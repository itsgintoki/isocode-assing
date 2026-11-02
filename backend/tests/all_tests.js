const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const app = require('../src/server');
const db = require('../src/db/database');
const { scoreCandidate, extractScorecardFromJD, sanitizeForBlindScoring, findEvidenceInText } = require('../src/services/ai_scorer');
const { calculateFileHash, checkDuplicate } = require('../src/services/duplicate_detector');
const { maskEmail, maskPhone, maskCandidateForClient } = require('../src/services/pii_masker');
const { executeCandidateErasure } = require('../src/services/dpdp_service');

test('AI Scorer - Exact Quote Citation & Extraction', () => {
  const cvText = `
    RITIKA BANSAL
    Experience: 6.5 years in banking software.
    Senior Developer at PayFintech. Built microservices architecture in Java and Spring Boot.
    Notice Period: 60 days remaining.
  `;

  const evidenceJava = findEvidenceInText(cvText, ['Java']);
  assert.ok(evidenceJava, 'Should find Java evidence');
  assert.match(evidenceJava.quote, /Java and Spring Boot/, 'Should quote exact matching line');

  const evidenceNotice = findEvidenceInText(cvText, ['Notice', '60 days']);
  assert.ok(evidenceNotice, 'Should find Notice evidence');
  assert.match(evidenceNotice.quote, /60 days remaining/, 'Should quote exact notice period line');
});

test('AI Scorer - Missing Notice Period Uncertainty Flag', () => {
  const candidateWithoutNotice = {
    id: 'CND-TEST-01',
    name: 'Test Candidate',
    email: 'test@example.com',
    phone: '+91 99999 11111',
    current_role: 'Developer',
    total_exp_years: 5.0,
    key_skills: ['Java', 'Spring Boot'],
    notice_period_days: null, // Omitted notice period
    raw_cv_text: 'Java Developer with 5 years experience. Skills: Java, Spring Boot. No notice mentioned.'
  };

  const scorecard = {
    must_have_skills: [{ name: 'Java', min_years: 3 }],
    min_exp: 4,
    max_exp: 7,
    max_notice_days: 60,
    weights: { skills: 0.5, experience: 0.3, notice: 0.2, ctc: 0.0 }
  };

  const result = scoreCandidate(candidateWithoutNotice, scorecard, { blindScreening: true });
  assert.ok(result.overall_score > 0, 'Score should be computed');
  
  const noticeCriterion = result.breakdown.find(b => b.category === 'notice_period');
  assert.strictEqual(noticeCriterion.uncertainty, true, 'Should flag uncertainty when notice period is omitted');
  assert.strictEqual(noticeCriterion.confidence, 'low', 'Confidence should be low for missing field');
});

test('AI Scorer - Blind Screening PII Redaction', () => {
  const rawCandidate = {
    id: 'CND-88888',
    name: 'Ananya Sharma',
    email: 'ananya.sharma@gmail.com',
    phone: '+91 98111 22334',
    raw_cv_text: 'Ananya Sharma, female, married. Contact: ananya.sharma@gmail.com, +91 98111 22334. Senior Engineer.'
  };

  const blinded = sanitizeForBlindScoring(rawCandidate);
  assert.strictEqual(blinded.name, 'Candidate CND-88888');
  assert.strictEqual(blinded.email, '[REDACTED]');
  assert.ok(!blinded.raw_cv_text.includes('Ananya Sharma'), 'Name should be scrubbed from text');
  assert.ok(!blinded.raw_cv_text.includes('female'), 'Gender should be scrubbed');
  assert.ok(!blinded.raw_cv_text.includes('married'), 'Marital status should be scrubbed');
});

