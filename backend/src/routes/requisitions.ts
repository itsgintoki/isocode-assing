import express from 'express';
import db from '../db/database';
import { authMiddleware, requireRole, canClientAccessRequisition } from '../middleware/auth';
import { extractScorecardFromJD, extractScorecardWithAI, scoreCandidate } from '../services/ai_scorer';
import { logAccess } from '../services/dpdp_service';

const router = express.Router();
const INTERNAL_ROLES = ['recruiter', 'delivery_head'];

router.use(authMiddleware);

function parseJson(value, fallback) {
  try {
    return JSON.parse(value || '');
  } catch {
    return fallback;
  }
}

function text(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function validateScorecard(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { error: 'A scorecard object is required.' };
  }

  const scorecard = {
    ...input,
    job_title: text(input.job_title, 120),
    min_exp: number(input.min_exp, 0),
    max_exp: number(input.max_exp, 40),
    max_notice_days: number(input.max_notice_days, 60),
    max_ctc: number(input.max_ctc, 0),
    location: text(input.location, 80),
    must_have_skills: Array.isArray(input.must_have_skills) ? input.must_have_skills : [],
    weights: input.weights || {}
  };

  if (!scorecard.job_title) return { error: 'Job title is required.' };
  if (scorecard.min_exp < 0 || scorecard.max_exp > 40 || scorecard.min_exp > scorecard.max_exp) {
    return { error: 'Experience must be a valid range between 0 and 40 years.' };
  }
  if (scorecard.max_ctc < 1 || scorecard.max_ctc > 200) {
    return { error: 'Maximum CTC must be between 1 and 200 LPA.' };
  }
  if (scorecard.max_notice_days < 0 || scorecard.max_notice_days > 180) {
    return { error: 'Maximum notice period must be between 0 and 180 days.' };
  }
  if (scorecard.must_have_skills.length < 1 || scorecard.must_have_skills.length > 20) {
    return { error: 'Add between 1 and 20 must-have skills.' };
  }

  const skills = [];
  for (const rawSkill of scorecard.must_have_skills) {
    const name = text(typeof rawSkill === 'string' ? rawSkill : rawSkill?.name, 80);
    if (!name) return { error: 'Every must-have skill needs a name.' };
    const minYears = number(typeof rawSkill === 'object' ? rawSkill.min_years : 0, 0);
    if (minYears < 0 || minYears > 40) return { error: `Minimum years for ${name} is invalid.` };
    skills.push({ name, min_years: minYears });
  }
  scorecard.must_have_skills = skills;

  const weights = {
    skills: number(scorecard.weights.skills, 0.4),
    experience: number(scorecard.weights.experience, 0.3),
    notice: number(scorecard.weights.notice, 0.15),
    ctc: number(scorecard.weights.ctc, 0.15)
  };
  const totalWeight = Object.values(weights).reduce((sum, value) => sum + value, 0);
  if (Object.values(weights).some((value) => value < 0 || value > 1) || Math.abs(totalWeight - 1) > 0.02) {
    return { error: 'Scoring weights must each be between 0 and 1 and add up to 100%.' };
  }
  scorecard.weights = weights;

  return { scorecard };
}

function requisitionSummary(requisition) {
  if (!requisition) return requisition;
  return {
    ...requisition,
    scorecard: parseJson(requisition.scorecard_json, {})
  };
}

