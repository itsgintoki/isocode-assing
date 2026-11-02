const express = require('express');
const router = express.Router();
const multer = require('multer');
const db = require('../db/database');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { extractRawTextFromFile, parseResumeDetails } = require('../services/cv_parser');
const { checkDuplicate, calculateFileHash } = require('../services/duplicate_detector');
const { scoreCandidate, sanitizeForBlindScoring } = require('../services/ai_scorer');
const { logAccess } = require('../services/dpdp_service');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 500 }
});

router.use(authMiddleware);

// Get ranked candidates for a requisition
router.get('/', (req, res) => {
  const {
    requisitionId,
    stage,
    minScore,
    search,
    blindMode = 'false',
    sortBy = 'overall_score',
    sortOrder = 'desc'
  } = req.query;

  if (!requisitionId) {
    return res.status(400).json({ error: 'requisitionId query parameter is required' });
  }

  // Fetch requisition and its scorecard
  const requisition = db.prepare('SELECT * FROM requisitions WHERE id = ?').get(requisitionId);
  if (!requisition) {
    return res.status(404).json({ error: 'Requisition not found' });
  }

  let query = `
    SELECT 
      c.id, c.name, c.email, c.phone, c.current_role, c.total_exp_years,
      c.key_skills_json, c.current_ctc, c.expected_ctc, c.notice_period_days,
      c.location, c.original_filename, c.consent_status, c.is_deleted,
      e.id as evaluation_id, e.overall_score, e.skills_score, e.exp_score,
      e.notice_score, e.ctc_score, e.breakdown_json, e.ai_confidence,
      e.uncertainty_notes, e.recruiter_verified, e.recruiter_verified_at,
      e.recruiter_verified_by, e.recruiter_notes, e.pipeline_stage,
      e.rejection_reason, e.client_feedback_notes, e.interview_slots_json
    FROM cv_evaluations e
    JOIN candidates c ON e.candidate_id = c.id
    WHERE e.requisition_id = ? AND c.is_deleted = 0
  `;

  const params = [requisitionId];

  if (stage && stage !== 'all') {
    query += ` AND e.pipeline_stage = ? `;
    params.push(stage);
  }

  if (minScore) {
    query += ` AND e.overall_score >= ? `;
    params.push(parseFloat(minScore));
  }

  if (search && search.trim()) {
    query += ` AND (c.name LIKE ? OR c.current_role LIKE ? OR c.key_skills_json LIKE ? OR c.id LIKE ?) `;
    const term = `%${search.trim()}%`;
    params.push(term, term, term, term);
  }

  // Dynamic sorting with safe column names
  const validSortCols = ['overall_score', 'total_exp_years', 'notice_period_days', 'name', 'created_at'];
  const sortCol = validSortCols.includes(sortBy) ? sortBy : 'overall_score';
  const order = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  query += ` ORDER BY e.${sortCol === 'total_exp_years' || sortCol === 'name' ? 'candidate_id' : sortCol} ${order} `;

  const rows = db.prepare(query).all(...params);

  const isBlind = blindMode === 'true';

  const candidates = rows.map(r => {
    let displayName = r.name;
    let displayEmail = r.email;
    let displayPhone = r.phone;

    if (isBlind) {
      displayName = `Candidate ${r.id}`;
      displayEmail = '[BLIND_SCREENING]';
      displayPhone = '[BLIND_SCREENING]';
    }

    return {
      ...r,
      name: displayName,
      email: displayEmail,
      phone: displayPhone,
      key_skills: JSON.parse(r.key_skills_json || '[]'),
      breakdown: JSON.parse(r.breakdown_json || '[]'),
      interview_slots: r.interview_slots_json ? JSON.parse(r.interview_slots_json) : null
    };
  });

  res.json({
    requisitionId,
    totalCount: candidates.length,
    blindMode: isBlind,
    candidates
  });
});

// Get single candidate full profile and log access in DPDP audit trail
router.get('/:id', (req, res) => {
  const candidateId = req.params.id;
  const { requisitionId } = req.query;

  const candidate = db.prepare('SELECT * FROM candidates WHERE id = ?').get(candidateId);
  if (!candidate) {
    return res.status(404).json({ error: 'Candidate not found' });
  }

  let evaluation = null;
  if (requisitionId) {
    evaluation = db.prepare('SELECT * FROM cv_evaluations WHERE candidate_id = ? AND requisition_id = ?').get(candidateId, requisitionId);
  } else {
    evaluation = db.prepare('SELECT * FROM cv_evaluations WHERE candidate_id = ? ORDER BY created_at DESC LIMIT 1').get(candidateId);
  }

  // Log unmasked CV view in DPDP compliance log
  logAccess({
    userId: req.user.id,
    userName: req.user.name,
    userRole: req.user.role,
    candidateId,
    requisitionId: requisitionId || null,
    action: 'view_unmasked_cv',
    details: {
      screen: 'CandidateDetailModal',
      verified_status: evaluation ? evaluation.recruiter_verified : 0
    }
  });

  res.json({
    candidate: {
      ...candidate,
      key_skills: JSON.parse(candidate.key_skills_json || '[]')
    },
    evaluation: evaluation ? {
      ...evaluation,
      breakdown: JSON.parse(evaluation.breakdown_json || '[]'),
      interview_slots: evaluation.interview_slots_json ? JSON.parse(evaluation.interview_slots_json) : null
    } : null
  });
});

