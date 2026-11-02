const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'screening.db');
const db = new Database(dbPath);

// Enable foreign keys and WAL mode for high concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initSchema() {
  db.exec(`
    -- Users table with role-based access control
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('recruiter', 'client_hiring_manager', 'delivery_head')),
      company_id TEXT NOT NULL,
      company_name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Requisitions table
    CREATE TABLE IF NOT EXISTS requisitions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      department TEXT NOT NULL,
      client_company TEXT NOT NULL,
      client_contact_name TEXT NOT NULL,
      client_user_id TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('draft', 'active', 'shortlisting', 'interviews', 'closed')),
      openings_count INTEGER DEFAULT 1,
      min_exp REAL DEFAULT 0,
      max_exp REAL DEFAULT 15,
      max_ctc REAL DEFAULT 30, -- In Lakhs INR
      max_notice_days INTEGER DEFAULT 60,
      location TEXT DEFAULT 'Noida',
      raw_jd TEXT,
      scorecard_json TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_user_id) REFERENCES users(id)
    );

    -- Candidates table (DPDP protected personal data)
    CREATE TABLE IF NOT EXISTS candidates (
      id TEXT PRIMARY KEY, -- e.g. CND-91022
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      current_role TEXT NOT NULL,
      total_exp_years REAL NOT NULL,
      key_skills_json TEXT NOT NULL, -- JSON array of skills
      current_ctc REAL, -- In LPA
      expected_ctc REAL, -- In LPA
      notice_period_days INTEGER NOT NULL,
      location TEXT,
      raw_cv_text TEXT,
      original_filename TEXT,
      file_hash TEXT,
      consent_status TEXT DEFAULT 'consented' CHECK(consent_status IN ('consented', 'withdrawn', 'deleted')),
      consent_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      consent_purpose TEXT DEFAULT 'Hiring evaluation for Company A requisitions',
      is_deleted INTEGER DEFAULT 0,
      deleted_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Evaluations & Pipeline table
    CREATE TABLE IF NOT EXISTS cv_evaluations (
      id TEXT PRIMARY KEY,
      requisition_id TEXT NOT NULL,
      candidate_id TEXT NOT NULL,
      overall_score REAL NOT NULL, -- 0-100
      skills_score REAL NOT NULL,
      exp_score REAL NOT NULL,
      notice_score REAL NOT NULL,
      ctc_score REAL NOT NULL,
      breakdown_json TEXT NOT NULL, -- JSON array of criterion details with quotes & confidence
      ai_confidence TEXT NOT NULL CHECK(ai_confidence IN ('high', 'medium', 'low')),
      uncertainty_notes TEXT,
      recruiter_verified INTEGER DEFAULT 0,
      recruiter_verified_at DATETIME,
      recruiter_verified_by TEXT,
      recruiter_notes TEXT,
      pipeline_stage TEXT NOT NULL DEFAULT 'ai_screened' CHECK(pipeline_stage IN (
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
      client_action_at DATETIME,
      interview_slots_json TEXT, -- Suggested slots from client
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (requisition_id) REFERENCES requisitions(id),
      FOREIGN KEY (candidate_id) REFERENCES candidates(id),
      UNIQUE(requisition_id, candidate_id)
    );

    -- DPDP Act 2023 Access & Activity Audit Log
    CREATE TABLE IF NOT EXISTS access_audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      user_role TEXT NOT NULL,
      candidate_id TEXT,
      requisition_id TEXT,
      action TEXT NOT NULL, -- 'view_unmasked_cv', 'view_masked_card', 'export_shortlist', 'stage_change', 'candidate_deletion', 'scorecard_updated'
      ip_address TEXT DEFAULT '127.0.0.1',
      details_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Weekly AI vs Recruiter Calibration Audit for Delivery Head
    CREATE TABLE IF NOT EXISTS calibration_audits (
      id TEXT PRIMARY KEY,
      week_label TEXT NOT NULL,
      requisition_id TEXT NOT NULL,
      candidate_id TEXT NOT NULL,
      ai_rank INTEGER NOT NULL,
      recruiter_rank INTEGER NOT NULL,
      discrepancy_score REAL NOT NULL,
      agreement_status TEXT NOT NULL CHECK(agreement_status IN ('aligned', 'minor_discrepancy', 'major_override')),
      recruiter_override_reason TEXT,
      audited_by TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (requisition_id) REFERENCES requisitions(id),
      FOREIGN KEY (candidate_id) REFERENCES candidates(id)
    );
  `);

  console.log('Database schema initialized at:', dbPath);
}

initSchema();

// Optional PostgreSQL Production Pool Support
const { Pool } = require('pg');
let pgPool = null;
const isPostgresEnabled = Boolean(process.env.DATABASE_URL || process.env.POSTGRES_HOST || process.env.DB_TYPE === 'postgres');

if (isPostgresEnabled) {
  try {
    const connStr = process.env.DATABASE_URL || 
      `postgres://${process.env.POSTGRES_USER || 'postgres'}:${process.env.POSTGRES_PASSWORD || 'postgrespassword'}@${process.env.POSTGRES_HOST || 'localhost'}:${process.env.POSTGRES_PORT || 5432}/${process.env.POSTGRES_DB || 'companya_screening'}`;
    pgPool = new Pool({ connectionString: connStr });
    console.log('PostgreSQL connection pool enabled for production environment.');
  } catch (err) {
    console.warn('PostgreSQL pool connection notice: Using embedded SQLite fallback for local reviewer execution.');
  }
}

db.pgPool = pgPool;
db.isPostgres = isPostgresEnabled;
db.getEngine = () => (isPostgresEnabled && pgPool ? 'PostgreSQL' : 'SQLite (Embedded WAL)');

module.exports = db;
