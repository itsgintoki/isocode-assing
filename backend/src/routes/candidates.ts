import express from 'express';
import multer from 'multer';
import path from 'node:path';
import db from '../db/database';
import { authMiddleware, requireRole } from '../middleware/auth';
import { extractRawTextFromFile, parseResumeDetails } from '../services/cv_parser';
import { checkDuplicate, calculateFileHash } from '../services/duplicate_detector';
import { scoreCandidate } from '../services/ai_scorer';
import { logAccess } from '../services/dpdp_service';

const router = express.Router();
const INTERNAL_ROLES = ['recruiter', 'delivery_head'];
const MAX_FILES = Number(process.env.MAX_BULK_UPLOAD_FILES) || 500;
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.docx', '.txt']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: MAX_FILES },
  fileFilter: (req, file, cb) => {
    const extension = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      return cb(new Error('Only PDF, DOCX and TXT files are supported.'));
    }
    cb(null, true);
  }
});

function handleUpload(req, res, next) {
  upload.array('cvFiles', MAX_FILES)(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Each CV must be 10 MB or smaller.' });
      }
      if (error.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({ error: `Upload no more than ${MAX_FILES} CVs at a time.` });
      }
      return res.status(400).json({ error: error.message });
    }
    return res.status(400).json({ error: error.message });
  });
}

router.use(authMiddleware);
router.use(requireRole(INTERNAL_ROLES));

function parseJson(value, fallback) {
  try {
    return JSON.parse(value || '');
  } catch {
    return fallback;
  }
}

function uniqueCandidateId() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const id = `CND-${Math.floor(90000 + Math.random() * 9999)}`;
    const exists = db.prepare('SELECT 1 FROM candidates WHERE id = ?').get(id);
    if (!exists) return id;
  }
  return `CND-${Date.now().toString().slice(-8)}`;
}

// Ranked candidates for an internal requisition.
router.get('/', (req, res) => {
  const {
    requisitionId,
    stage,
    minScore,
    search,
    blindMode = 'false',
    sortBy = 'score',
    sortOrder = 'desc'
  } = req.query as Record<string, string | undefined>;

  if (!requisitionId) {
    return res.status(400).json({ error: 'A requisition is required.' });
  }

  const requisition = db.prepare('SELECT * FROM requisitions WHERE id = ?').get(requisitionId);
  if (!requisition) {
    return res.status(404).json({ error: 'Requisition not found.' });
  }

  let query = `
    SELECT
      c.id, c.name, c.email, c.phone, c.current_role, c.total_exp_years,
      c.key_skills_json, c.current_ctc, c.expected_ctc, c.notice_period_days,
      c.location, c.original_filename, c.consent_status, c.is_deleted,
      c.created_at as candidate_created_at,
      e.id as evaluation_id, e.overall_score, e.skills_score, e.exp_score,
      e.notice_score, e.ctc_score, e.breakdown_json, e.ai_confidence,
      e.uncertainty_notes, e.scoring_engine, e.recruiter_verified,
      e.recruiter_verified_at, e.recruiter_verified_by, e.recruiter_notes,
      e.pipeline_stage, e.rejection_reason, e.client_feedback_notes,
      e.interview_slots_json, e.created_at as evaluated_at, e.updated_at
    FROM cv_evaluations e
    JOIN candidates c ON e.candidate_id = c.id
    WHERE e.requisition_id = ? AND c.is_deleted = 0
  `;

  const params: Array<string | number> = [requisitionId];

  if (stage && stage !== 'all') {
    query += ' AND e.pipeline_stage = ?';
    params.push(stage);
  }

  if (minScore !== undefined && minScore !== '') {
    const parsedMinScore = Number(minScore);
    if (Number.isFinite(parsedMinScore)) {
      query += ' AND e.overall_score >= ?';
      params.push(Math.min(100, Math.max(0, parsedMinScore)));
    }
  }

  if (search && search.trim()) {
    query += ' AND (c.name LIKE ? OR c.current_role LIKE ? OR c.key_skills_json LIKE ? OR c.id LIKE ?)';
    const term = `%${search.trim()}%`;
    params.push(term, term, term, term);
  }

  const sortColumns = {
    score: 'e.overall_score',
    experience: 'c.total_exp_years',
    notice: 'c.notice_period_days',
    name: 'c.name',
    recent: 'e.updated_at'
  };
  const order = String(sortOrder).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  query += ` ORDER BY ${sortColumns[sortBy] || sortColumns.score} ${order}, c.id ASC`;

  const rows = db.prepare(query).all(...params);
  const isBlind = blindMode === 'true';

  const candidates = rows.map((row) => ({
    ...row,
    name: isBlind ? `Candidate ${row.id}` : row.name,
    email: isBlind ? '[hidden]' : row.email,
    phone: isBlind ? '[hidden]' : row.phone,
    key_skills: parseJson(row.key_skills_json, []),
    breakdown: parseJson(row.breakdown_json, []),
    interview_slots: row.interview_slots_json ? parseJson(row.interview_slots_json, null) : null
  }));

  res.json({ requisitionId, totalCount: candidates.length, blindMode: isBlind, candidates });
});

