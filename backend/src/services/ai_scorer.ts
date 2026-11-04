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
      if (minYrs > 0) {
        notes = `${minYrs}+ years requested. The CV mentions the skill, but the years were not independently verified.`;
      }
    } else if (matchedInArray) {
      quote = `Listed in candidate core competencies: "${skillName}"`;
      criterionScore = 85;
      status = 'matched';
      confidence = 'medium';
      uncertainty = true;
      notes = 'Mentioned in the skills summary, but no project-level evidence line was found in the CV.';
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
    noticeQuote = 'Notice period not declared in the resume.';
    noticeNotes = 'The notice period is missing, so this criterion is scored neutrally. The recruiter must confirm availability; the candidate is not rejected automatically.';
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
    ctcScore = 50;
    ctcConfidence = 'low';
    ctcUncertainty = true;
    ctcQuote = ctcEvidence ? `"${ctcEvidence.quote}"` : 'Compensation expectation not stated in the resume.';
    ctcNotes = 'Expected CTC was not found, so this criterion is scored neutrally. The recruiter must confirm the expectation before submission.';
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
    status: ctcUncertainty ? 'unknown' : (ctcScore >= 80 ? 'matched' : 'budget_overrun'),
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
    scoring_engine: 'Deterministic evidence matcher',
    is_blind_screened: options.blindScreening
  };
}

/**
 * AI JD Intake & Scorecard Generator
 * Takes raw JD text and extracts structured criteria with weights
 */
