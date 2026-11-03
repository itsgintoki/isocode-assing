import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  EyeOff,
  FileText,
  Lock,
  MapPin,
  MessageSquareText,
  Plus,
  Quote,
  Send,
  ShieldCheck,
  UserRound,
  XCircle
} from 'lucide-react';
import type { Candidate, InterviewSlot, Requisition, User } from '../types';
import { clientApi } from '../lib/api';
import { EmptyState, LoadingRows, ScoreRing, StageBadge, criterionLabel } from '../components/common';
import { Modal } from '../components/common';

interface ClientShortlistPageProps {
  requisition: Requisition;
  user: User;
  refreshToken: number;
  notify: (type: 'success' | 'error' | 'info', text: string) => void;
}

const REJECTION_REASONS = [
  'Skills do not match the brief',
  'Experience is below the band',
  'Notice period is too long',
  'Compensation is above budget',
  'Role is already filled',
  'Other — see notes'
];

function tomorrow(days = 3): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const EMPTY_SLOT: InterviewSlot = { date: tomorrow(), time: '14:00 IST', round: 'Technical Round 1', interviewer: '' };

export default function ClientShortlistPage({ requisition, user, refreshToken, notify }: ClientShortlistPageProps) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionTarget, setActionTarget] = useState<Candidate | null>(null);
  const [actionType, setActionType] = useState<'reject' | 'slots' | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState(REJECTION_REASONS[0]);
  const [feedbackNotes, setFeedbackNotes] = useState('');
  const [slots, setSlots] = useState<InterviewSlot[]>([EMPTY_SLOT]);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    clientApi
      .shortlist(requisition.id)
      .then((data) => {
        if (active) setCandidates(data.candidates || []);
      })
      .catch((fetchError) => {
        if (active) setError(fetchError instanceof Error ? fetchError.message : 'Could not load the shortlist.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [requisition.id, refreshToken, refresh]);

  const stats = useMemo(() => {
    return {
      awaiting: candidates.filter((candidate) => candidate.pipeline_stage === 'submitted_to_client').length,
      shortlisted: candidates.filter((candidate) =>
        ['client_shortlisted', 'interview_scheduled', 'offered', 'joined'].includes(candidate.pipeline_stage || '')
      ).length,
      passed: candidates.filter((candidate) => candidate.pipeline_stage === 'rejected').length
    };
  }, [candidates]);

  const reload = () => setRefresh((value) => value + 1);

  const shortlist = async (candidate: Candidate) => {
    setBusyId(candidate.id);
    try {
      const result = await clientApi.action({
        requisitionId: requisition.id,
        candidateId: candidate.id,
        action: 'shortlist',
        feedbackNotes: 'Profile and quoted evidence reviewed by the client hiring manager.'
      });
      notify('success', result.message || 'Candidate shortlisted.');
      reload();
    } catch (actionFailure) {
      notify('error', actionFailure instanceof Error ? actionFailure.message : 'Could not shortlist this candidate.');
    } finally {
      setBusyId(null);
    }
  };

  const openReject = (candidate: Candidate) => {
    setActionTarget(candidate);
    setActionType('reject');
    setRejectionReason(REJECTION_REASONS[0]);
    setFeedbackNotes('');
    setActionError('');
  };

  const openSlots = (candidate: Candidate) => {
    setActionTarget(candidate);
    setActionType('slots');
    setSlots([
      {
        ...EMPTY_SLOT,
        round: candidate.recruiter_notes ? 'Technical Round 1' : 'Hiring Manager Round',
        interviewer: ''
      }
    ]);
    setFeedbackNotes('');
    setActionError('');
  };

  const closeAction = () => {
    if (busyId) return;
    setActionType(null);
    setActionTarget(null);
    setActionError('');
  };

  const submitReject = async () => {
    if (!actionTarget) return;
    setBusyId(actionTarget.id);
    setActionError('');
    try {
      const result = await clientApi.action({
        requisitionId: requisition.id,
        candidateId: actionTarget.id,
        action: 'reject',
        rejectionReason,
        feedbackNotes
      });
      notify('success', result.message || 'Feedback sent to the recruiter.');
      setActionType(null);
      setActionTarget(null);
      reload();
    } catch (actionFailure) {
      setActionError(actionFailure instanceof Error ? actionFailure.message : 'Could not send this decision.');
    } finally {
      setBusyId(null);
    }
  };

  const updateSlot = (index: number, patch: Partial<InterviewSlot>) => {
    setSlots((current) => current.map((slot, slotIndex) => (slotIndex === index ? { ...slot, ...patch } : slot)));
  };

  const submitSlots = async () => {
    if (!actionTarget) return;
    if (slots.some((slot) => !slot.date || !slot.time.trim() || !slot.round.trim())) {
      setActionError('Every slot needs a date, time and round.');
      return;
    }
    setBusyId(actionTarget.id);
    setActionError('');
    try {
      const result = await clientApi.action({
        requisitionId: requisition.id,
        candidateId: actionTarget.id,
        action: 'propose_slots',
        feedbackNotes,
        interviewSlots: slots.map((slot) => ({
          date: slot.date,
          time: slot.time.trim(),
          round: slot.round.trim(),
          ...(slot.interviewer ? { interviewer: slot.interviewer.trim() } : {})
        }))
      });
      notify('success', result.message || 'Interview slots sent to the recruiter.');
      setActionType(null);
      setActionTarget(null);
      reload();
    } catch (actionFailure) {
      setActionError(actionFailure instanceof Error ? actionFailure.message : 'Could not propose these slots.');
    } finally {
      setBusyId(null);
    }
  };

  const renderActions = (candidate: Candidate) => {
    const stage = candidate.pipeline_stage || 'submitted_to_client';
    const busy = busyId === candidate.id;

    if (stage === 'rejected') {
      return (
        <div className="client-decision client-decision--passed">
          <XCircle size={16} />
          <div>
            <strong>Passed</strong>
            <p>{candidate.rejection_reason || 'Feedback sent to the recruiter.'}</p>
          </div>
        </div>
      );
    }

    if (stage === 'offered' || stage === 'joined') {
      return (
        <div className="client-decision client-decision--positive">
          <CheckCircle2 size={16} />
          <span>{stage === 'joined' ? 'Candidate joined' : 'Offer extended'}</span>
        </div>
      );
    }

    return (
      <div className="client-actions">
        {(stage === 'submitted_to_client' || stage === 'client_shortlisted') && (
          <button
            type="button"
            className="button button--primary"
            onClick={() => shortlist(candidate)}
            disabled={busy || stage === 'client_shortlisted'}
          >
            <Check size={16} /> {stage === 'client_shortlisted' ? 'Shortlisted' : busy ? 'Shortlisting…' : 'Shortlist'}
          </button>
        )}
        <button type="button" className="button button--secondary" onClick={() => openSlots(candidate)} disabled={busy}>
          <CalendarClock size={16} /> {stage === 'interview_scheduled' ? 'Propose new slots' : 'Propose slots'}
        </button>
        <button type="button" className="button button--ghost button--danger-text" onClick={() => openReject(candidate)} disabled={busy}>
          <XCircle size={16} /> Pass
        </button>
      </div>
    );
  };

  return (
    <div className="page-stack">
      <section className="client-hero">
        <div>
          <span className="eyebrow eyebrow--light">
            <Lock size={14} /> Client portal · contacts masked
          </span>
          <h2>{requisition.title}</h2>
          <p>
            {requisition.client_company} · {requisition.location} · {requisition.min_exp}–{requisition.max_exp} years ·
            notice ≤ {requisition.max_notice_days} days
          </p>
        </div>
        <div className="client-hero__stats">
          <div>
            <span>Awaiting you</span>
            <strong>{stats.awaiting}</strong>
          </div>
          <div>
            <span>Shortlisted</span>
            <strong>{stats.shortlisted}</strong>
          </div>
          <div>
            <span>Passed</span>
            <strong>{stats.passed}</strong>
          </div>
        </div>
      </section>

      <div className="client-notice">
        <ShieldCheck size={17} />
        <p>
          You are reviewing as <strong>{user.name}</strong>. Recruiters have opened and verified each profile
          before submission. Contact details stay masked to protect the candidate until an interview is agreed.
        </p>
      </div>

      {error && (
        <div className="inline-error inline-error--block">
          <AlertTriangle size={17} /> {error}
        </div>
      )}

      {loading ? (
        <LoadingRows rows={3} />
      ) : candidates.length === 0 ? (
        <EmptyState
          icon={UserRound}
          title="No profiles are waiting for you"
          body="Your recruiter only submits candidates after opening the CV, checking the evidence and recording a verification call."
          action={
            <button type="button" className="button button--secondary" onClick={reload}>
              Refresh shortlist
            </button>
          }
        />
      ) : (
        <section className="client-list">
          <header className="section-heading">
            <div>
              <h2>Profiles sent to you</h2>
              <p>Open the evidence behind each score. There is no raw CV download in the client portal.</p>
            </div>
            <span className="masked-badge">
              <EyeOff size={14} /> Identity masked
            </span>
          </header>

          {candidates.map((candidate) => {
            const expanded = expandedId === candidate.id;
            const stage = candidate.pipeline_stage || 'submitted_to_client';
            return (
              <article className={`client-card ${stage === 'rejected' ? 'is-passed' : ''}`} key={candidate.id}>
                <div className="client-card__head">
                  <ScoreRing score={candidate.overall_score} size={60} />
                  <div className="client-card__identity">
                    <div className="client-card__name-row">
                      <h3>{candidate.name}</h3>
                      <StageBadge stage={stage} />
                    </div>
                    <p>
                      {candidate.current_role} · {candidate.total_exp_years} years experience
                      {candidate.location ? ` · ${candidate.location}` : ''}
                    </p>
                    <div className="client-card__contacts">
                      <span>
                        <Lock size={13} /> {candidate.email}
                      </span>
                      <span>
                        <Lock size={13} /> {candidate.phone}
                      </span>
                    </div>
                  </div>
                  <span className={`confidence confidence-${candidate.ai_confidence || 'medium'}`}>
                    <span className="confidence__dot" />
                    {candidate.ai_confidence || 'medium'} confidence
                  </span>
                </div>

                <div className="client-card__stats">
                  <div>
                    <span>Notice</span>
                    <strong>
                      {candidate.notice_period_days === null || candidate.notice_period_days === undefined
                        ? 'Not stated'
                        : `${candidate.notice_period_days} days`}
                    </strong>
                  </div>
                  <div>
                    <span>Expected CTC</span>
                    <strong>{candidate.expected_ctc ? `₹${candidate.expected_ctc} LPA` : 'Not stated'}</strong>
                  </div>
                  <div>
                    <span>Location</span>
                    <strong>{candidate.location || 'Not stated'}</strong>
                  </div>
                  <div>
                    <span>Recruiter verified</span>
                    <strong>{candidate.recruiter_verified_by || 'Yes'}</strong>
                  </div>
                </div>

                <div className="client-card__skills">
                  {(candidate.key_skills || []).map((skill) => (
                    <span key={skill}>{skill}</span>
                  ))}
                </div>

                {candidate.recruiter_notes && (
                  <div className="recruiter-note">
                    <MessageSquareText size={16} />
                    <div>
                      <strong>Recruiter note</strong>
                      <p>{candidate.recruiter_notes}</p>
                    </div>
                  </div>
                )}

                {candidate.interview_slots && candidate.interview_slots.length > 0 && (
                  <div className="slot-list">
                    <span className="slot-list__label">
                      <CalendarClock size={15} /> Proposed slots
                    </span>
                    {candidate.interview_slots.map((slot, index) => (
                      <span className="slot-chip" key={`${slot.date}-${slot.time}-${index}`}>
                        {slot.date} · {slot.time} · {slot.round}
                        {slot.interviewer ? ` · ${slot.interviewer}` : ''}
                      </span>
                    ))}
                  </div>
                )}

                <div className="client-card__evidence-toggle">
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setExpandedId(expanded ? null : candidate.id)}
                    aria-expanded={expanded}
                  >
                    <Quote size={15} /> {expanded ? 'Hide evidence' : 'View quoted CV evidence'}
                    {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </button>
                  <span>No raw CV access in this portal</span>
                </div>

                {expanded && (
                  <div className="client-evidence">
                    {(candidate.breakdown || []).map((item, index) => (
                      <div className="client-evidence__row" key={`${item.category}-${item.name}-${index}`}>
                        <div>
                          <strong>{item.name}</strong>
                          <span className={`criterion-status criterion-status--${item.status}`}>{criterionLabel(item.status)}</span>
                        </div>
                        <blockquote>
                          <Quote size={13} />
                          <span>{item.evidence_quote}</span>
                        </blockquote>
                        {item.notes && <p>{item.notes}</p>}
                      </div>
                    ))}
                  </div>
                )}

                {candidate.client_feedback_notes && stage !== 'submitted_to_client' && (
                  <div className="client-feedback">
                    <MessageSquareText size={15} />
                    <span>{candidate.client_feedback_notes}</span>
                  </div>
                )}

                <footer className="client-card__footer">{renderActions(candidate)}</footer>
              </article>
            );
          })}
        </section>
      )}

      {!loading && candidates.length > 0 && (
        <div className="info-strip">
          <FileText size={16} />
          <span>
            Decisions are recorded against your account and visible to the recruiter. Passing on a profile
            requires a reason; it does not erase the candidate’s data.
          </span>
        </div>
      )}

      {actionType === 'reject' && actionTarget && (
        <Modal
          title={`Pass on ${actionTarget.name}`}
          description="The recruiter sees this reason. The candidate remains in the agency system and can be considered for another role."
          onClose={closeAction}
          footer={
            <>
              <button type="button" className="button button--ghost" onClick={closeAction} disabled={Boolean(busyId)}>
                Cancel
              </button>
              <button type="button" className="button button--danger" onClick={submitReject} disabled={Boolean(busyId)}>
                <Send size={16} /> {busyId ? 'Sending…' : 'Send feedback'}
              </button>
            </>
          }
        >
          <div className="form-grid form-grid--single">
            <label className="field">
              <span>Reason</span>
              <select value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)}>
                {REJECTION_REASONS.map((reason) => (
                  <option key={reason} value={reason}>
                    {reason}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Notes for the recruiter (optional)</span>
              <textarea
                rows={3}
                value={feedbackNotes}
                onChange={(event) => setFeedbackNotes(event.target.value)}
                placeholder="What was missing? Keep it specific and job-related."
                maxLength={2000}
              />
            </label>
          </div>
          {actionError && (
            <div className="inline-error">
              <AlertTriangle size={16} /> {actionError}
            </div>
          )}
        </Modal>
      )}

      {actionType === 'slots' && actionTarget && (
        <Modal
          title={`Propose interview slots for ${actionTarget.name}`}
          description="Send one to three options. The recruiter confirms with the candidate."
          onClose={closeAction}
          width="680px"
          footer={
            <>
              <button type="button" className="button button--ghost" onClick={closeAction} disabled={Boolean(busyId)}>
                Cancel
              </button>
              <button type="button" className="button button--primary" onClick={submitSlots} disabled={Boolean(busyId)}>
                <CalendarClock size={16} /> {busyId ? 'Sending…' : 'Send slot proposal'}
              </button>
            </>
          }
        >
          <div className="slot-form">
            {slots.map((slot, index) => (
              <div className="slot-row" key={index}>
                <label className="field">
                  <span>Date</span>
                  <input type="date" value={slot.date} onChange={(event) => updateSlot(index, { date: event.target.value })} />
                </label>
                <label className="field">
                  <span>Time & timezone</span>
                  <input
                    type="text"
                    value={slot.time}
                    onChange={(event) => updateSlot(index, { time: event.target.value })}
                    placeholder="14:00 IST"
                    maxLength={40}
                  />
                </label>
                <label className="field">
                  <span>Round</span>
                  <input
                    type="text"
                    value={slot.round}
                    onChange={(event) => updateSlot(index, { round: event.target.value })}
                    placeholder="Technical Round 1"
                    maxLength={120}
                  />
                </label>
                <label className="field">
                  <span>Interviewer (optional)</span>
                  <input
                    type="text"
                    value={slot.interviewer || ''}
                    onChange={(event) => updateSlot(index, { interviewer: event.target.value })}
                    placeholder="Vikram Malhotra"
                    maxLength={120}
                  />
                </label>
                {slots.length > 1 && (
                  <button
                    type="button"
                    className="icon-button slot-row__remove"
                    onClick={() => setSlots((current) => current.filter((_, slotIndex) => slotIndex !== index))}
                    aria-label={`Remove slot ${index + 1}`}
                  >
                    <XCircle size={17} />
                  </button>
                )}
              </div>
            ))}
            {slots.length < 3 && (
              <button
                type="button"
                className="button button--small button--secondary"
                onClick={() => setSlots((current) => [...current, { ...EMPTY_SLOT, round: slots[0]?.round || 'Technical Round 1' }])}
              >
                <Plus size={14} /> Add another option
              </button>
            )}
            <label className="field">
              <span>Notes to the recruiter (optional)</span>
              <textarea
                rows={2}
                value={feedbackNotes}
                onChange={(event) => setFeedbackNotes(event.target.value)}
                placeholder="Panel details, timezone or preparation notes…"
                maxLength={2000}
              />
            </label>
          </div>
          {actionError && (
            <div className="inline-error">
              <AlertTriangle size={16} /> {actionError}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
