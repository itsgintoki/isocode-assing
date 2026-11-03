import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  FileSearch,
  Lock,
  Search,
  ShieldCheck,
  Trash2,
  UserX
} from 'lucide-react';
import type { AuditLogEntry, ConsentData } from '../types';
import { complianceApi } from '../lib/api';
import { EmptyState, LoadingRows, Modal } from '../components/common';

interface CompliancePageProps {
  refreshToken: number;
  notify: (type: 'success' | 'error' | 'info', text: string) => void;
}

type Tab = 'audit' | 'consent';

function formatStamp(value?: string): string {
  if (!value) return '—';
  return value.replace('T', ' ').slice(0, 19);
}

function detailSummary(raw?: string): string {
  if (!raw) return 'No extra context';
  try {
    const parsed = JSON.parse(raw);
    return Object.entries(parsed)
      .map(([key, value]) => `${key.replace(/_/g, ' ')}: ${typeof value === 'object' ? JSON.stringify(value) : value}`)
      .join(' · ');
  } catch {
    return raw;
  }
}

export default function CompliancePage({ refreshToken, notify }: CompliancePageProps) {
  const [tab, setTab] = useState<Tab>('audit');
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [consents, setConsents] = useState<ConsentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [eraseOpen, setEraseOpen] = useState(false);
  const [eraseCandidateId, setEraseCandidateId] = useState('');
  const [eraseReason, setEraseReason] = useState(
    'Candidate exercised the right to erasure under the DPDP Act, 2023.'
  );
  const [erasing, setErasing] = useState(false);
  const [eraseError, setEraseError] = useState('');
  const [receipt, setReceipt] = useState<{ candidateId: string; receipt: string } | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    Promise.all([complianceApi.auditLogs(undefined, 100), complianceApi.consents()])
      .then(([logData, consentData]) => {
        if (!active) return;
        setLogs(logData.logs || []);
        setConsents(consentData);
      })
      .catch((fetchError) => {
        if (active) setError(fetchError instanceof Error ? fetchError.message : 'Could not load compliance records.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refreshToken, refresh]);

  const actions = useMemo(() => {
    return Array.from(new Set(logs.map((log) => log.action))).sort();
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const term = search.trim().toLowerCase();
    return logs.filter((log) => {
      if (actionFilter !== 'all' && log.action !== actionFilter) return false;
      if (!term) return true;
      return [log.user_name, log.user_role, log.candidate_id, log.requisition_id, log.action, log.ip_address]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [logs, search, actionFilter]);

  const activeCandidates = (consents?.candidates || []).filter((candidate) => !candidate.is_deleted);

  const openErase = () => {
    setEraseCandidateId(activeCandidates[0]?.id || '');
    setEraseReason('Candidate exercised the right to erasure under the DPDP Act, 2023.');
    setEraseError('');
    setReceipt(null);
    setEraseOpen(true);
  };

  const erase = async () => {
    if (!eraseCandidateId) {
      setEraseError('Choose a candidate.');
      return;
    }
    setErasing(true);
    setEraseError('');
    try {
      const result = await complianceApi.erase(eraseCandidateId, eraseReason);
      setReceipt({ candidateId: result.result.candidateId, receipt: result.result.receipt });
      setEraseOpen(false);
      notify('success', result.message);
      setRefresh((value) => value + 1);
    } catch (eraseFailure) {
      setEraseError(eraseFailure instanceof Error ? eraseFailure.message : 'Could not complete the erasure.');
    } finally {
      setErasing(false);
    }
  };

  return (
    <div className="page-stack">
      <section className="page-intro">
        <div className="page-intro__main">
          <div className="page-intro__title-row">
            <span className="role-tag">DPDP Act, 2023</span>
            <h2>Consent, access and erasure</h2>
          </div>
          <p>
            Every CV open is logged. Consent is recorded per candidate, erasure removes personal data and
            CV content, and the audit trail remains without the erased profile.
          </p>
        </div>
        <div className="page-intro__actions">
          <button type="button" className="button button--danger-quiet" onClick={openErase} disabled={activeCandidates.length === 0}>
            <Trash2 size={16} /> Erase candidate data
          </button>
        </div>
      </section>

      {error && (
        <div className="inline-error inline-error--block">
          <AlertTriangle size={17} /> {error}
        </div>
      )}

      {receipt && (
        <div className="receipt-banner">
          <CheckCircle2 size={20} />
          <div>
            <strong>Erasure completed for {receipt.candidateId}</strong>
            <p>
              Receipt: <code>{receipt.receipt}</code>. Personal data and CV text were removed; the audit
              record is retained without the CV content.
            </p>
          </div>
          <button type="button" className="text-button" onClick={() => setReceipt(null)}>
            Dismiss
          </button>
        </div>
      )}

      {consents?.stats && (
        <section className="stats-row stats-row--four">
          <div className="stat-card">
            <span>Active consents</span>
            <strong>{consents.stats.active_consents}</strong>
            <small className="muted">lawful hiring purpose recorded</small>
          </div>
          <div className="stat-card">
            <span>Audit events</span>
            <strong>{consents.stats.total_audit_events}</strong>
            <small className="muted">views, verifications and decisions</small>
          </div>
          <div className="stat-card">
            <span>Erased profiles</span>
            <strong>{consents.stats.erased_candidates}</strong>
            <small className="muted">personal data removed</small>
          </div>
          <div className="stat-card stat-card--accent">
            <span>Framework</span>
            <strong className="stat-card__text">DPDP 2023</strong>
            <small>India’s data protection law</small>
          </div>
        </section>
      )}

      <div className="segmented" role="tablist" aria-label="Compliance view">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'audit'}
          className={tab === 'audit' ? 'is-active' : ''}
          onClick={() => setTab('audit')}
        >
          <FileSearch size={16} /> Access audit
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'consent'}
          className={tab === 'consent' ? 'is-active' : ''}
          onClick={() => setTab('consent')}
        >
          <Lock size={16} /> Consent registry
        </button>
      </div>

      {loading ? (
        <LoadingRows rows={5} />
      ) : tab === 'audit' ? (
        <section className="panel-card">
          <header className="section-heading section-heading--wrap">
            <div>
              <h2>Access audit trail</h2>
              <p>Who opened a CV, who verified it, and which client action followed.</p>
            </div>
            <div className="table-filters">
              <label className="search-field search-field--small">
                <Search size={16} />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search user, candidate or action"
                  aria-label="Search audit logs"
                />
              </label>
              <label className="select-field select-field--small">
                <select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)} aria-label="Filter action">
                  <option value="all">All actions</option>
                  {actions.map((action) => (
                    <option key={action} value={action}>
                      {action.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </header>

          {filteredLogs.length === 0 ? (
            <EmptyState
              icon={FileSearch}
              title="No audit events match"
              body="Clear the search or action filter to see the complete access trail."
              action={
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => {
                    setSearch('');
                    setActionFilter('all');
                  }}
                >
                  Clear filters
                </button>
              }
            />
          ) : (
            <div className="table-wrap">
              <table className="data-table audit-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Who</th>
                    <th>Action</th>
                    <th>Candidate / role</th>
                    <th>Context</th>
                    <th>IP</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="cell-nowrap">
                        <span className="is-mono">{formatStamp(log.created_at)}</span>
                      </td>
                      <td>
                        <strong>{log.user_name}</strong>
                        <span className="cell-sub">{log.user_role.replace(/_/g, ' ')}</span>
                      </td>
                      <td>
                        <span className={`action-chip ${log.action.includes('erasure') || log.action.includes('delete') ? 'is-danger' : ''}`}>
                          {log.action.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td>
                        <span className="is-mono">{log.candidate_id || '—'}</span>
                        <span className="cell-sub">{log.requisition_id || 'No requisition'}</span>
                      </td>
                      <td className="cell-note">{detailSummary(log.details_json)}</td>
                      <td className="cell-nowrap">
                        <span className="is-mono">{log.ip_address || '—'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="panel-note">
            Audit records are append-only in this demo. Erasing a candidate removes their personal data and CV
            content but keeps the access event so the action remains accountable.
          </p>
        </section>
      ) : (
        <div className="compliance-columns">
          <section className="panel-card">
            <header className="section-heading">
              <div>
                <h2>Candidate consent registry</h2>
                <p>Consent status, purpose and erasure state for every profile in the workspace.</p>
              </div>
              <span className="metric-badge">
                <Database size={14} /> {consents?.stats.total_registered || 0} records
              </span>
            </header>

            {!consents || consents.candidates.length === 0 ? (
              <EmptyState icon={UserX} title="No candidate records" body="Upload CVs to create consent records." />
            ) : (
              <div className="table-wrap">
                <table className="data-table consent-table">
                  <thead>
                    <tr>
                      <th>Candidate</th>
                      <th>Consent</th>
                      <th>Purpose</th>
                      <th>Recorded</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {consents.candidates.map((candidate) => (
                      <tr key={candidate.id} className={candidate.is_deleted ? 'is-erased' : ''}>
                        <td>
                          <strong>{candidate.name}</strong>
                          <span className="cell-sub">{candidate.id}</span>
                        </td>
                        <td>
                          <span className={`consent-chip ${candidate.consent_status === 'consented' && !candidate.is_deleted ? 'is-good' : 'is-muted'}`}>
                            {candidate.is_deleted ? 'withdrawn / erased' : candidate.consent_status}
                          </span>
                        </td>
                        <td className="cell-note">{candidate.consent_purpose || '—'}</td>
                        <td>
                          <span className="is-mono">{candidate.consent_date?.slice(0, 10) || '—'}</span>
                        </td>
                        <td>
                          <span className={`consent-chip ${candidate.is_deleted ? 'is-danger' : 'is-good'}`}>
                            {candidate.is_deleted ? 'data erased' : 'active'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <aside className="compliance-aside">
            <div className="side-card side-card--warning">
              <span className="eyebrow">Right to erasure</span>
              <h3>Remove personal data on request</h3>
              <p>
                Erasure clears the candidate’s name, contact details, raw CV text and other personal fields.
                Evaluation history and audit events remain for accountability.
              </p>
              <button type="button" className="button button--danger" onClick={openErase} disabled={activeCandidates.length === 0}>
                <Trash2 size={16} /> Erase a candidate
              </button>
            </div>
            <div className="side-card side-card--muted">
              <ShieldCheck size={18} />
              <strong>Scope of this build</strong>
              <p>
                This is a working demo of consent, access logging and erasure, not a legal compliance
                certification. Production use needs counsel, retention schedules and a grievance process.
              </p>
            </div>
          </aside>
        </div>
      )}

      {eraseOpen && (
        <Modal
          title="Erase candidate personal data"
          description="This cannot be undone. The audit trail stays, but the CV and contact details are removed."
          onClose={() => {
            if (!erasing) setEraseOpen(false);
          }}
          footer={
            <>
              <button type="button" className="button button--ghost" onClick={() => setEraseOpen(false)} disabled={erasing}>
                Cancel
              </button>
              <button type="button" className="button button--danger" onClick={erase} disabled={erasing || !eraseCandidateId}>
                <Trash2 size={16} /> {erasing ? 'Erasing…' : 'Erase permanently'}
              </button>
            </>
          }
        >
          <div className="danger-callout">
            <AlertTriangle size={18} />
            <p>
              The candidate disappears from every ranked list and client portal. Keep the request reason in
              the audit record.
            </p>
          </div>
          <div className="form-grid form-grid--single">
            <label className="field">
              <span>Candidate</span>
              <select value={eraseCandidateId} onChange={(event) => setEraseCandidateId(event.target.value)}>
                {activeCandidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name} · {candidate.id}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Reason for erasure</span>
              <textarea
                rows={3}
                value={eraseReason}
                onChange={(event) => setEraseReason(event.target.value)}
                maxLength={1000}
              />
            </label>
          </div>
          {eraseError && (
            <div className="inline-error">
              <AlertTriangle size={16} /> {eraseError}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