// Full profile for the evidence drawer. Every open is recorded for DPDP audit.
router.get('/:id', (req, res) => {
  const candidateId = req.params.id;
  const requisitionId = req.query.requisitionId || null;

  const candidate = db.prepare('SELECT * FROM candidates WHERE id = ? AND is_deleted = 0').get(candidateId);
  if (!candidate) {
    return res.status(404).json({ error: 'Candidate not found.' });
  }

  const evaluation = requisitionId
    ? db.prepare('SELECT * FROM cv_evaluations WHERE candidate_id = ? AND requisition_id = ?').get(candidateId, requisitionId)
    : db.prepare('SELECT * FROM cv_evaluations WHERE candidate_id = ? ORDER BY created_at DESC LIMIT 1').get(candidateId);

  if (requisitionId && !evaluation) {
    return res.status(404).json({ error: 'This candidate has not been evaluated for the selected requisition.' });
  }

  logAccess({
    userId: req.user.id,
    userName: req.user.name,
    userRole: req.user.role,
    candidateId,
    requisitionId,
    action: 'view_unmasked_cv',
    ipAddress: req.ip,
    details: { screen: 'Candidate detail', requisition_id: requisitionId }
  });

  res.json({
    candidate: {
      ...candidate,
      key_skills: parseJson(candidate.key_skills_json, [])
    },
    evaluation: evaluation
      ? {
          ...evaluation,
          breakdown: parseJson(evaluation.breakdown_json, []),
          interview_slots: evaluation.interview_slots_json ? parseJson(evaluation.interview_slots_json, null) : null
        }
      : null
  });
});

// A recruiter must open the CV before attesting to it.
router.post('/:id/verify', requireRole(INTERNAL_ROLES), (req, res) => {
  const candidateId = req.params.id;
  const { requisitionId, notes = '' } = req.body || {};

  if (!requisitionId) {
    return res.status(400).json({ error: 'A requisition is required.' });
  }
  if (typeof notes !== 'string' || notes.length > 3000) {
    return res.status(400).json({ error: 'Notes must be plain text under 3,000 characters.' });
  }

  const evaluation = db.prepare(`
    SELECT * FROM cv_evaluations WHERE candidate_id = ? AND requisition_id = ?
  `).get(candidateId, requisitionId);

  if (!evaluation) {
    return res.status(404).json({ error: 'Evaluation not found for this candidate and requisition.' });
  }

  const viewed = db.prepare(`
    SELECT id FROM access_audit_logs
    WHERE user_id = ? AND candidate_id = ? AND requisition_id = ? AND action = 'view_unmasked_cv'
    ORDER BY created_at DESC LIMIT 1
  `).get(req.user.id, candidateId, requisitionId);

  if (!viewed) {
    return res.status(400).json({
      error: 'Open the candidate CV before verifying. The verification is an explicit human review, not a bulk action.'
    });
  }

  db.prepare(`
    UPDATE cv_evaluations
    SET
      recruiter_verified = 1,
      recruiter_verified_at = CURRENT_TIMESTAMP,
      recruiter_verified_by = ?,
      recruiter_notes = ?,
      pipeline_stage = CASE WHEN pipeline_stage = 'ai_screened' THEN 'recruiter_verified' ELSE pipeline_stage END,
      updated_at = CURRENT_TIMESTAMP
    WHERE candidate_id = ? AND requisition_id = ?
  `).run(req.user.name, notes.trim() || 'CV reviewed and credentials checked by recruiter.', candidateId, requisitionId);

  logAccess({
    userId: req.user.id,
    userName: req.user.name,
    userRole: req.user.role,
    candidateId,
    requisitionId,
    action: 'recruiter_verified',
    ipAddress: req.ip,
    details: { notes: notes.trim() }
  });

  res.json({ success: true, candidateId, recruiter_verified: 1, verifiedBy: req.user.name });
});

