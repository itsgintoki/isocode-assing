const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const { calculateFileHash } = require('./duplicate_detector');

// Standard skills taxonomy across IT, Banking, and Retail
const SKILLS_TAXONOMY = [
  'Java', 'Spring Boot', 'Microservices', 'Hibernate', 'REST APIs', 'Kafka', 'Docker', 'Kubernetes',
  'Python', 'Django', 'FastAPI', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'AWS', 'GCP', 'Azure',
  'React', 'TypeScript', 'JavaScript', 'Next.js', 'Node.js', 'HTML5', 'CSS3', 'Git',
  'KYC', 'AML checks', 'Customer Due Diligence', 'PEP Screening', 'Sanctions', 'Transaction Monitoring',
  'Excel', 'PowerBI', 'Tableau', 'Risk Assessment', 'Finacle', 'Banking Operations',
  'Retail Store Operations', 'Inventory Management', 'Supply Chain', 'POS Systems', 'Visual Merchandising',
  'Vendor Management', 'Loss Prevention', 'P&L Management', 'Team Leadership'
];

async function extractRawTextFromFile(buffer, mimeType, filename = '') {
  const ext = filename.split('.').pop().toLowerCase();

  try {
    if (mimeType === 'application/pdf' || ext === 'pdf') {
      const data = await pdfParse(buffer);
      return data.text || '';
    } else if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
      ext === 'docx'
    ) {
      const result = await mammoth.extractRawText({ buffer });
      return result.value || '';
    } else {
      // Plain text or markdown
      return buffer.toString('utf-8');
    }
  } catch (error) {
    console.warn(`Extraction error for ${filename}:`, error.message);
    // Fallback to string decoding
    return buffer.toString('utf-8');
  }
}

