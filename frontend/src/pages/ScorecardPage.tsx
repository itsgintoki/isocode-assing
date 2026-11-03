import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  FileText,
  Plus,
  RotateCcw,
  Save,
  Scale,
  Sparkles,
  Trash2,
  Wand2
} from 'lucide-react';
import type { Requisition, Scorecard, ScorecardSkill } from '../types';
import { requisitionApi } from '../lib/api';
import { EmptyState } from '../components/common';

interface ScorecardPageProps {
  requisition: Requisition | null;
  onUpdated: () => void;
  onCreated: (requisitionId: string, title: string) => void;
  notify: (type: 'success' | 'error' | 'info', text: string) => void;
}

type Mode = 'current' | 'new';

const WEIGHT_LABELS: Array<{ key: keyof Scorecard['weights']; label: string; help: string }> = [
  { key: 'skills', label: 'Must-have skills', help: 'Evidence found for each skill' },
  { key: 'experience', label: 'Experience band', help: 'Fit against the minimum and maximum' },
  { key: 'notice', label: 'Notice period', help: 'Availability against the client limit' },
  { key: 'ctc', label: 'Compensation', help: 'Expected CTC against the budget' }
];

function normaliseScorecard(input: Partial<Scorecard> | null | undefined, fallbackTitle = ''): Scorecard {
  const skills = Array.isArray(input?.must_have_skills) ? input?.must_have_skills : [];
  return {
    job_title: input?.job_title || fallbackTitle,
    min_exp: Number(input?.min_exp ?? 0),
    max_exp: Number(input?.max_exp ?? 0),
    max_notice_days: Number(input?.max_notice_days ?? 60),
    max_ctc: Number(input?.max_ctc ?? 0),
    location: input?.location || 'Noida',
    must_have_skills: skills.map((skill) =>
      typeof skill === 'string' ? { name: skill, min_years: 0 } : { name: skill.name, min_years: Number(skill.min_years || 0) }
    ),
    nice_to_have_skills: Array.isArray(input?.nice_to_have_skills) ? input?.nice_to_have_skills : [],
    weights: {
      skills: Number(input?.weights?.skills ?? 0.4),
      experience: Number(input?.weights?.experience ?? 0.3),
      notice: Number(input?.weights?.notice ?? 0.15),
      ctc: Number(input?.weights?.ctc ?? 0.15)
    },
    minimum_threshold_score: input?.minimum_threshold_score,
    ai_engine: input?.ai_engine,
    intake_timestamp: input?.intake_timestamp
  };
}

function validateScorecard(scorecard: Scorecard): string | null {
  if (!scorecard.job_title.trim()) return 'Add the role title.';
  if (!Number.isFinite(scorecard.min_exp) || !Number.isFinite(scorecard.max_exp)) return 'Experience values must be numbers.';
  if (scorecard.min_exp < 0 || scorecard.max_exp > 40 || scorecard.min_exp > scorecard.max_exp) {
    return 'Experience must be a valid range between 0 and 40 years.';
  }
  if (!Number.isFinite(scorecard.max_ctc) || scorecard.max_ctc < 1 || scorecard.max_ctc > 200) {
    return 'Maximum CTC must be between 1 and 200 LPA.';
  }
  if (!Number.isFinite(scorecard.max_notice_days) || scorecard.max_notice_days < 0 || scorecard.max_notice_days > 180) {
    return 'Notice period must be between 0 and 180 days.';
  }
  if (scorecard.must_have_skills.length < 1 || scorecard.must_have_skills.length > 20) {
    return 'Add between 1 and 20 must-have skills.';
  }
  if (scorecard.must_have_skills.some((skill) => !skill.name.trim())) {
    return 'Every must-have skill needs a name.';
  }
  if (scorecard.must_have_skills.some((skill) => !Number.isFinite(skill.min_years) || skill.min_years < 0 || skill.min_years > 40)) {
    return 'Skill minimum years must be between 0 and 40.';
  }
  const totalWeight = Object.values(scorecard.weights).reduce((sum, weight) => sum + Number(weight || 0), 0);
  if (Object.values(scorecard.weights).some((weight) => weight < 0 || weight > 1) || Math.abs(totalWeight - 1) > 0.015) {
    return 'Weights must each be between 0% and 100% and add up to 100%.';
  }
  return null;
}