// Bulk upload: parse, deduplicate and score in one pass.
router.post('/upload', handleUpload, async (req, res) => {
  const { requisitionId } = req.body;
  const files: Express.Multer.File[] = Array.isArray(req.files) ? req.files : [];

  if (!requisitionId) {
    return res.status(400).json({ error: 'Select a requisition before uploading CVs.' });
  }
  if (files.length === 0) {
    return res.status(400).json({ error: 'No CV files were received.' });
  }
  if (files.reduce((sum, file) => sum + file.size, 0) > 200 * 1024 * 1024) {
    return res.status(400).json({ error: 'The upload is larger than 200 MB. Please split it into smaller batches.' });
  }

  const requisition = db.prepare('SELECT * FROM requisitions WHERE id = ?').get(requisitionId);
  if (!requisition) {
    return res.status(404).json({ error: 'Requisition not found.' });
  }

  const scorecard = parseJson(requisition.scorecard_json, {});
  const results = {
    processed: 0,
    successfulCandidates: [],
    duplicatesDetected: [],
    errors: []
  };

  const insertCandidate = db.prepare(`
    INSERT INTO candidates (
      id, name, email, phone, current_role, total_exp_years,
      key_skills_json, current_ctc, expected_ctc, notice_period_days,
      location, raw_cv_text, original_filename, file_hash,
      consent_status, consent_date, consent_purpose
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'consented', CURRENT_TIMESTAMP, ?)
  `);

  const insertEvaluation = db.prepare(`
    INSERT INTO cv_evaluations (
      id, requisition_id, candidate_id, overall_score, skills_score, exp_score,
      notice_score, ctc_score, breakdown_json, ai_confidence, uncertainty_notes,
      scoring_engine, recruiter_verified, pipeline_stage
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'ai_screened')
  `);

  const candidateExistsForReq = db.prepare(`
    SELECT id FROM cv_evaluations WHERE requisition_id = ? AND candidate_id = ?
  `);

  for (const file of files) {
    const filename = path.basename(file.originalname || 'cv');
    try {
      const rawText = await extractRawTextFromFile(file.buffer, file.mimetype, filename);
      if (!rawText || rawText.trim().length < 30) {
        throw new Error('No readable text found. This may be a scanned PDF; OCR is not enabled in this build.');
      }

      const fileHash = calculateFileHash(rawText);
      const parsed = parseResumeDetails(rawText, filename);
      const duplicate = checkDuplicate({ fileHash, email: parsed.email, phone: parsed.phone });

      if (duplicate.isDuplicate) {
        const existingCandidate = db.prepare('SELECT * FROM candidates WHERE id = ?').get(duplicate.candidate.id);

        if (existingCandidate) {
          const alreadyInReq = candidateExistsForReq.get(requisitionId, existingCandidate.id);

          if (!alreadyInReq) {
            const existingProfile = {
              ...existingCandidate,
              key_skills: parseJson(existingCandidate.key_skills_json, [])
            };
            const evaluation = scoreCandidate(existingProfile, scorecard, { blindScreening: true });
            insertEvaluation.run(
              `eval_${requisitionId}_${existingCandidate.id}`,
              requisitionId,
              existingCandidate.id,
              evaluation.overall_score,
              evaluation.skills_score,
              evaluation.exp_score,
              evaluation.notice_score,
              evaluation.ctc_score,
              JSON.stringify(evaluation.breakdown),
              evaluation.ai_confidence,
              evaluation.uncertainty_notes,
              evaluation.scoring_engine
            );
          }

          results.duplicatesDetected.push({
            filename,
            duplicateType: duplicate.type,
            message: duplicate.message,
            candidate: { id: existingCandidate.id, name: existingCandidate.name }
          });
          results.processed += 1;
          continue;
        }
      }

      const candidateId = uniqueCandidateId();
      insertCandidate.run(
        candidateId,
        parsed.name,
        parsed.email,
        parsed.phone,
        parsed.current_role,
        parsed.total_exp_years,
        JSON.stringify(parsed.key_skills),
        parsed.current_ctc,
        parsed.expected_ctc,
        parsed.notice_period_days,
        parsed.location,
        rawText,
        filename,
        fileHash,
        `Hiring evaluation for ${requisition.client_company} (${requisition.title}) under DPDP Act 2023`
      );

      const evaluation = scoreCandidate(
        { ...parsed, id: candidateId, raw_cv_text: rawText },
        scorecard,
        { blindScreening: true }
      );

      insertEvaluation.run(
        `eval_${requisitionId}_${candidateId}`,
        requisitionId,
        candidateId,
        evaluation.overall_score,
        evaluation.skills_score,
        evaluation.exp_score,
        evaluation.notice_score,
        evaluation.ctc_score,
        JSON.stringify(evaluation.breakdown),
        evaluation.ai_confidence,
        evaluation.uncertainty_notes,
        evaluation.scoring_engine
      );

      results.successfulCandidates.push({
        candidateId,
        name: parsed.name,
        filename,
        score: evaluation.overall_score,
        confidence: evaluation.ai_confidence,
        noticePeriodDays: parsed.notice_period_days,
        warnings: parsed.parse_warnings
      });
      results.processed += 1;
    } catch (error) {
      results.errors.push({ filename, error: error.message });
    }
  }

  logAccess({
    userId: req.user.id,
    userName: req.user.name,
    userRole: req.user.role,
    requisitionId,
    action: 'bulk_cv_upload',
    ipAddress: req.ip,
    details: {
      total_files: files.length,
      successful: results.successfulCandidates.length,
      duplicates: results.duplicatesDetected.length,
      errors: results.errors.length
    }
  });

  res.json({ success: true, requisitionId, results });
});

export default router;
