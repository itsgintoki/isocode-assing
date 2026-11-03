const express = require('express');
const db = require('../db/database');
const { authMiddleware, requireRole, canClientAccessRequisition } = require('../middleware/auth');
const { maskCandidateForClient } = require('../services/pii_masker');
const { logAccess } = require('../services/dpdp_service');

const router = express.Router();

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

function assertRequisitionAccess(req, res, requisition) {
  if (req.user.role === 'client_hiring_manager' && !canClientAccessRequisition(req.user, requisition)) {
    res.status(403).json({ error: 'This requisition belongs to another client.' });
    return false;
  }
  return true;
}

// Requisitions visible in the portal. Clients see only their own company's roles.
router.get('/requisitions', (req, res) => {
  let query = `
    SELECT
      r.id, r.title, r.department, r.client_company, r.status, r.openings_count,
      r.min_exp, r.max_exp, r.max_notice_days, r.location,
      COUNT(CASE WHEN e.pipeline_stage IN ('submitted_to_client', 'client_shortlisted', 'interview_scheduled', 'offered', 'joined') THEN 1 END) as pending_review_count,
      COUNT(CASE WHEN e.pipeline_stage IN ('client_shortlisted', 'interview_scheduled', 'offered', 'joined') THEN 1 END) as shortlisted_count,
      COUNT(CASE WHEN e.pipeline_stage = 'interview_scheduled' THEN 1 END) as interview_count
    FROM requisitions r
    LEFT JOIN cv_evaluations e ON r.id = e.requisition_id
  `;

  if (req.user.role === 'client_hiring_manager') {
    query += ' WHERE r.client_company = ?';
    query += ' GROUP BY r.id ORDER BY r.created_at DESC';
    return res.json({ requisitions: db.prepare(query).all(req.user.company_name) });
  }

  query += ' GROUP BY r.id ORDER BY r.created_at DESC';
  res.json({ requisitions: db.prepare(query).all() });
});

// Only candidates explicitly submitted by a recruiter are visible to the client.
router.get('/shortlist/:requisitionId', (req, res) => {
  const requisition = db.prepare('SELECT * FROM requisitions WHERE id = ?').get(req.params.requisitionId);
  if (!requisition) {
    return res.status(404).json({ error: 'Requisition not found.' });
  }
  if (!assertRequisitionAccess(req, res, requisition)) return;

  const rows = db.prepare(`
    SELECT
      c.id, c.name, c.email, c.phone, c.current_role, c.total_exp_years,
      c.key_skills_json, c.current_ctc, c.expected_ctc, c.notice_period_days,
      c.location, c.original_filename,
      e.id as evaluation_id, e.overall_score, e.skills_score, e.exp_score,
      e.notice_score, e.breakdown_json, e.ai_confidence, e.uncertainty_notes,
      e.recruiter_notes, e.recruiter_verified_by, e.pipeline_stage,
      e.rejection_reason, e.rejection_notes, e.client_feedback_notes,
      e.interview_slots_json, e.client_action_at
    FROM cv_evaluations e
    JOIN candidates c ON e.candidate_id = c.id
    WHERE e.requisition_id = ?
      AND e.pipeline_stage IN ('submitted_to_client', 'client_shortlisted', 'interview_scheduled', 'offered', 'joined', 'rejected')
      AND c.is_deleted = 0
    ORDER BY
      CASE e.pipeline_stage
        WHEN 'submitted_to_client' THEN 1
        WHEN 'client_shortlisted' THEN 2
        WHEN 'interview_scheduled' THEN 3
        WHEN 'offered' THEN 4
        WHEN 'joined' THEN 5
        ELSE 6
      END,
      e.overall_score DESC
  `).all(requisition.id);

  const candidates = rows.map((row) => {
    const masked = maskCandidateForClient(row);

    // Deliberately do not send raw CV text to the client portal. Evidence quotes
    // are already stored on the evaluation and are sufficient for review.
    return {
      id: row.id,
      name: masked.name,
      email: masked.email,
      phone: masked.phone,
      current_role: row.current_role,
      total_exp_years: row.total_exp_years,
      key_skills: parseJson(row.key_skills_json, []),
      current_ctc: row.current_ctc,
      expected_ctc: row.expected_ctc,
      notice_period_days: row.notice_period_days,
      location: row.location,
      overall_score: row.overall_score,
      skills_score: row.skills_score,
      exp_score: row.exp_score,
      notice_score: row.notice_score,
      breakdown: parseJson(row.breakdown_json, []),
      ai_confidence: row.ai_confidence,
      uncertainty_notes: row.uncertainty_notes,
      recruiter_notes: row.recruiter_notes,
      recruiter_verified_by: row.recruiter_verified_by,
      pipeline_stage: row.pipeline_stage,
      rejection_reason: row.rejection_reason,
      rejection_notes: row.rejection_notes,
      client_feedback_notes: row.client_feedback_notes,
      interview_slots: row.interview_slots_json ? parseJson(row.interview_slots_json, null) : null,
      client_action_at: row.client_action_at,
      contact_masked: true
    };
  });

  logAccess({
    userId: req.user.id,
    userName: req.user.name,
    userRole: req.user.role,
    requisitionId: requisition.id,
    action: 'view_client_shortlist',
    ipAddress: req.ip,
    details: { candidate_count: candidates.length, masked: true }
  });

  res.json({
    requisition: {
      id: requisition.id,
      title: requisition.title,
      client_company: requisition.client_company,
      location: requisition.location,
      min_exp: requisition.min_exp,
      max_exp: requisition.max_exp,
      max_notice_days: requisition.max_notice_days
    },
    candidates
  });
});

