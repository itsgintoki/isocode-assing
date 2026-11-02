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

  // 1. Email extraction
  const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/i;
  const emailMatch = text.match(emailRegex);
  const email = emailMatch ? emailMatch[1].toLowerCase() : `candidate.${Date.now()}@inbox.mock`;

  // 2. Phone extraction
  const phoneRegex = /(?:\+?91[\s-]?)?[6789]\d{9}|\+?[1-9]\d{1,14}/;
  const phoneMatch = text.match(phoneRegex);
  const phone = phoneMatch ? phoneMatch[0].replace(/\s+/g, '') : '+91 98000 00000';

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
    'Senior Java Developer', 'Java Developer', 'KYC Analyst', 'Senior KYC Analyst',
    'Full Stack Engineer', 'Backend Engineer', 'Retail Store Manager', 'Store Ops Lead',
    'Software Engineer', 'Technical Lead', 'Data Analyst', 'DevOps Engineer'
  ];
  for (const role of roleKeywords) {
    if (new RegExp(role, 'i').test(text)) {
      currentRole = role;
      break;
    }
  }

  // 5. Total Experience extraction (in years)
  let totalExpYears = 3.0;
  const expMatch = text.match(/(\d+(?:\.\d+)?)\+?\s*(?:yrs|years|year)(?:\s*(?:of)?\s*experience)?/i);
  if (expMatch) {
    totalExpYears = parseFloat(expMatch[1]);
  } else {
    // Try scanning year ranges: 2018 - 2024
    const years = text.match(/\b(20[0-2][0-9]|199[0-9])\b/g);
    if (years && years.length >= 2) {
      const numYears = years.map(Number).sort((a, b) => a - b);
      const minYear = numYears[0];
      const maxYear = Math.min(new Date().getFullYear(), numYears[numYears.length - 1]);
      if (maxYear - minYear > 0 && maxYear - minYear < 35) {
        totalExpYears = maxYear - minYear;
      }
    }
  }

  // 6. Notice Period extraction (in days)
  let noticePeriodDays = 60; // standard default
  if (/immediate|0\s*days|ready to join immediately/i.test(text)) {
    noticePeriodDays = 0;
  } else if (/15\s*days/i.test(text)) {
    noticePeriodDays = 15;
  } else if (/30\s*days|1\s*month/i.test(text)) {
    noticePeriodDays = 30;
  } else if (/45\s*days/i.test(text)) {
    noticePeriodDays = 45;
  } else if (/60\s*days|2\s*months/i.test(text)) {
    noticePeriodDays = 60;
  } else if (/90\s*days|3\s*months/i.test(text)) {
    noticePeriodDays = 90;
  } else {
    const rawNoticeMatch = text.match(/notice(?:\s*period)?\s*[:=-]?\s*(\d+)\s*days/i);
    if (rawNoticeMatch) {
      noticePeriodDays = parseInt(rawNoticeMatch[1], 10);
    }
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
  } else if (currentCtc) {
    expectedCtc = +(currentCtc * 1.25).toFixed(1);
  }

  // 8. Location
  let location = 'Noida';
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
    raw_cv_text: text
  };
}

module.exports = {
  extractRawTextFromFile,
  parseResumeDetails,
  SKILLS_TAXONOMY
};