function ScorecardEditor({
  value,
  onChange,
  idPrefix
}: {
  value: Scorecard;
  onChange: (next: Scorecard) => void;
  idPrefix: string;
}) {
  const weightTotal = Math.round(
    Object.values(value.weights).reduce((sum, weight) => sum + Number(weight || 0), 0) * 100
  );

  const setField = (patch: Partial<Scorecard>) => onChange({ ...value, ...patch });

  const setWeight = (key: keyof Scorecard['weights'], percent: number) => {
    onChange({ ...value, weights: { ...value.weights, [key]: percent / 100 } });
  };

  const resetWeights = () => {
    onChange({
      ...value,
      weights: { skills: 0.4, experience: 0.3, notice: 0.15, ctc: 0.15 }
    });
  };

  const balanceWeights = () => {
    onChange({
      ...value,
      weights: { skills: 0.25, experience: 0.25, notice: 0.25, ctc: 0.25 }
    });
  };

  const setSkill = (index: number, patch: Partial<ScorecardSkill>) => {
    const next = value.must_have_skills.map((skill, skillIndex) =>
      skillIndex === index ? { ...skill, ...patch } : skill
    );
    onChange({ ...value, must_have_skills: next });
  };

  const addSkill = () => {
    if (value.must_have_skills.length >= 20) return;
    onChange({ ...value, must_have_skills: [...value.must_have_skills, { name: '', min_years: 0 }] });
  };

  const removeSkill = (index: number) => {
    onChange({ ...value, must_have_skills: value.must_have_skills.filter((_, skillIndex) => skillIndex !== index) });
  };

  return (
    <div className="scorecard-editor">
      <div className="form-grid">
        <label className="field field--full">
          <span>Role title</span>
          <input
            type="text"
            value={value.job_title}
            onChange={(event) => setField({ job_title: event.target.value })}
            placeholder="Senior Java Developer"
            maxLength={120}
          />
        </label>

        <label className="field">
          <span>Location</span>
          <input
            type="text"
            value={value.location}
            onChange={(event) => setField({ location: event.target.value })}
            placeholder="Noida"
            maxLength={80}
          />
        </label>

        <label className="field">
          <span>Minimum experience (years)</span>
          <input
            type="number"
            min={0}
            max={40}
            step={0.5}
            value={value.min_exp}
            onChange={(event) => setField({ min_exp: Number(event.target.value) })}
          />
        </label>

        <label className="field">
          <span>Maximum experience (years)</span>
          <input
            type="number"
            min={0}
            max={40}
            step={0.5}
            value={value.max_exp}
            onChange={(event) => setField({ max_exp: Number(event.target.value) })}
          />
        </label>

        <label className="field">
          <span>Notice limit (days)</span>
          <input
            type="number"
            min={0}
            max={180}
            value={value.max_notice_days}
            onChange={(event) => setField({ max_notice_days: Number(event.target.value) })}
          />
        </label>

        <label className="field">
          <span>Maximum CTC (₹ LPA)</span>
          <input
            type="number"
            min={1}
            max={200}
            step={0.5}
            value={value.max_ctc}
            onChange={(event) => setField({ max_ctc: Number(event.target.value) })}
          />
        </label>
      </div>

      <div className="scorecard-section">
        <div className="scorecard-section__heading">
          <div>
            <h3>Must-have skills</h3>
            <p>Every skill is checked against a line in the CV. Empty names are not saved.</p>
          </div>
          <button type="button" className="button button--small button--secondary" onClick={addSkill}>
            <Plus size={14} /> Add skill
          </button>
        </div>

        <div className="skill-editor">
          {value.must_have_skills.map((skill, index) => (
            <div className="skill-row" key={`${idPrefix}-skill-${index}`}>
              <label className="field">
                <span>Skill {index + 1}</span>
                <input
                  type="text"
                  value={skill.name}
                  onChange={(event) => setSkill(index, { name: event.target.value })}
                  placeholder="e.g. Spring Boot"
                  maxLength={80}
                />
              </label>
              <label className="field skill-row__years">
                <span>Min. years</span>
                <input
                  type="number"
                  min={0}
                  max={40}
                  value={skill.min_years}
                  onChange={(event) => setSkill(index, { min_years: Number(event.target.value) })}
                />
              </label>
              <button
                type="button"
                className="icon-button skill-row__remove"
                onClick={() => removeSkill(index)}
                aria-label={`Remove ${skill.name || `skill ${index + 1}`}`}
                disabled={value.must_have_skills.length === 1}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="scorecard-section">
        <div className="scorecard-section__heading">
          <div>
            <h3>Scoring weights</h3>
            <p>The overall score is a weighted total. Change the emphasis, not the evidence rules.</p>
          </div>
          <div className="scorecard-weight-actions">
            <span className={`weight-total ${weightTotal === 100 ? 'is-balanced' : 'is-unbalanced'}`}>
              {weightTotal === 100 ? <Check size={14} /> : <AlertTriangle size={14} />}
              {weightTotal}% total
            </span>
            <button type="button" className="button button--small button--ghost" onClick={resetWeights}>
              <RotateCcw size={13} />
              Reset
            </button>
            <button type="button" className="button button--small button--ghost" onClick={balanceWeights}>
              <Scale size={13} />
              Balance
            </button>
          </div>
        </div>

        <div className="weight-grid">
          {WEIGHT_LABELS.map((item) => (
            <label className="weight-field" key={item.key}>
              <span>
                <strong>{item.label}</strong>
                <small>{item.help}</small>
              </span>
              <span className="weight-field__input">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={Math.round(value.weights[item.key] * 100)}
                  onChange={(event) => setWeight(item.key, Number(event.target.value))}
                  aria-label={`${item.label} weight`}
                />
                <span>{Math.round(value.weights[item.key] * 100)}%</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="form-grid">
        <label className="field">
          <span>Review threshold (%)</span>
          <input
            type="number"
            min={0}
            max={100}
            value={value.minimum_threshold_score ?? 65}
            onChange={(event) => setField({ minimum_threshold_score: Number(event.target.value) })}
          />
          <small>Guidance only. A score below this is never an automatic rejection.</small>
        </label>
      </div>
    </div>
  );
}

const EMPTY_META = {
  title: '',
  client_company: '',
  department: 'Engineering',
  client_contact_name: '',
  openings_count: 1,
  location: 'Noida'
};

export default function ScorecardPage({ requisition, onUpdated, onCreated, notify }: ScorecardPageProps) {
  const [mode, setMode] = useState<Mode>(requisition ? 'current' : 'new');
  const [draft, setDraft] = useState<Scorecard | null>(null);
  const [jdText, setJdText] = useState('');
  const [meta, setMeta] = useState(EMPTY_META);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (requisition?.scorecard) {
      setDraft(normaliseScorecard(requisition.scorecard, requisition.title));
      return;
    }
    if (requisition) {
      setDraft(
        normaliseScorecard(
          {
            job_title: requisition.title,
            min_exp: requisition.min_exp,
            max_exp: requisition.max_exp,
            max_notice_days: requisition.max_notice_days,
            max_ctc: requisition.max_ctc,
            location: requisition.location,
            must_have_skills: []
          },
          requisition.title
        )
      );
    }
  }, [requisition?.id, requisition?.scorecard_json, requisition?.title, requisition?.location, requisition?.max_ctc]);

  useEffect(() => {
    if (!requisition && mode === 'current') setMode('new');
  }, [requisition, mode]);

  const weightTotal = useMemo(
    () => (draft ? Math.round(Object.values(draft.weights).reduce((sum, weight) => sum + Number(weight || 0), 0) * 100) : 0),
    [draft]
  );

  const setMetaField = (patch: Partial<typeof EMPTY_META>) => setMeta((current) => ({ ...current, ...patch }));

  const extract = async () => {
    if (jdText.trim().length < 15) {
      setError('Paste a job description with at least 15 characters.');
      return;
    }
    setExtracting(true);
    setError('');
    try {
      const data = await requisitionApi.intakeJd(jdText, meta.title || undefined);
      const next = normaliseScorecard(data.scorecard, meta.title);
      setDraft(next);
      if (!meta.title) setMetaField({ title: next.job_title });
      if (!meta.location || meta.location === 'Noida') setMetaField({ location: next.location || meta.location });
      notify('success', 'Scorecard drafted from the JD. Review every field before creating the role.');
    } catch (extractError) {
      setError(extractError instanceof Error ? extractError.message : 'Could not read this job description.');
    } finally {
      setExtracting(false);
    }
  };

  const saveCurrent = async () => {
    if (!requisition || !draft) return;
    const validationError = validateScorecard(draft);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const result = await requisitionApi.updateScorecard(requisition.id, draft);
      setDraft(normaliseScorecard(result.scorecard, requisition.title));
      notify('success', result.message);
      onUpdated();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save the scorecard.');
    } finally {
      setSaving(false);
    }
  };

  const createRequisition = async () => {
    if (!draft) {
      setError('Extract a scorecard from a job description first.');
      return;
    }
    if (!meta.title.trim()) {
      setError('Add the role title.');
      return;
    }
    if (!meta.client_company.trim()) {
      setError('Add the client company.');
      return;
    }
    const validationError = validateScorecard({ ...draft, job_title: meta.title, location: meta.location });
    if (validationError) {
      setError(validationError);
      return;
    }

    setCreating(true);
    setError('');
    try {
      const result = await requisitionApi.create({
        title: meta.title.trim(),
        client_company: meta.client_company.trim(),
        department: meta.department.trim() || 'Engineering',
        client_contact_name: meta.client_contact_name.trim() || 'Hiring Manager',
        openings_count: meta.openings_count,
        location: meta.location.trim() || draft.location,
        raw_jd: jdText,
        scorecard: { ...draft, job_title: meta.title.trim(), location: meta.location.trim() || draft.location }
      });
      notify('success', `Requisition ${result.requisitionId} created. Add CVs to start the ranked list.`);
      setDraft(null);
      setJdText('');
      setMeta(EMPTY_META);
      setMode('current');
      onCreated(result.requisitionId, meta.title.trim());
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Could not create the requisition.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="page-stack">
      <section className="page-intro">
        <div className="page-intro__main">
          <div className="page-intro__title-row">
            <span className="role-tag">Scorecard</span>
            <h2>{mode === 'current' && requisition ? requisition.title : 'Build a role scorecard'}</h2>
            {mode === 'current' && requisition && (
              <span className={`status-dot status-dot--${requisition.status}`}>{requisition.status}</span>
            )}
          </div>
          <p>
            The scorecard is the single source of truth for every match. Evidence is quoted from the CV;
            missing information is flagged for a recruiter instead of being hidden.
          </p>
        </div>
        {mode === 'current' && requisition && (
          <div className="page-intro__actions">
            <span className="guardrail">
              <FileText size={15} /> {requisition.client_company}
            </span>
          </div>
        )}
      </section>

      <div className="segmented segmented--wide" role="tablist" aria-label="Scorecard mode">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'current'}
          className={mode === 'current' ? 'is-active' : ''}
          onClick={() => {
            setMode('current');
            setError('');
          }}
          disabled={!requisition}
        >
          Current requisition
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'new'}
          className={mode === 'new' ? 'is-active' : ''}
          onClick={() => {
            setMode('new');
            setError('');
          }}
        >
          New requisition
        </button>
      </div>

      {error && (
        <div className="inline-error inline-error--block">
          <AlertTriangle size={17} /> {error}
        </div>
      )}

      {mode === 'current' ? (
        !requisition ? (
          <EmptyState
            icon={FileText}
            title="No requisition selected"
            body="Create a requisition to define the scorecard, then upload CVs against it."
            action={
              <button type="button" className="button button--primary" onClick={() => setMode('new')}>
                <Plus size={16} /> New requisition
              </button>
            }
          />
        ) : (
          <div className="scorecard-layout">
            <div className="scorecard-card">
              <header className="section-heading">
                <div>
                  <h2>Criteria behind every score</h2>
                  <p>{requisition.total_candidates || 0} candidate evaluation{requisition.total_candidates === 1 ? '' : 's'} use this scorecard.</p>
                </div>
                {requisition.scorecard?.ai_engine && (
                  <span className="engine-badge">
                    <Sparkles size={14} /> {requisition.scorecard.ai_engine}
                  </span>
                )}
              </header>

              {draft ? (
                <>
                  <ScorecardEditor value={draft} onChange={setDraft} idPrefix={requisition.id} />
                  <div className="form-actions">
                    <span className={`weight-total ${weightTotal === 100 ? 'is-balanced' : 'is-unbalanced'}`}>
                      {weightTotal === 100 ? <Check size={14} /> : <AlertTriangle size={14} />}
                      {weightTotal}% allocated
                    </span>
                    <button type="button" className="button button--primary" onClick={saveCurrent} disabled={saving}>
                      <Save size={16} />
                      {saving ? 'Saving & re-scoring…' : 'Save & re-score candidates'}
                    </button>
                  </div>
                </>
              ) : (
                <EmptyState
                  icon={FileText}
                  title="This requisition has no scorecard"
                  body="Paste the job description in the new requisition tab to create one."
                />
              )}
            </div>

            <aside className="scorecard-aside">
              <div className="side-card">
                <span className="eyebrow">Requisition</span>
                <dl className="detail-list">
                  <div>
                    <dt>Client</dt>
                    <dd>{requisition.client_company}</dd>
                  </div>
                  <div>
                    <dt>Department</dt>
                    <dd>{requisition.department}</dd>
                  </div>
                  <div>
                    <dt>Openings</dt>
                    <dd>{requisition.openings_count}</dd>
                  </div>
                  <div>
                    <dt>Hiring manager</dt>
                    <dd>{requisition.client_contact_name}</dd>
                  </div>
                </dl>
              </div>
              <div className="side-card side-card--muted">
                <strong>What saving changes</strong>
                <p>
                  Every candidate already evaluated for this requisition is re-scored with the new criteria.
                  Their stage, recruiter notes and verification are preserved.
                </p>
              </div>
            </aside>
          </div>
        )
      ) : (
        <div className="scorecard-layout">
          <div className="scorecard-card">
            <header className="section-heading">
              <div>
                <h2>Start with the job description</h2>
                <p>The local extractor finds the experience band, notice limit, budget and skills. Every field stays editable.</p>
              </div>
              <span className="engine-badge">
                <Wand2 size={14} /> Works without an LLM key
              </span>
            </header>

            <label className="field field--full">
              <span>Paste the client JD</span>
              <textarea
                className="jd-textarea"
                value={jdText}
                onChange={(event) => setJdText(event.target.value)}
                placeholder={'Client: HDFC Tech Platform\nRole: Senior Java Developer\nExperience: 5 to 8 years\nNotice Period: Up to 60 days\nBudget: ₹24 LPA\n\nMust-have: Java, Spring Boot, Microservices, Kafka…'}
                rows={9}
                maxLength={50000}
              />
              <small>{jdText.length.toLocaleString()} / 50,000 characters</small>
            </label>

            <div className="form-actions form-actions--start">
              <button type="button" className="button button--secondary" onClick={extract} disabled={extracting}>
                <Sparkles size={16} />
                {extracting ? 'Reading the JD…' : draft ? 'Extract again' : 'Draft scorecard from JD'}
              </button>
              {draft && (
                <span className="extract-state">
                  <Check size={14} /> Draft ready. Review it below.
                </span>
              )}
            </div>

            {draft && (
              <>
                <div className="scorecard-divider" />
                <header className="section-heading">
                  <div>
                    <h2>Review the extracted scorecard</h2>
                    <p>The extractor is a starting point. Correct anything that does not match the client’s brief.</p>
                  </div>
                </header>
                <ScorecardEditor value={draft} onChange={setDraft} idPrefix="new" />
                <div className="form-actions">
                  <span className={`weight-total ${weightTotal === 100 ? 'is-balanced' : 'is-unbalanced'}`}>
                    {weightTotal === 100 ? <Check size={14} /> : <AlertTriangle size={14} />}
                    {weightTotal}% allocated
                  </span>
                  <button type="button" className="button button--primary" onClick={createRequisition} disabled={creating}>
                    <ArrowRight size={16} />
                    {creating ? 'Creating requisition…' : 'Create requisition'}
                  </button>
                </div>
              </>
            )}
          </div>

          <aside className="scorecard-aside">
            <div className="side-card">
              <span className="eyebrow">Role details</span>
              <div className="form-grid form-grid--single">
                <label className="field">
                  <span>Role title</span>
                  <input
                    type="text"
                    value={meta.title}
                    onChange={(event) => setMetaField({ title: event.target.value })}
                    placeholder="Senior Java Developer"
                    maxLength={120}
                  />
                </label>
                <label className="field">
                  <span>Client company</span>
                  <input
                    type="text"
                    value={meta.client_company}
                    onChange={(event) => setMetaField({ client_company: event.target.value })}
                    placeholder="HDFC Tech Platform"
                    maxLength={120}
                  />
                </label>
                <label className="field">
                  <span>Department</span>
                  <input
                    type="text"
                    value={meta.department}
                    onChange={(event) => setMetaField({ department: event.target.value })}
                    placeholder="Engineering"
                    maxLength={120}
                  />
                </label>
                <label className="field">
                  <span>Hiring manager</span>
                  <input
                    type="text"
                    value={meta.client_contact_name}
                    onChange={(event) => setMetaField({ client_contact_name: event.target.value })}
                    placeholder="Vikram Malhotra"
                    maxLength={120}
                  />
                </label>
                <div className="form-grid form-grid--two">
                  <label className="field">
                    <span>Openings</span>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={meta.openings_count}
                      onChange={(event) => setMetaField({ openings_count: Number(event.target.value) })}
                    />
                  </label>
                  <label className="field">
                    <span>Location</span>
                    <input
                      type="text"
                      value={meta.location}
                      onChange={(event) => setMetaField({ location: event.target.value })}
                      maxLength={80}
                    />
                  </label>
                </div>
              </div>
            </div>

            <div className="side-card side-card--muted">
              <strong>No auto-rejection</strong>
              <p>
                A score is a sorting aid. It never removes a CV from the review queue, and the client only
                sees profiles a recruiter has opened and verified.
              </p>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
