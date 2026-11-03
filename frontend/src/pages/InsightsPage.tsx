import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Plus,
  RotateCcw,
  ShieldCheck,
  UserCheck
} from 'lucide-react';
import type { CalibrationData, Candidate, KpiData, Requisition, User } from '../types';
import { adminApi, analyticsApi, candidateApi } from '../lib/api';
import { EmptyState, LoadingRows } from '../components/common';
import { Modal } from '../components/common';

interface InsightsPageProps {
  user: User;
  requisitions: Requisition[];
  refreshToken: number;
  notify: (type: 'success' | 'error' | 'info', text: string) => void;
}

const STAGE_ORDER = [
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

const STAGE_LABEL: Record<string, string> = {
  sourced: 'Sourced',
  ai_screened: 'AI screened',
  recruiter_verified: 'Recruiter verified',
  submitted_to_client: 'With client',
  client_shortlisted: 'Client shortlisted',
  interview_scheduled: 'Interview',
  offered: 'Offer',
  joined: 'Joined',
  rejected: 'Passed'
};

function formatDate(value?: string): string {
  if (!value) return '—';
  return value.slice(0, 10);
}

export default function InsightsPage({ user, requisitions, refreshToken, notify }: InsightsPageProps) {
  const [kpis, setKpis] = useState<KpiData | null>(null);
  const [calibration, setCalibration] = useState<CalibrationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [auditOpen, setAuditOpen] = useState(false);
  const [savingAudit, setSavingAudit] = useState(false);
  const [auditError, setAuditError] = useState('');
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState('');
  const [auditRequisitionId, setAuditRequisitionId] = useState(requisitions[0]?.id || '');
  const [auditCandidates, setAuditCandidates] = useState<Candidate[]>([]);
  const [loadingAuditCandidates, setLoadingAuditCandidates] = useState(false);
  const [auditForm, setAuditForm] = useState({
    weekLabel: `Week ${Math.ceil((new Date().getDate() + 3) / 7)}`,
    candidateId: '',
    aiRank: 1,
    recruiterRank: 1,
    overrideReason: ''
  });

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    Promise.all([analyticsApi.kpis(), analyticsApi.calibration()])
      .then(([kpiData, calibrationData]) => {
        if (!active) return;
        setKpis(kpiData);
        setCalibration(calibrationData);
      })
      .catch((fetchError) => {
        if (active) setError(fetchError instanceof Error ? fetchError.message : 'Could not load delivery metrics.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refreshToken]);

  useEffect(() => {
    if (!auditOpen || !auditRequisitionId) return;
    let active = true;
    setLoadingAuditCandidates(true);
    setAuditCandidates([]);
    candidateApi
      .list(new URLSearchParams({ requisitionId: auditRequisitionId, sortBy: 'score', sortOrder: 'desc' }))
      .then((data) => {
        if (!active) return;
        setAuditCandidates(data.candidates || []);
        setAuditForm((current) => ({ ...current, candidateId: data.candidates?.[0]?.id || '' }));
      })
      .catch((fetchError) => {
        if (active) setAuditError(fetchError instanceof Error ? fetchError.message : 'Could not load candidates.');
      })
      .finally(() => {
        if (active) setLoadingAuditCandidates(false);
      });
    return () => {
      active = false;
    };
  }, [auditOpen, auditRequisitionId]);

  const stageRows = useMemo(() => {
    if (!kpis) return [];
    const max = Math.max(1, ...STAGE_ORDER.map((stage) => kpis.stage_counts[stage] || 0));
    return STAGE_ORDER.map((stage) => ({
      stage,
      count: kpis.stage_counts[stage] || 0,
      width: Math.max(3, ((kpis.stage_counts[stage] || 0) / max) * 100)
    }));
  }, [kpis]);

  const resetAudit = () => {
    setAuditError('');
    setAuditForm({
      weekLabel: `Week ${Math.ceil((new Date().getDate() + 3) / 7)}`,
      candidateId: '',
      aiRank: 1,
      recruiterRank: 1,
      overrideReason: ''
    });
    setAuditRequisitionId(requisitions[0]?.id || '');
  };

  const submitAudit = async () => {
    if (!auditRequisitionId || !auditForm.candidateId) {
      setAuditError('Choose a requisition and candidate.');
      return;
    }
    if (auditForm.aiRank < 1 || auditForm.recruiterRank < 1) {
      setAuditError('Ranks must be at least 1.');
      return;
    }
    setSavingAudit(true);
    setAuditError('');
    try {
      const result = await analyticsApi.createCalibration({
        weekLabel: auditForm.weekLabel.trim() || 'Current week',
        requisitionId: auditRequisitionId,
        candidateId: auditForm.candidateId,
        aiRank: auditForm.aiRank,
        recruiterRank: auditForm.recruiterRank,
        overrideReason: auditForm.overrideReason
      });
      notify(
        'success',
        `Calibration sample recorded: ${result.agreementStatus.replace(/_/g, ' ')} (Δ ${result.discrepancyScore}).`
      );
      setAuditOpen(false);
      resetAudit();
      const fresh = await analyticsApi.calibration();
      setCalibration(fresh);
    } catch (saveError) {
      setAuditError(saveError instanceof Error ? saveError.message : 'Could not record this sample.');
    } finally {
      setSavingAudit(false);
    }
  };

  const resetDemoData = async () => {
    setResetting(true);
    setResetError('');
    try {
      const result = await adminApi.resetDemoData();
      notify('success', result.message || 'Demo data restored. Reloading…');
      setResetOpen(false);
      window.setTimeout(() => window.location.reload(), 900);
    } catch (error) {
      setResetError(error instanceof Error ? error.message : 'Could not reset the demo data.');
      setResetting(false);
    }
  };

  const summary = kpis?.summary;

  return (
    <div className="page-stack">
      <section className="page-intro">
        <div className="page-intro__main">
          <div className="page-intro__title-row">
            <span className="role-tag">Delivery oversight</span>
            <h2>Outcomes, measured honestly</h2>
          </div>
          <p>
            These numbers come straight from this workspace. There are no modelled savings, invented
            turnaround times or claimed ROI figures.
          </p>
        </div>
        {user.role === 'delivery_head' && (
          <div className="page-intro__actions">
            <button type="button" className="button button--ghost" onClick={() => setResetOpen(true)}>
              <RotateCcw size={16} /> Reset demo
            </button>
            <button type="button" className="button button--primary" onClick={() => setAuditOpen(true)}>
              <Plus size={16} /> Record calibration
            </button>
          </div>
        )}
      </section>

      {error && (
        <div className="inline-error inline-error--block">
          <AlertTriangle size={17} /> {error}
        </div>
      )}

      {loading ? (
        <LoadingRows rows={4} />
      ) : !kpis || !summary ? (
        <EmptyState icon={BarChart3} title="No delivery data yet" body="Upload CVs and move candidates through the pipeline to populate this view." />
      ) : (
        <>
          <section className="insight-grid">
            <article className="kpi-card">
              <span>Active requisitions</span>
              <strong>{summary.active_requisitions}</strong>
              <small>Roles currently open across clients</small>
            </article>
            <article className="kpi-card">
              <span>CVs evaluated</span>
              <strong>{summary.evaluations}</strong>
              <small>{summary.candidates} unique, non-erased candidates</small>
            </article>
            <article className="kpi-card">
              <span>Recruiter verification</span>
              <strong>{summary.verification_rate === null ? '—' : `${summary.verification_rate}%`}</strong>
              <small>{summary.verified} explicitly opened and verified</small>
            </article>
            <article className="kpi-card">
              <span>Client acceptance</span>
              <strong>{summary.client_acceptance_rate === null ? '—' : `${summary.client_acceptance_rate}%`}</strong>
              <small>{summary.client_decisions} client decisions recorded</small>
            </article>
            <article className="kpi-card">
              <span>With clients</span>
              <strong>{summary.submitted}</strong>
              <small>{summary.shortlisted} shortlisted · {summary.interviews} interviewing</small>
            </article>
            <article className="kpi-card kpi-card--accent">
              <span>Joined</span>
              <strong>{summary.joined}</strong>
              <small>Confirmed starts, not forecast hires</small>
            </article>
          </section>

          <div className="insights-columns">
            <section className="panel-card">
              <header className="section-heading">
                <div>
                  <h2>Stage distribution</h2>
                  <p>Every evaluated candidate sits in one stage. Nothing is removed automatically.</p>
                </div>
                <span className="metric-badge">
                  <BarChart3 size={14} /> {summary.evaluations} evaluations
                </span>
              </header>
              <div className="stage-bars">
                {stageRows.map((row) => (
                  <div className={`stage-bar ${row.stage === 'rejected' ? 'is-muted' : ''}`} key={row.stage}>
                    <span className="stage-bar__label">{STAGE_LABEL[row.stage] || row.stage}</span>
                    <span className="stage-bar__track">
                      <span style={{ width: `${row.width}%` }} />
                    </span>
                    <strong>{row.count}</strong>
                  </div>
                ))}
              </div>
              <p className="panel-note">
                Verification rate is the share of evaluations a recruiter has opened and explicitly verified.
                Acceptance is the share of client-reviewed candidates that were shortlisted or moved further.
              </p>
            </section>

            <section className="panel-card panel-card--quiet">
              <header className="section-heading">
                <div>
                  <h2>How to read this</h2>
                  <p>What the workspace does and does not claim.</p>
                </div>
              </header>
              <ul className="plain-list">
                <li>
                  <UserCheck size={17} />
                  <div>
                    <strong>Human verification is the gate</strong>
                    <p>A recruiter must open the CV before it can be submitted to a client.</p>
                  </div>
                </li>
                <li>
                  <ShieldCheck size={17} />
                  <div>
                    <strong>Scores are deterministic</strong>
                    <p>CV scoring uses evidence matching against the scorecard, not a black-box model.</p>
                  </div>
                </li>
                <li>
                  <ClipboardCheck size={17} />
                  <div>
                    <strong>No time-to-hire claim</strong>
                    <p>This demo records stage outcomes but not elapsed hiring time, so it does not report a turnaround figure.</p>
                  </div>
                </li>
              </ul>
            </section>
          </div>

          <section className="panel-card">
            <header className="section-heading">
              <div>
                <h2>Calibration samples</h2>
                <p>Delivery-head review of AI rank versus the recruiter’s judgement.</p>
              </div>
              {calibration && (
                <span className={`metric-badge ${calibration.summary.alignmentRate !== null && calibration.summary.alignmentRate >= 80 ? 'is-good' : ''}`}>
                  {calibration.summary.alignmentRate === null ? 'No samples' : `${calibration.summary.alignmentRate}% aligned`}
                </span>
              )}
            </header>

            {!calibration || calibration.audits.length === 0 ? (
              <EmptyState
                icon={ClipboardCheck}
                title="No calibration samples recorded"
                body="A delivery head can record weekly rank comparisons to spot scoring drift and document overrides."
                action={
                  user.role === 'delivery_head' ? (
                    <button type="button" className="button button--primary" onClick={() => setAuditOpen(true)}>
                      <Plus size={16} /> Record the first sample
                    </button>
                  ) : undefined
                }
              />
            ) : (
              <>
                <div className="calibration-summary">
                  <div>
                    <span>Samples</span>
                    <strong>{calibration.summary.totalAudits}</strong>
                  </div>
                  <div>
                    <span>Aligned</span>
                    <strong>{calibration.summary.alignedCount}</strong>
                  </div>
                  <div>
                    <span>Minor gaps</span>
                    <strong>{calibration.summary.minorDiscrepancies}</strong>
                  </div>
                  <div>
                    <span>Major overrides</span>
                    <strong>{calibration.summary.majorOverrides}</strong>
                  </div>
                  <p>{calibration.summary.status}. The working target for a weekly sample is at least 80% alignment.</p>
                </div>

                <div className="table-wrap">
                  <table className="data-table calibration-table">
                    <thead>
                      <tr>
                        <th>Sample</th>
                        <th>Candidate</th>
                        <th>Requisition</th>
                        <th>AI</th>
                        <th>Recruiter</th>
                        <th>Delta</th>
                        <th>Status</th>
                        <th>Override note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {calibration.audits.map((audit) => (
                        <tr key={audit.id}>
                          <td>
                            <strong>{audit.week_label}</strong>
                            <span className="cell-sub">{formatDate(audit.created_at)}</span>
                          </td>
                          <td>
                            <strong>{audit.candidate_name}</strong>
                            <span className="cell-sub">{audit.candidate_id}</span>
                          </td>
                          <td>
                            <span>{audit.requisition_title}</span>
                            <span className="cell-sub">{audit.client_company}</span>
                          </td>
                          <td className="is-mono">#{audit.ai_rank}</td>
                          <td className="is-mono">#{audit.recruiter_rank}</td>
                          <td className="is-mono">Δ {audit.discrepancy_score}</td>
                          <td>
                            <span className={`calibration-status is-${audit.agreement_status}`}>
                              {audit.agreement_status.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="cell-note">{audit.recruiter_override_reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </>
      )}

      {resetOpen && (
        <Modal
          title="Restore the demo dataset?"
          description="This is a demo convenience for reviewers, not production administration."
          onClose={() => {
            if (!resetting) setResetOpen(false);
          }}
          footer={
            <>
              <button
                type="button"
                className="button button--ghost"
                onClick={() => setResetOpen(false)}
                disabled={resetting}
              >
                Cancel
              </button>
              <button type="button" className="button button--danger" onClick={resetDemoData} disabled={resetting}>
                <RotateCcw size={16} /> {resetting ? 'Restoring…' : 'Reset and sign out'}
              </button>
            </>
          }
        >
          <p className="panel-note">
            This replaces every requisition, candidate, evaluation, user and audit row with the original
            fictional seed data. Any changes made in this session will be lost.
          </p>
          {resetError && (
            <div className="inline-error inline-error--block">
              <AlertTriangle size={17} /> {resetError}
            </div>
          )}
        </Modal>
      )}

      {auditOpen && (
        <Modal
          title="Record a calibration sample"
          description="Compare the AI rank with the recruiter’s final order. The gap is stored with your name and reason."
          onClose={() => {
            if (!savingAudit) setAuditOpen(false);
          }}
          footer={
            <>
              <button type="button" className="button button--ghost" onClick={() => setAuditOpen(false)} disabled={savingAudit}>
                Cancel
              </button>
              <button type="button" className="button button--primary" onClick={submitAudit} disabled={savingAudit}>
                <CheckCircle2 size={16} /> {savingAudit ? 'Recording…' : 'Record sample'}
              </button>
            </>
          }
        >
          <div className="form-grid form-grid--single">
            <label className="field">
              <span>Week label</span>
              <input
                type="text"
                value={auditForm.weekLabel}
                onChange={(event) => setAuditForm((current) => ({ ...current, weekLabel: event.target.value }))}
                maxLength={80}
              />
            </label>
            <label className="field">
              <span>Requisition</span>
              <select
                value={auditRequisitionId}
                onChange={(event) => setAuditRequisitionId(event.target.value)}
              >
                {requisitions.map((req) => (
                  <option key={req.id} value={req.id}>
                    {req.title} · {req.client_company}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Candidate</span>
              <select
                value={auditForm.candidateId}
                onChange={(event) => setAuditForm((current) => ({ ...current, candidateId: event.target.value }))}
                disabled={loadingAuditCandidates || auditCandidates.length === 0}
              >
                {loadingAuditCandidates ? (
                  <option value="">Loading candidates…</option>
                ) : auditCandidates.length === 0 ? (
                  <option value="">No evaluated candidates</option>
                ) : (
                  auditCandidates.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name} · rank by score {candidate.overall_score ?? '—'}
                    </option>
                  ))
                )}
              </select>
            </label>
            <div className="form-grid form-grid--two">
              <label className="field">
                <span>AI rank</span>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={auditForm.aiRank}
                  onChange={(event) => setAuditForm((current) => ({ ...current, aiRank: Number(event.target.value) }))}
                />
              </label>
              <label className="field">
                <span>Recruiter rank</span>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={auditForm.recruiterRank}
                  onChange={(event) => setAuditForm((current) => ({ ...current, recruiterRank: Number(event.target.value) }))}
                />
              </label>
            </div>
            <label className="field">
              <span>Why did the ranking differ?</span>
              <textarea
                rows={3}
                value={auditForm.overrideReason}
                onChange={(event) => setAuditForm((current) => ({ ...current, overrideReason: event.target.value }))}
                placeholder="Budget, availability, evidence depth or a client constraint…"
                maxLength={1000}
              />
            </label>
          </div>
          {auditError && (
            <div className="inline-error">
              <AlertTriangle size={16} /> {auditError}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