// Internal users see every requisition; client hiring managers see only their company's roles.
router.get('/', (req, res) => {
  let query = `
    SELECT
      r.*,
      COUNT(DISTINCT e.candidate_id) as total_candidates,
      COALESCE(SUM(CASE WHEN e.pipeline_stage IN ('recruiter_verified', 'submitted_to_client', 'client_shortlisted', 'interview_scheduled', 'offered', 'joined') THEN 1 ELSE 0 END), 0) as verified_count,
      COALESCE(SUM(CASE WHEN e.pipeline_stage IN ('submitted_to_client', 'client_shortlisted', 'interview_scheduled', 'offered', 'joined') THEN 1 ELSE 0 END), 0) as submitted_count,
      COALESCE(SUM(CASE WHEN e.pipeline_stage IN ('client_shortlisted', 'interview_scheduled', 'offered', 'joined') THEN 1 ELSE 0 END), 0) as shortlisted_count,
      COALESCE(SUM(CASE WHEN e.pipeline_stage IN ('interview_scheduled', 'offered', 'joined') THEN 1 ELSE 0 END), 0) as interview_count,
      COALESCE(SUM(CASE WHEN e.pipeline_stage = 'joined' THEN 1 ELSE 0 END), 0) as joined_count
    FROM requisitions r
    LEFT JOIN cv_evaluations e ON r.id = e.requisition_id
  `;

  if (req.user.role === 'client_hiring_manager') {
    query += ' WHERE r.client_company = ?';
    query += ' GROUP BY r.id ORDER BY r.created_at DESC';
    const rows = db.prepare(query).all(req.user.company_name);
    return res.json({ requisitions: rows.map(requisitionSummary) });
  }

  query += ' GROUP BY r.id ORDER BY r.created_at DESC';
  const rows = db.prepare(query).all();
  res.json({ requisitions: rows.map(requisitionSummary) });
});

router.get('/:id', (req, res) => {
  const requisition = db.prepare('SELECT * FROM requisitions WHERE id = ?').get(req.params.id);
  if (!requisition) {
    return res.status(404).json({ error: 'Requisition not found.' });
  }

  if (req.user.role === 'client_hiring_manager' && !canClientAccessRequisition(req.user, requisition)) {
    return res.status(403).json({ error: 'This requisition belongs to another client.' });
  }

  const stageStats = db.prepare(`
    SELECT pipeline_stage, COUNT(*) as count
    FROM cv_evaluations
    WHERE requisition_id = ?
    GROUP BY pipeline_stage
  `).all(req.params.id);

  res.json({ requisition: requisitionSummary(requisition), stageStats });
});

// Turn a pasted JD into an editable scorecard. The LLM is optional; the local
// extractor is always available and every field is editable by a recruiter.
router.post('/intake-jd', requireRole(INTERNAL_ROLES), async (req, res, next) => {
  const rawJdText = String(req.body?.rawJdText || '').trim();
  const jobTitle = text(req.body?.jobTitle, 120);

  if (rawJdText.length < 15) {
    return res.status(400).json({ error: 'Paste a job description with at least 15 characters.' });
  }
  if (rawJdText.length > 50000) {
    return res.status(400).json({ error: 'The job description is too long. Keep it under 50,000 characters.' });
  }

  try {
    const scorecard = await extractScorecardWithAI(rawJdText, jobTitle);
    res.json({ success: true, scorecard });
  } catch (error) {
    next(error);
  }
});

