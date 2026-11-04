import express from 'express';
import db from '../db/database';
import { authMiddleware, requireRole } from '../middleware/auth';
import { getAuditLogs, executeCandidateErasure } from '../services/dpdp_service';

const router = express.Router();
const INTERNAL_ROLES = ['recruiter', 'delivery_head'];

router.use(authMiddleware);
router.use(requireRole(INTERNAL_ROLES));

router.get('/audit-logs', (req, res) => {
  const candidateId = req.query.candidateId ? String(req.query.candidateId).slice(0, 40) : null;
  const parsedLimit = Number(req.query.limit || 50);
  const limit = Number.isFinite(parsedLimit) ? Math.min(200, Math.max(1, parsedLimit)) : 50;

  res.json({ logs: getAuditLogs({ candidateId, limit }) });
});

router.get('/consents', (req, res) => {
  const candidates = db.prepare(`
    SELECT id, name, email, consent_status, consent_date, consent_purpose, is_deleted, deleted_at, created_at
    FROM candidates
    ORDER BY created_at DESC
  `).all();

  const totalAuditEvents = db.prepare('SELECT COUNT(*) as count FROM access_audit_logs').get().count;

  res.json({
    stats: {
      total_registered: candidates.length,
      active_consents: candidates.filter((candidate) => candidate.consent_status === 'consented' && !candidate.is_deleted).length,
      erased_candidates: candidates.filter((candidate) => candidate.is_deleted === 1).length,
      total_audit_events: totalAuditEvents,
      compliance_framework: 'Digital Personal Data Protection Act, 2023'
    },
    candidates
  });
});

router.post('/erasure-request', (req, res) => {
  const candidateId = String(req.body?.candidateId || '').trim();
  const reason = String(req.body?.reason || '').trim().slice(0, 1000);

  if (!candidateId) {
    return res.status(400).json({ error: 'Choose a candidate whose data should be erased.' });
  }

  try {
    const result = executeCandidateErasure({
      candidateId,
      requestedBy: req.user,
      reason: reason || 'Candidate exercised the right to erasure under the DPDP Act, 2023.'
    });

    res.json({
      success: true,
      message: `Personal data for ${candidateId} has been erased. The audit record is retained without the CV content.`,
      result
    });
  } catch (error) {
    const status = /not found/i.test(error.message) ? 404 : 500;
    res.status(status).json({ error: error.message });
  }
});

export default router;
