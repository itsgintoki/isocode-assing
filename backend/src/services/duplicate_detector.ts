import crypto from 'node:crypto';
import db from '../db/database';

function calculateFileHash(bufferOrString: string | Buffer): string {
  const hash = crypto.createHash('sha256');
  hash.update(bufferOrString);
  return hash.digest('hex');
}

interface DuplicateLookup {
  fileHash?: string | null;
  email?: string;
  phone?: string;
  candidateId?: string | null;
}

function checkDuplicate({
  fileHash = null,
  email = '',
  phone = '',
  candidateId = null
}: DuplicateLookup = {}) {
  // Check exact file hash duplicate
  if (fileHash) {
    const existingByHash = db.prepare(`
      SELECT id, name, email, phone, original_filename, created_at, is_deleted
      FROM candidates
      WHERE file_hash = ? AND is_deleted = 0 AND (id != ? OR ? IS NULL)
    `).get(fileHash, candidateId, candidateId);

    if (existingByHash) {
      return {
        isDuplicate: true,
        type: 'exact_file_duplicate',
        message: `Identical CV file already uploaded for ${existingByHash.name} (${existingByHash.id})`,
        candidate: existingByHash
      };
    }
  }

  // Check email duplicate
  if (email && email.includes('@')) {
    const normalizedEmail = email.trim().toLowerCase();
    const existingByEmail = db.prepare(`
      SELECT id, name, email, phone, original_filename, created_at, is_deleted
      FROM candidates
      WHERE LOWER(email) = ? AND is_deleted = 0 AND (id != ? OR ? IS NULL)
    `).get(normalizedEmail, candidateId, candidateId);

    if (existingByEmail) {
      return {
        isDuplicate: true,
        type: 'email_profile_duplicate',
        message: `Candidate profile already exists with email ${normalizedEmail} (${existingByEmail.name}, ${existingByEmail.id})`,
        candidate: existingByEmail
      };
    }
  }

  // Check phone duplicate
  if (phone) {
    const cleanPhone = phone.replace(/[^0-9]/g, '').slice(-10); // last 10 digits
    if (cleanPhone.length === 10) {
      const candidates = db.prepare(`
        SELECT id, name, email, phone, original_filename, created_at, is_deleted
        FROM candidates
        WHERE is_deleted = 0 AND (id != ? OR ? IS NULL)
      `).all(candidateId, candidateId);

      const existingByPhone = candidates.find(c => {
        const cPhone = (c.phone || '').replace(/[^0-9]/g, '').slice(-10);
        return cPhone === cleanPhone;
      });

      if (existingByPhone) {
        return {
          isDuplicate: true,
          type: 'phone_profile_duplicate',
          message: `Phone number matches candidate ${existingByPhone.name} (${existingByPhone.id})`,
          candidate: existingByPhone
        };
      }
    }
  }

  return {
    isDuplicate: false,
    type: 'unique',
    message: 'New unique candidate profile'
  };
}

export {
  calculateFileHash,
  checkDuplicate
};