// Recruiter opens and verifies CV before submission to client
router.post('/:id/verify', requireRole(['recruiter', 'delivery_head']), (req, res) => {
  const candidateId = req.params.id;
  const { requisitionId, notes } = req.body;

  if (!requisitionId) {
    return res.status(400).json({ error: 'requisitionId is required' });
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
  `).run(req.user.name, notes || 'Verified candidate resume and credentials', candidateId, requisitionId);

  logAccess({
    userId: req.user.id,
    userName: req.user.name,
    userRole: req.user.role,
    candidateId,
    requisitionId,
    action: 'recruiter_verified',
    details: { notes }
  });

  res.json({
    success: true,
    candidateId,
    recruiter_verified: 1,
    verifiedBy: req.user.name,
    message: 'Candidate verified. Eligible for client shortlist submission.'
  });
});

// Bulk CV Upload and Parsing endpoint
router.post('/upload', requireRole(['recruiter', 'delivery_head']), upload.array('cvFiles', 500), async (req, res) => {
  const { requisitionId } = req.body;
  if (!requisitionId) {
    return res.status(400).json({ error: 'requisitionId is required' });
  }

  const requisition = db.prepare('SELECT * FROM requisitions WHERE id = ?').get(requisitionId);
  if (!requisition) {
    return res.status(404).json({ error: 'Requisition not found' });
  }

  const scorecard = JSON.parse(requisition.scorecard_json || '{}');
  const files = req.files || [];

  if (files.length === 0) {
    return res.status(400).json({ error: 'No CV files received for processing' });
  }

  const results = {
    processed: 0,
    duplicatesDetected: [],
    successfulCandidates: [],
    errors: []
  };

  const insertCand = db.prepare(`
    INSERT INTO candidates (
      id, name, email, phone, current_role, total_exp_years,
      key_skills_json, current_ctc, expected_ctc, notice_period_days,
      location, raw_cv_text, original_filename, file_hash,
      consent_status, consent_date, consent_purpose
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'consented', CURRENT_TIMESTAMP, ?)
  `);

  const insertEval = db.prepare(`
    INSERT OR REPLACE INTO cv_evaluations (
      id, requisition_id, candidate_id, overall_score, skills_score, exp_score,
      notice_score, ctc_score, breakdown_json, ai_confidence, uncertainty_notes,
      recruiter_verified, pipeline_stage
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'ai_screened')
  `);

  for (const file of files) {
    try {
      // 1. Extract text from PDF, DOCX or TXT
      const rawText = await extractRawTextFromFile(file.buffer, file.mimetype, file.originalname);
      const fileHash = calculateFileHash(rawText || file.buffer);

      // 2. Parse candidate structured attributes
      const parsed = parseResumeDetails(rawText, file.originalname);

      // 3. Check for duplicates
      const dupCheck = checkDuplicate({ fileHash, email: parsed.email, phone: parsed.phone });
      if (dupCheck.isDuplicate) {
        results.duplicatesDetected.push({
          filename: file.originalname,
          duplicateType: dupCheck.type,
          message: dupCheck.message,
          candidate: dupCheck.candidate
        });
        // Still link evaluation to this requisition if not already linked
        const existingCandId = dupCheck.candidate.id;
        const evalResult = scoreCandidate({ ...parsed, id: existingCandId, raw_cv_text: rawText }, scorecard, { blindScreening: true });
        
        insertEval.run(
          `eval_${requisitionId}_${existingCandId}`,
          requisitionId,
          existingCandId,
          evalResult.overall_score,
          evalResult.skills_score,
          evalResult.exp_score,
          evalResult.notice_score,
          evalResult.ctc_score,
          JSON.stringify(evalResult.breakdown),
          evalResult.ai_confidence,
          evalResult.uncertainty_notes
        );

        results.processed++;
        continue;
      }

      // 4. Create new unique candidate
      const candId = `CND-${Math.floor(90000 + Math.random() * 9999)}`;
      insertCand.run(
        candId,
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
        file.originalname,
        fileHash,
        `Hiring evaluation for ${requisition.client_company} (${requisition.title}) under DPDP Act 2023`
      );

      // 5. Run AI scoring against scorecard
      const evalResult = scoreCandidate({ ...parsed, id: candId, raw_cv_text: rawText }, scorecard, { blindScreening: true });

      insertEval.run(
        `eval_${requisitionId}_${candId}`,
        requisitionId,
        candId,
        evalResult.overall_score,
        evalResult.skills_score,
        evalResult.exp_score,
        evalResult.notice_score,
        evalResult.ctc_score,
        JSON.stringify(evalResult.breakdown),
        evalResult.ai_confidence,
        evalResult.uncertainty_notes
      );

      results.successfulCandidates.push({
        candidateId: candId,
        name: parsed.name,
        filename: file.originalname,
        score: evalResult.overall_score,
        confidence: evalResult.ai_confidence
      });

      results.processed++;
    } catch (err) {
      console.error(`Error processing file ${file.originalname}:`, err);
      results.errors.push({
        filename: file.originalname,
        error: err.message
      });
    }
  }

  logAccess({
    userId: req.user.id,
    userName: req.user.name,
    userRole: req.user.role,
    requisitionId,
    action: 'bulk_cv_upload',
    details: {
      total_files: files.length,
      successful: results.successfulCandidates.length,
      duplicates: results.duplicatesDetected.length,
      errors: results.errors.length
    }
  });

  res.json({
    success: true,
    requisitionId,
    results
  });
});

module.exports = router;
