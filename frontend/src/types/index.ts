export type UserRole = 'recruiter' | 'client_hiring_manager' | 'delivery_head';

export type PipelineStage =
  | 'sourced'
  | 'ai_screened'
  | 'recruiter_verified'
  | 'submitted_to_client'
  | 'client_shortlisted'
  | 'interview_scheduled'
  | 'offered'
  | 'joined'
  | 'rejected';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  company_id: string;
  company_name: string;
}

export interface InterviewSlot {
  date: string;
  time: string;
  round: string;
  interviewer?: string;
}

export interface ScorecardSkill {
  name: string;
  min_years: number;
}

export interface ScorecardWeights {
  skills: number;
  experience: number;
  notice: number;
  ctc: number;
}

export interface Scorecard {
  job_title: string;
  min_exp: number;
  max_exp: number;
  max_notice_days: number;
  max_ctc: number;
  location: string;
  must_have_skills: ScorecardSkill[];
  nice_to_have_skills?: ScorecardSkill[];
  weights: ScorecardWeights;
  minimum_threshold_score?: number;
  ai_engine?: string;
  intake_timestamp?: string;
}

export type CriterionStatus =
  | 'matched'
  | 'missing'
  | 'overqualified'
  | 'under_experience'
  | 'notice_mismatch'
  | 'unknown'
  | 'budget_overrun';

export interface CriterionEvaluation {
  category: 'must_have_skill' | 'experience' | 'notice_period' | 'compensation' | 'domain';
  name: string;
  required: boolean;
  min_years?: number;
  score: number;
  status: CriterionStatus;
  evidence_quote: string;
  confidence: 'high' | 'medium' | 'low';
  uncertainty: boolean;
  notes?: string;
}

export interface Requisition {
  id: string;
  title: string;
  department: string;
  client_company: string;
  client_contact_name: string;
  client_user_id?: string | null;
  status: 'draft' | 'active' | 'shortlisting' | 'interviews' | 'closed';
  openings_count: number;
  min_exp: number;
  max_exp: number;
  max_ctc: number;
  max_notice_days: number;
  location: string;
  raw_jd?: string;
  scorecard_json: string;
  scorecard?: Scorecard;
  created_by: string;
  created_at?: string;
  updated_at?: string;
  total_candidates?: number;
  verified_count?: number;
  submitted_count?: number;
  shortlisted_count?: number;
  interview_count?: number;
  joined_count?: number;
  pending_review_count?: number;
}

export interface Candidate {
  id: string;
  name: string;
  email: string;
  phone: string;
  current_role: string;
  total_exp_years: number;
  key_skills: string[];
  current_ctc?: number | null;
  expected_ctc?: number | null;
  notice_period_days?: number | null;
  location?: string | null;
  raw_cv_text?: string;
  original_filename?: string;
  consent_status?: 'consented' | 'withdrawn' | 'deleted';
  consent_date?: string;
  consent_purpose?: string;
  is_deleted?: number;
  created_at?: string;
  // Evaluation fields merged into the ranked list.
  evaluation_id?: string;
  overall_score?: number;
  skills_score?: number;
  exp_score?: number;
  notice_score?: number;
  ctc_score?: number;
  breakdown?: CriterionEvaluation[];
  ai_confidence?: 'high' | 'medium' | 'low';
  uncertainty_notes?: string;
  scoring_engine?: string;
  recruiter_verified?: number;
  recruiter_verified_at?: string | null;
  recruiter_verified_by?: string | null;
  recruiter_notes?: string | null;
  pipeline_stage?: PipelineStage;
  rejection_reason?: string | null;
  rejection_notes?: string | null;
  client_feedback_notes?: string | null;
  interview_slots?: InterviewSlot[] | null;
  client_action_at?: string | null;
  evaluated_at?: string;
  updated_at?: string;
  contact_masked?: boolean;
}

export interface CandidateDetail {
  candidate: Candidate;
  evaluation: Candidate | null;
}

export interface AuditLogEntry {
  id: string;
  user_id: string;
  user_name: string;
  user_role: string;
  candidate_id?: string | null;
  requisition_id?: string | null;
  action: string;
  ip_address: string;
  details_json?: string;
  created_at: string;
}

export interface ConsentCandidate {
  id: string;
  name: string;
  email: string;
  consent_status: string;
  consent_date: string;
  consent_purpose: string;
  is_deleted: number;
  deleted_at?: string | null;
  created_at: string;
}

export interface ConsentData {
  stats: {
    total_registered: number;
    active_consents: number;
    erased_candidates: number;
    total_audit_events: number;
    compliance_framework: string;
  };
  candidates: ConsentCandidate[];
}

export interface CalibrationAudit {
  id: string;
  week_label: string;
  requisition_id: string;
  candidate_id: string;
  ai_rank: number;
  recruiter_rank: number;
  discrepancy_score: number;
  agreement_status: 'aligned' | 'minor_discrepancy' | 'major_override';
  recruiter_override_reason: string;
  audited_by: string;
  created_at: string;
  requisition_title?: string;
  client_company?: string;
  candidate_name?: string;
}

export interface CalibrationData {
  summary: {
    totalAudits: number;
    alignedCount: number;
    minorDiscrepancies: number;
    majorOverrides: number;
    alignmentRate: number | null;
    status: string;
  };
  audits: CalibrationAudit[];
}

export interface KpiData {
  summary: {
    active_requisitions: number;
    candidates: number;
    evaluations: number;
    verified: number;
    submitted: number;
    shortlisted: number;
    interviews: number;
    joined: number;
    client_decisions: number;
    client_acceptance_rate: number | null;
    verification_rate: number | null;
  };
  stage_counts: Record<string, number>;
  notes: {
    acceptance_rate: string;
    verification_rate: string;
  };
}

export interface PipelineData {
  requisitionId: string;
  requisitionTitle: string;
  clientCompany: string;
  pipeline: Record<PipelineStage, Candidate[]>;
}

export interface UploadResult {
  processed: number;
  successfulCandidates: Array<{
    candidateId: string;
    name: string;
    filename: string;
    score: number;
    confidence: 'high' | 'medium' | 'low';
    noticePeriodDays: number | null;
    warnings?: string[];
  }>;
  duplicatesDetected: Array<{
    filename: string;
    duplicateType: string;
    message: string;
    candidate: { id: string; name: string };
  }>;
  errors: Array<{ filename: string; error: string }>;
}

export interface ToastMessage {
  id: number;
  type: 'success' | 'error' | 'info';
  text: string;
}
