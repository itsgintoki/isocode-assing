import React, { useState, useEffect } from 'react';
import { 
  CheckCircle, 
  XCircle, 
  Calendar, 
  Clock, 
  Quote, 
  ChevronDown, 
  ChevronUp, 
  Building2, 
  Lock, 
  Briefcase, 
  Check, 
  AlertCircle,
  Smartphone,
  ShieldCheck,
  Send
} from 'lucide-react';

export default function ClientPortal({
  currentRequisition,
  currentUser,
  onSwitchUser
}) {
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  // Action Modals State
  const [actionTarget, setActionTarget] = useState(null);
  const [actionType, setActionType] = useState(null); // 'reject' | 'propose_slots'
  const [rejectionReason, setRejectionReason] = useState('Insufficient microservices depth');
  const [rejectionNotes, setRejectionNotes] = useState('');
  
  // Interview slot state
  const [slotDate, setSlotDate] = useState('2026-11-05');
  const [slotTime, setSlotTime] = useState('14:30');
  const [slotRound, setSlotRound] = useState('Technical Round 1');
  const [interviewerName, setInterviewerName] = useState('Vikram Malhotra (VP Eng)');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionNotice, setActionNotice] = useState(null);

  const fetchShortlist = async () => {
    if (!currentRequisition) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/client/shortlist/${currentRequisition.id}`, {
        headers: { 'x-user-id': currentUser?.id || 'usr_client_vikram' }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load client shortlist');
      setCandidates(data.candidates || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShortlist();
  }, [currentRequisition?.id, currentUser?.id]);

  const handleShortlist = async (candidateId) => {
    setIsSubmitting(true);
    setActionNotice(null);
    try {
      const res = await fetch('/api/client/action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser?.id || 'usr_client_vikram'
        },
        body: JSON.stringify({
          requisitionId: currentRequisition.id,
          candidateId,
          action: 'shortlist',
          feedbackNotes: 'Candidate profile and evidence quotes approved for interviews.'
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Action failed');
      setActionNotice({ type: 'success', text: `Candidate ${candidateId} shortlisted successfully!` });
      fetchShortlist();
    } catch (err) {
      setActionNotice({ type: 'error', text: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRejectSubmit = async (e) => {
    e.preventDefault();
    if (!actionTarget) return;
    setIsSubmitting(true);
    setActionNotice(null);
    try {
      const res = await fetch('/api/client/action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser?.id || 'usr_client_vikram'
        },
        body: JSON.stringify({
          requisitionId: currentRequisition.id,
          candidateId: actionTarget.id,
          action: 'reject',
          rejectionReason,
          feedbackNotes: rejectionNotes
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Reject action failed');
      setActionNotice({ type: 'info', text: `Feedback submitted for ${actionTarget.id}. Marked as rejected.` });
      setActionTarget(null);
      fetchShortlist();
    } catch (err) {
      setActionNotice({ type: 'error', text: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInterviewSlotSubmit = async (e) => {
    e.preventDefault();
    if (!actionTarget) return;
    setIsSubmitting(true);
    setActionNotice(null);
    try {
      const res = await fetch('/api/client/action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser?.id || 'usr_client_vikram'
        },
        body: JSON.stringify({
          requisitionId: currentRequisition.id,
          candidateId: actionTarget.id,
          action: 'propose_slots',
          interviewSlots: [
            {
              date: slotDate,
              time: `${slotTime} IST`,
              round: slotRound,
              interviewer: interviewerName
            }
          ]
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Slot proposal failed');
      setActionNotice({ type: 'success', text: `Interview slot proposed for ${actionTarget.id} on ${slotDate} at ${slotTime}!` });
      setActionTarget(null);
      fetchShortlist();
    } catch (err) {
      setActionNotice({ type: 'error', text: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleExpand = (id) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Client Mode Header Banner */}
      <div 
        className="card" 
        style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          color: '#ffffff',
          padding: '1.5rem',
          border: 'none'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.25rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, background: 'rgba(255,255,255,0.2)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                CLIENT PORTAL
              </span>
              <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                Reviewing as: <strong>{currentUser?.name || 'Client Hiring Manager'}</strong>
              </span>
            </div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 800, margin: '0.2rem 0', color: '#ffffff' }}>
              {currentRequisition?.title || 'Open Requisition'}
            </h1>
            <p style={{ fontSize: '0.85rem', color: '#cbd5e1', margin: 0 }}>
              {currentRequisition?.client_company} • Noida • Target Notice: &le;{currentRequisition?.max_notice_days} days
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ background: 'rgba(255,255,255,0.1)', padding: '0.4rem 0.75rem', borderRadius: '8px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Lock size={14} color="#38bdf8" />
              <span>Contact Details Masked (DPDP Act)</span>
            </div>
          </div>
        </div>
      </div>

      {actionNotice && (
        <div style={{
          padding: '0.75rem 1rem',
          borderRadius: '8px',
          background: actionNotice.type === 'success' ? '#ecfdf5' : '#eff6ff',
          color: actionNotice.type === 'success' ? '#065f46' : '#1e40af',
          border: `1px solid ${actionNotice.type === 'success' ? '#a7f3d0' : '#bfdbfe'}`,
          fontSize: '0.85rem'
        }}>
          {actionNotice.text}
        </div>
      )}

      {/* Shortlisted Candidates Feed */}
      {loading ? (
        <div className="card" style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
          Loading shortlisted candidates submitted to your organization...
        </div>
      ) : candidates.length === 0 ? (
        <div className="card" style={{ padding: '3.5rem 1.5rem', textAlign: 'center' }}>
          <Briefcase size={36} color="#94a3b8" style={{ margin: '0 auto 1rem auto' }} />
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.5rem' }}>
            No Candidates Pending Review
          </h3>
          <p style={{ fontSize: '0.875rem', color: '#64748b', maxWidth: '480px', margin: '0 auto 1.25rem auto' }}>
            Recruiters are currently qualifying and verifying candidates. Verified profiles will appear here for your review and interview scheduling.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {candidates.map((cand) => {
            const isExpanded = expandedId === cand.id;
            const hasSlots = cand.interview_slots && cand.interview_slots.length > 0;

            return (
              <div 
                key={cand.id} 
                className="card client-candidate-card"
                style={{
                  border: cand.pipeline_stage === 'client_shortlisted' ? '1px solid #10b981' : (cand.pipeline_stage === 'interview_scheduled' ? '1px solid #3b82f6' : '1px solid #e2e8f0'),
                  transition: 'all 0.2s ease'
                }}
              >
                {/* Card Top Details */}
                <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div 
                        className={`score-badge ${
                          cand.overall_score >= 80 ? 'high' : (cand.overall_score >= 60 ? 'medium' : 'low')
                        }`}
                        style={{ fontSize: '1.05rem', padding: '0.35rem 0.65rem' }}
                      >
                        {cand.overall_score}% Match
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>
                            {cand.name}
                          </h3>
                          <span style={{ fontSize: '0.75rem', color: '#64748b', background: '#f1f5f9', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>
                            Masked ID
                          </span>
                        </div>
                        <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                          {cand.current_role} • {cand.location}
                        </span>
                      </div>
                    </div>

                    {/* Stage Status Badge */}
                    <div>
                      <span style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        padding: '0.25rem 0.6rem',
                        borderRadius: '9999px',
                        textTransform: 'uppercase',
                        background: cand.pipeline_stage === 'client_shortlisted' ? '#ecfdf5' : (cand.pipeline_stage === 'interview_scheduled' ? '#eff6ff' : '#f8fafc'),
                        color: cand.pipeline_stage === 'client_shortlisted' ? '#065f46' : (cand.pipeline_stage === 'interview_scheduled' ? '#1e40af' : '#475569'),
                        border: `1px solid ${cand.pipeline_stage === 'client_shortlisted' ? '#a7f3d0' : (cand.pipeline_stage === 'interview_scheduled' ? '#bfdbfe' : '#e2e8f0')}`
                      }}>
                        {cand.pipeline_stage.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </div>

                  {/* Candidate Quick Stats Row */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', background: '#f8fafc', padding: '0.75rem', borderRadius: '8px' }}>
                    <div>
                      <span style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Total Experience</span>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>{cand.total_exp_years} Years</div>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Notice Period</span>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: cand.notice_period_days <= currentRequisition.max_notice_days ? '#059669' : '#b45309' }}>
                        {cand.notice_period_days} Days
                      </div>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Expected CTC</span>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>
                        {cand.expected_ctc ? `₹${cand.expected_ctc} LPA` : 'Within Budget'}
                      </div>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Contact Info</span>
                      <div style={{ fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <Lock size={12} /> {cand.phone}
                      </div>
                    </div>
                  </div>

                  {/* Skills Pills */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                    {cand.key_skills.map((s, idx) => (
                      <span 
                        key={idx}
                        style={{
                          fontSize: '0.75rem',
                          background: '#eff6ff',
                          color: '#1e40af',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '6px',
                          fontWeight: 500
                        }}
                      >
                        {s}
                      </span>
                    ))}
                  </div>

                  {/* Recruiter Notes to Client */}
                  {cand.recruiter_notes && (
                    <div style={{ fontSize: '0.825rem', color: '#334155', background: '#f1f5f9', padding: '0.6rem 0.8rem', borderRadius: '6px', borderLeft: '3px solid #2563eb' }}>
                      <strong>Agency Recruiter Note:</strong> {cand.recruiter_notes}
                    </div>
                  )}

                  {/* Proposed Interview Slots Banner if already scheduled */}
                  {hasSlots && (
                    <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '6px', padding: '0.65rem 0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Calendar size={16} color="#059669" />
                      <div style={{ fontSize: '0.825rem', color: '#065f46' }}>
                        <strong>Interview Scheduled:</strong> {cand.interview_slots[0].round} on {cand.interview_slots[0].date} at {cand.interview_slots[0].time}
                      </div>
                    </div>
                  )}

                  {/* Expand Evidence Button */}
                  <button
                    onClick={() => toggleExpand(cand.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.35rem',
                      background: 'transparent',
                      border: 'none',
                      color: '#2563eb',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      padding: '0.35rem 0'
                    }}
                  >
                    <span>{isExpanded ? 'Hide CV Evidence Quotes' : 'View Quoted CV Evidence Lines'}</span>
                    {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </button>

                  {/* Collapsible Evidence Quotes Drawer */}
                  {isExpanded && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', borderTop: '1px solid #e2e8f0', paddingTop: '0.75rem' }}>
                      <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: '#64748b', margin: 0, fontWeight: 700 }}>
                        Direct Quotes Cited from Candidate CV:
                      </h4>
                      {cand.breakdown.map((crit, idx) => (
                        <div key={idx} className="evidence-quote-box">
                          <span className="quote-label">
                            <Quote size={11} style={{ display: 'inline', marginRight: '3px' }} />
                            {crit.name} ({crit.score}% Match):
                          </span>
                          {crit.evidence_quote}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Mobile-Friendly Action Button Bar */}
                  <div className="client-action-bar" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
                    <button
                      onClick={() => handleShortlist(cand.id)}
                      disabled={isSubmitting || cand.pipeline_stage === 'client_shortlisted'}
                      className="btn btn-success btn-sm"
                      style={{ flex: 1 }}
                    >
                      <CheckCircle size={15} />
                      <span>{cand.pipeline_stage === 'client_shortlisted' ? 'Shortlisted' : 'Shortlist Candidate'}</span>
                    </button>

                    <button
                      onClick={() => {
                        setActionTarget(cand);
                        setActionType('propose_slots');
                      }}
                      className="btn btn-primary btn-sm"
                      style={{ flex: 1 }}
                    >
                      <Calendar size={15} />
                      <span>Propose Interview Slot</span>
                    </button>

                    <button
                      onClick={() => {
                        setActionTarget(cand);
                        setActionType('reject');
                      }}
                      className="btn btn-outline-danger btn-sm"
                    >
                      <XCircle size={15} />
                      <span>Reject</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Reject with Reason Modal */}
      {actionTarget && actionType === 'reject' && (
        <div className="modal-overlay" onClick={() => setActionTarget(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>
                Reject Candidate: {actionTarget.name}
              </h3>
              <button onClick={() => setActionTarget(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}>
                <XCircle size={20} color="#64748b" />
              </button>
            </div>

            <form onSubmit={handleRejectSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>
                  Structured rejection reasons help Company A calibrate candidate screening to match your exact standards.
                </p>

                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.35rem' }}>
                    Primary Rejection Reason:
                  </label>
                  <select
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.55rem',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.85rem',
                      outline: 'none'
                    }}
                  >
                    <option value="Insufficient microservices depth">Insufficient microservices / architecture depth</option>
                    <option value="Notice period too long">Notice period too long (Cannot wait &gt;60 days)</option>
                    <option value="CTC budget mismatch">CTC expectation exceeds team budget</option>
                    <option value="Domain mismatch">Banking / domain experience missing</option>
                    <option value="Overqualified">Overqualified for current seniority band</option>
                    <option value="Other">Other feedback</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.35rem' }}>
                    Additional Feedback Note for Recruiter:
                  </label>
                  <textarea
                    value={rejectionNotes}
                    onChange={(e) => setRejectionNotes(e.target.value)}
                    placeholder="e.g. Candidate projects were in monolithic Java 8 rather than distributed Kafka microservices..."
                    rows={3}
                    style={{
                      width: '100%',
                      padding: '0.55rem',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.825rem',
                      outline: 'none',
                      resize: 'none'
                    }}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" onClick={() => setActionTarget(null)} className="btn btn-secondary btn-sm">
                  Cancel
                </button>
                <button type="submit" disabled={isSubmitting} className="btn btn-danger btn-sm">
                  {isSubmitting ? 'Submitting...' : 'Confirm Rejection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Propose Interview Slots Modal */}
      {actionTarget && actionType === 'propose_slots' && (
        <div className="modal-overlay" onClick={() => setActionTarget(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>
                Propose Interview Slot: {actionTarget.name}
              </h3>
              <button onClick={() => setActionTarget(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}>
                <XCircle size={20} color="#64748b" />
              </button>
            </div>

            <form onSubmit={handleInterviewSlotSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>
                  Selected slots will be dispatched to Company A recruiters to coordinate availability with the candidate.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.35rem' }}>
                      Interview Date:
                    </label>
                    <input
                      type="date"
                      value={slotDate}
                      onChange={(e) => setSlotDate(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        borderRadius: '6px',
                        border: '1px solid #cbd5e1',
                        fontSize: '0.85rem',
                        outline: 'none'
                      }}
                      required
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.35rem' }}>
                      Time (IST):
                    </label>
                    <input
                      type="time"
                      value={slotTime}
                      onChange={(e) => setSlotTime(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        borderRadius: '6px',
                        border: '1px solid #cbd5e1',
                        fontSize: '0.85rem',
                        outline: 'none'
                      }}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.35rem' }}>
                    Interview Round:
                  </label>
                  <select
                    value={slotRound}
                    onChange={(e) => setSlotRound(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.55rem',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.85rem',
                      outline: 'none'
                    }}
                  >
                    <option value="Technical Round 1 (System Design & Code)">Technical Round 1 (System Design & Code)</option>
                    <option value="Technical Round 2 (Core Architecture & Spring Boot)">Technical Round 2 (Core Architecture & Spring Boot)</option>
                    <option value="Managerial & Cultural Fit Round">Managerial & Cultural Fit Round</option>
                    <option value="Director / Final Round">Director / Final Round</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.35rem' }}>
                    Interviewer Name / Lead:
                  </label>
                  <input
                    type="text"
                    value={interviewerName}
                    onChange={(e) => setInterviewerName(e.target.value)}
                    placeholder="e.g. Vikram Malhotra (VP Eng)"
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.85rem',
                      outline: 'none'
                    }}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" onClick={() => setActionTarget(null)} className="btn btn-secondary btn-sm">
                  Cancel
                </button>
                <button type="submit" disabled={isSubmitting} className="btn btn-primary btn-sm">
                  <Send size={14} />
                  <span>{isSubmitting ? 'Dispatching...' : 'Propose Slot'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
