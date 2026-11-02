const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');

/**
 * DPDP Act 2023 Compliance Service
 * Handles access logging, consent records, and right-to-erasure workflows
 */

function logAccess({ userId, userName, userRole, candidateId = null, requisitionId = null, action, ipAddress = '127.0.0.1', details = {} }) {
  const logId = `AUD-${uuidv4().slice(0, 8)}`;
  
  db.prepare(`
    INSERT INTO access_audit_logs (id, user_id, user_name, user_role, candidate_id, requisition_id, action, ip_address, details_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(
    logId,
    userId || 'system',
    userName || 'Anonymous',
    userRole || 'recruiter',
    candidateId,
    requisitionId,
    action,
    ipAddress,
    JSON.stringify(details)
  );

  return logId;
}

function getAuditLogs({ candidateId = null, limit = 50 }) {
  if (candidateId) {
    return db.prepare(`
      SELECT * FROM access_audit_logs
      WHERE candidate_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(candidateId, limit);
  }

  return db.prepare(`
    SELECT * FROM access_audit_logs
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit);
}

function executeCandidateErasure({ candidateId, requestedBy, reason = 'Candidate requested right to erasure under DPDP Act 2023 Section 12' }) {
  const candidate = db.prepare('SELECT * FROM candidates WHERE id = ?').get(candidateId);
  if (!candidate) {
    throw new Error(`Candidate ${candidateId} not found`);
  }

  const anonymizedName = `Erased Candidate ${candidateId.slice(-4)}`;
  const anonymizedEmail = `erased.${candidateId.toLowerCase()}@dpdp.purged`;
  const anonymizedPhone = '+91 00000 00000';

  // Perform secure redaction while preserving audit trail
  db.prepare(`
    UPDATE candidates
    SET 
      name = ?,
      email = ?,
      phone = ?,
      raw_cv_text = '[DATA PURGED UNDER DPDP ACT 2023 RIGHT TO ERASURE - ' || CURRENT_TIMESTAMP || ']',
      file_hash = NULL,
      consent_status = 'deleted',
      is_deleted = 1,
      deleted_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(anonymizedName, anonymizedEmail, anonymizedPhone, candidateId);

  // Log compliance audit entry
  logAccess({
    userId: requestedBy.id || 'recruiter-admin',
    userName: requestedBy.name || 'Compliance Officer',
    userRole: requestedBy.role || 'recruiter',
    candidateId,
    action: 'candidate_deletion',
    details: {
      reason,
      erasure_type: 'DPDP_RIGHT_TO_ERASURE_SEC_12',
      timestamp: new Date().toISOString()
    }
  });

  return {
    success: true,
    candidateId,
    status: 'erased',
    receipt: `DPDP-PURGE-${uuidv4().slice(0, 12).toUpperCase()}`
  };
}

module.exports = {
  logAccess,
  getAuditLogs,
  executeCandidateErasure
};
