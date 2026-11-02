const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { extractScorecardFromJD, extractScorecardWithAI, scoreCandidate } = require('../services/ai_scorer');
const { logAccess } = require('../services/dpdp_service');

router.use(authMiddleware);

// List all requisitions with pipeline counts
router.get('/', (req, res) => {
  let query = `
    SELECT 
      r.*,
      COUNT(DISTINCT e.candidate_id) as total_candidates,
      SUM(CASE WHEN e.pipeline_stage = 'submitted_to_client' THEN 1 ELSE 0 END) as submitted_count,
      SUM(CASE WHEN e.pipeline_stage = 'client_shortlisted' THEN 1 ELSE 0 END) as shortlisted_count,
      SUM(CASE WHEN e.pipeline_stage = 'interview_scheduled' THEN 1 ELSE 0 END) as interview_count
    FROM requisitions r
    LEFT JOIN cv_evaluations e ON r.id = e.requisition_id
  `;

  // If client hiring manager, filter strictly to their company
  if (req.user.role === 'client_hiring_manager') {
    query += ` WHERE r.client_company = ? OR r.client_user_id = ? `;
    query += ` GROUP BY r.id ORDER BY r.created_at DESC`;
    const rows = db.prepare(query).all(req.user.company_name, req.user.id);
    return res.json({ requisitions: rows });
  }

  query += ` GROUP BY r.id ORDER BY r.created_at DESC`;
  const rows = db.prepare(query).all();
  res.json({ requisitions: rows });
});

// Get requisition detail
router.get('/:id', (req, res) => {
  const reqId = req.params.id;
  const requisition = db.prepare('SELECT * FROM requisitions WHERE id = ?').get(reqId);
  
  if (!requisition) {
    return res.status(404).json({ error: 'Requisition not found' });
  }

  // Client role isolation check
  if (req.user.role === 'client_hiring_manager') {
    if (requisition.client_company !== req.user.company_name && requisition.client_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized: Requisition belongs to another client' });
    }
  }

  // Parse scorecard JSON
  requisition.scorecard = JSON.parse(requisition.scorecard_json || '{}');
  
  // Pipeline stage counts
  const stageStats = db.prepare(`
    SELECT pipeline_stage, COUNT(*) as count
    FROM cv_evaluations
    WHERE requisition_id = ?
    GROUP BY pipeline_stage
  `).all(reqId);

  res.json({ requisition, stageStats });
});

// AI JD Intake endpoint - Extracts editable scorecard from raw JD text
router.post('/intake-jd', requireRole(['recruiter', 'delivery_head']), async (req, res) => {
  const { rawJdText, jobTitle } = req.body;
  if (!rawJdText || rawJdText.trim().length < 15) {
    return res.status(400).json({ error: 'Please provide valid JD text to extract scorecard' });
  }

  const scorecard = await extractScorecardWithAI(rawJdText, jobTitle);
  res.json({
    success: true,
    scorecard,
    extracted_summary: {
      title: scorecard.job_title,
      min_exp: scorecard.min_exp,
      max_exp: scorecard.max_exp,
      max_notice_days: scorecard.max_notice_days,
      max_ctc: scorecard.max_ctc,
      location: scorecard.location,
      must_have_skills: scorecard.must_have_skills
    }
  });
});

// Create new requisition
router.post('/', requireRole(['recruiter', 'delivery_head']), (req, res) => {
  const {
    id,
    title,
    department,
    client_company,
    client_contact_name,
    min_exp,
    max_exp,
    max_ctc,
    max_notice_days,
    location,
    raw_jd,
    scorecard
  } = req.body;

  const reqId = id || `REQ-2026-${Math.floor(100 + Math.random() * 900)}`;
  const scorecardJson = JSON.stringify(scorecard || extractScorecardFromJD(raw_jd, title));

  db.prepare(`
    INSERT INTO requisitions (
      id, title, department, client_company, client_contact_name,
      status, openings_count, min_exp, max_exp, max_ctc, max_notice_days,
      location, raw_jd, scorecard_json, created_by
    )
    VALUES (?, ?, ?, ?, ?, 'active', 2, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    reqId,
    title,
    department || 'Engineering',
    client_company,
    client_contact_name || 'Hiring Manager',
    min_exp || 3,
    max_exp || 7,
    max_ctc || 20,
    max_notice_days || 60,
    location || 'Noida',
    raw_jd || '',
    scorecardJson,
    req.user.id
  );

  res.json({ success: true, requisitionId: reqId });
});

// Update scorecard and recalculate evaluations for this requisition
router.put('/:id/scorecard', requireRole(['recruiter', 'delivery_head']), (req, res) => {
  const reqId = req.params.id;
  const { scorecard } = req.body;

  if (!scorecard) {
    return res.status(400).json({ error: 'Scorecard payload required' });
  }

  const scorecardJson = JSON.stringify(scorecard);
  db.prepare(`
    UPDATE requisitions
    SET scorecard_json = ?, min_exp = ?, max_exp = ?, max_ctc = ?, max_notice_days = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    scorecardJson,
    scorecard.min_exp || 3,
    scorecard.max_exp || 8,
    scorecard.max_ctc || 24,
    scorecard.max_notice_days || 60,
    reqId
  );

  // Recalculate evaluations for all candidates attached to this requisition
  const evaluations = db.prepare('SELECT candidate_id FROM cv_evaluations WHERE requisition_id = ?').all(reqId);
  const updateEval = db.prepare(`
    UPDATE cv_evaluations
    SET overall_score = ?, skills_score = ?, exp_score = ?, notice_score = ?, ctc_score = ?,
        breakdown_json = ?, ai_confidence = ?, uncertainty_notes = ?, updated_at = CURRENT_TIMESTAMP
    WHERE requisition_id = ? AND candidate_id = ?
  `);

  let recalculatedCount = 0;
  for (const ev of evaluations) {
    const cand = db.prepare('SELECT * FROM candidates WHERE id = ?').get(ev.candidate_id);
    if (cand) {
      const result = scoreCandidate(cand, scorecard, { blindScreening: true });
      updateEval.run(
        result.overall_score,
        result.skills_score,
        result.exp_score,
        result.notice_score,
        result.ctc_score,
        JSON.stringify(result.breakdown),
        result.ai_confidence,
        result.uncertainty_notes,
        reqId,
        ev.candidate_id
      );
      recalculatedCount++;
    }
  }

  logAccess({
    userId: req.user.id,
    userName: req.user.name,
    userRole: req.user.role,
    requisitionId: reqId,
    action: 'scorecard_updated',
    details: { recalculated_candidates: recalculatedCount }
  });

  res.json({
    success: true,
    message: `Scorecard updated. Recalculated ${recalculatedCount} candidates.`,
    scorecard
  });
});

module.exports = router;
