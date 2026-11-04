import { randomUUID } from 'node:crypto';
import db from '../db/database';

/**
 * DPDP Act 2023 Compliance Service
 * Handles access logging, consent records, and right-to-erasure workflows
 */

function logAccess({ userId, userName, userRole, candidateId = null, requisitionId = null, action, ipAddress = '127.0.0.1', details = {} }) {
  const logId = `AUD-${randomUUID().slice(0, 8)}`;
  
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

  // Perform secure redaction while preserving the audit trail. Direct
  // identifiers, the CV text and every derived profile field are cleared.
  // The evaluation row remains so stage history and audit references survive.
  const erase = db.transaction(() => {
    db.prepare(`
      UPDATE candidates
      SET
        name = ?,
        email = ?,
        phone = ?,
        current_role = 'Erased profile',
        total_exp_years = 0,
        key_skills_json = '[]',
        current_ctc = NULL,
        expected_ctc = NULL,
        notice_period_days = NULL,
        location = '',
        raw_cv_text = '[DATA PURGED UNDER DPDP ACT 2023 RIGHT TO ERASURE - ' || CURRENT_TIMESTAMP || ']',
        original_filename = NULL,
        file_hash = NULL,
        consent_status = 'deleted',
        is_deleted = 1,
        deleted_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(anonymizedName, anonymizedEmail, anonymizedPhone, candidateId);

    db.prepare(`
      UPDATE cv_evaluations
      SET breakdown_json = '[]',
          uncertainty_notes = 'Candidate data erased under the DPDP Act, 2023.',
          recruiter_notes = '[erased]',
          rejection_reason = NULL,
          rejection_notes = NULL,
          client_feedback_notes = '[erased]',
          interview_slots_json = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE candidate_id = ?
    `).run(candidateId);
  });
  erase();

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
    receipt: `DPDP-PURGE-${randomUUID().slice(0, 12).toUpperCase()}`
  };
}

export {
  logAccess,
  getAuditLogs,
  executeCandidateErasure
};
