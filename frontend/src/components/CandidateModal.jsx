import React, { useState } from 'react';
import { 
  X, 
  CheckCircle2, 
  AlertTriangle, 
  HelpCircle, 
  Send, 
  ShieldCheck, 
  FileText, 
  UserCheck, 
  Calendar, 
  DollarSign, 
  Clock, 
  Check, 
  Quote
} from 'lucide-react';

export default function CandidateModal({
  candidate,
  evaluation,
  requisition,
  onClose,
  onVerifyCandidate,
  onSubmitToClient,
  currentUser
}) {
  const [recruiterNotes, setRecruiterNotes] = useState(evaluation?.recruiter_notes || '');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState(null);

  if (!candidate || !evaluation) return null;

  const breakdown = evaluation.breakdown || [];
  const isVerified = evaluation.recruiter_verified === 1;

  const handleVerify = async () => {
    setIsVerifying(true);
    setMessage(null);
    try {
      await onVerifyCandidate(candidate.id, recruiterNotes);
      setMessage({ type: 'success', text: 'Candidate successfully verified by recruiter!' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setMessage(null);
    try {
      await onSubmitToClient(candidate.id);
      setMessage({ type: 'success', text: 'Candidate submitted to Client Shortlist Portal!' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div 
        className="modal-content" 
        onClick={(e) => e.stopPropagation()} 
        style={{ maxWidth: '1100px', height: '90vh' }}
      >
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div 
              className={`score-badge ${
                evaluation.overall_score >= 80 ? 'high' : 
                evaluation.overall_score >= 60 ? 'medium' : 'low'
              }`}
              style={{ fontSize: '1.25rem', width: '56px', height: '56px', borderRadius: '12px' }}
            >
              {evaluation.overall_score}%
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>
                  {candidate.name}
                </h2>
                <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>
                  ({candidate.id})
                </span>
                {isVerified ? (
                  <span className="verified-badge">
                    <CheckCircle2 size={13} />
                    Verified by {evaluation.recruiter_verified_by || 'Recruiter'}
                  </span>
                ) : (
                  <span className="unverified-badge">
                    <AlertTriangle size={13} />
                    Pending Recruiter Verification
                  </span>
                )}
              </div>
              <p style={{ fontSize: '0.875rem', color: '#64748b', margin: '0.2rem 0 0 0' }}>
                {candidate.current_role} • {candidate.total_exp_years} yrs exp • Notice: {candidate.notice_period_days} days • CTC: ₹{candidate.current_ctc || 'N/A'} LPA
              </p>
            </div>
          </div>

          <button 
            onClick={onClose}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b', padding: '0.5rem' }}
          >
            <X size={22} />
          </button>
        </div>

        {/* Modal Body - 2 Columns */}
        <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1.15fr 0.85fr', gap: '1.5rem', padding: '1.5rem' }}>
          {/* Left Column: AI Criteria Breakdown with Quoted Evidence */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto' }}>
            {/* AI Confidence & Uncertainty Callout */}
            <div style={{ 
              background: evaluation.ai_confidence === 'low' ? '#fef2f2' : (evaluation.ai_confidence === 'medium' ? '#fffbeb' : '#f0fdf4'),
              border: `1px solid ${evaluation.ai_confidence === 'low' ? '#fecaca' : (evaluation.ai_confidence === 'medium' ? '#fde68a' : '#bbf7d0')}`,
              borderRadius: '8px',
              padding: '0.85rem 1rem',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.75rem'
            }}>
              {evaluation.ai_confidence === 'low' ? (
                <AlertTriangle size={20} color="#dc2626" style={{ flexShrink: 0, marginTop: '2px' }} />
              ) : evaluation.ai_confidence === 'medium' ? (
                <HelpCircle size={20} color="#d97706" style={{ flexShrink: 0, marginTop: '2px' }} />
              ) : (
                <CheckCircle2 size={20} color="#059669" style={{ flexShrink: 0, marginTop: '2px' }} />
              )}
              <div style={{ fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  <span style={{ fontWeight: 700, color: evaluation.ai_confidence === 'low' ? '#991b1b' : (evaluation.ai_confidence === 'medium' ? '#92400e' : '#065f46') }}>
                    AI Confidence: {evaluation.ai_confidence.toUpperCase()}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    (Anti-Auto-Rejection Active)
                  </span>
                </div>
                <p style={{ margin: 0, color: '#475569', lineHeight: 1.4 }}>
                  {evaluation.uncertainty_notes || 'Scorecard criteria extracted and verified with direct resume line citations.'}
                </p>
              </div>
            </div>

            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a', margin: '0.5rem 0 0.2rem 0' }}>
              Scorecard Criteria & CV Evidence Citations
            </h3>

            {/* Criteria List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {breakdown.map((criterion, idx) => (
                <div 
                  key={idx} 
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    padding: '0.85rem',
                    background: '#ffffff'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.875rem', color: '#0f172a' }}>
                        {criterion.name}
                      </span>
                      {criterion.uncertainty && (
                        <span style={{ fontSize: '0.7rem', color: '#b45309', background: '#fef3c7', padding: '0.1rem 0.4rem', borderRadius: '4px', fontWeight: 600 }}>
                          Uncertain / Missing
                        </span>
                      )}
                    </div>
                    <span 
                      style={{
                        fontWeight: 700,
                        fontSize: '0.825rem',
                        fontFamily: 'monospace',
                        color: criterion.score >= 80 ? '#059669' : (criterion.score >= 50 ? '#d97706' : '#dc2626')
                      }}
                    >
                      {criterion.score}%
                    </span>
                  </div>

                  {/* Quoted Evidence Line */}
                  <div className="evidence-quote-box">
                    <span className="quote-label">
                      <Quote size={11} style={{ display: 'inline', marginRight: '3px' }} />
                      Quoted Evidence from CV:
                    </span>
                    {criterion.evidence_quote}
                  </div>

                  {criterion.notes && (
                    <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.4rem', marginBottom: 0, fontStyle: 'italic' }}>
                      Note: {criterion.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Right Column: Full CV Text & Recruiter Verification Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', borderLeft: '1px solid #e2e8f0', paddingLeft: '1.5rem', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <FileText size={16} />
                Candidate Full CV Viewer
              </h3>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                {candidate.original_filename || 'Parsed Resume'}
              </span>
            </div>

            {/* Resume Text Box */}
            <div 
              style={{
                flex: 1,
                minHeight: '260px',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '1rem',
                fontSize: '0.8rem',
                fontFamily: 'monospace',
                whiteSpace: 'pre-wrap',
                overflowY: 'auto',
                color: '#334155',
                lineHeight: 1.5
              }}
            >
              {candidate.raw_cv_text || 'No raw CV text available.'}
            </div>

            {/* Recruiter Notes & Quality Verification Section */}
            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.25rem' }}>
                  Recruiter Screening Assessment Notes:
                </label>
                <textarea
                  value={recruiterNotes}
                  onChange={(e) => setRecruiterNotes(e.target.value)}
                  placeholder="Enter phone qualification notes, notice buyout status, or specific strengths..."
                  rows={2}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.825rem',
                    outline: 'none',
                    resize: 'none'
                  }}
                />
              </div>

              {message && (
                <div style={{ 
                  fontSize: '0.8rem', 
                  padding: '0.5rem 0.75rem', 
                  borderRadius: '6px',
                  background: message.type === 'success' ? '#ecfdf5' : '#fef2f2',
                  color: message.type === 'success' ? '#065f46' : '#991b1b',
                  border: `1px solid ${message.type === 'success' ? '#a7f3d0' : '#fecaca'}`
                }}>
                  {message.text}
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {!isVerified ? (
                  <button
                    onClick={handleVerify}
                    disabled={isVerifying}
                    className="btn btn-primary"
                    style={{ flex: 1 }}
                  >
                    <UserCheck size={16} />
                    <span>{isVerifying ? 'Verifying...' : 'Verify Candidate CV'}</span>
                  </button>
                ) : (
                  <button
                    onClick={handleSubmit}
                    disabled={isSubmitting || evaluation.pipeline_stage === 'submitted_to_client'}
                    className="btn btn-success"
                    style={{ flex: 1 }}
                  >
                    <Send size={16} />
                    <span>
                      {evaluation.pipeline_stage === 'submitted_to_client' 
                        ? 'Submitted to Client' 
                        : (isSubmitting ? 'Submitting...' : 'Submit to Client Portal')}
                    </span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="modal-footer">
          <span style={{ fontSize: '0.75rem', color: '#64748b', marginRight: 'auto' }}>
            Protected under DPDP Act 2023 • Access logged for audit trail
          </span>
          <button onClick={onClose} className="btn btn-secondary btn-sm">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
