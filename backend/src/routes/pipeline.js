const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { logAccess } = require('../services/dpdp_service');

router.use(authMiddleware);

// Get complete pipeline stage counts and grouped candidates for a requisition
router.get('/:requisitionId', (req, res) => {
  const reqId = req.params.requisitionId;

  const requisition = db.prepare('SELECT * FROM requisitions WHERE id = ?').get(reqId);
  if (!requisition) {
    return res.status(404).json({ error: 'Requisition not found' });
  }

  const stages = [
    'sourced',
    'ai_screened',
    'recruiter_verified',
    'submitted_to_client',
    'client_shortlisted',
    'interview_scheduled',
    'offered',
    'joined',
    'rejected'
  ];

  const evaluations = db.prepare(`
    SELECT 
      c.id, c.name, c.email, c.phone, c.current_role, c.total_exp_years,
      c.key_skills_json, c.notice_period_days, c.location,
      e.id as evaluation_id, e.overall_score, e.skills_score, e.ai_confidence,
      e.recruiter_verified, e.recruiter_verified_by, e.pipeline_stage,
      e.rejection_reason, e.client_feedback_notes, e.interview_slots_json,
      e.updated_at
    FROM cv_evaluations e
    JOIN candidates c ON e.candidate_id = c.id
    WHERE e.requisition_id = ? AND c.is_deleted = 0
    ORDER BY e.overall_score DESC
  `).all(reqId);

  const pipeline = {};
  stages.forEach(s => {
    pipeline[s] = [];
  });

  evaluations.forEach(ev => {
    const stage = ev.pipeline_stage || 'ai_screened';
    if (pipeline[stage]) {
      pipeline[stage].push({
        ...ev,
        key_skills: JSON.parse(ev.key_skills_json || '[]'),
        interview_slots: ev.interview_slots_json ? JSON.parse(ev.interview_slots_json) : null
      });
    }
  });

  res.json({
    requisitionId: reqId,
    requisitionTitle: requisition.title,
    clientCompany: requisition.client_company,
    pipeline
  });
});

// Move candidate to a different pipeline stage
router.post('/move', requireRole(['recruiter', 'delivery_head', 'client_hiring_manager']), (req, res) => {
  const { requisitionId, candidateId, targetStage, notes, rejectionReason } = req.body;

  if (!requisitionId || !candidateId || !targetStage) {
    return res.status(400).json({ error: 'requisitionId, candidateId, and targetStage are required' });
  }

  const evaluation = db.prepare(`
    SELECT * FROM cv_evaluations
    WHERE requisition_id = ? AND candidate_id = ?
  `).get(requisitionId, candidateId);

  if (!evaluation) {
    return res.status(404).json({ error: 'Evaluation record not found for this candidate and requisition' });
  }

  // MANDATORY CONSTRAINT CHECK: "a recruiter must open a CV before submitting it"
  if (targetStage === 'submitted_to_client' && !evaluation.recruiter_verified) {
    return res.status(400).json({
      error: 'Action Blocked: Per Company A quality & compliance policy, a recruiter must open and verify the candidate CV before submitting to client.'
    });
  }

  const currentStage = evaluation.pipeline_stage;

  db.prepare(`
    UPDATE cv_evaluations
    SET 
      pipeline_stage = ?,
      rejection_reason = ?,
      recruiter_notes = COALESCE(?, recruiter_notes),
      updated_at = CURRENT_TIMESTAMP
    WHERE requisition_id = ? AND candidate_id = ?
  `).run(
    targetStage,
    targetStage === 'rejected' ? rejectionReason || 'Candidate withdrawn or not shortlisted' : null,
    notes || null,
    requisitionId,
    candidateId
  );

  logAccess({
    userId: req.user.id,
    userName: req.user.name,
    userRole: req.user.role,
    candidateId,
    requisitionId,
    action: 'stage_change',
    details: {
      from: currentStage,
      to: targetStage,
      notes,
      rejectionReason
    }
  });

  res.json({
    success: true,
    candidateId,
    previousStage: currentStage,
    newStage: targetStage,
    message: `Candidate moved from ${currentStage} to ${targetStage}`
  });
});

// Batch submit verified candidates to Client Portal
router.post('/batch-submit', requireRole(['recruiter', 'delivery_head']), (req, res) => {
  const { requisitionId, candidateIds } = req.body;

  if (!requisitionId || !Array.isArray(candidateIds) || candidateIds.length === 0) {
    return res.status(400).json({ error: 'requisitionId and non-empty candidateIds array required' });
  }

  const submitted = [];
  const blockedNotVerified = [];

  const updateStmt = db.prepare(`
    UPDATE cv_evaluations
    SET pipeline_stage = 'submitted_to_client', updated_at = CURRENT_TIMESTAMP
    WHERE requisition_id = ? AND candidate_id = ?
  `);

  for (const cid of candidateIds) {
    const ev = db.prepare(`
      SELECT * FROM cv_evaluations WHERE requisition_id = ? AND candidate_id = ?
    `).get(requisitionId, cid);

    if (!ev) continue;

    if (!ev.recruiter_verified) {
      blockedNotVerified.push(cid);
    } else {
      updateStmt.run(requisitionId, cid);
      submitted.push(cid);

      logAccess({
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        candidateId: cid,
        requisitionId,
        action: 'stage_change',
        details: { from: ev.pipeline_stage, to: 'submitted_to_client', via: 'batch_submission' }
      });
    }
  }

  res.json({
    success: true,
    submittedCount: submitted.length,
    submittedIds: submitted,
    blockedCount: blockedNotVerified.length,
    blockedIds: blockedNotVerified,
    message: blockedNotVerified.length > 0 
      ? `Submitted ${submitted.length} candidates. ${blockedNotVerified.length} blocked because recruiter verification is required first.`
      : `Successfully submitted ${submitted.length} candidates to client portal!`
  });
});

module.exports = router;
