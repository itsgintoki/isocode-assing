import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Eye, 
  EyeOff, 
  CheckCircle2, 
  AlertTriangle, 
  Send, 
  Sparkles, 
  ChevronRight
} from 'lucide-react';
import CandidateModal from '../components/CandidateModal';
import { Candidate, Requisition, User } from '../types';

interface RankedCandidatesProps {
  currentRequisition: Requisition | null;
  currentUser: User | null;
  onNavigateTab: (tab: string) => void;
}

export default function RankedCandidates({
  currentRequisition,
  currentUser,
  onNavigateTab
}: RankedCandidatesProps) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Controls
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedStage, setSelectedStage] = useState<string>('all');
  const [minScore, setMinScore] = useState<number>(0);
  const [blindMode, setBlindMode] = useState<boolean>(false);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [batchSelected, setBatchSelected] = useState<string[]>([]);
  const [batchSubmitting, setBatchSubmitting] = useState<boolean>(false);
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const fetchCandidates = async () => {
    if (!currentRequisition) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        requisitionId: currentRequisition.id,
        stage: selectedStage,
        minScore: minScore.toString(),
        search: searchQuery,
        blindMode: blindMode.toString()
      });

      const res = await fetch(`/api/candidates?${params.toString()}`, {
        headers: { 'x-user-id': currentUser?.id || 'usr_recruiter_priya' }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch candidates');
      setCandidates(data.candidates || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCandidates();
  }, [currentRequisition?.id, selectedStage, minScore, blindMode]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchCandidates();
  };

  const handleVerifyCandidate = async (candidateId: string, notes: string) => {
    if (!currentRequisition) return;
    const res = await fetch(`/api/candidates/${candidateId}/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': currentUser?.id || 'usr_recruiter_priya'
      },
      body: JSON.stringify({
        requisitionId: currentRequisition.id,
        notes
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Verification failed');
    fetchCandidates();
    if (selectedCandidate && selectedCandidate.id === candidateId) {
      setSelectedCandidate(prev => prev ? ({
        ...prev,
        recruiter_verified: 1,
        recruiter_verified_by: currentUser?.name || 'Recruiter'
      }) : null);
    }
  };

  const handleSubmitToClient = async (candidateId: string) => {
    if (!currentRequisition) return;
    const res = await fetch('/api/pipeline/move', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': currentUser?.id || 'usr_recruiter_priya'
      },
      body: JSON.stringify({
        requisitionId: currentRequisition.id,
        candidateId,
        targetStage: 'submitted_to_client'
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Submission failed');
    fetchCandidates();
    if (selectedCandidate && selectedCandidate.id === candidateId) {
      setSelectedCandidate(prev => prev ? ({
        ...prev,
        pipeline_stage: 'submitted_to_client'
      }) : null);
    }
  };

  const handleBatchSubmit = async () => {
    if (batchSelected.length === 0 || !currentRequisition) return;
    setBatchSubmitting(true);
    setActionNotice(null);
    try {
      const res = await fetch('/api/pipeline/batch-submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser?.id || 'usr_recruiter_priya'
        },
        body: JSON.stringify({
          requisitionId: currentRequisition.id,
          candidateIds: batchSelected
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Batch submission failed');
      setActionNotice({ type: 'success', text: data.message });
      setBatchSelected([]);
      fetchCandidates();
    } catch (err: any) {
      setActionNotice({ type: 'error', text: err.message });
    } finally {
      setBatchSubmitting(false);
    }
  };

  const toggleSelectCandidate = (id: string) => {
    setBatchSelected(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  if (!currentRequisition) {
    return (
      <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
        <p style={{ color: '#64748b' }}>Please select a job requisition from the top navigation bar.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Top Banner: Requisition Header & Blind Screening Toggle */}
      <div className="card" style={{ padding: '1.25rem 1.5rem', background: '#ffffff' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#2563eb', background: '#eff6ff', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                {currentRequisition.id}
              </span>
              <h1 style={{ fontSize: '1.35rem', fontWeight: 800, margin: 0 }}>
                {currentRequisition.title}
              </h1>
            </div>
            <p style={{ fontSize: '0.875rem', color: '#64748b', margin: '0.25rem 0 0 0' }}>
              Client: <strong>{currentRequisition.client_company}</strong> • Exp: {currentRequisition.min_exp}-{currentRequisition.max_exp} yrs • Notice: &le;{currentRequisition.max_notice_days} days • Budget: &le;₹{currentRequisition.max_ctc} LPA
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {/* Blind Screening Toggle */}
            <div 
              onClick={() => setBlindMode(!blindMode)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                cursor: 'pointer',
                padding: '0.45rem 0.85rem',
                borderRadius: '8px',
                border: '1px solid',
                borderColor: blindMode ? '#93c5fd' : '#e2e8f0',
                background: blindMode ? '#eff6ff' : '#f8fafc',
                userSelect: 'none'
              }}
              title="Hide candidate name, gender, age, and contact information for unbiased algorithmic review"
            >
              {blindMode ? <EyeOff size={16} color="#2563eb" /> : <Eye size={16} color="#64748b" />}
              <span style={{ fontSize: '0.825rem', fontWeight: 600, color: blindMode ? '#1e40af' : '#475569' }}>
                Blind Screening Mode: {blindMode ? 'ON' : 'OFF'}
              </span>
            </div>

            {/* Quick Upload Button */}
            <button
              onClick={() => onNavigateTab('upload')}
              className="btn btn-primary btn-sm"
            >
              <Sparkles size={14} />
              <span>Bulk Upload CVs</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filters & Search Toolbar */}
      <div className="card" style={{ padding: '1rem 1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          {/* Search Input */}
          <form onSubmit={handleSearchSubmit} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: '1 1 260px' }}>
            <div style={{ position: 'relative', width: '100%' }}>
              <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                placeholder="Search candidates by skill, name or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem 0.5rem 2.25rem',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.875rem',
                  outline: 'none'
                }}
              />
            </div>
            <button type="submit" className="btn btn-secondary btn-sm">
              Search
            </button>
          </form>

          {/* Stage Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>Stage:</span>
            <select
              value={selectedStage}
              onChange={(e) => setSelectedStage(e.target.value)}
              style={{
                padding: '0.45rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '0.825rem',
                outline: 'none',
                background: '#ffffff'
              }}
            >
              <option value="all">All Stages</option>
              <option value="ai_screened">AI Screened</option>
              <option value="recruiter_verified">Recruiter Verified</option>
              <option value="submitted_to_client">Submitted to Client</option>
              <option value="client_shortlisted">Client Shortlisted</option>
              <option value="interview_scheduled">Interview Scheduled</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          {/* Minimum Score Slider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>Min Score:</span>
            <input
              type="range"
              min="0"
              max="90"
              step="5"
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              style={{ width: '90px' }}
            />
            <span style={{ fontSize: '0.8rem', fontWeight: 700, fontFamily: 'monospace', width: '35px' }}>
              {minScore}%
            </span>
          </div>

          {/* Batch Submit Button */}
          {batchSelected.length > 0 && (
            <button
              onClick={handleBatchSubmit}
              disabled={batchSubmitting}
              className="btn btn-success btn-sm"
            >
              <Send size={14} />
              <span>Submit Selected ({batchSelected.length}) to Client</span>
            </button>
          )}
        </div>
      </div>

      {actionNotice && (
        <div style={{
          padding: '0.75rem 1rem',
          borderRadius: '8px',
          background: actionNotice.type === 'success' ? '#ecfdf5' : '#fef2f2',
          color: actionNotice.type === 'success' ? '#065f46' : '#991b1b',
          border: `1px solid ${actionNotice.type === 'success' ? '#a7f3d0' : '#fecaca'}`,
          fontSize: '0.85rem'
        }}>
          {actionNotice.text}
        </div>
      )}

      {/* Candidates List Table */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">
            <Sparkles size={18} color="#2563eb" />
            Ranked Candidate Matches ({candidates.length})
          </h2>
          <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
            AI never auto-rejects • Low scorers stay searchable per Company A policy
          </span>
        </div>

        <div className="candidate-table-container">
          {loading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
              Loading candidate evaluations...
            </div>
          ) : candidates.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center' }}>
              <p style={{ color: '#64748b', marginBottom: '1rem' }}>No candidates found matching the current filters.</p>
              <button onClick={() => { setSearchQuery(''); setSelectedStage('all'); setMinScore(0); }} className="btn btn-secondary btn-sm">
                Clear Filters
              </button>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>
                    <input
                      type="checkbox"
                      checked={batchSelected.length === candidates.length && candidates.length > 0}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setBatchSelected(candidates.map(c => c.id));
                        } else {
                          setBatchSelected([]);
                        }
                      }}
                    />
                  </th>
                  <th>Candidate Profile</th>
                  <th>Match Score</th>
                  <th>Key Skills Detected</th>
                  <th>Exp & Notice</th>
                  <th>AI Confidence</th>
                  <th>Verification Status</th>
                  <th>Pipeline Stage</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((cand) => (
                  <tr key={cand.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={batchSelected.includes(cand.id)}
                        onChange={() => toggleSelectCandidate(cand.id)}
                      />
                    </td>

                    {/* Candidate Name & Current Role */}
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 700, color: '#0f172a' }}>
                          {cand.name}
                        </span>
                        <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                          {cand.current_role} • {cand.id}
                        </span>
                      </div>
                    </td>

                    {/* Score */}
                    <td>
                      <div 
                        className={`score-badge ${
                          (cand.overall_score || 0) >= 80 ? 'high' : 
                          (cand.overall_score || 0) >= 60 ? 'medium' : 'low'
                        }`}
                      >
                        {cand.overall_score || 0}%
                      </div>
                    </td>

                    {/* Key Skills */}
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', maxWidth: '240px' }}>
                        {(cand.key_skills || []).slice(0, 3).map((s, idx) => (
                          <span 
                            key={idx}
                            style={{
                              fontSize: '0.72rem',
                              background: '#f1f5f9',
                              color: '#334155',
                              padding: '0.15rem 0.4rem',
                              borderRadius: '4px',
                              fontWeight: 500
                            }}
                          >
                            {s}
                          </span>
                        ))}
                        {(cand.key_skills || []).length > 3 && (
                          <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                            +{(cand.key_skills || []).length - 3}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Experience & Notice */}
                    <td>
                      <div style={{ fontSize: '0.8rem', color: '#334155' }}>
                        <div>{cand.total_exp_years} yrs exp</div>
                        <div style={{ color: cand.notice_period_days <= currentRequisition.max_notice_days ? '#059669' : '#b45309', fontWeight: 600 }}>
                          {cand.notice_period_days} days notice
                        </div>
                      </div>
                    </td>

                    {/* AI Confidence */}
                    <td>
                      <span className={`confidence-pill ${cand.ai_confidence || 'medium'}`}>
                        {cand.ai_confidence || 'medium'}
                      </span>
                    </td>

                    {/* Verification Status */}
                    <td>
                      {cand.recruiter_verified ? (
                        <span className="verified-badge">
                          <CheckCircle2 size={12} />
                          Verified
                        </span>
                      ) : (
                        <span className="unverified-badge">
                          <AlertTriangle size={12} />
                          Unverified
                        </span>
                      )}
                    </td>

                    {/* Pipeline Stage */}
                    <td>
                      <span style={{ 
                        fontSize: '0.75rem', 
                        fontWeight: 600,
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        background: cand.pipeline_stage === 'submitted_to_client' ? '#eff6ff' : (cand.pipeline_stage === 'client_shortlisted' ? '#ecfdf5' : '#f8fafc'),
                        color: cand.pipeline_stage === 'submitted_to_client' ? '#1d4ed8' : (cand.pipeline_stage === 'client_shortlisted' ? '#047857' : '#475569')
                      }}>
                        {(cand.pipeline_stage || 'ai_screened').replace(/_/g, ' ')}
                      </span>
                    </td>

                    {/* Action */}
                    <td style={{ textAlign: 'right' }}>
                      <button
                        onClick={() => setSelectedCandidate(cand)}
                        className="btn btn-secondary btn-sm"
                        style={{ whiteSpace: 'nowrap' }}
                      >
                        <span>Inspect Quotes & CV</span>
                        <ChevronRight size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Candidate Modal with Evidence Inspector */}
      {selectedCandidate && (
        <CandidateModal
          candidate={selectedCandidate}
          evaluation={selectedCandidate}
          requisition={currentRequisition}
          currentUser={currentUser}
          onClose={() => setSelectedCandidate(null)}
          onVerifyCandidate={handleVerifyCandidate}
          onSubmitToClient={handleSubmitToClient}
        />
      )}
    </div>
  );
}
