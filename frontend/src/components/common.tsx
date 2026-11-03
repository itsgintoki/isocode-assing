import React, { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { CriterionStatus, PipelineStage } from '../types';

export function scoreTone(score = 0): 'high' | 'mid' | 'low' {
  if (score >= 80) return 'high';
  if (score >= 60) return 'mid';
  return 'low';
}

export function ScoreRing({ score = 0, size = 52 }: { score?: number; size?: number }) {
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(100, Math.max(0, score)) / 100) * circumference;
  return (
    <div className={`score-ring ${scoreTone(score)}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 52 52" aria-hidden="true">
        <circle className="score-ring__track" cx="26" cy="26" r={radius} />
        <circle
          className="score-ring__value"
          cx="26"
          cy="26"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <span>{Math.round(score)}</span>
    </div>
  );
}

const STAGE_LABELS: Record<PipelineStage, string> = {
  sourced: 'Sourced',
  ai_screened: 'AI screened',
  recruiter_verified: 'Recruiter verified',
  submitted_to_client: 'With client',
  client_shortlisted: 'Client shortlisted',
  interview_scheduled: 'Interview',
  offered: 'Offer',
  joined: 'Joined',
  rejected: 'Passed'
};

export function stageLabel(stage?: string): string {
  return STAGE_LABELS[(stage || 'ai_screened') as PipelineStage] || String(stage || '').replace(/_/g, ' ');
}

export function StageBadge({ stage }: { stage?: string }) {
  const safeStage = stage || 'ai_screened';
  return <span className={`stage-badge stage-${safeStage}`}>{stageLabel(safeStage)}</span>;
}

export function ConfidenceBadge({ confidence }: { confidence?: 'high' | 'medium' | 'low' }) {
  const level = confidence || 'medium';
  return (
    <span className={`confidence confidence-${level}`}>
      <span className="confidence__dot" />
      {level} confidence
    </span>
  );
}

export function VerifiedBadge({ verified, by }: { verified?: number; by?: string | null }) {
  if (verified) {
    return <span className="verified">{by ? `Verified by ${by.split(' ')[0]}` : 'Recruiter verified'}</span>;
  }
  return <span className="unverified">Awaiting recruiter</span>;
}

const STATUS_LABELS: Record<CriterionStatus, string> = {
  matched: 'Evidence found',
  missing: 'Not found',
  overqualified: 'Above band',
  under_experience: 'Below band',
  notice_mismatch: 'Notice mismatch',
  unknown: 'Needs checking',
  budget_overrun: 'Over budget'
};

export function criterionLabel(status: CriterionStatus): string {
  return STATUS_LABELS[status] || status;
}

export function EmptyState({
  icon: Icon = AlertTriangle,
  title,
  body,
  action
}: {
  icon?: LucideIcon;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-state__icon">
        <Icon size={22} />
      </span>
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}

export function Modal({
  title,
  description,
  onClose,
  children,
  footer,
  width = '560px'
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div className="overlay" onMouseDown={onClose} role="presentation">
      <div
        className="modal"
        style={{ maxWidth: width }}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="modal__header">
          <div>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>
        <div className="modal__body">{children}</div>
        {footer && <footer className="modal__footer">{footer}</footer>}
      </div>
    </div>
  );
}

export function LoadingRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="loading-rows" aria-label="Loading">
      {Array.from({ length: rows }).map((_, index) => (
        <div className="loading-row" key={index}>
          <span className="skeleton skeleton--circle" />
          <span className="skeleton skeleton--line" />
          <span className="skeleton skeleton--short" />
        </div>
      ))}
    </div>
  );
}

export function severityForCriterion(status: CriterionStatus): 'good' | 'warn' | 'bad' {
  if (status === 'matched') return 'good';
  if (status === 'missing' || status === 'notice_mismatch' || status === 'budget_overrun') return 'warn';
  return 'bad';
}
