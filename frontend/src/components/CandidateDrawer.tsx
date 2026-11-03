import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  MapPin,
  Quote,
  Send,
  Sparkles,
  UserCheck,
  X
} from 'lucide-react';
import type { Candidate, CandidateDetail, Requisition, User } from '../types';
import { candidateApi, pipelineApi } from '../lib/api';
import { ConfidenceBadge, ScoreRing, StageBadge, criterionLabel } from './common';

interface CandidateDrawerProps {
  candidateId: string;
  requisition: Requisition;
  user: User;
  onClose: () => void;
  onChanged: () => void;
  notify: (type: 'success' | 'error' | 'info', text: string) => void;
}

const TABS = [
  { id: 'evidence', label: 'Evidence' },
  { id: 'cv', label: 'Full CV' }
] as const;

export default function CandidateDrawer({ candidateId, requisition, user, onClose, onChanged, notify }: CandidateDrawerProps) {
  const [detail, setDetail] = useState<CandidateDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('evidence');
  const [notes, setNotes] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    candidateApi
      .detail(candidateId, requisition.id)
      .then((data) => {
        if (!alive) return;
        setDetail(data);
        setNotes(data.evaluation?.recruiter_notes || '');
      })
      .catch((fetchError) => {
        if (alive) setError(fetchError instanceof Error ? fetchError.message : 'Could not open this CV.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [candidateId, requisition.id]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  const candidate: Candidate | null = detail?.candidate || null;
  const evaluation = detail?.evaluation || null;
  const verified = Boolean(evaluation?.recruiter_verified);
  const stage = evaluation?.pipeline_stage || 'ai_screened';
  const withClient = ['submitted_to_client', 'client_shortlisted', 'interview_scheduled', 'offered', 'joined'].includes(stage);

  const verify = async () => {
    setVerifying(true);
    try {
      await candidateApi.verify(candidateId, requisition.id, notes);
      setDetail((current) =>
        current?.evaluation
          ? {
              ...current,
              evaluation: {
                ...current.evaluation,
                recruiter_verified: 1,
                recruiter_verified_by: user.name,
                recruiter_notes: notes,
                pipeline_stage: current.evaluation.pipeline_stage === 'ai_screened' ? 'recruiter_verified' : current.evaluation.pipeline_stage
              }
            }
          : current
      );
      notify('success', 'CV verified. This candidate can now be submitted.');
      onChanged();
    } catch (verifyError) {
      notify('error', verifyError instanceof Error ? verifyError.message : 'Verification failed.');
    } finally {
      setVerifying(false);
    }
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      await pipelineApi.move(requisition.id, candidateId, 'submitted_to_client');
      setDetail((current) =>
        current?.evaluation
          ? { ...current, evaluation: { ...current.evaluation, pipeline_stage: 'submitted_to_client' } }
          : current
      );
      notify('success', 'Submitted to the client shortlist.');
      onChanged();
    } catch (submitError) {
      notify('error', submitError instanceof Error ? submitError.message : 'Submission failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const confidence = evaluation?.ai_confidence || 'medium';

  return (
    <div className="overlay drawer-overlay" onMouseDown={onClose} role="presentation">
      <aside className="drawer" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Candidate review">
        <header className="drawer__header">
          {loading ? (
            <div className="drawer__header-skeleton">
              <span className="skeleton skeleton--circle" />
              <div>
                <span className="skeleton skeleton--line" />
                <span className="skeleton skeleton--short" />
              </div>
            </div>
          ) : candidate ? (
            <div className="drawer__identity">
              <ScoreRing score={evaluation?.overall_score} size={58} />
              <div>
                <div className="drawer__name-row">
                  <h2>{candidate.name}</h2>
                  <span className="id-pill">{candidate.id}</span>
                  <StageBadge stage={stage} />
                </div>
                <p>
                  {candidate.current_role} · {candidate.total_exp_years} yrs experience
                </p>
              </div>
            </div>
          ) : (
            <div className="drawer__identity">
              <h2>Review</h2>
            </div>
          )}
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close review">
            <X size={20} />
          </button>
        </header>

        {loading ? (
          <div className="drawer__loading">
            <span className="skeleton skeleton--block" />
            <span className="skeleton skeleton--block" />
            <span className="skeleton skeleton--block" />
          </div>
        ) : error ? (
          <div className="drawer__error">
            <AlertTriangle size={24} />
            <h3>This CV could not be opened</h3>
            <p>{error}</p>
            <button type="button" className="button button--secondary" onClick={onClose}>
              Close
            </button>
          </div>
        ) : candidate && evaluation ? (
          <>
            <div className="drawer__context">
              <span>
                <Clock size={15} /> Notice: {candidate.notice_period_days ?? 'Not stated'} {candidate.notice_period_days !== null && candidate.notice_period_days !== undefined ? 'days' : ''}
              </span>
              <span>
                <MapPin size={15} /> {candidate.location || 'Location not stated'}
              </span>
              <span>
                <FileText size={15} /> {candidate.original_filename || 'Parsed CV'}
              </span>
              <span className="drawer__verified-state">
                {verified ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
                {verified ? `Verified by ${evaluation.recruiter_verified_by || user.name}` : 'Not yet verified'}
              </span>
            </div>

            <div className="drawer__tabs">
              {TABS.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={tab === item.id ? 'is-active' : ''}
                  onClick={() => setTab(item.id)}
                >
                  {item.label}
                </button>
              ))}
              <span className="drawer__logged">CV open recorded in the audit log</span>
            </div>

            <div className="drawer__body">
              {tab === 'evidence' ? (
                <>
                  <div className={`confidence-callout confidence-callout--${confidence}`}>
                    {confidence === 'high' ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
                    <div>
                      <strong>{confidence} confidence match</strong>
                      <p>
                        {evaluation.uncertainty_notes ||
                          'Every score below is tied to a line in the CV. Check the gaps before you submit.'}
                      </p>
                    </div>
                    <ConfidenceBadge confidence={confidence} />
                  </div>

                  <div className="evidence-list">
                    {(evaluation.breakdown || []).map((item, index) => (
                      <article className="evidence-card" key={`${item.category}-${item.name}-${index}`}>
                        <header>
                          <div>
                            <h3>{item.name}</h3>
                            <span className={`criterion-status criterion-status--${item.status}`}>
                              {criterionLabel(item.status)}
                            </span>
                          </div>
                          <strong className={`criterion-score is-${item.score >= 80 ? 'high' : item.score >= 50 ? 'mid' : 'low'}`}>
                            {Math.round(item.score)}%
                          </strong>
                        </header>
                        <blockquote>
                          <Quote size={14} />
                          <span>{item.evidence_quote}</span>
                        </blockquote>
                        {item.notes && <p className="evidence-card__note">{item.notes}</p>}
                        <footer>
                          <span>{item.confidence} confidence</span>
                          {item.uncertainty && <span className="warning-text">Needs human check</span>}
                        </footer>
                      </article>
                    ))}
                  </div>
                </>
              ) : (
                <div className="cv-panel">
                  <div className="cv-panel__heading">
                    <Sparkles size={16} />
                    <span>Original CV text, as parsed</span>
                  </div>
                  <pre>{candidate.raw_cv_text || 'No CV text was stored for this candidate.'}</pre>
                </div>
              )}
            </div>

            <footer className="drawer__footer">
              <div className="drawer__contact">
                <strong>{candidate.email || 'No email found'}</strong>
                <span>{candidate.phone || 'No phone found'}</span>
              </div>

              {stage === 'rejected' ? (
                <div className="drawer__terminal">
                  <span>Passed</span>
                  <p>{evaluation.rejection_reason || evaluation.rejection_notes || 'No reason recorded.'}</p>
                </div>
              ) : withClient ? (
                <div className="drawer__terminal drawer__terminal--positive">
                  <CheckCircle2 size={17} />
                  <span>{stage === 'submitted_to_client' ? 'With the client for review' : 'Progressing through the client process'}</span>
                </div>
              ) : (
                <div className="drawer__actions">
                  {!verified ? (
                    <>
                      <label className="drawer__notes">
                        <span>Recruiter note</span>
                        <textarea
                          value={notes}
                          onChange={(event) => setNotes(event.target.value)}
                          placeholder="What did you confirm on the call? Notice, budget, evidence gaps…"
                          rows={2}
                        />
                      </label>
                      <button type="button" className="button button--primary" onClick={verify} disabled={verifying}>
                        <UserCheck size={16} />
                        {verifying ? 'Verifying…' : 'Verify CV'}
                      </button>
                    </>
                  ) : (
                    <button type="button" className="button button--primary" onClick={submit} disabled={submitting}>
                      <Send size={16} />
                      {submitting ? 'Submitting…' : 'Submit to client'}
                    </button>
                  )}
                </div>
              )}
            </footer>
          </>
        ) : null}
      </aside>
    </div>
  );
}
