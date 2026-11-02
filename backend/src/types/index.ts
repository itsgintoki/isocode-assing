export type UserRole = 'recruiter' | 'client_hiring_manager' | 'delivery_head';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  company_id: string;
  company_name: string;
  created_at?: string;
}

export interface ScorecardCriterion {
  name: string;
  min_years?: number;
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
  must_have_skills: ScorecardCriterion[];
  nice_to_have_skills?: ScorecardCriterion[];
  weights: ScorecardWeights;
  minimum_threshold_score: number;
  ai_engine?: string;
  intake_timestamp?: string;
}

export interface CriterionEvaluation {
  category: 'must_have_skill' | 'experience' | 'notice_period' | 'compensation' | 'domain';
  name: string;
  required: boolean;
  min_years?: number;
  score: number;
  status: 'matched' | 'missing' | 'overqualified' | 'under_experience' | 'notice_mismatch' | 'unknown' | 'budget_overrun';
  evidence_quote: string;
  confidence: 'high' | 'medium' | 'low';
  uncertainty: boolean;
  notes?: string;
}

export interface ScoringResult {
  candidate_id: string;
  overall_score: number;
  skills_score: number;
  exp_score: number;
  notice_score: number;
  ctc_score: number;
  breakdown: CriterionEvaluation[];
  ai_confidence: 'high' | 'medium' | 'low';
  uncertainty_notes?: string;
  must_have_matched?: string;
  is_blind_screened?: boolean;
}

export interface Candidate {
  id: string;
  name: string;
  email: string;
  phone: string;
  current_role: string;
  total_exp_years: number;
  key_skills: string[];
  key_skills_json?: string;
  current_ctc?: number | null;
  expected_ctc?: number | null;
  notice_period_days: number;
  location?: string;
  raw_cv_text?: string;
  original_filename?: string;
  file_hash?: string | null;
  consent_status: 'consented' | 'withdrawn' | 'deleted';
  consent_date: string;
  consent_purpose: string;
  is_deleted: number;
  deleted_at?: string | null;
  created_at?: string;
}

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

export interface InterviewSlot {
  date: string;
  time: string;
  round: string;
  interviewer?: string;
}

export interface CVEvaluation {
  id: string;
  requisition_id: string;
  candidate_id: string;
  overall_score: number;
  skills_score: number;
  exp_score: number;
  notice_score: number;
  ctc_score: number;
  breakdown: CriterionEvaluation[];
  breakdown_json?: string;
  ai_confidence: 'high' | 'medium' | 'low';
  uncertainty_notes?: string;
  recruiter_verified: number;
  recruiter_verified_at?: string | null;
  recruiter_verified_by?: string | null;
  recruiter_notes?: string | null;
  pipeline_stage: PipelineStage;
  rejection_reason?: string | null;
  rejection_notes?: string | null;
  client_feedback_notes?: string | null;
  client_action_at?: string | null;
  interview_slots?: InterviewSlot[] | null;
  interview_slots_json?: string | null;
  created_at?: string;
  updated_at?: string;
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
  submitted_count?: number;
  shortlisted_count?: number;
  interview_count?: number;
}

export interface AccessAuditLog {
  id: string;
  user_id: string;
  user_name: string;
  user_role: string;
  candidate_id?: string | null;
  requisition_id?: string | null;
  action: string;
  ip_address?: string;
  details_json?: string;
  created_at?: string;
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
  recruiter_override_reason?: string;
  audited_by: string;
  created_at?: string;
  candidate_name?: string;
  current_role?: string;
  requisition_title?: string;
  client_company?: string;
}