router.post('/', requireRole(INTERNAL_ROLES), (req, res) => {
  const body = req.body || {};
  const validation = validateScorecard(body.scorecard || extractScorecardFromJD(body.raw_jd, body.title));
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }

  const scorecard = validation.scorecard;
  const title = text(body.title, 120) || scorecard.job_title;
  const clientCompany = text(body.client_company, 120);
  const department = text(body.department, 120) || 'Engineering';
  const clientContactName = text(body.client_contact_name, 120) || 'Hiring Manager';
  const location = text(body.location, 80) || scorecard.location || 'Noida';

  if (!title || !clientCompany) {
    return res.status(400).json({ error: 'Job title and client company are required.' });
  }

  let reqId = text(body.id, 40);
  if (!reqId) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const candidateId = `REQ-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
      if (!db.prepare('SELECT 1 FROM requisitions WHERE id = ?').get(candidateId)) {
        reqId = candidateId;
        break;
      }
    }
  }

  if (!reqId) {
    return res.status(500).json({ error: 'Could not allocate a requisition ID. Please retry.' });
  }
  if (db.prepare('SELECT 1 FROM requisitions WHERE id = ?').get(reqId)) {
    return res.status(409).json({ error: 'A requisition with this ID already exists.' });
  }

  scorecard.job_title = title;
  scorecard.location = location;

  db.prepare(`
    INSERT INTO requisitions (
      id, title, department, client_company, client_contact_name,
      status, openings_count, min_exp, max_exp, max_ctc, max_notice_days,
      location, raw_jd, scorecard_json, created_by
    )
    VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    reqId,
    title,
    department,
    clientCompany,
    clientContactName,
    Math.min(50, Math.max(1, number(body.openings_count, 1))),
    scorecard.min_exp,
    scorecard.max_exp,
    scorecard.max_ctc,
    scorecard.max_notice_days,
    location,
    String(body.raw_jd || '').slice(0, 50000),
    JSON.stringify(scorecard),
    req.user.id
  );

  logAccess({
    userId: req.user.id,
    userName: req.user.name,
    userRole: req.user.role,
    requisitionId: reqId,
    action: 'requisition_created',
    ipAddress: req.ip,
    details: { title, client_company: clientCompany }
  });

  res.status(201).json({ success: true, requisitionId: reqId });
});

router.put('/:id/scorecard', requireRole(INTERNAL_ROLES), (req, res) => {
  const requisition = db.prepare('SELECT * FROM requisitions WHERE id = ?').get(req.params.id);
  if (!requisition) {
    return res.status(404).json({ error: 'Requisition not found.' });
  }

  const validation = validateScorecard(req.body?.scorecard);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }

  const scorecard = validation.scorecard;
  db.prepare(`
    UPDATE requisitions
    SET title = ?, location = ?, scorecard_json = ?, min_exp = ?, max_exp = ?,
        max_ctc = ?, max_notice_days = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    scorecard.job_title || requisition.title,
    scorecard.location || requisition.location,
    JSON.stringify(scorecard),
    scorecard.min_exp,
    scorecard.max_exp,
    scorecard.max_ctc,
    scorecard.max_notice_days,
    requisition.id
  );

  const evaluations = db.prepare('SELECT candidate_id FROM cv_evaluations WHERE requisition_id = ?').all(requisition.id);
  const updateEvaluation = db.prepare(`
    UPDATE cv_evaluations
    SET overall_score = ?, skills_score = ?, exp_score = ?, notice_score = ?, ctc_score = ?,
        breakdown_json = ?, ai_confidence = ?, uncertainty_notes = ?, scoring_engine = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE requisition_id = ? AND candidate_id = ?
  `);

  let recalculatedCount = 0;
  const recalculate = db.transaction(() => {
    for (const evaluation of evaluations) {
      const candidate = db.prepare('SELECT * FROM candidates WHERE id = ? AND is_deleted = 0').get(evaluation.candidate_id);
      if (!candidate) continue;
      const result = scoreCandidate(candidate, scorecard, { blindScreening: true });
      updateEvaluation.run(
        result.overall_score,
        result.skills_score,
        result.exp_score,
        result.notice_score,
        result.ctc_score,
        JSON.stringify(result.breakdown),
        result.ai_confidence,
        result.uncertainty_notes,
        result.scoring_engine,
        requisition.id,
        evaluation.candidate_id
      );
      recalculatedCount += 1;
    }
  });
  recalculate();

  logAccess({
    userId: req.user.id,
    userName: req.user.name,
    userRole: req.user.role,
    requisitionId: requisition.id,
    action: 'scorecard_updated',
    ipAddress: req.ip,
    details: { recalculated_candidates: recalculatedCount }
  });

  res.json({
    success: true,
    message: `Scorecard saved. Re-scored ${recalculatedCount} candidate${recalculatedCount === 1 ? '' : 's'}.`,
    scorecard,
    recalculatedCount
  });
});

export default router;
