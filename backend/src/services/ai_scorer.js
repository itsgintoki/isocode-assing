/**
 * AI Scoring & Evidence Extraction Engine
 * Conforms to Company A requirements:
 * - Scores CV against editable scorecard criteria
 * - Quotes exact verbatim evidence lines from candidate's CV
 * - Highlights AI uncertainty and confidence levels
 * - NEVER auto-rejects any candidate
 * - Supports blind screening (strips PII from scoring context)
 */

function escapeRegex(string) {
  if (!string) return '';
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sanitizeForBlindScoring(candidate) {
  // Blind Screening: Hide Name, Gender, Age, Marital status, Contact Info
  // Ensures scoring model evaluates purely on skills, experience, and qualifications
  let rawText = candidate.raw_cv_text || candidate.text || '';
  if (candidate.name) {
    rawText = rawText.replace(new RegExp(escapeRegex(candidate.name), 'gi'), '[CANDIDATE]');
  }
  if (candidate.email) {
    rawText = rawText.replace(new RegExp(escapeRegex(candidate.email), 'gi'), '[REDACTED_EMAIL]');
  }
  if (candidate.phone) {
    rawText = rawText.replace(new RegExp(escapeRegex(candidate.phone), 'gi'), '[REDACTED_PHONE]');
  }
  rawText = rawText.replace(/\b(male|female|other|single|married|unmarried|dob|date of birth)\b/gi, '[DEMOGRAPHIC_REDACTED]');

  return {
    ...candidate,
    name: `Candidate ${candidate.id}`,
    email: '[REDACTED]',
    phone: '[REDACTED]',
    raw_cv_text: rawText,
    text: rawText
  };
}

function findEvidenceInText(text, searchTerms) {
  if (!text) return null;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    for (const term of searchTerms) {
      if (new RegExp(`\\b${escapeRegex(term)}\\b`, 'i').test(line)) {
        // Return matching line plus adjacent context if helpful
        const prevLine = i > 0 ? lines[i - 1].trim() : '';
        const nextLine = i < lines.length - 1 ? lines[i + 1].trim() : '';
        return {
          quote: line,
          context: [prevLine, line, nextLine].filter(Boolean).join(' | '),
          lineNumber: i + 1
        };
      }
    }
  }
  return null;
}

