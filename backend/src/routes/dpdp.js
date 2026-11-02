const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { getAuditLogs, executeCandidateErasure, logAccess } = require('../services/dpdp_service');

router.use(authMiddleware);

// Get DPDP access and activity audit logs
router.get('/audit-logs', (req, res) => {
  const { candidateId, limit = 50 } = req.query;
  const logs = getAuditLogs({ candidateId, limit: parseInt(limit, 10) });
  res.json({ logs });
});

// Get Candidate Consent Registry
router.get('/consents', (req, res) => {
  const candidates = db.prepare(`
    SELECT id, name, email, consent_status, consent_date, consent_purpose, is_deleted, deleted_at, created_at
    FROM candidates
    ORDER BY created_at DESC
  `).all();

  const stats = {
    total_registered: candidates.length,
    active_consents: candidates.filter(c => c.consent_status === 'consented' && !c.is_deleted).length,
    erased_candidates: candidates.filter(c => c.is_deleted === 1).length,
    compliance_framework: 'Digital Personal Data Protection Act 2023 (DPDP Act)'
  };

  res.json({ stats, candidates });
});

// Candidate Right to Erasure / Deletion on Request (DPDP Act Section 12)
router.post('/erasure-request', requireRole(['recruiter', 'delivery_head']), (req, res) => {
  const { candidateId, reason } = req.body;

  if (!candidateId) {
    return res.status(400).json({ error: 'candidateId is required' });
  }

  try {
    const result = executeCandidateErasure({
      candidateId,
      requestedBy: req.user,
      reason: reason || 'Candidate exercised Right to Erasure under DPDP Act 2023'
    });

    res.json({
      success: true,
      message: `Candidate ${candidateId} personal data successfully purged in compliance with DPDP Act 2023.`,
      result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
