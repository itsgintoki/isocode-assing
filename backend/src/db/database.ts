import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

const projectRoot = path.join(__dirname, '../..');
const configuredPath = process.env.DATABASE_PATH
  ? path.resolve(projectRoot, process.env.DATABASE_PATH)
  : path.join(projectRoot, 'data/screening.db');

const dataDir = path.dirname(configuredPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export interface SqlStatement {
  get(...params: any[]): any;
  all(...params: any[]): any[];
  run(...params: any[]): Database.RunResult;
  pluck(toggleState?: boolean): SqlStatement;
  expand(toggleState?: boolean): SqlStatement;
  raw(toggleState?: boolean): SqlStatement;
  safeIntegers(toggleState?: boolean): SqlStatement;
  bind(...params: any[]): SqlStatement;
}

export interface ShortlistDatabase extends Omit<Database.Database, 'prepare'> {
  prepare(source: string): SqlStatement;
  databasePath: string;
  getEngine(): string;
}

const db = new Database(configuredPath) as unknown as ShortlistDatabase;
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

function hasColumn(table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column);
}

function addColumnIfMissing(table, column, definition) {
  if (!hasColumn(table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('recruiter', 'client_hiring_manager', 'delivery_head')),
      company_id TEXT NOT NULL,
      company_name TEXT NOT NULL,
      password_hash TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

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
      max_ctc REAL DEFAULT 30,
      max_notice_days INTEGER DEFAULT 60,
      location TEXT DEFAULT 'Noida',
      raw_jd TEXT,
      scorecard_json TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS candidates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      current_role TEXT NOT NULL,
      total_exp_years REAL NOT NULL,
      key_skills_json TEXT NOT NULL,
      current_ctc REAL,
      expected_ctc REAL,
      notice_period_days INTEGER,
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

    CREATE TABLE IF NOT EXISTS cv_evaluations (
      id TEXT PRIMARY KEY,
      requisition_id TEXT NOT NULL,
      candidate_id TEXT NOT NULL,
      overall_score REAL NOT NULL,
      skills_score REAL NOT NULL,
      exp_score REAL NOT NULL,
      notice_score REAL NOT NULL,
      ctc_score REAL NOT NULL,
      breakdown_json TEXT NOT NULL,
      ai_confidence TEXT NOT NULL CHECK(ai_confidence IN ('high', 'medium', 'low')),
      uncertainty_notes TEXT,
      scoring_engine TEXT DEFAULT 'Local evidence matcher',
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
      interview_slots_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (requisition_id) REFERENCES requisitions(id),
      FOREIGN KEY (candidate_id) REFERENCES candidates(id),
      UNIQUE(requisition_id, candidate_id)
    );

    CREATE TABLE IF NOT EXISTS access_audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      user_role TEXT NOT NULL,
      candidate_id TEXT,
      requisition_id TEXT,
      action TEXT NOT NULL,
      ip_address TEXT DEFAULT '127.0.0.1',
      details_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

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

    CREATE INDEX IF NOT EXISTS idx_evaluations_requisition ON cv_evaluations(requisition_id, overall_score DESC);
    CREATE INDEX IF NOT EXISTS idx_evaluations_candidate ON cv_evaluations(candidate_id);
    CREATE INDEX IF NOT EXISTS idx_candidates_email ON candidates(LOWER(email));
    CREATE INDEX IF NOT EXISTS idx_candidates_hash ON candidates(file_hash);
    CREATE INDEX IF NOT EXISTS idx_audit_candidate ON access_audit_logs(candidate_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_user ON access_audit_logs(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  `);

  // Small, forward-only migrations for databases created by the earlier build.
  addColumnIfMissing('users', 'password_hash', 'TEXT');
  addColumnIfMissing('cv_evaluations', 'scoring_engine', "TEXT DEFAULT 'Local evidence matcher'");

  console.log(`Database ready: ${configuredPath}`);
}

initSchema();

db.databasePath = configuredPath;
db.getEngine = () => 'SQLite (WAL)';

export default db;
