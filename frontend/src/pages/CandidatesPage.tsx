import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  ChevronRight,
  Eye,
  EyeOff,
  Plus,
  Quote,
  Search,
  Users
} from 'lucide-react';
import type { AppView } from '../components/AppShell';
import type { Candidate, Requisition, User } from '../types';
import { candidateApi } from '../lib/api';
import { ConfidenceBadge, EmptyState, LoadingRows, ScoreRing, StageBadge, VerifiedBadge } from '../components/common';
import CandidateDrawer from '../components/CandidateDrawer';

interface CandidatesPageProps {
  requisition: Requisition;
  user: User;
  refreshToken: number;
  onNavigate: (view: AppView) => void;
  onChanged: () => void;
  notify: (type: 'success' | 'error' | 'info', text: string) => void;
}

export default function CandidatesPage({ requisition, user, refreshToken, onNavigate, onChanged, notify }: CandidatesPageProps) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState('all');
  const [minScore, setMinScore] = useState(0);
  const [blind, setBlind] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [localRefresh, setLocalRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams({
          requisitionId: requisition.id,
          stage,
          minScore: String(minScore),
          search,
          blindMode: String(blind),
          sortBy: 'score',
          sortOrder: 'desc'
        });
        const data = await candidateApi.list(params);
        if (active) setCandidates(data.candidates || []);
      } catch (fetchError) {
        if (active) setError(fetchError instanceof Error ? fetchError.message : 'Could not load candidates.');
      } finally {
        if (active) setLoading(false);
      }
    }, search ? 250 : 0);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [requisition.id, stage, minScore, search, blind, refreshToken, localRefresh]);

  const stats = useMemo(() => {
    const avg = candidates.length
      ? Math.round(candidates.reduce((sum, candidate) => sum + Number(candidate.overall_score || 0), 0) / candidates.length)
      : null;
    return {
      average: avg,
      verified: candidates.filter((candidate) => candidate.recruiter_verified).length,
      withClient: candidates.filter((candidate) =>
        ['submitted_to_client', 'client_shortlisted', 'interview_scheduled', 'offered', 'joined'].includes(candidate.pipeline_stage || '')
      ).length
    };
  }, [candidates]);

  const scorecard = requisition.scorecard;

  const handleChanged = () => {
    setLocalRefresh((value) => value + 1);
    onChanged();
  };

  return (
    <div className="page-stack">
      <section className="page-intro">
        <div className="page-intro__main">
          <div className="page-intro__title-row">
            <span className="role-tag">{requisition.id}</span>
            <h2>{requisition.title}</h2>
            <span className={`status-dot status-dot--${requisition.status}`}>{requisition.status}</span>
          </div>
          <p>
            {requisition.client_company} · {requisition.department}
          </p>
          <div className="criteria-chips">
            <span>{requisition.min_exp}–{requisition.max_exp} yrs</span>
            <span>Notice ≤ {requisition.max_notice_days} days</span>
            <span>Budget ≤ ₹{requisition.max_ctc} LPA</span>
            <span>{requisition.location}</span>
            {scorecard && <span>{scorecard.must_have_skills.length} must-have skills</span>}
          </div>
        </div>
        <div className="page-intro__actions">
          <button type="button" className="button button--secondary" onClick={() => onNavigate('scorecard')}>
            View scorecard
          </button>
          <button type="button" className="button button--primary" onClick={() => onNavigate('upload')}>
            <Plus size={16} />
            Add CVs
          </button>
        </div>
      </section>

      <section className="stats-row stats-row--four">
        <div className="stat-card">
          <span>Candidates</span>
          <strong>{candidates.length}</strong>
          <small className="muted">matching the current filters</small>
        </div>
        <div className="stat-card">
          <span>Average match</span>
          <strong>{stats.average === null ? '—' : `${stats.average}%`}</strong>
          <small className="muted">weighted scorecard score</small>
        </div>
        <div className="stat-card">
          <span>Verified</span>
          <strong>{stats.verified}</strong>
          <small className="muted">opened and checked by a recruiter</small>
        </div>
        <div className="stat-card stat-card--accent">
          <span>With client</span>
          <strong>{stats.withClient}</strong>
          <small>submitted or further along</small>
        </div>
      </section>

      <section className="toolbar">
        <label className="search-field">
          <Search size={17} />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, role, skill or candidate ID"
            aria-label="Search candidates"
          />
        </label>

        <label className="select-field">
          <span>Stage</span>
          <select value={stage} onChange={(event) => setStage(event.target.value)}>
            <option value="all">All stages</option>
            <option value="ai_screened">AI screened</option>
            <option value="recruiter_verified">Recruiter verified</option>
            <option value="submitted_to_client">With client</option>
            <option value="client_shortlisted">Client shortlisted</option>
            <option value="interview_scheduled">Interview</option>
            <option value="offered">Offer</option>
            <option value="joined">Joined</option>
            <option value="rejected">Passed</option>
          </select>
        </label>

        <label className="select-field">
          <span>Score</span>
          <select value={minScore} onChange={(event) => setMinScore(Number(event.target.value))}>
            <option value={0}>Any score</option>
            <option value={80}>80% and above</option>
            <option value={60}>60% and above</option>
            <option value={40}>40% and above</option>
          </select>
        </label>

        <button
          type="button"
          className={`toggle ${blind ? 'is-on' : ''}`}
          onClick={() => setBlind((value) => !value)}
          aria-pressed={blind}
        >
          {blind ? <EyeOff size={16} /> : <Eye size={16} />}
          Blind review
        </button>
      </section>

      {error && (
        <div className="inline-error inline-error--block">
          <AlertTriangle size={17} />
          {error}
        </div>
      )}

      <section className="candidate-list-card">
        <header className="section-heading">
          <div>
            <h2>Ranked matches</h2>
            <p>Every row keeps the CV one click away. AI scores never remove a candidate.</p>
          </div>
          {blind && <span className="blind-note">Identity hidden for this view</span>}
        </header>

        {loading ? (
          <LoadingRows rows={5} />
        ) : candidates.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No candidates match these filters"
            body="Try a broader score or stage, or upload a fresh batch of CVs to this requisition."
            action={
              <div className="empty-state__actions">
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => {
                    setSearch('');
                    setStage('all');
                    setMinScore(0);
                  }}
                >
                  Clear filters
                </button>
                <button type="button" className="button button--primary" onClick={() => onNavigate('upload')}>
                  <Plus size={16} /> Add CVs
                </button>
              </div>
            }
          />
        ) : (
          <div className="candidate-list">
            {candidates.map((candidate, index) => {
              const evidence = candidate.breakdown?.find((item) => item.evidence_quote && item.status === 'matched');
              return (
                <button
                  type="button"
                  className="candidate-row"
                  key={candidate.id}
                  onClick={() => setSelectedId(candidate.id)}
                >
                  <span className="candidate-row__rank">{String(index + 1).padStart(2, '0')}</span>
                  <ScoreRing score={candidate.overall_score} />
                  <div className="candidate-row__main">
                    <div className="candidate-row__name-line">
                      <strong>{candidate.name}</strong>
                      <span className="id-pill">{candidate.id}</span>
                      <StageBadge stage={candidate.pipeline_stage} />
                      <VerifiedBadge verified={candidate.recruiter_verified} by={candidate.recruiter_verified_by} />
                    </div>
                    <p className="candidate-row__role">
                      {candidate.current_role} · {candidate.total_exp_years} yrs ·{' '}
                      {candidate.notice_period_days === null || candidate.notice_period_days === undefined
                        ? 'notice not stated'
                        : `${candidate.notice_period_days} days notice`}{' '}
                      · {candidate.location || 'location not stated'}
                    </p>
                    <div className="candidate-row__skills">
                      {(candidate.key_skills || []).slice(0, 4).map((skill) => (
                        <span key={skill}>{skill}</span>
                      ))}
                      {(candidate.key_skills || []).length > 4 && <span>+{candidate.key_skills.length - 4}</span>}
                    </div>
                    {!blind && evidence && (
                      <p className="candidate-row__evidence">
                        <Quote size={13} />
                        <span>{evidence.evidence_quote}</span>
                      </p>
                    )}
                  </div>
                  <div className="candidate-row__side">
                    <ConfidenceBadge confidence={candidate.ai_confidence} />
                    <span className="candidate-row__open">
                      Review <ChevronRight size={15} />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <div className="info-strip">
        <ArrowUpRight size={16} />
        <span>
          Scores are deterministic evidence matches against the scorecard. Missing fields are flagged,
          never used to auto-reject. A recruiter must open the CV before verification.
        </span>
      </div>

      {selectedId && (
        <CandidateDrawer
          candidateId={selectedId}
          requisition={requisition}
          user={user}
          onClose={() => setSelectedId(null)}
          onChanged={handleChanged}
          notify={notify}
        />
      )}
    </div>
  );
}
