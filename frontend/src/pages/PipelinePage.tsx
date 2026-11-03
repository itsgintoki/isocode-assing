import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  GitBranch,
  Send,
  UserCheck
} from 'lucide-react';
import type { PipelineData, PipelineStage, Requisition, User } from '../types';
import { pipelineApi } from '../lib/api';
import { EmptyState, LoadingRows, ScoreRing, StageBadge, VerifiedBadge } from '../components/common';
import CandidateDrawer from '../components/CandidateDrawer';

interface PipelinePageProps {
  requisition: Requisition;
  user: User;
  refreshToken: number;
  onChanged: () => void;
  notify: (type: 'success' | 'error' | 'info', text: string) => void;
}

interface Group {
  id: string;
  title: string;
  description: string;
  stages: PipelineStage[];
}

const GROUPS: Group[] = [
  { id: 'review', title: 'To review', description: 'AI screened, waiting for a recruiter', stages: ['sourced', 'ai_screened'] },
  { id: 'verified', title: 'Verified', description: 'Ready for the client', stages: ['recruiter_verified'] },
  { id: 'client', title: 'With client', description: 'Awaiting the hiring manager', stages: ['submitted_to_client', 'client_shortlisted'] },
  { id: 'interview', title: 'Interviewing', description: 'Scheduled or in progress', stages: ['interview_scheduled'] },
  { id: 'closed', title: 'Closed', description: 'Offer, joined or passed', stages: ['offered', 'joined', 'rejected'] }
];

export default function PipelinePage({ requisition, user, refreshToken, onChanged, notify }: PipelinePageProps) {
  const [data, setData] = useState<PipelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [localRefresh, setLocalRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    pipelineApi
      .get(requisition.id)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((fetchError) => {
        if (active) setError(fetchError instanceof Error ? fetchError.message : 'Could not load the pipeline.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [requisition.id, refreshToken, localRefresh]);

  const refresh = () => {
    setLocalRefresh((value) => value + 1);
    onChanged();
  };

  const move = async (candidateId: string, targetStage: PipelineStage) => {
    setBusyId(candidateId);
    try {
      const result = await pipelineApi.move(requisition.id, candidateId, targetStage);
      notify('success', result.message || 'Candidate moved.');
      refresh();
    } catch (moveError) {
      notify('error', moveError instanceof Error ? moveError.message : 'Could not move the candidate.');
    } finally {
      setBusyId(null);
    }
  };

  const renderAction = (stage: PipelineStage, candidateId: string, verified: number | undefined) => {
    if (stage === 'ai_screened' || stage === 'sourced') {
      return (
        <button type="button" className="button button--small button--secondary" onClick={() => setSelectedId(candidateId)}>
          <UserCheck size={14} />
          Review & verify
        </button>
      );
    }
    if (stage === 'recruiter_verified') {
      return (
        <button
          type="button"
          className="button button--small button--primary"
          onClick={() => move(candidateId, 'submitted_to_client')}
          disabled={busyId === candidateId || !verified}
        >
          <Send size={14} />
          {busyId === candidateId ? 'Submitting…' : 'Submit to client'}
        </button>
      );
    }
    if (stage === 'interview_scheduled') {
      return (
        <button
          type="button"
          className="button button--small button--primary"
          onClick={() => move(candidateId, 'offered')}
          disabled={busyId === candidateId}
        >
          <ArrowRight size={14} />
          Mark offer
        </button>
      );
    }
    if (stage === 'offered') {
      return (
        <button
          type="button"
          className="button button--small button--primary"
          onClick={() => move(candidateId, 'joined')}
          disabled={busyId === candidateId}
        >
          <CheckCircle2 size={14} />
          Mark joined
        </button>
      );
    }
    return null;
  };

  return (
    <div className="page-stack">
      <section className="page-intro">
        <div className="page-intro__main">
          <div className="page-intro__title-row">
            <span className="role-tag">{requisition.id}</span>
            <h2>Hiring pipeline</h2>
          </div>
          <p>
            Internal stages are moved here. Client decisions only arrive from the client portal, so the
            agency never records a client choice on their behalf.
          </p>
        </div>
        <div className="page-intro__actions">
          <span className="guardrail">
            <UserCheck size={15} /> Verification required before submission
          </span>
        </div>
      </section>

      {error && (
        <div className="inline-error inline-error--block">
          <AlertTriangle size={17} /> {error}
        </div>
      )}

      {loading ? (
        <div className="pipeline-board">
          {GROUPS.map((group) => (
            <div className="pipeline-column" key={group.id}>
              <div className="pipeline-column__header">
                <h3>{group.title}</h3>
              </div>
              <LoadingRows rows={2} />
            </div>
          ))}
        </div>
      ) : !data || Object.values(data.pipeline).every((stage) => stage.length === 0) ? (
        <EmptyState
          icon={GitBranch}
          title="Nothing in the pipeline yet"
          body="Upload CVs and verify the strongest profiles. They will start moving through these stages."
        />
      ) : (
        <div className="pipeline-board">
          {GROUPS.map((group) => {
            const candidates = group.stages.flatMap((stage) => data.pipeline[stage] || []);
            return (
              <section className="pipeline-column" key={group.id}>
                <header className="pipeline-column__header">
                  <div>
                    <h3>{group.title}</h3>
                    <p>{group.description}</p>
                  </div>
                  <span>{candidates.length}</span>
                </header>
                <div className="pipeline-column__body">
                  {candidates.length === 0 ? (
                    <div className="pipeline-empty">No candidates</div>
                  ) : (
                    candidates.map((candidate) => {
                      const stage = candidate.pipeline_stage || 'ai_screened';
                      return (
                        <article
                          key={candidate.id}
                          className="pipeline-card"
                          onClick={() => setSelectedId(candidate.id)}
                        >
                          <div className="pipeline-card__top">
                            <ScoreRing score={candidate.overall_score} size={40} />
                            <div>
                              <strong>{candidate.name}</strong>
                              <span>
                                {candidate.current_role} · {candidate.total_exp_years} yrs
                              </span>
                            </div>
                          </div>
                          <div className="pipeline-card__meta">
                            <StageBadge stage={stage} />
                            <VerifiedBadge verified={candidate.recruiter_verified} />
                          </div>
                          {candidate.interview_slots?.[0] && (
                            <div className="pipeline-card__slot">
                              <CalendarClock size={14} />
                              {candidate.interview_slots[0].date} · {candidate.interview_slots[0].time}
                            </div>
                          )}
                          {candidate.client_feedback_notes && stage !== 'ai_screened' && (
                            <p className="pipeline-card__feedback">{candidate.client_feedback_notes}</p>
                          )}
                          <div className="pipeline-card__actions" onClick={(event) => event.stopPropagation()}>
                            {renderAction(stage, candidate.id, candidate.recruiter_verified)}
                            <button type="button" className="text-button" onClick={() => setSelectedId(candidate.id)}>
                              Open
                            </button>
                          </div>
                        </article>
                      );
                    })
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {selectedId && (
        <CandidateDrawer
          candidateId={selectedId}
          requisition={requisition}
          user={user}
          onClose={() => setSelectedId(null)}
          onChanged={refresh}
          notify={notify}
        />
      )}
    </div>
  );
}