function extractScorecardFromJD(rawJdText, title = '') {
  const text = (rawJdText || '').toLowerCase();

  // Extract years of experience. Supports "5 to 8 years", "5-8 yrs" and "5+ years".
  let minExp = 3;
  let maxExp = 7;
  const rangeMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)/i);
  const minimumMatch = text.match(/(\d+(?:\.\d+)?)\s*\+\s*(?:years?|yrs?)/i)
    || text.match(/(?:minimum|at least|min\.?)\s*(?:of\s*)?(\d+(?:\.\d+)?)\s*(?:years?|yrs?)/i);
  if (rangeMatch) {
    minExp = parseFloat(rangeMatch[1]);
    maxExp = parseFloat(rangeMatch[2]);
  } else if (minimumMatch) {
    minExp = parseFloat(minimumMatch[1]);
    maxExp = minExp + 3;
  }

  // Extract notice period. The colon and currency/qualifier words in real JDs
  // are why this is deliberately tolerant: "Notice Period: Up to 60 days".
  let maxNotice = 60;
  const noticeMatch = text.match(/notice(?:\s*period)?\s*[:\-–]?\s*(?:of\s*)?(?:up to|within|max(?:imum)?|under|<=|less than)?\s*(\d+)\s*(?:calendar\s*)?days?/i)
    || text.match(/(\d+)\s*(?:calendar\s*)?days?\s*(?:of\s*)?notice/i);
  if (noticeMatch) {
    maxNotice = parseInt(noticeMatch[1], 10);
  } else if (/\bimmediate\s+(?:joiner|joiners|joining|start)\b/i.test(text)) {
    maxNotice = 15;
  }

  // Extract CTC / Budget. Handles "₹24.0 LPA", "18-24 LPA", "Budget: 24 LPA".
  let maxCtc = 24;
  const ctcRangeMatch = text.match(/(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*(?:lpa|lakhs?|lakh)/i);
  const ctcSingleMatch = text.match(/(?:budget|max(?:imum)?\s*ctc|ctc|package|compensation|salary)[^0-9₹]{0,30}(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(?:lpa|lakhs?|lakh)/i);
  if (ctcRangeMatch) {
    maxCtc = parseFloat(ctcRangeMatch[2]);
  } else if (ctcSingleMatch) {
    maxCtc = parseFloat(ctcSingleMatch[1]);
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

async function callLLM(prompt, systemPrompt = '') {
  const geminiKey = process.env.GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const preferredModel = (process.env.AI_MODEL || '').trim();

  if (geminiKey) {
    const geminiModel = process.env.GEMINI_MODEL
      || (process.env.AI_PROVIDER === 'gemini' ? preferredModel : '')
      || 'gemini-2.5-flash';
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(20000),
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${systemPrompt}\n\n${prompt}` }] }],
          generationConfig: { responseMimeType: 'application/json' }
        })
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return JSON.parse(text);
      } else {
        // Fallback to gemini-2.0-flash if specified model is not provisioned on given key
        const fallbackUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`;
        const fallbackRes = await fetch(fallbackUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(20000),
          body: JSON.stringify({
            contents: [{ parts: [{ text: `${systemPrompt}\n\n${prompt}` }] }],
            generationConfig: { responseMimeType: 'application/json' }
          })
        });
        if (fallbackRes.ok) {
          const fallbackData = await fallbackRes.json();
          const fallbackText = fallbackData.candidates?.[0]?.content?.parts?.[0]?.text;
          if (fallbackText) return JSON.parse(fallbackText);
        }
      }
    } catch (e) {
      console.warn('Gemini API call notice, falling back to local NLP engine:', e.message);
    }
  }

  if (openaiKey) {
    const openaiModel = process.env.OPENAI_MODEL
      || (process.env.AI_PROVIDER === 'openai' ? preferredModel : '')
      || 'gpt-4o-mini';
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiKey}`
        },
        signal: AbortSignal.timeout(20000),
        body: JSON.stringify({
          model: openaiModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
          ],
          response_format: { type: 'json_object' }
        })
      });
      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) return JSON.parse(content);
      }
    } catch (e) {
      console.warn('OpenAI API call notice, falling back to local NLP engine:', e.message);
    }
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    const claudeModel = process.env.ANTHROPIC_MODEL
      || (process.env.AI_PROVIDER === 'anthropic' ? preferredModel : '')
      || 'claude-3-7-sonnet';
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01'
        },
        signal: AbortSignal.timeout(20000),
        body: JSON.stringify({
          model: claudeModel,
          max_tokens: 1500,
          system: systemPrompt,
          messages: [{ role: 'user', content: prompt }]
        })
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.content?.[0]?.text;
        if (text) {
          const match = text.match(/\{[\s\S]*\}/);
          if (match) return JSON.parse(match[0]);
        }
      }
    } catch (e) {
      console.warn('Anthropic API call notice, falling back to local NLP engine:', e.message);
    }
  }

  return null;
}

async function extractScorecardWithAI(rawJdText, title = '') {
  const prompt = `You are an AI recruitment expert for Company A staffing. Extract structured scorecard criteria from this Job Description:
JD TEXT:
${rawJdText}

Output strict JSON with fields:
- job_title: string
- min_exp: number
- max_exp: number
- max_notice_days: number
- max_ctc: number (in LPA)
- location: string
- must_have_skills: array of { name: string, min_years: number }
- nice_to_have_skills: array of { name: string }
- weights: { skills: 0.4, experience: 0.3, notice: 0.15, ctc: 0.15 }
- minimum_threshold_score: 65`;

  const llmResult = await callLLM(prompt, 'Extract recruitment scorecard criteria in valid JSON format.');
  if (llmResult && llmResult.must_have_skills && Array.isArray(llmResult.must_have_skills)) {
    const skills = llmResult.must_have_skills
      .map((skill) => ({
        name: String(typeof skill === 'string' ? skill : skill?.name || '').trim().slice(0, 80),
        min_years: Math.max(0, Number(skill?.min_years) || 0)
      }))
      .filter((skill) => skill.name)
      .slice(0, 20);

    if (skills.length > 0) {
      const provider = process.env.GEMINI_API_KEY ? 'Gemini' : (process.env.OPENAI_API_KEY ? 'OpenAI' : 'Anthropic');
      const modelName = process.env.GEMINI_MODEL || process.env.OPENAI_MODEL || process.env.ANTHROPIC_MODEL || process.env.AI_MODEL || 'configured model';
      return {
        ...llmResult,
        job_title: String(llmResult.job_title || title || 'Senior Professional').slice(0, 120),
        min_exp: Math.max(0, Number(llmResult.min_exp) || 0),
        max_exp: Math.max(0, Number(llmResult.max_exp) || 0),
        max_notice_days: Math.max(0, Number(llmResult.max_notice_days) || 60),
        max_ctc: Math.max(1, Number(llmResult.max_ctc) || 1),
        location: String(llmResult.location || 'Noida').slice(0, 80),
        must_have_skills: skills,
        weights: {
          skills: 0.4,
          experience: 0.3,
          notice: 0.15,
          ctc: 0.15
        },
        minimum_threshold_score: 65,
        intake_timestamp: new Date().toISOString(),
        ai_engine: `Live LLM extraction (${provider}, ${modelName})`
      };
    }
  }

  const localScorecard = extractScorecardFromJD(rawJdText, title);
  return {
    ...localScorecard,
    ai_engine: 'Deterministic JD extractor (no LLM key configured)'
  };
}

export {
  scoreCandidate,
  extractScorecardFromJD,
  extractScorecardWithAI,
  callLLM,
  sanitizeForBlindScoring,
  findEvidenceInText
};