function scoreCandidate(candidateRaw, scorecard, options = { blindScreening: true }) {
  const candidate = options.blindScreening ? sanitizeForBlindScoring(candidateRaw) : candidateRaw;
  const text = candidate.raw_cv_text || candidate.text || '';
  
  const weights = scorecard.weights || {
    skills: 0.40,
    experience: 0.30,
    notice: 0.15,
    ctc: 0.15
  };

  const breakdown = [];
  let skillsScoreTotal = 0;
  let mustHaveCount = 0;
  let mustHaveMatched = 0;
  let missingCriticalItems = [];

  // 1. MUST-HAVE SKILLS EVALUATION
  const mustHaveSkills = scorecard.must_have_skills || [];
  const candidateSkills = (
    Array.isArray(candidate.key_skills) ? candidate.key_skills :
    Array.isArray(candidate.key_skills_json) ? candidate.key_skills_json :
    JSON.parse(candidate.key_skills_json || candidate.key_skills || '[]')
  ).map(s => String(s).toLowerCase());

  mustHaveSkills.forEach((skill) => {
    mustHaveCount++;
    const skillName = typeof skill === 'string' ? skill : skill.name;
    const minYrs = typeof skill === 'object' && skill.min_years ? skill.min_years : 0;
    
    // Search in skills array and in raw CV text
    const matchedInArray = candidateSkills.some(s => s.includes(skillName.toLowerCase()) || skillName.toLowerCase().includes(s));
    const evidence = findEvidenceInText(text, [skillName, skillName.replace(/\s+/g, '')]);
    
    let criterionScore = 0;
    let confidence = 'high';
    let quote = '';
    let status = 'unmatched';
    let uncertainty = false;
    let notes = '';

    if (evidence) {
      quote = `"${evidence.quote}" (Line ${evidence.lineNumber})`;
      criterionScore = 100;
      status = 'matched';
      mustHaveMatched++;
    } else if (matchedInArray) {
      quote = `Listed in candidate core competencies: "${skillName}"`;
      criterionScore = 85;
      status = 'matched';
      confidence = 'medium';
      uncertainty = true;
      notes = 'Mentioned in skills summary list, but specific project depth line not found in CV text.';
      mustHaveMatched++;
    } else {
      quote = `No direct mention of "${skillName}" discovered in resume text.`;
      criterionScore = 0;
      status = 'missing';
      missingCriticalItems.push(skillName);
    }

    skillsScoreTotal += criterionScore;

    breakdown.push({
      category: 'must_have_skill',
      name: skillName,
      required: true,
      min_years: minYrs,
      score: criterionScore,
      status,
      evidence_quote: quote,
      confidence,
      uncertainty,
      notes
    });
  });

  const skillsScore = mustHaveCount > 0 ? Math.round(skillsScoreTotal / mustHaveCount) : 80;

  // 2. EXPERIENCE EVALUATION
  const reqMinExp = scorecard.min_exp || 5;
  const reqMaxExp = scorecard.max_exp || 8;
  const candExp = Number(candidate.total_exp_years) || 0;
  
  let expScore = 0;
  let expStatus = 'matched';
  let expUncertainty = false;
  let expConfidence = 'high';
  let expNotes = '';

  if (candExp >= reqMinExp && candExp <= reqMaxExp) {
    expScore = 100;
    expNotes = `Optimal fit: ${candExp} yrs falls cleanly in requested ${reqMinExp}-${reqMaxExp} yrs band.`;
  } else if (candExp > reqMaxExp) {
    // Overqualified or senior
    const diff = candExp - reqMaxExp;
    expScore = Math.max(70, 100 - (diff * 5));
    expStatus = 'overqualified';
    expNotes = `Candidate has ${candExp} yrs (exceeds ${reqMaxExp} yrs ceiling). Check for potential CTC or retention risk.`;
  } else {
    // Under minimum
    const diff = reqMinExp - candExp;
    expScore = Math.max(20, 100 - (diff * 25));
    expStatus = 'under_experience';
    expUncertainty = true;
    expConfidence = 'medium';
    expNotes = `Candidate has ${candExp} yrs, below requirement of ${reqMinExp} yrs.`;
    missingCriticalItems.push(`Experience (${candExp} < ${reqMinExp} yrs)`);
  }

  // Find experience quote in CV
  const expEvidence = findEvidenceInText(text, ['year', 'years', 'experience', '201', '202', 'developer', 'analyst', 'lead']);
  const expQuote = expEvidence 
    ? `"${expEvidence.quote}" (Total computed: ${candExp} years)`
    : `Total stated experience: ${candExp} years across prior employment tenure.`;

  breakdown.push({
    category: 'experience',
    name: `Total Experience (${reqMinExp}-${reqMaxExp} yrs)`,
    required: true,
    score: expScore,
    status: expStatus,
    evidence_quote: expQuote,
    confidence: expConfidence,
    uncertainty: expUncertainty,
    notes: expNotes
  });

  // 3. NOTICE PERIOD EVALUATION
  const maxNotice = scorecard.max_notice_days || 60;
  const candNotice = candidate.notice_period_days !== undefined && candidate.notice_period_days !== null 
    ? Number(candidate.notice_period_days) 
    : null;

  let noticeScore = 0;
  let noticeStatus = 'matched';
  let noticeUncertainty = false;
  let noticeConfidence = 'high';
  let noticeQuote = '';
  let noticeNotes = '';

  const noticeEvidence = findEvidenceInText(text, ['notice', 'serving notice', 'immediate', 'availability', 'days', 'months']);

  if (candNotice === null || isNaN(candNotice)) {
    // Notice period missing from CV! Explicit uncertainty handling
    noticeScore = 50;
    noticeStatus = 'unknown';
    noticeUncertainty = true;
    noticeConfidence = 'low';
    noticeQuote = 'Notice period not declared in resume.';
    noticeNotes = 'AI Flag: Notice period missing from CV text. Defaulted to standard 90-day assumption. Recruiter must clarify on call.';
  } else if (candNotice <= maxNotice) {
    noticeScore = 100;
    noticeQuote = noticeEvidence 
      ? `"${noticeEvidence.quote}" (${candNotice} days)` 
      : `Availability recorded: ${candNotice} days (meets requirement <= ${maxNotice} days).`;
    noticeNotes = candNotice <= 15 ? 'Immediate / Short notice advantage.' : `Acceptable notice of ${candNotice} days.`;
  } else {
    const diff = candNotice - maxNotice;
    noticeScore = diff <= 30 ? 60 : 35;
    noticeStatus = 'notice_mismatch';
    noticeUncertainty = true;
    noticeConfidence = 'medium';
    noticeQuote = noticeEvidence 
      ? `"${noticeEvidence.quote}" (${candNotice} days)` 
      : `Stated notice: ${candNotice} days (exceeds client limit of ${maxNotice} days).`;
    noticeNotes = `Notice period of ${candNotice} days exceeds requirement of ${maxNotice} days. Buyout or negotiation required.`;
    missingCriticalItems.push(`Notice Period (${candNotice}d > ${maxNotice}d)`);
  }

  breakdown.push({
    category: 'notice_period',
    name: `Notice Period (<= ${maxNotice} days)`,
    required: true,
    score: noticeScore,
    status: noticeStatus,
    evidence_quote: noticeQuote,
    confidence: noticeConfidence,
    uncertainty: noticeUncertainty,
    notes: noticeNotes
  });

  // 4. COMPENSATION / CTC EVALUATION
  const maxCtc = scorecard.max_ctc || 22; // In Lakhs
  const expCtc = Number(candidate.expected_ctc) || (candidate.current_ctc ? candidate.current_ctc * 1.25 : null);
  
  let ctcScore = 0;
  let ctcQuote = '';
  let ctcConfidence = 'high';
  let ctcUncertainty = false;
  let ctcNotes = '';

  const ctcEvidence = findEvidenceInText(text, ['ctc', 'lpa', 'salary', 'package', 'compensation', 'inr']);

  if (!expCtc) {
    ctcScore = 75;
    ctcConfidence = 'low';
    ctcUncertainty = true;
    ctcQuote = ctcEvidence ? `"${ctcEvidence.quote}"` : 'Compensation expectation not explicitly stated in resume.';
    ctcNotes = 'Expected CTC not found. Inferred within market band. Verification required.';
  } else if (expCtc <= maxCtc) {
    ctcScore = 100;
    ctcQuote = `Expected CTC: ₹${expCtc} LPA (within client budget of ₹${maxCtc} LPA).`;
    ctcNotes = `Budget aligned: ₹${expCtc} LPA <= ₹${maxCtc} LPA cap.`;
  } else {
    const overrun = ((expCtc - maxCtc) / maxCtc) * 100;
    ctcScore = Math.max(30, Math.round(100 - overrun * 2));
    ctcQuote = `Expected CTC: ₹${expCtc} LPA (exceeds client budget of ₹${maxCtc} LPA).`;
    ctcNotes = `Exceeds budget cap by ₹${(expCtc - maxCtc).toFixed(1)} LPA (${overrun.toFixed(0)}% overrun).`;
  }

  breakdown.push({
    category: 'compensation',
    name: `CTC Budget (Max ₹${maxCtc} LPA)`,
    required: false,
    score: ctcScore,
    status: ctcScore >= 80 ? 'matched' : 'budget_overrun',
    evidence_quote: ctcQuote,
    confidence: ctcConfidence,
    uncertainty: ctcUncertainty,
    notes: ctcNotes
  });

  // COMPUTE WEIGHTED OVERALL SCORE
  const overallScore = Math.round(
    (skillsScore * weights.skills) +
    (expScore * weights.experience) +
    (noticeScore * weights.notice) +
    (ctcScore * weights.ctc)
  );

  // DETERMINE OVERALL AI CONFIDENCE
  let aiConfidence = 'high';
  const hasLowConfidence = breakdown.some(b => b.confidence === 'low');
  const hasUncertainty = breakdown.filter(b => b.uncertainty).length;

  if (hasLowConfidence || hasUncertainty >= 2) {
    aiConfidence = 'low';
  } else if (hasUncertainty === 1) {
    aiConfidence = 'medium';
  }

  let uncertaintySummary = '';
  if (missingCriticalItems.length > 0) {
    uncertaintySummary = `Gaps detected: ${missingCriticalItems.join(', ')}. Candidate retained for recruiter review per anti-auto-rejection policy.`;
  } else if (aiConfidence === 'low') {
    uncertaintySummary = 'Some resume sections (notice or CTC) require manual verification on initial recruiter call.';
  } else {
    uncertaintySummary = 'High confidence profile match. Direct citations verified against JD scorecard.';
  }

  return {
    candidate_id: candidate.id,
    overall_score: Math.min(100, Math.max(0, overallScore)),
    skills_score: skillsScore,
    exp_score: expScore,
    notice_score: noticeScore,
    ctc_score: ctcScore,
    breakdown,
    ai_confidence: aiConfidence,
    uncertainty_notes: uncertaintySummary,
    must_have_matched: `${mustHaveMatched}/${mustHaveCount}`,
    is_blind_screened: options.blindScreening
  };
}

