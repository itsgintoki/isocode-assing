-- Company A Staffing — PostgreSQL Production DDL Schema

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(32) NOT NULL CHECK(role IN ('recruiter', 'client_hiring_manager', 'delivery_head')),
  company_id VARCHAR(64) NOT NULL,
  company_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS requisitions (
  id VARCHAR(64) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  department VARCHAR(128) NOT NULL,
  client_company VARCHAR(255) NOT NULL,
  client_contact_name VARCHAR(255) NOT NULL,
  client_user_id VARCHAR(64) REFERENCES users(id),
  status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK(status IN ('draft', 'active', 'shortlisting', 'interviews', 'closed')),
  openings_count INT DEFAULT 1,
  min_exp NUMERIC(4, 1) DEFAULT 0,
  max_exp NUMERIC(4, 1) DEFAULT 15,
  max_ctc NUMERIC(5, 2) DEFAULT 30, -- In Lakhs INR
  max_notice_days INT DEFAULT 60,
  location VARCHAR(128) DEFAULT 'Noida',
  raw_jd TEXT,
  scorecard_json JSONB NOT NULL,
  created_by VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS candidates (
  id VARCHAR(64) PRIMARY KEY, -- e.g. CND-91022
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(64) NOT NULL,
  current_role VARCHAR(255) NOT NULL,
  total_exp_years NUMERIC(4, 1) NOT NULL,
  key_skills_json JSONB NOT NULL,
  current_ctc NUMERIC(5, 2),
  expected_ctc NUMERIC(5, 2),
  notice_period_days INT NOT NULL,
  location VARCHAR(128),
  raw_cv_text TEXT,
  original_filename VARCHAR(255),
  file_hash VARCHAR(128),
  consent_status VARCHAR(32) DEFAULT 'consented' CHECK(consent_status IN ('consented', 'withdrawn', 'deleted')),
  consent_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  consent_purpose TEXT DEFAULT 'Hiring evaluation for Company A requisitions under DPDP Act 2023',
  is_deleted INT DEFAULT 0,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cv_evaluations (
  id VARCHAR(128) PRIMARY KEY,
  requisition_id VARCHAR(64) NOT NULL REFERENCES requisitions(id) ON DELETE CASCADE,
  candidate_id VARCHAR(64) NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  overall_score NUMERIC(5, 2) NOT NULL,
  skills_score NUMERIC(5, 2) NOT NULL,
  exp_score NUMERIC(5, 2) NOT NULL,
  notice_score NUMERIC(5, 2) NOT NULL,
  ctc_score NUMERIC(5, 2) NOT NULL,
  breakdown_json JSONB NOT NULL,
  ai_confidence VARCHAR(16) NOT NULL CHECK(ai_confidence IN ('high', 'medium', 'low')),
  uncertainty_notes TEXT,
  recruiter_verified INT DEFAULT 0,
  recruiter_verified_at TIMESTAMPTZ,
  recruiter_verified_by VARCHAR(255),
  recruiter_notes TEXT,
  pipeline_stage VARCHAR(32) NOT NULL DEFAULT 'ai_screened' CHECK(pipeline_stage IN (
    'sourced',
    'ai_screened',
    'recruiter_verified',
    'submitted_to_client',
    'client_shortlisted',
    'interview_scheduled',
    'offered',
    'joined',
    'rejected'
  )),
  rejection_reason TEXT,
  rejection_notes TEXT,
  client_feedback_notes TEXT,
  client_action_at TIMESTAMPTZ,
  interview_slots_json JSONB,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(requisition_id, candidate_id)
);

CREATE TABLE IF NOT EXISTS access_audit_logs (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  user_name VARCHAR(255) NOT NULL,
  user_role VARCHAR(32) NOT NULL,
  candidate_id VARCHAR(64),
  requisition_id VARCHAR(64),
  action VARCHAR(64) NOT NULL,
  ip_address VARCHAR(64) DEFAULT '127.0.0.1',
  details_json JSONB,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS calibration_audits (
  id VARCHAR(64) PRIMARY KEY,
  week_label VARCHAR(64) NOT NULL,
  requisition_id VARCHAR(64) NOT NULL REFERENCES requisitions(id),
  candidate_id VARCHAR(64) NOT NULL REFERENCES candidates(id),
  ai_rank INT NOT NULL,
  recruiter_rank INT NOT NULL,
  discrepancy_score NUMERIC(4, 2) NOT NULL,
  agreement_status VARCHAR(32) NOT NULL CHECK(agreement_status IN ('aligned', 'minor_discrepancy', 'major_override')),
  recruiter_override_reason TEXT,
  audited_by VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_candidates_file_hash ON candidates(file_hash);
CREATE INDEX IF NOT EXISTS idx_candidates_email ON candidates(email);
CREATE INDEX IF NOT EXISTS idx_eval_req_stage ON cv_evaluations(requisition_id, pipeline_stage);
CREATE INDEX IF NOT EXISTS idx_eval_score ON cv_evaluations(overall_score DESC);
CREATE INDEX IF NOT EXISTS idx_audit_candidate ON access_audit_logs(candidate_id);
