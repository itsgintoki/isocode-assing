import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Trash2, 
  Lock, 
  Eye, 
  FileText, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Download,
  Search
} from 'lucide-react';

export default function DPDPCompliance({
  currentUser
}) {
  const [auditLogs, setAuditLogs] = useState([]);
  const [consentData, setConsentData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorNotice, setErrorNotice] = useState(null);

  // Erasure form state
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [erasureReason, setErasureReason] = useState('Candidate exercised Right to Erasure under DPDP Act 2023 Section 12');
  const [isDeleting, setIsDeleting] = useState(false);
  const [erasureReceipt, setErasureReceipt] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    setErrorNotice(null);
    try {
      const [logsRes, consentRes] = await Promise.all([
        fetch('/api/dpdp/audit-logs?limit=50', {
          headers: { 'x-user-id': currentUser?.id || 'usr_recruiter_priya' }
        }),
        fetch('/api/dpdp/consents', {
          headers: { 'x-user-id': currentUser?.id || 'usr_recruiter_priya' }
        })
      ]);

      const logs = await logsRes.json();
      const consents = await consentRes.json();

      setAuditLogs(logs.logs || []);
      setConsentData(consents);
    } catch (err) {
      setErrorNotice(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentUser?.id]);

  const handleExecuteErasure = async (e) => {
    e.preventDefault();
    if (!selectedCandidateId) return;

    if (!window.confirm(`Are you sure you want to permanently erase all personal identifiable data and raw CV text for candidate ${selectedCandidateId} under DPDP Act 2023? This action is irreversible.`)) {
      return;
    }

    setIsDeleting(true);
    setErasureReceipt(null);
    setErrorNotice(null);

    try {
      const res = await fetch('/api/dpdp/erasure-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser?.id || 'usr_recruiter_priya'
        },
        body: JSON.stringify({
          candidateId: selectedCandidateId,
          reason: erasureReason
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erasure execution failed');

      setErasureReceipt(data.result);
      setSelectedCandidateId('');
      fetchData();
    } catch (err) {
      setErrorNotice(err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header Banner */}
      <div 
        className="card" 
        style={{
          background: 'linear-gradient(135deg, #064e3b 0%, #065f46 100%)',
          color: '#ffffff',
          padding: '1.5rem',
          border: 'none'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.25rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, background: 'rgba(255,255,255,0.2)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                DPDP ACT 2023 COMPLIANCE
              </span>
              <span style={{ fontSize: '0.8rem', color: '#a7f3d0' }}>
                Data Principal Protection & Regulatory Privacy Hub
              </span>
            </div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 800, margin: '0.2rem 0', color: '#ffffff' }}>
              Candidate Consent, Access Audit & Right to Erasure
            </h1>
            <p style={{ fontSize: '0.85rem', color: '#d1fae5', margin: 0 }}>
              Full compliance with the Digital Personal Data Protection Act 2023: verified lawful purpose, access logging, and prompt deletion on request.
            </p>
          </div>
        </div>
      </div>

      {errorNotice && (
        <div style={{ padding: '0.75rem 1rem', borderRadius: '8px', background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', fontSize: '0.85rem' }}>
          {errorNotice}
        </div>
      )}

      {/* Compliance Stats Cards */}
      {consentData?.stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
          <div className="card" style={{ padding: '1.25rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              Active Consents Logged
            </span>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#059669' }}>
              {consentData.stats.active_consents}
            </div>
            <p style={{ fontSize: '0.72rem', color: '#64748b', margin: '0.25rem 0 0 0' }}>
              Lawful hiring evaluation purpose recorded
            </p>
          </div>

          <div className="card" style={{ padding: '1.25rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              Access Audit Log Entries
            </span>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#2563eb' }}>
              {auditLogs.length}
            </div>
            <p style={{ fontSize: '0.72rem', color: '#64748b', margin: '0.25rem 0 0 0' }}>
              Every CV view, role, action, and timestamp tracked
            </p>
          </div>

          <div className="card" style={{ padding: '1.25rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              Right to Erasure (Purged)
            </span>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#dc2626' }}>
              {consentData.stats.erased_candidates}
            </div>
            <p style={{ fontSize: '0.72rem', color: '#64748b', margin: '0.25rem 0 0 0' }}>
              Personal data erased under Section 12
            </p>
          </div>
        </div>
      )}

      {/* 2-Column: Right to Erasure Execution & Consent Registry */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        {/* Left: Execute Right to Erasure Form */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Trash2 size={18} color="#dc2626" />
            Candidate Right to Erasure (Section 12 DPDP Act)
          </h2>
          <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '1.25rem' }}>
            When a candidate requests deletion or withdraws consent, this workflow permanently purges their raw CV text, anonymizes contact details, and logs a compliance receipt.
          </p>

          <form onSubmit={handleExecuteErasure} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.35rem' }}>
                Select Candidate to Erase:
              </label>
              <select
                value={selectedCandidateId}
                onChange={(e) => setSelectedCandidateId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.55rem',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.85rem',
                  outline: 'none',
                  background: '#ffffff'
                }}
                required
              >
                <option value="">-- Choose Candidate Profile --</option>
                {(consentData?.candidates || [])
                  .filter(c => !c.is_deleted)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.id}) • {c.email}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.35rem' }}>
                Reason for Erasure Request:
              </label>
              <input
                type="text"
                value={erasureReason}
                onChange={(e) => setErasureReason(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.55rem',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.825rem',
                  outline: 'none'
                }}
                required
              />
            </div>

            <button
              type="submit"
              disabled={isDeleting || !selectedCandidateId}
              className="btn btn-danger"
              style={{ alignSelf: 'flex-start' }}
            >
              <Trash2 size={15} />
              <span>{isDeleting ? 'Purging Personal Data...' : 'Execute Permanent Erasure'}</span>
            </button>
          </form>

          {/* Purge Certificate Receipt Box */}
          {erasureReceipt && (
            <div style={{ marginTop: '1.25rem', background: '#f0fdf4', border: '1px solid #a7f3d0', borderRadius: '8px', padding: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#065f46', fontWeight: 700, fontSize: '0.875rem', marginBottom: '0.25rem' }}>
                <CheckCircle2 size={16} />
                Erasure Receipt Issued
              </div>
              <p style={{ fontSize: '0.78rem', color: '#047857', margin: 0 }}>
                Candidate <strong>{erasureReceipt.candidateId}</strong> has been purged. Receipt Hash: <code style={{ fontFamily: 'monospace' }}>{erasureReceipt.receipt}</code>. Logged in audit registry.
              </p>
            </div>
          )}
        </div>

        {/* Right: Consent Registry */}
        <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Lock size={18} color="#059669" />
            Candidate Consent Registry
          </h2>
          <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '1rem' }}>
            All candidates in Company A systems maintain explicit consent records with verified timestamps and specific hiring evaluation purpose.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '280px', overflowY: 'auto' }}>
            {(consentData?.candidates || []).map((cand) => (
              <div
                key={cand.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.6rem 0.85rem',
                  background: cand.is_deleted ? '#fef2f2' : '#f8fafc',
                  border: `1px solid ${cand.is_deleted ? '#fecaca' : '#e2e8f0'}`,
                  borderRadius: '6px',
                  fontSize: '0.8rem'
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, color: cand.is_deleted ? '#991b1b' : '#0f172a' }}>
                    {cand.name}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                    {cand.id} • Consent: {cand.consent_date?.slice(0, 10)}
                  </div>
                </div>

                <span style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  padding: '0.15rem 0.45rem',
                  borderRadius: '4px',
                  background: cand.is_deleted ? '#fee2e2' : '#ecfdf5',
                  color: cand.is_deleted ? '#991b1b' : '#065f46'
                }}>
                  {cand.is_deleted ? 'DATA PURGED' : 'CONSENTED'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Access Audit Trail Log */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">
            <Clock size={18} color="#2563eb" />
            Immutable Access & Activity Audit Trail
          </h2>
          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
            Mandatory under DPDP Act 2023 • Records who viewed unmasked CVs & actions taken
          </span>
        </div>

        <div className="candidate-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>User & Role</th>
                <th>Candidate ID</th>
                <th>Action Logged</th>
                <th>IP Address</th>
                <th>Audit Context Details</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((log) => {
                let detailsStr = '';
                try {
                  const d = JSON.parse(log.details_json || '{}');
                  detailsStr = Object.entries(d).map(([k, v]) => `${k}: ${v}`).join('; ');
                } catch (e) {
                  detailsStr = log.details_json || '';
                }

                return (
                  <tr key={log.id}>
                    <td>
                      <span style={{ fontSize: '0.78rem', color: '#64748b', fontFamily: 'monospace' }}>
                        {log.created_at}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 600, color: '#0f172a' }}>{log.user_name}</span>
                        <span style={{ fontSize: '0.72rem', color: '#64748b' }}>({log.user_role})</span>
                      </div>
                    </td>
                    <td>
                      <span style={{ fontWeight: 600, color: '#2563eb', fontSize: '0.8rem' }}>
                        {log.candidate_id || 'System'}
                      </span>
                    </td>
                    <td>
                      <span style={{
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        padding: '0.15rem 0.45rem',
                        borderRadius: '4px',
                        background: log.action.includes('delete') ? '#fef2f2' : '#f1f5f9',
                        color: log.action.includes('delete') ? '#991b1b' : '#334155'
                      }}>
                        {log.action}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.75rem', color: '#64748b', fontFamily: 'monospace' }}>
                        {log.ip_address}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.75rem', color: '#475569' }}>
                        {detailsStr || 'Standard viewing event'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
