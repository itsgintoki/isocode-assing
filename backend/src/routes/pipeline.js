const express = require('express');
const db = require('../db/database');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { logAccess } = require('../services/dpdp_service');

const router = express.Router();
const INTERNAL_ROLES = ['recruiter', 'delivery_head'];
const ALL_STAGES = ['sourced', 'ai_screened', 'recruiter_verified', 'submitted_to_client', 'client_shortlisted', 'interview_scheduled', 'offered', 'joined', 'rejected'];
const INTERNAL_MOVE_STAGES = ['sourced', 'ai_screened', 'recruiter_verified', 'submitted_to_client', 'offered', 'joined', 'rejected'];

router.use(authMiddleware);
router.use(requireRole(INTERNAL_ROLES));

function parseJson(value, fallback) {
  try {
    return JSON.parse(value || '');
  } catch {
    return fallback;
  }
}

router.get('/:requisitionId', (req, res) => {
  const requisition = db.prepare('SELECT * FROM requisitions WHERE id = ?').get(req.params.requisitionId);
  if (!requisition) {
    return res.status(404).json({ error: 'Requisition not found.' });
  }

  const evaluations = db.prepare(`
    SELECT
      c.id, c.name, c.email, c.phone, c.current_role, c.total_exp_years,
      c.key_skills_json, c.notice_period_days, c.location,
      e.id as evaluation_id, e.overall_score, e.skills_score, e.ai_confidence,
      e.recruiter_verified, e.recruiter_verified_by, e.pipeline_stage,
      e.rejection_reason, e.rejection_notes, e.client_feedback_notes,
      e.interview_slots_json, e.updated_at
    FROM cv_evaluations e
    JOIN candidates c ON e.candidate_id = c.id
    WHERE e.requisition_id = ? AND c.is_deleted = 0
    ORDER BY e.overall_score DESC
  `).all(req.params.requisitionId);

  const pipeline = Object.fromEntries(ALL_STAGES.map((stage) => [stage, []]));
  for (const evaluation of evaluations) {
    const stage = evaluation.pipeline_stage || 'ai_screened';
    if (!pipeline[stage]) continue;
    pipeline[stage].push({
      ...evaluation,
      key_skills: parseJson(evaluation.key_skills_json, []),
      interview_slots: evaluation.interview_slots_json ? parseJson(evaluation.interview_slots_json, null) : null
    });
  }

  res.json({
    requisitionId: requisition.id,
    requisitionTitle: requisition.title,
    clientCompany: requisition.client_company,
    pipeline
  });
});

router.post('/move', (req, res) => {
  const requisitionId = String(req.body?.requisitionId || '').trim();
  const candidateId = String(req.body?.candidateId || '').trim();
  const targetStage = String(req.body?.targetStage || '').trim();
  const notes = String(req.body?.notes || '').trim().slice(0, 3000);
  const rejectionReason = String(req.body?.rejectionReason || '').trim().slice(0, 200);

  if (!requisitionId || !candidateId || !targetStage) {
    return res.status(400).json({ error: 'Requisition, candidate and target stage are required.' });
  }
  if (!ALL_STAGES.includes(targetStage)) {
    return res.status(400).json({ error: 'Unknown pipeline stage.' });
  }
  if (!INTERNAL_MOVE_STAGES.includes(targetStage)) {
    return res.status(403).json({
      error: 'Client decisions (shortlist and interview) can only be recorded from the client portal.'
    });
  }

  const evaluation = db.prepare(`
    SELECT * FROM cv_evaluations WHERE requisition_id = ? AND candidate_id = ?
  `).get(requisitionId, candidateId);

  if (!evaluation) {
    return res.status(404).json({ error: 'Evaluation not found for this candidate and requisition.' });
  }

  if (targetStage === 'submitted_to_client' && !evaluation.recruiter_verified) {
    return res.status(400).json({
      error: 'Verify the CV before submitting this candidate to the client.'
    });
  }

  const currentStage = evaluation.pipeline_stage;
  db.prepare(`
    UPDATE cv_evaluations
    SET pipeline_stage = ?, rejection_reason = ?, recruiter_notes = COALESCE(?, recruiter_notes),
        updated_at = CURRENT_TIMESTAMP
    WHERE requisition_id = ? AND candidate_id = ?
  `).run(
    targetStage,
    targetStage === 'rejected' ? rejectionReason || 'Not progressing in this requisition.' : null,
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
    ipAddress: req.ip,
    details: { from: currentStage, to: targetStage, notes, rejectionReason }
  });

  res.json({
    success: true,
    candidateId,
    previousStage: currentStage,
    newStage: targetStage,
    message: `Candidate moved to ${targetStage.replace(/_/g, ' ')}.`
  });
});

router.post('/batch-submit', requireRole(INTERNAL_ROLES), (req, res) => {
  const requisitionId = String(req.body?.requisitionId || '').trim();
  const candidateIds = Array.isArray(req.body?.candidateIds) ? req.body.candidateIds : [];

  if (!requisitionId || candidateIds.length === 0 || candidateIds.length > 100) {
    return res.status(400).json({ error: 'Select between 1 and 100 candidates to submit.' });
  }

  const submitted = [];
  const blocked = [];
  const update = db.prepare(`
    UPDATE cv_evaluations
    SET pipeline_stage = 'submitted_to_client', updated_at = CURRENT_TIMESTAMP
    WHERE requisition_id = ? AND candidate_id = ?
  `);

  const run = db.transaction(() => {
    for (const candidateId of candidateIds) {
      const evaluation = db.prepare(`
        SELECT * FROM cv_evaluations WHERE requisition_id = ? AND candidate_id = ?
      `).get(requisitionId, candidateId);

      if (!evaluation) {
        blocked.push({ candidateId, reason: 'No evaluation for this requisition.' });
        continue;
      }
      if (!evaluation.recruiter_verified) {
        blocked.push({ candidateId, reason: 'Recruiter verification required.' });
        continue;
      }
      if (evaluation.pipeline_stage === 'rejected') {
        blocked.push({ candidateId, reason: 'Rejected candidate cannot be submitted.' });
        continue;
      }

      update.run(requisitionId, candidateId);
      submitted.push(candidateId);

      logAccess({
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        candidateId,
        requisitionId,
        action: 'stage_change',
        ipAddress: req.ip,
        details: { from: evaluation.pipeline_stage, to: 'submitted_to_client', via: 'batch_submission' }
      });
    }
  });
  run();

  res.json({
    success: true,
    submittedCount: submitted.length,
    submittedIds: submitted,
    blockedCount: blocked.length,
    blocked,
    message: blocked.length > 0
      ? `Submitted ${submitted.length}. ${blocked.length} could not be submitted because verification is still required.`
      : `Submitted ${submitted.length} candidate${submitted.length === 1 ? '' : 's'} to the client.`
  });
});

module.exports = router;