// Client decisions. This route is intentionally client-only; recruiters cannot
// simulate a client decision from the internal workspace.
router.post('/action', requireRole(['client_hiring_manager']), (req, res) => {
  const requisitionId = text(req.body?.requisitionId, 40);
  const candidateId = text(req.body?.candidateId, 40);
  const action = text(req.body?.action, 30);
  const feedbackNotes = text(req.body?.feedbackNotes, 2000);
  const rejectionReason = text(req.body?.rejectionReason, 160);
  const interviewSlots = req.body?.interviewSlots;

  if (!requisitionId || !candidateId || !action) {
    return res.status(400).json({ error: 'Requisition, candidate and action are required.' });
  }

  const requisition = db.prepare('SELECT * FROM requisitions WHERE id = ?').get(requisitionId);
  if (!requisition) {
    return res.status(404).json({ error: 'Requisition not found.' });
  }
  if (!assertRequisitionAccess(req, res, requisition)) return;

  const evaluation = db.prepare(`
    SELECT * FROM cv_evaluations WHERE requisition_id = ? AND candidate_id = ?
  `).get(requisitionId, candidateId);

  const clientVisibleStages = ['submitted_to_client', 'client_shortlisted', 'interview_scheduled', 'offered', 'joined', 'rejected'];
  if (!evaluation || !clientVisibleStages.includes(evaluation.pipeline_stage)) {
    return res.status(404).json({ error: 'This candidate was not submitted to your portal.' });
  }

  if (evaluation.pipeline_stage === 'rejected') {
    return res.status(409).json({ error: 'This candidate has already been passed on.' });
  }

  if (action === 'reject') {
    if (!['submitted_to_client', 'client_shortlisted', 'interview_scheduled'].includes(evaluation.pipeline_stage)) {
      return res.status(409).json({ error: 'Only candidates in review or shortlisted can be rejected.' });
    }
    if (!rejectionReason) {
      return res.status(400).json({ error: 'Choose a reason before rejecting a candidate.' });
    }

    db.prepare(`
      UPDATE cv_evaluations
      SET pipeline_stage = 'rejected', rejection_reason = ?, rejection_notes = ?,
          client_feedback_notes = ?, client_action_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE requisition_id = ? AND candidate_id = ?
    `).run(rejectionReason, feedbackNotes || null, feedbackNotes || null, requisitionId, candidateId);

    logAccess({
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      candidateId,
      requisitionId,
      action: 'client_rejected',
      ipAddress: req.ip,
      details: { reason: rejectionReason, notes: feedbackNotes }
    });

    return res.json({ success: true, candidateId, newStage: 'rejected', message: 'Feedback sent to the recruiter.' });
  }

  if (action === 'shortlist') {
    if (evaluation.pipeline_stage !== 'submitted_to_client' && evaluation.pipeline_stage !== 'client_shortlisted') {
      return res.status(409).json({ error: 'This candidate is no longer awaiting a shortlist decision.' });
    }

    db.prepare(`
      UPDATE cv_evaluations
      SET pipeline_stage = 'client_shortlisted', client_feedback_notes = ?,
          rejection_reason = NULL, rejection_notes = NULL,
          client_action_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE requisition_id = ? AND candidate_id = ?
    `).run(feedbackNotes || 'Shortlisted for interview.', requisitionId, candidateId);

    logAccess({
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      candidateId,
      requisitionId,
      action: 'client_shortlisted',
      ipAddress: req.ip,
      details: { notes: feedbackNotes }
    });

    return res.json({ success: true, candidateId, newStage: 'client_shortlisted', message: 'Candidate shortlisted.' });
  }

  if (action === 'propose_slots') {
    if (!['submitted_to_client', 'client_shortlisted', 'interview_scheduled'].includes(evaluation.pipeline_stage)) {
      return res.status(409).json({ error: 'This candidate is not available for interview scheduling.' });
    }
    if (!Array.isArray(interviewSlots) || interviewSlots.length < 1 || interviewSlots.length > 3) {
      return res.status(400).json({ error: 'Propose between one and three interview slots.' });
    }

    const slots = [];
    for (const slot of interviewSlots) {
      const date = text(slot?.date, 20);
      const time = text(slot?.time, 40);
      const round = text(slot?.round, 120);
      const interviewer = text(slot?.interviewer, 120);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || !time || !round) {
        return res.status(400).json({ error: 'Each interview slot needs a valid date, time and round.' });
      }
      slots.push({ date, time, round, ...(interviewer ? { interviewer } : {}) });
    }

    db.prepare(`
      UPDATE cv_evaluations
      SET pipeline_stage = 'interview_scheduled', interview_slots_json = ?,
          client_feedback_notes = ?, rejection_reason = NULL, rejection_notes = NULL,
          client_action_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE requisition_id = ? AND candidate_id = ?
    `).run(JSON.stringify(slots), feedbackNotes || 'Interview slots proposed.', requisitionId, candidateId);

    logAccess({
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      candidateId,
      requisitionId,
      action: 'client_proposed_slots',
      ipAddress: req.ip,
      details: { slots }
    });

    return res.json({ success: true, candidateId, newStage: 'interview_scheduled', slots, message: 'Interview slots sent to the recruiter.' });
  }

  return res.status(400).json({ error: 'Invalid action. Use shortlist, reject or propose_slots.' });
});

module.exports = router;
