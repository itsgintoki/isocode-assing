const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { maskCandidateForClient } = require('../services/pii_masker');
const { logAccess } = require('../services/dpdp_service');

router.use(authMiddleware);

// Middleware: Verify client access and scope to client company
function clientScopeMiddleware(req, res, next) {
  // Recruiters and Delivery heads can preview client view; Client hiring managers are strictly scoped
  if (req.user.role === 'client_hiring_manager') {
    req.clientCompany = req.user.company_name;
  }
  next();
}

router.use(clientScopeMiddleware);

// Get requisitions submitted to this client
router.get('/requisitions', (req, res) => {
  let query = `
    SELECT 
      r.id, r.title, r.department, r.client_company, r.status, r.openings_count,
      r.min_exp, r.max_exp, r.max_notice_days, r.location,
      COUNT(CASE WHEN e.pipeline_stage IN ('submitted_to_client', 'client_shortlisted', 'interview_scheduled', 'offered', 'joined') THEN 1 END) as pending_review_count,
      COUNT(CASE WHEN e.pipeline_stage = 'client_shortlisted' THEN 1 END) as shortlisted_count,
      COUNT(CASE WHEN e.pipeline_stage = 'interview_scheduled' THEN 1 END) as interview_count
    FROM requisitions r
    LEFT JOIN cv_evaluations e ON r.id = e.requisition_id
  `;

  if (req.clientCompany) {
    query += ` WHERE r.client_company = ? `;
    query += ` GROUP BY r.id ORDER BY r.created_at DESC`;
    const rows = db.prepare(query).all(req.clientCompany);
    return res.json({ requisitions: rows });
  }

  query += ` GROUP BY r.id ORDER BY r.created_at DESC`;
  const rows = db.prepare(query).all();
  res.json({ requisitions: rows });
});

// Get submitted candidates for a client requisition with MASKED contact info
router.get('/shortlist/:requisitionId', (req, res) => {
  const reqId = req.params.requisitionId;

  const requisition = db.prepare('SELECT * FROM requisitions WHERE id = ?').get(reqId);
  if (!requisition) {
    return res.status(404).json({ error: 'Requisition not found' });
  }

  // Strict tenant isolation: client sees only their company's requisitions
  if (req.clientCompany && requisition.client_company !== req.clientCompany) {
    return res.status(403).json({ error: 'Access denied: Requisition belongs to another client company' });
  }

  // Query only candidates that have been submitted to client or progressed beyond
  const rows = db.prepare(`
    SELECT 
      c.id, c.name, c.email, c.phone, c.current_role, c.total_exp_years,
      c.key_skills_json, c.current_ctc, c.expected_ctc, c.notice_period_days,
      c.location, c.raw_cv_text, c.original_filename,
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
        ELSE 4
      END,
      e.overall_score DESC
  `).all(reqId);

  // Mask contact info for all candidates in client portal
  const maskedCandidates = rows.map(r => {
    const masked = maskCandidateForClient({
      id: r.id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      location: r.location,
      raw_cv_text: r.raw_cv_text
    });

    // Log client masked profile view in DPDP compliance log
    logAccess({
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      candidateId: r.id,
      requisitionId: reqId,
      action: 'view_masked_card',
      details: { client_company: requisition.client_company }
    });

    return {
      ...r,
      name: masked.name,
      email: masked.email,
      phone: masked.phone,
      contact_masked: true,
      raw_cv_text: masked.raw_cv_text,
      key_skills: JSON.parse(r.key_skills_json || '[]'),
      breakdown: JSON.parse(r.breakdown_json || '[]'),
      interview_slots: r.interview_slots_json ? JSON.parse(r.interview_slots_json) : null
    };
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
    candidates: maskedCandidates
  });
});

// Client action: Shortlist, Reject with reason, or Propose Interview Slots
router.post('/action', (req, res) => {
  const {
    requisitionId,
    candidateId,
    action, // 'shortlist', 'reject', 'propose_slots'
    feedbackNotes,
    rejectionReason,
    interviewSlots // [{ date, time, round, interviewer }]
  } = req.body;

  if (!requisitionId || !candidateId || !action) {
    return res.status(400).json({ error: 'requisitionId, candidateId, and action are required' });
  }

  const requisition = db.prepare('SELECT * FROM requisitions WHERE id = ?').get(requisitionId);
  if (!requisition) {
    return res.status(404).json({ error: 'Requisition not found' });
  }

  if (req.clientCompany && requisition.client_company !== req.clientCompany) {
    return res.status(403).json({ error: 'Access denied: Requisition belongs to another client company' });
  }

  let newStage = 'submitted_to_client';
  let slotsJson = null;

  if (action === 'shortlist') {
    newStage = 'client_shortlisted';
  } else if (action === 'reject') {
    newStage = 'rejected';
  } else if (action === 'propose_slots') {
    newStage = 'interview_scheduled';
    slotsJson = JSON.stringify(interviewSlots || []);
  } else {
    return res.status(400).json({ error: 'Invalid action. Allowed: shortlist, reject, propose_slots' });
  }

  db.prepare(`
    UPDATE cv_evaluations
    SET 
      pipeline_stage = ?,
      client_feedback_notes = ?,
      rejection_reason = ?,
      interview_slots_json = COALESCE(?, interview_slots_json),
      client_action_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE requisition_id = ? AND candidate_id = ?
  `).run(
    newStage,
    feedbackNotes || null,
    action === 'reject' ? (rejectionReason || 'Client did not proceed') : null,
    slotsJson,
    requisitionId,
    candidateId
  );

  logAccess({
    userId: req.user.id,
    userName: req.user.name,
    userRole: req.user.role,
    candidateId,
    requisitionId,
    action: `client_action_${action}`,
    details: {
      action,
      feedbackNotes,
      rejectionReason,
      interviewSlots
    }
  });

  res.json({
    success: true,
    candidateId,
    action,
    newStage,
    message: action === 'shortlist' 
      ? 'Candidate shortlisted by client!' 
      : (action === 'propose_slots' ? 'Interview slots proposed successfully!' : 'Candidate marked as rejected with structured feedback.')
  });
});

module.exports = router;
