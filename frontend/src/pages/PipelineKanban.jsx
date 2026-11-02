import React, { useState, useEffect } from 'react';
import { 
  GitPullRequest, 
  ArrowRight, 
  ArrowLeft, 
  CheckCircle2, 
  AlertTriangle, 
  Send, 
  UserCheck, 
  Calendar,
  Briefcase
} from 'lucide-react';

const STAGE_CONFIG = [
  { id: 'sourced', label: '1. Sourced', color: '#64748b' },
  { id: 'ai_screened', label: '2. AI Screened', color: '#0284c7' },
  { id: 'recruiter_verified', label: '3. Recruiter Verified', color: '#7c3aed' },
  { id: 'submitted_to_client', label: '4. Submitted to Client', color: '#2563eb' },
  { id: 'client_shortlisted', label: '5. Client Shortlisted', color: '#059669' },
  { id: 'interview_scheduled', label: '6. Interview Scheduled', color: '#0d9488' },
  { id: 'offered', label: '7. Offered', color: '#16a34a' },
  { id: 'joined', label: '8. Joined', color: '#15803d' },
  { id: 'rejected', label: 'Archived / Rejected', color: '#dc2626' }
];

export default function PipelineKanban({
  currentRequisition,
  currentUser,
  onOpenCandidate
}) {
  const [pipelineData, setPipelineData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorNotice, setErrorNotice] = useState(null);
  const [isMoving, setIsMoving] = useState(false);

  const fetchPipeline = async () => {
    if (!currentRequisition) return;
    setLoading(true);
    setErrorNotice(null);
    try {
      const res = await fetch(`/api/pipeline/${currentRequisition.id}`, {
        headers: { 'x-user-id': currentUser?.id || 'usr_recruiter_priya' }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch pipeline data');
      setPipelineData(data.pipeline || {});
    } catch (err) {
      setErrorNotice(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPipeline();
  }, [currentRequisition?.id]);

  const handleMoveStage = async (candidateId, targetStage) => {
    setIsMoving(true);
    setErrorNotice(null);
    try {
      const res = await fetch('/api/pipeline/move', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser?.id || 'usr_recruiter_priya'
        },
        body: JSON.stringify({
          requisitionId: currentRequisition.id,
          candidateId,
          targetStage
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Move failed');
      fetchPipeline();
    } catch (err) {
      setErrorNotice(err.message);
    } finally {
      setIsMoving(false);
    }
  };

  if (!currentRequisition) {
    return <div className="card" style={{ padding: '2rem' }}>No requisition selected.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header */}
      <div className="card" style={{ padding: '1.25rem 1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ fontSize: '1.35rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <GitPullRequest size={22} color="#2563eb" />
              Requisition Hiring Pipeline: {currentRequisition.title}
            </h1>
            <p style={{ fontSize: '0.875rem', color: '#64748b', margin: '0.25rem 0 0 0' }}>
              Tracks candidates from Sourced & AI Screened through Client Shortlist, Interview, and Joining stages.
            </p>
          </div>

          <div style={{ fontSize: '0.8rem', color: '#475569', background: '#f8fafc', padding: '0.4rem 0.8rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
            Quality Guardrail: <strong>Recruiter CV verification mandatory</strong> before client submission
          </div>
        </div>
      </div>

      {errorNotice && (
        <div style={{
          padding: '0.75rem 1rem',
          borderRadius: '8px',
          background: '#fef2f2',
          color: '#991b1b',
          border: '1px solid #fecaca',
          fontSize: '0.85rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <AlertTriangle size={18} />
          <span>{errorNotice}</span>
        </div>
      )}

      {/* Kanban Columns */}
      {loading ? (
        <div className="card" style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
          Loading requisition pipeline stages...
        </div>
      ) : (
        <div className="kanban-board">
          {STAGE_CONFIG.map((stage) => {
            const cards = (pipelineData && pipelineData[stage.id]) || [];

            return (
              <div key={stage.id} className="kanban-column">
                {/* Column Header */}
                <div className="kanban-column-header">
                  <span style={{ color: stage.color }}>{stage.label}</span>
                  <span style={{ 
                    background: '#ffffff', 
                    padding: '0.15rem 0.5rem', 
                    borderRadius: '9999px',
                    fontSize: '0.75rem',
                    border: '1px solid #e2e8f0',
                    color: '#0f172a'
                  }}>
                    {cards.length}
                  </span>
                </div>

                {/* Cards Container */}
                <div className="kanban-cards-container">
                  {cards.length === 0 ? (
                    <div style={{ padding: '2rem 1rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem' }}>
                      No candidates in this stage
                    </div>
                  ) : (
                    cards.map((cand) => (
                      <div 
                        key={cand.id} 
                        className="kanban-card"
                        onClick={() => onOpenCandidate && onOpenCandidate(cand)}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>
                            {cand.name}
                          </span>
                          <span className={`score-badge ${cand.overall_score >= 80 ? 'high' : (cand.overall_score >= 60 ? 'medium' : 'low')}`} style={{ fontSize: '0.75rem', padding: '0.15rem 0.4rem' }}>
                            {cand.overall_score}%
                          </span>
                        </div>

                        <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: '0.5rem' }}>
                          {cand.current_role} • {cand.total_exp_years}y exp
                        </div>

                        {/* Recruiter Verified Badge */}
                        <div style={{ marginBottom: '0.5rem' }}>
                          {cand.recruiter_verified ? (
                            <span className="verified-badge" style={{ fontSize: '0.68rem', padding: '0.1rem 0.4rem' }}>
                              <CheckCircle2 size={10} />
                              Verified
                            </span>
                          ) : (
                            <span className="unverified-badge" style={{ fontSize: '0.68rem', padding: '0.1rem 0.4rem' }}>
                              <AlertTriangle size={10} />
                              Unverified
                            </span>
                          )}
                        </div>

                        {/* Stage Progression Quick Action Buttons */}
                        <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.4rem', borderTop: '1px solid #f1f5f9', paddingTop: '0.4rem' }} onClick={(e) => e.stopPropagation()}>
                          {stage.id === 'ai_screened' && (
                            <button
                              onClick={() => handleMoveStage(cand.id, 'submitted_to_client')}
                              disabled={isMoving}
                              className="btn btn-primary btn-sm"
                              style={{ width: '100%', fontSize: '0.72rem', padding: '0.25rem 0.4rem' }}
                              title="Submit to client (Requires verification first)"
                            >
                              <span>Submit to Client</span>
                              <ArrowRight size={12} />
                            </button>
                          )}

                          {stage.id === 'submitted_to_client' && (
                            <button
                              onClick={() => handleMoveStage(cand.id, 'client_shortlisted')}
                              disabled={isMoving}
                              className="btn btn-success btn-sm"
                              style={{ width: '100%', fontSize: '0.72rem', padding: '0.25rem 0.4rem' }}
                            >
                              <span>Client Shortlist</span>
                              <ArrowRight size={12} />
                            </button>
                          )}

                          {stage.id === 'client_shortlisted' && (
                            <button
                              onClick={() => handleMoveStage(cand.id, 'interview_scheduled')}
                              disabled={isMoving}
                              className="btn btn-primary btn-sm"
                              style={{ width: '100%', fontSize: '0.72rem', padding: '0.25rem 0.4rem' }}
                            >
                              <span>Schedule Interview</span>
                              <ArrowRight size={12} />
                            </button>
                          )}

                          {stage.id === 'interview_scheduled' && (
                            <button
                              onClick={() => handleMoveStage(cand.id, 'offered')}
                              disabled={isMoving}
                              className="btn btn-success btn-sm"
                              style={{ width: '100%', fontSize: '0.72rem', padding: '0.25rem 0.4rem' }}
                            >
                              <span>Extend Offer</span>
                              <ArrowRight size={12} />
                            </button>
                          )}

                          {stage.id === 'offered' && (
                            <button
                              onClick={() => handleMoveStage(cand.id, 'joined')}
                              disabled={isMoving}
                              className="btn btn-success btn-sm"
                              style={{ width: '100%', fontSize: '0.72rem', padding: '0.25rem 0.4rem' }}
                            >
                              <span>Mark Joined</span>
                              <CheckCircle2 size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
