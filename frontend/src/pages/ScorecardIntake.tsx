import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Sparkles, 
  Plus, 
  Trash2, 
  Save, 
  Sliders
} from 'lucide-react';
import { Requisition, User, Scorecard } from '../types';

interface ScorecardIntakeProps {
  currentRequisition: Requisition | null;
  currentUser: User | null;
  onRequisitionUpdated?: () => void;
}

export default function ScorecardIntake({
  currentRequisition,
  currentUser,
  onRequisitionUpdated
}: ScorecardIntakeProps) {
  const [rawJd, setRawJd] = useState<string>('');
  const [scorecard, setScorecard] = useState<Scorecard | null>(null);
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [newSkillName, setNewSkillName] = useState<string>('');
  const [newSkillYears, setNewSkillYears] = useState<number>(3);

  // Load current requisition scorecard
  useEffect(() => {
    if (currentRequisition) {
      setRawJd(currentRequisition.raw_jd || '');
      try {
        const sc = typeof currentRequisition.scorecard_json === 'string'
          ? JSON.parse(currentRequisition.scorecard_json)
          : currentRequisition.scorecard || {};
        setScorecard(sc);
      } catch (e) {
        console.error('Error parsing scorecard:', e);
      }
    }
  }, [currentRequisition]);

  const handleAIExtract = async () => {
    if (!rawJd || rawJd.trim().length < 15) {
      setNotice({ type: 'error', text: 'Please enter JD text with at least 15 characters to parse.' });
      return;
    }

    setIsExtracting(true);
    setNotice(null);
    try {
      const res = await fetch('/api/requisitions/intake-jd', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser?.id || 'usr_recruiter_priya'
        },
        body: JSON.stringify({
          rawJdText: rawJd,
          jobTitle: currentRequisition?.title || 'Senior Role'
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Extraction failed');
      setScorecard(data.scorecard);
      const engineNote = data.scorecard?.ai_engine ? ` via ${data.scorecard.ai_engine}` : '';
      setNotice({ type: 'success', text: `AI successfully extracted scorecard parameters${engineNote}!` });
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message });
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSaveScorecard = async () => {
    if (!currentRequisition || !scorecard) return;
    setIsSaving(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/requisitions/${currentRequisition.id}/scorecard`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser?.id || 'usr_recruiter_priya'
        },
        body: JSON.stringify({ scorecard })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update scorecard');
      setNotice({ type: 'success', text: data.message || 'Scorecard saved and candidate scores recalculated!' });
      if (onRequisitionUpdated) onRequisitionUpdated();
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddSkill = () => {
    if (!newSkillName.trim() || !scorecard) return;
    const skills = scorecard.must_have_skills || [];
    setScorecard({
      ...scorecard,
      must_have_skills: [...skills, { name: newSkillName.trim(), min_years: Number(newSkillYears) }]
    });
    setNewSkillName('');
    setNewSkillYears(3);
  };

  const handleRemoveSkill = (index: number) => {
    if (!scorecard) return;
    const skills = [...(scorecard.must_have_skills || [])];
    skills.splice(index, 1);
    setScorecard({ ...scorecard, must_have_skills: skills });
  };

  const updateWeight = (category: 'skills' | 'experience' | 'notice' | 'ctc', value: string) => {
    if (!scorecard) return;
    const weights = { ...(scorecard.weights || { skills: 0.4, experience: 0.3, notice: 0.15, ctc: 0.15 }) };
    weights[category] = parseFloat(value);
    setScorecard({ ...scorecard, weights });
  };

  if (!currentRequisition) {
    return <div className="card" style={{ padding: '2rem' }}>No requisition selected.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Page Header */}
      <div className="card" style={{ padding: '1.25rem 1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#2563eb', background: '#eff6ff', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                {currentRequisition.id}
              </span>
              <h1 style={{ fontSize: '1.35rem', fontWeight: 800, margin: 0 }}>
                JD Intake & AI Scorecard Architecture
              </h1>
            </div>
            <p style={{ fontSize: '0.875rem', color: '#64748b', margin: '0.25rem 0 0 0' }}>
              Define weighted criteria used by the AI engine to score incoming CVs and cite verbatim evidence.
            </p>
          </div>

          <button
            onClick={handleSaveScorecard}
            disabled={isSaving}
            className="btn btn-primary"
          >
            <Save size={16} />
            <span>{isSaving ? 'Recalculating CVs...' : 'Save & Recalculate AI Scores'}</span>
          </button>
        </div>
      </div>

      {notice && (
        <div style={{
          padding: '0.75rem 1rem',
          borderRadius: '8px',
          background: notice.type === 'success' ? '#ecfdf5' : '#fef2f2',
          color: notice.type === 'success' ? '#065f46' : '#991b1b',
          border: `1px solid ${notice.type === 'success' ? '#a7f3d0' : '#fecaca'}`,
          fontSize: '0.85rem'
        }}>
          {notice.text}
        </div>
      )}

      {/* 2-Column Layout: Raw JD Intake on Left, Editable Scorecard on Right */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '1.5rem' }}>
        {/* Left: Raw JD Intake Box */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="card-header">
            <h2 className="card-title">
              <FileText size={18} color="#2563eb" />
              Raw Job Description (Intake)
            </h2>
            <button
              onClick={handleAIExtract}
              disabled={isExtracting}
              className="btn btn-secondary btn-sm"
            >
              <Sparkles size={14} color="#2563eb" />
              <span>{isExtracting ? 'Extracting...' : 'AI Extract Scorecard'}</span>
            </button>
          </div>

          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', flex: 1 }}>
            <p style={{ fontSize: '0.8rem', color: '#64748b', margin: 0 }}>
              Paste client email or job description. AI extracts must-have skills, experience ceiling, notice period, and CTC budget.
            </p>
            <textarea
              value={rawJd}
              onChange={(e) => setRawJd(e.target.value)}
              placeholder="Paste raw Job Description text here..."
              rows={16}
              style={{
                width: '100%',
                flex: 1,
                minHeight: '360px',
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '0.85rem',
                fontFamily: 'monospace',
                outline: 'none',
                resize: 'vertical',
                lineHeight: 1.5
              }}
            />
          </div>
        </div>

        {/* Right: Editable Scorecard Parameters */}
        {scorecard && (
          <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="card-header">
              <h2 className="card-title">
                <Sliders size={18} color="#059669" />
                Scorecard Parameters & Weights
              </h2>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                Weights must sum to 100%
              </span>
            </div>

            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Category Weights Sliders */}
              <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '0.75rem' }}>
                  Scoring Category Weights
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                      <span>Skills Weight:</span>
                      <strong>{Math.round((scorecard.weights?.skills || 0.4) * 100)}%</strong>
                    </label>
                    <input
                      type="range"
                      min="0.1"
                      max="0.7"
                      step="0.05"
                      value={scorecard.weights?.skills || 0.4}
                      onChange={(e) => updateWeight('skills', e.target.value)}
                      style={{ width: '100%' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                      <span>Experience Weight:</span>
                      <strong>{Math.round((scorecard.weights?.experience || 0.3) * 100)}%</strong>
                    </label>
                    <input
                      type="range"
                      min="0.1"
                      max="0.6"
                      step="0.05"
                      value={scorecard.weights?.experience || 0.3}
                      onChange={(e) => updateWeight('experience', e.target.value)}
                      style={{ width: '100%' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                      <span>Notice Period Weight:</span>
                      <strong>{Math.round((scorecard.weights?.notice || 0.15) * 100)}%</strong>
                    </label>
                    <input
                      type="range"
                      min="0.05"
                      max="0.4"
                      step="0.05"
                      value={scorecard.weights?.notice || 0.15}
                      onChange={(e) => updateWeight('notice', e.target.value)}
                      style={{ width: '100%' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                      <span>CTC Budget Weight:</span>
                      <strong>{Math.round((scorecard.weights?.ctc || 0.15) * 100)}%</strong>
                    </label>
                    <input
                      type="range"
                      min="0.05"
                      max="0.4"
                      step="0.05"
                      value={scorecard.weights?.ctc || 0.15}
                      onChange={(e) => updateWeight('ctc', e.target.value)}
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>
              </div>

              {/* Numerical Requirements: Exp, Notice, CTC */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.25rem' }}>
                    Min Exp (Yrs):
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={scorecard.min_exp || 3}
                    onChange={(e) => setScorecard({ ...scorecard, min_exp: parseFloat(e.target.value) })}
                    style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.25rem' }}>
                    Max Exp (Yrs):
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={scorecard.max_exp || 8}
                    onChange={(e) => setScorecard({ ...scorecard, max_exp: parseFloat(e.target.value) })}
                    style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.25rem' }}>
                    Max Notice (Days):
                  </label>
                  <input
                    type="number"
                    value={scorecard.max_notice_days || 60}
                    onChange={(e) => setScorecard({ ...scorecard, max_notice_days: parseInt(e.target.value, 10) })}
                    style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.25rem' }}>
                    Max CTC (₹ LPA):
                  </label>
                  <input
                    type="number"
                    value={scorecard.max_ctc || 24}
                    onChange={(e) => setScorecard({ ...scorecard, max_ctc: parseFloat(e.target.value) })}
                    style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  />
                </div>
              </div>

              {/* Must-Have Skills List */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>
                    Must-Have Required Skills ({scorecard.must_have_skills?.length || 0})
                  </label>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '220px', overflowY: 'auto' }}>
                  {(scorecard.must_have_skills || []).map((skill, idx) => (
                    <div 
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.4rem 0.75rem',
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: '6px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#0f172a' }}>
                          {typeof skill === 'string' ? skill : skill.name}
                        </span>
                        <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                          (Min {typeof skill === 'object' && skill.min_years ? skill.min_years : 2} yrs)
                        </span>
                      </div>
                      <button
                        onClick={() => handleRemoveSkill(idx)}
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8' }}
                        title="Remove skill"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Add Skill Row */}
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                  <input
                    type="text"
                    placeholder="Add skill (e.g. Kafka, Docker)..."
                    value={newSkillName}
                    onChange={(e) => setNewSkillName(e.target.value)}
                    style={{ flex: 1, padding: '0.45rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.825rem' }}
                  />
                  <input
                    type="number"
                    placeholder="Min Yrs"
                    value={newSkillYears}
                    onChange={(e) => setNewSkillYears(Number(e.target.value))}
                    style={{ width: '80px', padding: '0.45rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.825rem' }}
                  />
                  <button onClick={handleAddSkill} className="btn btn-secondary btn-sm">
                    <Plus size={14} />
                    <span>Add</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
