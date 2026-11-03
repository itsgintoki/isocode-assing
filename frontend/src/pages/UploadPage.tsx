import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileText,
  FileUp,
  Sparkles,
  Trash2,
  UploadCloud
} from 'lucide-react';
import type { AppView } from '../components/AppShell';
import type { Requisition, UploadResult } from '../types';
import { candidateApi } from '../lib/api';
import { EmptyState, ScoreRing } from '../components/common';

interface UploadPageProps {
  requisition: Requisition;
  onNavigate: (view: AppView) => void;
  onUploaded: () => void;
  notify: (type: 'success' | 'error' | 'info', text: string) => void;
}

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED = ['.pdf', '.docx', '.txt'];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UploadPage({ requisition, onNavigate, onUploaded, notify }: UploadPageProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<UploadResult | null>(null);
  const [error, setError] = useState('');

  const totalSize = useMemo(() => files.reduce((sum, file) => sum + file.size, 0), [files]);

  const addFiles = (incoming: FileList | File[]) => {
    setError('');
    const next: File[] = [];
    const rejected: string[] = [];

    Array.from(incoming).forEach((file) => {
      const extension = `.${file.name.split('.').pop()?.toLowerCase()}`;
      if (!ALLOWED.includes(extension)) {
        rejected.push(`${file.name} is not a PDF, DOCX or TXT file.`);
      } else if (file.size > MAX_FILE_BYTES) {
        rejected.push(`${file.name} is larger than 10 MB.`);
      } else {
        next.push(file);
      }
    });

    if (rejected.length > 0) setError(rejected.join(' '));
    setFiles((current) => {
      const existing = new Set(current.map((file) => `${file.name}:${file.size}`));
      return [...current, ...next.filter((file) => !existing.has(`${file.name}:${file.size}`))].slice(0, 500);
    });
  };

  const sampleFiles = () => {
    const skills = (requisition.scorecard?.must_have_skills || []).map((skill) => skill.name);
    const fallback = ['Stakeholder management', 'Process improvement', 'Communication'];
    const selectedSkills = (skills.length ? skills : fallback).slice(0, 5);
    const samples = [
      {
        name: 'Aarav_Kapoor_Sample_CV.txt',
        candidate: 'AARAV KAPOOR',
        email: 'aarav.kapoor.sample@example.com',
        phone: '+91 90000 41001',
        years: 6,
        notice: 30,
        ctc: '16',
        expected: '21'
      },
      {
        name: 'Simran_Kaur_Sample_CV.txt',
        candidate: 'SIMRAN KAUR',
        email: 'simran.kaur.sample@example.com',
        phone: '+91 90000 41002',
        years: 4.5,
        notice: 15,
        ctc: '13',
        expected: '17'
      },
      {
        name: 'Nikhil_Rao_Sample_CV.txt',
        candidate: 'NIKHIL RAO',
        email: 'nikhil.rao.sample@example.com',
        phone: '+91 90000 41003',
        years: 8,
        notice: 60,
        ctc: '22',
        expected: '28'
      }
    ];

    const generated = samples.map(({ name, candidate, email, phone, years, notice, ctc, expected }) => {
      const body = `${candidate}
Pune | ${email} | ${phone}

SUMMARY
${requisition.title} with ${years} years of experience delivering cross-functional programmes and measurable improvements.

EXPERIENCE
- Applied ${selectedSkills.join(', ')} across live projects.
- Worked with stakeholders to document requirements, test changes and improve delivery.
- Led weekly reviews and maintained clear reporting.

AVAILABILITY
Notice Period: ${notice} days.
Current CTC: ₹${ctc}.0 LPA | Expected CTC: ₹${expected}.0 LPA`;
      return new File([body], name, { type: 'text/plain' });
    });

    setError('');
    setFiles((current) => [...current, ...generated].slice(0, 500));
    notify('info', 'Three clearly labelled sample CVs were added. Review them before uploading.');
  };

  const upload = async () => {
    if (files.length === 0) return;
    setUploading(true);
    setError('');
    setResults(null);
    try {
      const data = await candidateApi.upload(requisition.id, files);
      setResults(data.results);
      setFiles([]);
      onUploaded();
      notify('success', `Processed ${data.results.processed} CV${data.results.processed === 1 ? '' : 's'}.`);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'The upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const hasResults = results && (results.successfulCandidates.length > 0 || results.duplicatesDetected.length > 0 || results.errors.length > 0 || results.processed > 0);

  return (
    <div className="page-stack">
      <section className="page-intro">
        <div className="page-intro__main">
          <div className="page-intro__title-row">
            <span className="role-tag">{requisition.id}</span>
            <h2>Add candidate CVs</h2>
          </div>
          <p>
            Upload PDF, DOCX or TXT files. Each CV is parsed, checked for duplicates and scored against
            the {requisition.title} scorecard.
          </p>
        </div>
        <div className="page-intro__actions">
          <button type="button" className="button button--secondary" onClick={() => onNavigate('candidates')}>
            Back to candidates
          </button>
        </div>
      </section>

      <section className="upload-layout">
        <div className="upload-card">
          <div
            className={`dropzone ${dragging ? 'is-dragging' : ''}`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              addFiles(event.dataTransfer.files);
            }}
            onClick={() => inputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click();
            }}
          >
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.txt"
              className="sr-only"
              onChange={(event) => {
                if (event.target.files) addFiles(event.target.files);
                event.target.value = '';
              }}
            />
            <span className="dropzone__icon">
              <UploadCloud size={26} />
            </span>
            <h3>Drop CVs here, or browse</h3>
            <p>Up to 500 files per batch · PDF, DOCX or TXT · 10 MB each</p>
            <span className="dropzone__cta">Choose files</span>
          </div>

          <div className="upload-actions">
            <button type="button" className="button button--ghost" onClick={sampleFiles}>
              <Sparkles size={15} />
              Add 3 sample CVs
            </button>
            <span className="muted">Sample files are fictional and clearly labelled.</span>
          </div>

          {error && (
            <div className="inline-error inline-error--block">
              <AlertTriangle size={17} />
              {error}
            </div>
          )}

          {files.length > 0 && (
            <div className="file-queue">
              <header>
                <div>
                  <h3>{files.length} file{files.length === 1 ? '' : 's'} ready</h3>
                  <span>{formatBytes(totalSize)} total</span>
                </div>
                <div className="file-queue__actions">
                  <button type="button" className="text-button" onClick={() => setFiles([])}>
                    Clear all
                  </button>
                  <button type="button" className="button button--primary" onClick={upload} disabled={uploading}>
                    <FileUp size={16} />
                    {uploading ? 'Parsing & scoring…' : `Process ${files.length} CV${files.length === 1 ? '' : 's'}`}
                  </button>
                </div>
              </header>
              <ul>
                {files.map((file, index) => (
                  <li key={`${file.name}-${file.size}-${index}`}>
                    <span className="file-icon">
                      <FileText size={16} />
                    </span>
                    <span className="file-queue__name">
                      <strong>{file.name}</strong>
                      <span>{formatBytes(file.size)}</span>
                    </span>
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}
                      aria-label={`Remove ${file.name}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <aside className="upload-side">
          <div className="side-card">
            <span className="eyebrow">What happens next</span>
            <ol className="process-list">
              <li>
                <span>1</span>
                <p>Text is extracted from the file. Scanned PDFs without a text layer are reported, not guessed.</p>
              </li>
              <li>
                <span>2</span>
                <p>Exact files and matching contact details are checked before a new profile is created.</p>
              </li>
              <li>
                <span>3</span>
                <p>Every new profile is scored and placed in the review queue. Nothing is auto-rejected.</p>
              </li>
            </ol>
          </div>
          <div className="side-card side-card--muted">
            <strong>Current scorecard</strong>
            <p>
              {requisition.min_exp}–{requisition.max_exp} years · notice ≤ {requisition.max_notice_days} days · budget ≤ ₹
              {requisition.max_ctc} LPA
            </p>
            <span>{requisition.scorecard?.must_have_skills.map((skill) => skill.name).join(' · ')}</span>
          </div>
        </aside>
      </section>

      {!hasResults && results && results.processed === 0 && (
        <EmptyState
          icon={FileUp}
          title="No files were processed"
          body="Add at least one readable CV file, then try again."
        />
      )}

      {hasResults && results && (
        <section className="results-card">
          <header className="section-heading">
            <div>
              <h2>Batch report</h2>
              <p>Parsing and scoring finished. Review anything that was flagged before opening the ranked list.</p>
            </div>
            <button type="button" className="button button--primary" onClick={() => onNavigate('candidates')}>
              View ranked candidates <ArrowRight size={16} />
            </button>
          </header>

          <div className="result-stats">
            <div className="result-stat result-stat--good">
              <span>Added</span>
              <strong>{results.successfulCandidates.length}</strong>
            </div>
            <div className="result-stat result-stat--warn">
              <span>Duplicates</span>
              <strong>{results.duplicatesDetected.length}</strong>
            </div>
            <div className="result-stat result-stat--bad">
              <span>Errors</span>
              <strong>{results.errors.length}</strong>
            </div>
          </div>

          {results.successfulCandidates.length > 0 && (
            <div className="result-group">
              <h3>
                <CheckCircle2 size={17} /> New profiles
              </h3>
              <div className="result-rows">
                {results.successfulCandidates.map((candidate) => (
                  <div className="result-row" key={candidate.candidateId}>
                    <ScoreRing score={candidate.score} size={42} />
                    <div className="result-row__main">
                      <strong>{candidate.name}</strong>
                      <span>
                        {candidate.filename} · {candidate.candidateId}
                      </span>
                      {candidate.warnings && candidate.warnings.length > 0 && (
                        <span className="warning-text">{candidate.warnings.join(' ')}</span>
                      )}
                    </div>
                    <span className={`confidence confidence-${candidate.confidence}`}>
                      <span className="confidence__dot" />
                      {candidate.confidence}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {results.duplicatesDetected.length > 0 && (
            <div className="result-group">
              <h3>
                <AlertTriangle size={17} /> Duplicates skipped
              </h3>
              <div className="result-rows">
                {results.duplicatesDetected.map((duplicate, index) => (
                  <div className="result-row result-row--warn" key={`${duplicate.filename}-${index}`}>
                    <span className="file-icon">
                      <FileText size={16} />
                    </span>
                    <div className="result-row__main">
                      <strong>{duplicate.filename}</strong>
                      <span>{duplicate.message}</span>
                    </div>
                    <span className="id-pill">{duplicate.candidate.id}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {results.errors.length > 0 && (
            <div className="result-group">
              <h3>
                <AlertTriangle size={17} /> Could not read
              </h3>
              <div className="result-rows">
                {results.errors.map((item, index) => (
                  <div className="result-row result-row--bad" key={`${item.filename}-${index}`}>
                    <span className="file-icon">
                      <FileText size={16} />
                    </span>
                    <div className="result-row__main">
                      <strong>{item.filename}</strong>
                      <span>{item.error}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
