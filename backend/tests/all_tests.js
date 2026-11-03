const test = require('node:test');
const { after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// Use a disposable database so the suite never touches the demo data.
process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = 'data/test-screening.db';
const testDatabasePath = path.join(__dirname, '../data/test-screening.db');
for (const suffix of ['', '-wal', '-shm']) {
  fs.rmSync(`${testDatabasePath}${suffix}`, { force: true });
}

const request = require('supertest');
const app = require('../src/server');
const db = require('../src/db/database');
const {
  scoreCandidate,
  extractScorecardFromJD,
  sanitizeForBlindScoring,
  findEvidenceInText
} = require('../src/services/ai_scorer');
const { parseResumeDetails } = require('../src/services/cv_parser');
const { calculateFileHash, checkDuplicate } = require('../src/services/duplicate_detector');
const { maskEmail, maskPhone, maskCandidateForClient } = require('../src/services/pii_masker');

const PASSWORD = 'demo1234';

async function loginAs(email) {
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/login').send({ email, password: PASSWORD });
  assert.strictEqual(response.status, 200, `Login failed for ${email}: ${response.body.error || response.status}`);
  return agent;
}

after(() => {
  db.close();
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${testDatabasePath}${suffix}`, { force: true });
  }
});

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

test('CV parser - extracts contact details, experience, notice and CTC', () => {
  const cv = `PRIYA MENON
Bengaluru | priya.menon@example.com | +91 98765 43210

SUMMARY
Senior Java engineer with 7.5 years of experience in banking platforms.

EXPERIENCE
- Built Spring Boot microservices and REST APIs at Acme Bank.
- Worked with Kafka, PostgreSQL and Docker.

AVAILABILITY
Notice Period: 45 days.
Current CTC: ₹20.0 LPA | Expected CTC: ₹26.5 LPA`;

  const parsed = parseResumeDetails(cv, 'Priya_Menon.pdf');
  assert.strictEqual(parsed.name, 'PRIYA MENON');
  assert.strictEqual(parsed.email, 'priya.menon@example.com');
  assert.strictEqual(parsed.phone, '+919876543210');
  assert.strictEqual(parsed.total_exp_years, 7.5);
  assert.strictEqual(parsed.notice_period_days, 45);
  assert.strictEqual(parsed.current_ctc, 20);
  assert.strictEqual(parsed.expected_ctc, 26.5);
  assert.strictEqual(parsed.location, 'Bengaluru');
  assert.ok(parsed.key_skills.includes('Java'));
  assert.ok(parsed.key_skills.includes('Kafka'));
});

test('CV parser - missing notice stays null instead of inventing a default', () => {
  const parsed = parseResumeDetails(`SAMPLE CANDIDATE
sample.candidate@example.com | +91 98111 22334
Java developer with 4.0 years of experience.
Availability: to be discussed on the screening call.`, 'sample.txt');

  assert.strictEqual(parsed.notice_period_days, null);
  assert.ok(parsed.parse_warnings.some((warning) => /notice period/i.test(warning)));
});

test('CV parser - "available immediately" resolves to zero days', () => {
  const parsed = parseResumeDetails(`SAMPLE CANDIDATE
sample.candidate@example.com
Available immediately.`, 'sample.txt');
  assert.strictEqual(parsed.notice_period_days, 0);
});

test('CV parser - no fake contact details are generated', () => {
  const parsed = parseResumeDetails('SOME CANDIDATE\nJava developer with five years of experience.', 'some-cv.txt');
  assert.strictEqual(parsed.email, '');
  assert.strictEqual(parsed.phone, '');
  assert.ok(parsed.parse_warnings.some((warning) => /email/i.test(warning)));
  assert.ok(parsed.parse_warnings.some((warning) => /phone/i.test(warning)));
});

test('AI scorer - quotes verbatim evidence from the CV', () => {
  const cv = `
    RITIKA BANSAL
    Experience: 6.5 years in banking software.
    Senior Developer at PayFintech. Built microservices architecture in Java and Spring Boot.
    Notice Period: 60 days remaining.
  `;

  const javaEvidence = findEvidenceInText(cv, ['Java']);
  assert.ok(javaEvidence);
  assert.match(javaEvidence.quote, /Java and Spring Boot/);

  const noticeEvidence = findEvidenceInText(cv, ['Notice', '60 days']);
  assert.ok(noticeEvidence);
  assert.match(noticeEvidence.quote, /60 days remaining/);
});

test('AI scorer - missing notice and CTC are flagged, never auto-rejected', () => {
  const result = scoreCandidate({
    id: 'CND-TEST-01',
    name: 'Test Candidate',
    email: 'test@example.com',
    phone: '+91 99999 11111',
    current_role: 'Developer',
    total_exp_years: 5,
    key_skills: ['Java', 'Spring Boot'],
    notice_period_days: null,
    expected_ctc: null,
    raw_cv_text: 'Java Developer with 5 years experience. Skills: Java, Spring Boot. No notice mentioned.'
  }, {
    must_have_skills: [{ name: 'Java', min_years: 3 }],
    min_exp: 4,
    max_exp: 7,
    max_notice_days: 60,
    weights: { skills: 0.5, experience: 0.3, notice: 0.2, ctc: 0 }
  }, { blindScreening: true });

  assert.ok(result.overall_score > 0, 'A candidate is always retained for human review.');
  assert.strictEqual(result.scoring_engine, 'Deterministic evidence matcher');

  const notice = result.breakdown.find((item) => item.category === 'notice_period');
  assert.strictEqual(notice.uncertainty, true);
  assert.strictEqual(notice.confidence, 'low');
  assert.match(notice.notes, /not rejected automatically/i);

  const ctc = result.breakdown.find((item) => item.category === 'compensation');
  assert.strictEqual(ctc.uncertainty, true);
  assert.strictEqual(ctc.status, 'unknown');
});

test('AI scorer - JD extraction handles colon, rupee and "up to" formatting', () => {
  const javaJd = `Client: HDFC Tech Platform, Noida
Role: Senior Java Developer
Experience: 5 to 8 years
Location: Noida
Notice Period: Up to 60 days
Budget / Max CTC: ₹24.0 LPA
Must have: Java, Spring Boot, microservices, REST APIs, Kafka, Docker.`;

  const scorecard = extractScorecardFromJD(javaJd, 'Senior Java Developer');
  assert.strictEqual(scorecard.min_exp, 5);
  assert.strictEqual(scorecard.max_exp, 8);
  assert.strictEqual(scorecard.max_notice_days, 60);
  assert.strictEqual(scorecard.max_ctc, 24);
  assert.strictEqual(scorecard.location, 'Noida');
  assert.ok(scorecard.must_have_skills.some((skill) => skill.name === 'Java'));
  assert.ok(scorecard.must_have_skills.some((skill) => skill.name === 'Kafka'));

  const kycScorecard = extractScorecardFromJD(`Role: KYC Analyst
Experience: 2 to 5 years
Notice Period: 30 days
Budget: ₹11.0 LPA`, 'KYC Analyst');
  assert.deepStrictEqual(
    [kycScorecard.min_exp, kycScorecard.max_exp, kycScorecard.max_notice_days, kycScorecard.max_ctc],
    [2, 5, 30, 11]
  );
});

test('AI scorer - blind screening removes identity and demographics', () => {
  const blinded = sanitizeForBlindScoring({
    id: 'CND-88888',
    name: 'Ananya Sharma',
    email: 'ananya.sharma@gmail.com',
    phone: '+91 98111 22334',
    raw_cv_text: 'Ananya Sharma, female, married. Contact: ananya.sharma@gmail.com, +91 98111 22334. Senior Engineer.'
  });

  assert.strictEqual(blinded.name, 'Candidate CND-88888');
  assert.strictEqual(blinded.email, '[REDACTED]');
  assert.strictEqual(blinded.phone, '[REDACTED]');
  assert.ok(!blinded.raw_cv_text.includes('Ananya Sharma'));
  assert.ok(!blinded.raw_cv_text.includes('female'));
  assert.ok(!blinded.raw_cv_text.includes('married'));
});

test('PII masker - client portal masks direct contact details', () => {
  assert.strictEqual(maskEmail('ritika.bansal92@gmail.com'), 'r***2@gmail.com');
  assert.ok(maskPhone('+91 98112 45890').includes('***'));

  const masked = maskCandidateForClient({
    id: 'CND-91022',
    name: 'Ritika Bansal',
    email: 'ritika.bansal92@gmail.com',
    phone: '+91 98112 45890',
    raw_cv_text: 'Ritika Bansal, phone +91 98112 45890, email ritika.bansal92@gmail.com'
  });

  assert.strictEqual(masked.name, 'Ritika B. (CND-91022)');
  assert.ok(!masked.raw_cv_text.includes('ritika.bansal92@gmail.com'));
  assert.strictEqual(masked.contact_masked, true);
});

test('Duplicate detector - SHA-256 hash and email matching', () => {
  const content = 'Unique Resume Text for Duplicate Detection Test 2026';
  assert.strictEqual(calculateFileHash(content), calculateFileHash(content));

  const byEmail = checkDuplicate({ email: 'ritika.bansal92@gmail.com' });
  assert.strictEqual(byEmail.isDuplicate, true);
  assert.strictEqual(byEmail.type, 'email_profile_duplicate');
});

// ---------------------------------------------------------------------------
// API: authentication and role boundaries
// ---------------------------------------------------------------------------

test('API health check is public', async () => {
  const response = await request(app).get('/api/health');
  assert.strictEqual(response.status, 200);
  assert.strictEqual(response.body.status, 'online');
});

test('API - protected routes reject anonymous requests', async () => {
  const response = await request(app).get('/api/requisitions');
  assert.strictEqual(response.status, 401);
  assert.match(response.body.error, /sign in/i);

  const candidates = await request(app).get('/api/candidates?requisitionId=REQ-2026-081');
  assert.strictEqual(candidates.status, 401);
});

test('API auth - demo accounts expose roles but never passwords', async () => {
  const response = await request(app).get('/api/auth/demo-accounts');
  assert.strictEqual(response.status, 200);
  assert.ok(response.body.users.length >= 3);
  assert.ok(response.body.users.every((user) => !('password_hash' in user)));
});

test('API auth - login sets an HttpOnly session cookie and logout clears it', async () => {
  const agent = request.agent(app);
  const login = await agent.post('/api/auth/login').send({
    email: 'priya@companya.in',
    password: PASSWORD
  });

  assert.strictEqual(login.status, 200);
  assert.strictEqual(login.body.user.role, 'recruiter');
  assert.ok(!('password_hash' in login.body.user));
  const cookie = login.headers['set-cookie'][0];
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);

  const me = await agent.get('/api/auth/me');
  assert.strictEqual(me.status, 200);
  assert.strictEqual(me.body.user.email, 'priya@companya.in');

  const logout = await agent.post('/api/auth/logout');
  assert.strictEqual(logout.status, 200);
  const afterLogout = await agent.get('/api/auth/me');
  assert.strictEqual(afterLogout.status, 401);
});

test('API auth - failed attempts are rate-limited but successes reset the counter', async () => {
  for (let i = 0; i < 3; i += 1) {
    const failed = await request(app).post('/api/auth/login').send({
      email: 'priya@companya.in',
      password: 'definitely-wrong'
    });
    assert.strictEqual(failed.status, 401);
  }

  const login = await request(app).post('/api/auth/login').send({
    email: 'priya@companya.in',
    password: PASSWORD
  });
  assert.strictEqual(login.status, 200);
});

test('API security - client hiring managers cannot reach internal workspaces', async () => {
  const client = await loginAs('vikram@hdfctech.com');

  const candidates = await client.get('/api/candidates?requisitionId=REQ-2026-081');
  assert.strictEqual(candidates.status, 403);

  const audit = await client.get('/api/dpdp/audit-logs');
  assert.strictEqual(audit.status, 403);

  const analytics = await client.get('/api/analytics/kpi-metrics');
  assert.strictEqual(analytics.status, 403);

  const scorecard = await client.put('/api/requisitions/REQ-2026-081/scorecard').send({
    scorecard: { job_title: 'Hacked' }
  });
  assert.strictEqual(scorecard.status, 403);
});

test('API tenancy - a client only sees its own requisitions', async () => {
  const vikram = await loginAs('vikram@hdfctech.com');
  const ownList = await vikram.get('/api/requisitions');
  assert.strictEqual(ownList.status, 200);
  assert.ok(ownList.body.requisitions.length > 0);
  assert.ok(ownList.body.requisitions.every((req) => req.client_company === 'HDFC Tech Platform'));

  const otherDetail = await vikram.get('/api/requisitions/REQ-2026-082');
  assert.strictEqual(otherDetail.status, 403);

  const otherShortlist = await vikram.get('/api/client/shortlist/REQ-2026-082');
  assert.strictEqual(otherShortlist.status, 403);

  const ananya = await loginAs('ananya@standardchartered.com');
  const ananyaList = await ananya.get('/api/requisitions');
  assert.ok(ananyaList.body.requisitions.every((req) => req.client_company === 'Standard Chartered Global Back-Office'));
});

test('API client portal - masked contacts, submitted candidates only, no CV text', async () => {
  const client = await loginAs('vikram@hdfctech.com');
  const response = await client.get('/api/client/shortlist/REQ-2026-081');
  assert.strictEqual(response.status, 200);

  const ids = response.body.candidates.map((candidate) => candidate.id);
  assert.ok(ids.includes('CND-91022'), 'Submitted candidate should be visible');
  assert.ok(ids.includes('CND-91120'), 'Interview candidate should be visible');
  assert.ok(!ids.includes('CND-91150'), 'Unsubmitted candidate must not leak into the portal');

  for (const candidate of response.body.candidates) {
    assert.ok(!('raw_cv_text' in candidate), 'Raw CV text must never be sent to clients');
    assert.strictEqual(candidate.contact_masked, true);
    assert.match(candidate.email, /\*/);
    assert.match(candidate.phone, /\*/);
  }
});

test('API client portal - decisions are client-only and validate their input', async () => {
  const recruiter = await loginAs('priya@companya.in');
  const forbidden = await recruiter.post('/api/client/action').send({
    requisitionId: 'REQ-2026-081',
    candidateId: 'CND-91022',
    action: 'shortlist'
  });
  assert.strictEqual(forbidden.status, 403);

  const client = await loginAs('vikram@hdfctech.com');
  const noReason = await client.post('/api/client/action').send({
    requisitionId: 'REQ-2026-081',
    candidateId: 'CND-91022',
    action: 'reject'
  });
  assert.strictEqual(noReason.status, 400);
  assert.match(noReason.body.error, /reason/i);

  const unsubmitted = await client.post('/api/client/action').send({
    requisitionId: 'REQ-2026-081',
    candidateId: 'CND-91150',
    action: 'shortlist'
  });
  assert.strictEqual(unsubmitted.status, 404);
});

test('API recruiter flow - a CV must be opened before verification', async () => {
  const recruiter = await loginAs('priya@companya.in');

  const blocked = await recruiter.post('/api/candidates/CND-91088/verify').send({
    requisitionId: 'REQ-2026-081',
    notes: 'Attempting to verify without opening the CV.'
  });
  assert.strictEqual(blocked.status, 400);
  assert.match(blocked.body.error, /open the candidate cv/i);

  const detail = await recruiter.get('/api/candidates/CND-91088?requisitionId=REQ-2026-081');
  assert.strictEqual(detail.status, 200);
  assert.ok(detail.body.candidate.raw_cv_text.length > 50);
  assert.strictEqual(detail.body.evaluation.scoring_engine, 'Deterministic evidence matcher');

  const audit = await recruiter.get('/api/dpdp/audit-logs?candidateId=CND-91088');
  assert.ok(audit.body.logs.some((log) => log.action === 'view_unmasked_cv'));

  const verified = await recruiter.post('/api/candidates/CND-91088/verify').send({
    requisitionId: 'REQ-2026-081',
    notes: 'Opened the CV and checked the Spring/Hibernate evidence on the screening call.'
  });
  assert.strictEqual(verified.status, 200);
  assert.strictEqual(verified.body.recruiter_verified, 1);

  const row = db.prepare('SELECT recruiter_verified, pipeline_stage FROM cv_evaluations WHERE candidate_id = ? AND requisition_id = ?')
    .get('CND-91088', 'REQ-2026-081');
  assert.strictEqual(row.recruiter_verified, 1);
  assert.strictEqual(row.pipeline_stage, 'recruiter_verified');
});

test('API pipeline - unverified candidates cannot be submitted to a client', async () => {
  const recruiter = await loginAs('priya@companya.in');
  const response = await recruiter.post('/api/pipeline/move').send({
    requisitionId: 'REQ-2026-081',
    candidateId: 'CND-91135',
    targetStage: 'submitted_to_client'
  });

  assert.strictEqual(response.status, 400);
  assert.match(response.body.error, /verify/i);
});

test('API pipeline - client-only stages cannot be moved from the internal workspace', async () => {
  const recruiter = await loginAs('priya@companya.in');
  const response = await recruiter.post('/api/pipeline/move').send({
    requisitionId: 'REQ-2026-081',
    candidateId: 'CND-91022',
    targetStage: 'client_shortlisted'
  });

  assert.strictEqual(response.status, 403);
  assert.match(response.body.error, /client portal/i);
});

// ---------------------------------------------------------------------------
// API: requisition creation, bulk upload and DPDP
// ---------------------------------------------------------------------------

let createdRequisitionId = null;

test('API requisitions - JD intake and validated creation', async () => {
  const recruiter = await loginAs('priya@companya.in');
  const jd = `Role: Senior Backend Engineer
Experience: 4 to 7 years
Location: Pune
Notice Period: Up to 45 days
Budget: ₹22.0 LPA
Must have: Java, Spring Boot, microservices, Kafka and Docker.`;

  const intake = await recruiter.post('/api/requisitions/intake-jd').send({ rawJdText: jd, jobTitle: 'Senior Backend Engineer' });
  assert.strictEqual(intake.status, 200);
  assert.strictEqual(intake.body.scorecard.min_exp, 4);
  assert.strictEqual(intake.body.scorecard.max_exp, 7);
  assert.strictEqual(intake.body.scorecard.max_notice_days, 45);
  assert.strictEqual(intake.body.scorecard.max_ctc, 22);
  assert.match(intake.body.scorecard.ai_engine, /deterministic/i);

  const create = await recruiter.post('/api/requisitions').send({
    title: 'Senior Backend Engineer',
    client_company: 'Test Client',
    department: 'Platform',
    client_contact_name: 'Test Hiring Manager',
    openings_count: 1,
    raw_jd: jd,
    scorecard: intake.body.scorecard
  });
  assert.strictEqual(create.status, 201);
  assert.match(create.body.requisitionId, /^REQ-/);
  createdRequisitionId = create.body.requisitionId;

  const invalid = await recruiter.post('/api/requisitions').send({
    title: 'Invalid Role',
    client_company: 'Test Client',
    scorecard: { ...intake.body.scorecard, weights: { skills: 0.9, experience: 0.3, notice: 0.2, ctc: 0.2 } }
  });
  assert.strictEqual(invalid.status, 400);
  assert.match(invalid.body.error, /weights/i);
});

test('API bulk upload - parses, scores, deduplicates and rejects unsafe types', async () => {
  const recruiter = await loginAs('priya@companya.in');
  const cv = `UPLOADED TEST CANDIDATE
Pune | uploaded.test.2026@example.com | +91 90000 12345

SUMMARY
Senior Backend Engineer with 6.0 years of experience building Java and Spring Boot services.

EXPERIENCE
- Built microservices and REST APIs for a payments platform.
- Used Kafka and Docker in production.

AVAILABILITY
Notice Period: 20 days.
Current CTC: ₹16.0 LPA | Expected CTC: ₹20.0 LPA`;

  const upload = await recruiter
    .post('/api/candidates/upload')
    .field('requisitionId', createdRequisitionId)
    .attach('cvFiles', Buffer.from(cv), 'uploaded-test-candidate.txt');

  assert.strictEqual(upload.status, 200);
  assert.strictEqual(upload.body.results.processed, 1);
  assert.strictEqual(upload.body.results.successfulCandidates.length, 1);
  assert.strictEqual(upload.body.results.errors.length, 0);
  const uploaded = upload.body.results.successfulCandidates[0];
  assert.strictEqual(uploaded.noticePeriodDays, 20);
  assert.ok(uploaded.score > 0);

  const ranked = await recruiter.get(`/api/candidates?requisitionId=${createdRequisitionId}`);
  assert.strictEqual(ranked.status, 200);
  assert.strictEqual(ranked.body.totalCount, 1);
  assert.strictEqual(ranked.body.candidates[0].email, 'uploaded.test.2026@example.com');

  const duplicate = await recruiter
    .post('/api/candidates/upload')
    .field('requisitionId', createdRequisitionId)
    .attach('cvFiles', Buffer.from(cv), 'uploaded-test-candidate-copy.txt');
  assert.strictEqual(duplicate.status, 200);
  assert.strictEqual(duplicate.body.results.duplicatesDetected.length, 1);

  const unsupported = await recruiter
    .post('/api/candidates/upload')
    .field('requisitionId', createdRequisitionId)
    .attach('cvFiles', Buffer.from('not a cv'), 'malware.exe');
  assert.strictEqual(unsupported.status, 400);
  assert.match(unsupported.body.error, /PDF, DOCX and TXT/i);
});

test('API DPDP - erasure anonymises the candidate and retains the audit trail', async () => {
  const candidateId = `CND-ERASE-${Date.now()}`;
  db.prepare(`
    INSERT INTO candidates (id, name, email, phone, current_role, total_exp_years, key_skills_json, notice_period_days, raw_cv_text, file_hash)
    VALUES (?, 'Delete Candidate', 'delete.me@test.com', '+91 91234 56789', 'Tester', 2.0, '["Testing"]', 30, 'Private Personal CV Text', 'hash123')
  `).run(candidateId);

  const recruiter = await loginAs('priya@companya.in');
  const response = await recruiter.post('/api/dpdp/erasure-request').send({
    candidateId,
    reason: 'Candidate requested erasure under DPDP Act 2023 Section 12'
  });

  assert.strictEqual(response.status, 200);
  assert.strictEqual(response.body.result.success, true);
  assert.ok(response.body.result.receipt.startsWith('DPDP-PURGE-'));

  const purged = db.prepare('SELECT * FROM candidates WHERE id = ?').get(candidateId);
  assert.strictEqual(purged.is_deleted, 1);
  assert.strictEqual(purged.consent_status, 'deleted');
  assert.strictEqual(purged.file_hash, null);
  assert.ok(purged.raw_cv_text.includes('DATA PURGED UNDER DPDP ACT 2023'));

  const client = await loginAs('vikram@hdfctech.com');
  const forbidden = await client.post('/api/dpdp/erasure-request').send({ candidateId });
  assert.strictEqual(forbidden.status, 403);
});