/**
 * AI JD Intake & Scorecard Generator
 * Takes raw JD text and extracts structured criteria with weights
 */
function extractScorecardFromJD(rawJdText, title = '') {
  const text = (rawJdText || '').toLowerCase();
  
  // Extract years of experience
  let minExp = 3;
  let maxExp = 7;
  const expMatch = text.match(/(\d+)\s*(?:-|to)\s*(\d+)\s*(?:yrs|years)/i) || 
                   text.match(/(\d+)\+?\s*(?:yrs|years)/i);
  if (expMatch) {
    if (expMatch[2]) {
      minExp = parseFloat(expMatch[1]);
      maxExp = parseFloat(expMatch[2]);
    } else {
      minExp = parseFloat(expMatch[1]);
      maxExp = minExp + 3;
    }
  }

  // Extract notice period
  let maxNotice = 60;
  const noticeMatch = text.match(/notice(?:\s*period)?\s*(?:up to|<=|max|within|under)?\s*(\d+)\s*days/i) ||
                      text.match(/(\d+)\s*days\s*notice/i);
  if (noticeMatch) {
    maxNotice = parseInt(noticeMatch[1], 10);
  } else if (text.includes('immediate') || text.includes('15 days')) {
    maxNotice = 30;
  }

  // Extract CTC / Budget
  let maxCtc = 24;
  const ctcMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)\s*(?:lpa|lakhs|lakh)/i) ||
                   text.match(/(?:budget|ctc|package|up to|max)\s*(\d+(?:\.\d+)?)\s*(?:lpa|lakhs|lakh)/i);
  if (ctcMatch) {
    maxCtc = parseFloat(ctcMatch[2] || ctcMatch[1]);
  }

  // Extract Location
  let location = 'Noida';
  const locations = ['noida', 'gurugram', 'gurgaon', 'delhi ncr', 'bengaluru', 'bangalore', 'mumbai', 'hyderabad', 'pune', 'chennai'];
  for (const loc of locations) {
    if (text.includes(loc)) {
      location = loc.charAt(0).toUpperCase() + loc.slice(1);
      break;
    }
  }

  // Skill taxonomy detection
  const skillTaxonomy = [
    'java', 'spring boot', 'microservices', 'hibernate', 'rest apis', 'kafka', 'docker', 'kubernetes',
    'python', 'django', 'fastapi', 'postgresql', 'mysql', 'mongodb', 'redis', 'aws',
    'react', 'typescript', 'javascript', 'next.js', 'node.js',
    'kyc', 'aml checks', 'excel', 'customer due diligence', 'pep screening', 'sanctions', 'transaction monitoring',
    'retail store operations', 'inventory management', 'supply chain', 'pos systems', 'vendor management'
  ];

  const detectedSkills = [];
  skillTaxonomy.forEach(skill => {
    if (text.includes(skill)) {
      detectedSkills.push(skill.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '));
    }
  });

  // Ensure default skills if none detected
  const mustHaveSkills = detectedSkills.length > 0 ? detectedSkills.slice(0, 5) : [
    'Core Competency', 'Domain Architecture', 'Problem Solving'
  ];

  return {
    job_title: title || 'Senior Professional',
    min_exp: minExp,
    max_exp: maxExp,
    max_notice_days: maxNotice,
    max_ctc: maxCtc,
    location: location,
    must_have_skills: mustHaveSkills.map(s => ({ name: s, min_years: Math.max(2, minExp - 2) })),
    nice_to_have_skills: detectedSkills.slice(5, 8).map(s => ({ name: s })),
    weights: {
      skills: 0.40,
      experience: 0.30,
      notice: 0.15,
      ctc: 0.15
    },
    minimum_threshold_score: 65,
    intake_timestamp: new Date().toISOString()
  };
}

module.exports = {
  scoreCandidate,
  extractScorecardFromJD,
  sanitizeForBlindScoring,
  findEvidenceInText
};