test('Duplicate Detector - SHA256 Hash and Email Detection', () => {
  const fileContent = 'Unique Resume Text for Duplicate Detection Test 2026';
  const hash1 = calculateFileHash(fileContent);
  const hash2 = calculateFileHash(fileContent);
  assert.strictEqual(hash1, hash2, 'Identical content must yield identical SHA-256 hash');

  const dupEmailCheck = checkDuplicate({ email: 'ritika.bansal92@gmail.com' });
  assert.strictEqual(dupEmailCheck.isDuplicate, true, 'Should detect existing candidate email');
  assert.strictEqual(dupEmailCheck.type, 'email_profile_duplicate');
});

test('PII Masker - Client Portal Contact Masking', () => {
  const maskedEmail = maskEmail('ritika.bansal92@gmail.com');
  assert.strictEqual(maskedEmail, 'r***2@gmail.com');

  const maskedPhone = maskPhone('+91 98112 45890');
  assert.ok(maskedPhone.includes('***'), 'Phone must mask middle digits');

  const candidate = {
    id: 'CND-91022',
    name: 'Ritika Bansal',
    email: 'ritika.bansal92@gmail.com',
    phone: '+91 98112 45890',
    raw_cv_text: 'Ritika Bansal, phone +91 98112 45890, email ritika.bansal92@gmail.com'
  };

  const masked = maskCandidateForClient(candidate);
  assert.strictEqual(masked.name, 'Ritika B. (CND-91022)');
  assert.ok(!masked.raw_cv_text.includes('ritika.bansal92@gmail.com'), 'Email scrubbed from CV text');
});

test('API Security - Role-Based Access Control and Submission Guard', async () => {
  // 1. Client hiring manager cannot alter recruiter scorecard
  const forbiddenRes = await request(app)
    .put('/api/requisitions/REQ-2026-081/scorecard')
    .set('x-user-id', 'usr_client_vikram') // Client role
    .send({ scorecard: { weights: { skills: 0.9 } } });
  assert.strictEqual(forbiddenRes.status, 403, 'Client hiring manager should be forbidden from modifying scorecards');

  // 2. Submission to client requires mandatory recruiter verification
  const blockedMoveRes = await request(app)
    .post('/api/pipeline/move')
    .set('x-user-id', 'usr_recruiter_priya')
    .send({
      requisitionId: 'REQ-2026-081',
      candidateId: 'CND-91135', // Vikas Gupta (unverified)
      targetStage: 'submitted_to_client'
    });
  assert.strictEqual(blockedMoveRes.status, 400, 'Unverified candidate cannot be submitted to client');
  assert.match(blockedMoveRes.body.error, /recruiter must open and verify/i);
});

test('DPDP Act 2023 - Candidate Right to Erasure Execution', () => {
  // Insert temporary candidate to test erasure
  const tempId = `CND-ERASE-${Date.now()}`;
  db.prepare(`
    INSERT INTO candidates (id, name, email, phone, current_role, total_exp_years, key_skills_json, notice_period_days, raw_cv_text, file_hash)
    VALUES (?, 'Delete Candidate', 'delete.me@test.com', '+91 91234 56789', 'Tester', 2.0, '["Testing"]', 30, 'Private Personal CV Text', 'hash123')
  `).run(tempId);

  const erasureResult = executeCandidateErasure({
    candidateId: tempId,
    requestedBy: { id: 'usr_recruiter_priya', name: 'Priya Sharma', role: 'recruiter' },
    reason: 'Candidate requested erasure under DPDP Act 2023 Section 12'
  });

  assert.strictEqual(erasureResult.success, true);
  assert.ok(erasureResult.receipt.startsWith('DPDP-PURGE-'));

  const purgedCandidate = db.prepare('SELECT * FROM candidates WHERE id = ?').get(tempId);
  assert.strictEqual(purgedCandidate.is_deleted, 1);
  assert.strictEqual(purgedCandidate.consent_status, 'deleted');
  assert.strictEqual(purgedCandidate.file_hash, null);
  assert.ok(purgedCandidate.raw_cv_text.includes('DATA PURGED UNDER DPDP ACT 2023'));
});
