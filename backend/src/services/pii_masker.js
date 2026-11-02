/**
 * PII Masking Service for Client Portal and Blind Screening
 * Protects candidate personal identifiable information under DPDP Act 2023
 * and prevents agency disintermediation.
 */

function maskEmail(email) {
  if (!email || !email.includes('@')) return 'c***e@masked.domain';
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

function maskPhone(phone) {
  if (!phone) return '+91 98*** *****';
  const clean = phone.replace(/[^0-9]/g, '');
  if (clean.length < 10) return '+91 98*** *****';
  const prefix = clean.slice(0, 2);
  const suffix = clean.slice(-2);
  return `+91 ${prefix}*** ***${suffix}`;
}

function escapeRegex(string) {
  if (!string) return '';
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function maskCandidateForClient(candidate) {
  if (!candidate) return null;

  // Format professional masked name for client hiring manager
  const nameParts = (candidate.name || 'Candidate').trim().split(' ');
  const formattedName = nameParts.length > 1 
    ? `${nameParts[0]} ${nameParts[nameParts.length - 1][0]}.` 
    : nameParts[0];

  let sanitizedText = candidate.raw_cv_text || '';
  if (candidate.email) {
    sanitizedText = sanitizedText.replace(new RegExp(escapeRegex(candidate.email), 'gi'), '[CONTACT REDACTED]');
  }
  if (candidate.phone) {
    sanitizedText = sanitizedText.replace(new RegExp(escapeRegex(candidate.phone), 'gi'), '[CONTACT REDACTED]');
  }

  return {
    ...candidate,
    name: `${formattedName} (${candidate.id})`,
    full_name_masked: true,
    email: maskEmail(candidate.email),
    phone: maskPhone(candidate.phone),
    contact_masked: true,
    location: candidate.location || 'Noida, India',
    raw_cv_text: sanitizedText
  };
}

module.exports = {
  maskEmail,
  maskPhone,
  maskCandidateForClient
};