function parseResumeDetails(rawText, filename = '') {
  const text = (rawText || '').trim();
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const warnings = [];

  // 1. Email extraction
  const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i;
  const emailMatch = text.match(emailRegex);
  const email = emailMatch ? emailMatch[1].toLowerCase() : '';
  if (!email) warnings.push('No email address found in the CV.');

  // 2. Phone extraction. Prefer an Indian mobile number; only then consider an
  // international number with an explicit country code.
  const phoneRegex = /(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/;
  const internationalPhoneRegex = /\+\d{1,3}[\s-]?(?:\d[\s-]?){7,14}\b/;
  const phoneMatch = text.match(phoneRegex) || text.match(internationalPhoneRegex);
  const phone = phoneMatch ? phoneMatch[0].replace(/\s+/g, '') : '';
  if (!phone) warnings.push('No phone number found in the CV.');

  // 3. Name extraction
  let name = '';
  // Look at first 3 non-empty lines, skipping headers or labels
  for (let i = 0; i < Math.min(4, lines.length); i++) {
    const candidateLine = lines[i];
    if (
      !candidateLine.toLowerCase().includes('curriculum') &&
      !candidateLine.toLowerCase().includes('resume') &&
      !candidateLine.toLowerCase().includes('cv') &&
      !candidateLine.includes('@') &&
      !/\d/.test(candidateLine) &&
      candidateLine.length >= 3 &&
      candidateLine.length <= 40
    ) {
      name = candidateLine;
      break;
    }
  }
  if (!name && filename) {
    name = filename.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
  }
  if (!name) name = 'Candidate Profile';

  // 4. Current Role extraction
  let currentRole = 'Professional';
  const roleKeywords = [
    'Senior Java Developer', 'Java Developer', 'Backend Architect', 'Software Architect',
    'Senior KYC Analyst', 'KYC Analyst', 'AML Analyst', 'Compliance Analyst',
    'Full Stack Engineer', 'Backend Engineer', 'Frontend Engineer',
    'Retail Store Operations Lead', 'Retail Store Manager', 'Store Operations Lead',
    'Technical Lead', 'Software Engineer', 'Data Analyst', 'DevOps Engineer'
  ];
  for (const role of roleKeywords) {
    if (new RegExp(role, 'i').test(text)) {
      currentRole = role;
      break;
    }
  }

  // 5. Total experience. Prefer an explicit statement; otherwise estimate from
  // employment year ranges and flag the estimate for recruiter verification.
  let totalExpYears = 0;
  const expMatch = text.match(/(\d+(?:\.\d+)?)\s*\+?\s*(?:yrs?|years?)(?:\s*(?:of)?\s*(?:relevant\s*|total\s*)?experience)?/i);
  if (expMatch) {
    totalExpYears = parseFloat(expMatch[1]);
  } else {
    const years = text.match(/\b(19[89][0-9]|20[0-2][0-9])\b/g);
    if (years && years.length >= 2) {
      const numYears = years.map(Number).sort((a, b) => a - b);
      const minYear = numYears[0];
      const maxYear = Math.min(new Date().getFullYear(), numYears[numYears.length - 1]);
      if (maxYear - minYear > 0 && maxYear - minYear < 35) {
        totalExpYears = maxYear - minYear;
        warnings.push('Total experience was estimated from year ranges. Confirm it on the screening call.');
      }
    }
  }
  if (!totalExpYears) warnings.push('Total experience could not be determined from the CV.');

  // 6. Notice period. Do not invent a default: a missing value is meaningful
  // information and must be confirmed by a recruiter.
  let noticePeriodDays = null;
  const noticeLine = (text.match(/[^\n]*\bnotice\b[^\n]*/i) || [''])[0]
    || (text.match(/[^\n]*\b(?:availability|available|immediate|joining|joiner)\b[^\n]*/i) || [''])[0];
  const dayMatch = noticeLine.match(/(\d+)\s*(?:calendar\s*)?days?/i)
    || text.match(/(\d+)\s*days?\s*(?:remaining|notice)/i);
  const weekMatch = noticeLine.match(/(\d+)\s*weeks?/i);
  const monthMatch = noticeLine.match(/(\d+(?:\.\d+)?)\s*months?/i);
  if (dayMatch) {
    noticePeriodDays = parseInt(dayMatch[1], 10);
  } else if (weekMatch) {
    noticePeriodDays = parseInt(weekMatch[1], 10) * 7;
  } else if (monthMatch) {
    noticePeriodDays = Math.round(parseFloat(monthMatch[1]) * 30);
  } else if (/\b(?:immediate(?:ly)?|ready to join immediately|available immediately)\b/i.test(noticeLine)) {
    noticePeriodDays = 0;
  }
  if (noticePeriodDays === null) {
    warnings.push('Notice period was not found. The recruiter must confirm availability.');
  }

  // 7. CTC extraction
  let currentCtc = null;
  let expectedCtc = null;
  const currentCtcMatch = text.match(/(?:current\s*ctc|cctc|present\s*ctc)\s*[:=-]?\s*₹?\s*(\d+(?:\.\d+)?)\s*(?:lpa|lakhs?)/i);
  if (currentCtcMatch) {
    currentCtc = parseFloat(currentCtcMatch[1]);
  }
  const expCtcMatch = text.match(/(?:expected\s*ctc|ectc)\s*[:=-]?\s*₹?\s*(\d+(?:\.\d+)?)\s*(?:lpa|lakhs?)/i);
  if (expCtcMatch) {
    expectedCtc = parseFloat(expCtcMatch[1]);
  }
  if (!expectedCtc) {
    warnings.push('Expected CTC was not found in the CV.');
  }

  // 8. Location
  let location = null;
  const cities = ['Noida', 'Gurugram', 'Gurgaon', 'Delhi NCR', 'Bengaluru', 'Bangalore', 'Mumbai', 'Hyderabad', 'Pune', 'Chennai'];
  for (const city of cities) {
    if (new RegExp(`\\b${city}\\b`, 'i').test(text)) {
      location = city === 'Gurgaon' ? 'Gurugram' : (city === 'Bangalore' ? 'Bengaluru' : city);
      break;
    }
  }

  // 9. Key Skills extraction
  const foundSkills = [];
  SKILLS_TAXONOMY.forEach(skill => {
    if (new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)) {
      foundSkills.push(skill);
    }
  });

  return {
    name,
    email,
    phone,
    current_role: currentRole,
    total_exp_years: totalExpYears,
    key_skills: foundSkills.length > 0 ? foundSkills : ['Problem Solving', 'Domain Expertise'],
    current_ctc: currentCtc,
    expected_ctc: expectedCtc,
    notice_period_days: noticePeriodDays,
    location,
    raw_cv_text: text,
    parse_warnings: warnings
  };
}

module.exports = {
  extractRawTextFromFile,
  parseResumeDetails,
  SKILLS_TAXONOMY
};
