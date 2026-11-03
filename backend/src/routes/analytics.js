const express = require('express');
const db = require('../db/database');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();
const INTERNAL_ROLES = ['recruiter', 'delivery_head'];

router.use(authMiddleware);
router.use(requireRole(INTERNAL_ROLES));

router.get('/calibration-audits', (req, res) => {
  const audits = db.prepare(`
    SELECT
      ca.*,
      c.name as candidate_name,
      c.current_role,
      r.title as requisition_title,
      r.client_company
    FROM calibration_audits ca
    JOIN candidates c ON ca.candidate_id = c.id
    JOIN requisitions r ON ca.requisition_id = r.id
    ORDER BY ca.created_at DESC
  `).all();

  const totalAudits = audits.length;
  const alignedCount = audits.filter((audit) => audit.agreement_status === 'aligned').length;
  const minorDiscrepancies = audits.filter((audit) => audit.agreement_status === 'minor_discrepancy').length;
  const majorOverrides = audits.filter((audit) => audit.agreement_status === 'major_override').length;
  const alignmentRate = totalAudits > 0 ? Math.round((alignedCount / totalAudits) * 100) : null;

  res.json({
    summary: {
      totalAudits,
      alignedCount,
      minorDiscrepancies,
      majorOverrides,
      alignmentRate,
      status: alignmentRate === null
        ? 'No weekly sample recorded yet'
        : alignmentRate >= 80
          ? 'Within the calibration target'
          : 'Review overrides with the delivery head'
    },
    audits
  });
});

router.post('/calibration-audits', requireRole(['delivery_head']), (req, res) => {
  const weekLabel = String(req.body?.weekLabel || 'Current week').trim().slice(0, 80);
  const requisitionId = String(req.body?.requisitionId || '').trim();
  const candidateId = String(req.body?.candidateId || '').trim();
  const aiRank = Number(req.body?.aiRank);
  const recruiterRank = Number(req.body?.recruiterRank);
  const overrideReason = String(req.body?.overrideReason || '').trim().slice(0, 1000);

  if (!requisitionId || !candidateId || !Number.isInteger(aiRank) || !Number.isInteger(recruiterRank)) {
    return res.status(400).json({ error: 'Requisition, candidate and integer ranks are required.' });
  }
  if (aiRank < 1 || recruiterRank < 1 || aiRank > 500 || recruiterRank > 500) {
    return res.status(400).json({ error: 'Ranks must be between 1 and 500.' });
  }

  const evaluation = db.prepare(`
    SELECT id FROM cv_evaluations WHERE requisition_id = ? AND candidate_id = ?
  `).get(requisitionId, candidateId);
  if (!evaluation) {
    return res.status(400).json({ error: 'This candidate is not evaluated for that requisition.' });
  }

  const discrepancyScore = Math.abs(aiRank - recruiterRank);
  const agreementStatus = discrepancyScore === 0
    ? 'aligned'
    : discrepancyScore <= 2
      ? 'minor_discrepancy'
      : 'major_override';
  const id = `cal_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  db.prepare(`
    INSERT INTO calibration_audits (
      id, week_label, requisition_id, candidate_id, ai_rank, recruiter_rank,
      discrepancy_score, agreement_status, recruiter_override_reason, audited_by, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(id, weekLabel, requisitionId, candidateId, aiRank, recruiterRank, discrepancyScore, agreementStatus, overrideReason || 'No override reason recorded.', req.user.name);

  res.status(201).json({ success: true, id, discrepancyScore, agreementStatus });
});

router.get('/kpi-metrics', (req, res) => {
  const count = (query, ...params) => db.prepare(query).get(...params).count;

  const activeRequisitions = count("SELECT COUNT(*) as count FROM requisitions WHERE status IN ('active', 'shortlisting', 'interviews')");
  const candidates = count('SELECT COUNT(*) as count FROM candidates WHERE is_deleted = 0');
  const evaluations = count('SELECT COUNT(*) as count FROM cv_evaluations');
  const verified = count("SELECT COUNT(*) as count FROM cv_evaluations WHERE recruiter_verified = 1");
  const submitted = count("SELECT COUNT(*) as count FROM cv_evaluations WHERE pipeline_stage IN ('submitted_to_client', 'client_shortlisted', 'interview_scheduled', 'offered', 'joined', 'rejected')");
  const shortlisted = count("SELECT COUNT(*) as count FROM cv_evaluations WHERE pipeline_stage IN ('client_shortlisted', 'interview_scheduled', 'offered', 'joined')");
  const interviews = count("SELECT COUNT(*) as count FROM cv_evaluations WHERE pipeline_stage IN ('interview_scheduled', 'offered', 'joined')");
  const joined = count("SELECT COUNT(*) as count FROM cv_evaluations WHERE pipeline_stage = 'joined'");
  const clientDecisions = count("SELECT COUNT(*) as count FROM cv_evaluations WHERE pipeline_stage IN ('client_shortlisted', 'interview_scheduled', 'offered', 'joined', 'rejected')");

  const stageRows = db.prepare(`
    SELECT pipeline_stage, COUNT(*) as count
    FROM cv_evaluations
    GROUP BY pipeline_stage
  `).all();
  const stageCounts = Object.fromEntries(stageRows.map((row) => [row.pipeline_stage, row.count]));

  res.json({
    summary: {
      active_requisitions: activeRequisitions,
      candidates,
      evaluations,
      verified,
      submitted,
      shortlisted,
      interviews,
      joined,
      client_decisions: clientDecisions,
      client_acceptance_rate: clientDecisions > 0 ? Math.round((shortlisted / clientDecisions) * 100) : null,
      verification_rate: evaluations > 0 ? Math.round((verified / evaluations) * 100) : null
    },
    stage_counts: stageCounts,
    notes: {
      acceptance_rate: 'Share of client-reviewed candidates that were shortlisted, interviewed, offered or joined.',
      verification_rate: 'Share of evaluated CVs a recruiter has explicitly opened and verified.'
    }
  });
});

module.exports = router;
