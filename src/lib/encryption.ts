import crypto from 'crypto';

/**
 * Encryption utilities for secure token storage
 * Uses AES-256-GCM for authenticated encryption
 */

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits
const SALT_LENGTH = 64;
const TAG_LENGTH = 16; // Auth tag length
const TAG_POSITION = SALT_LENGTH + IV_LENGTH;
const ENCRYPTED_POSITION = TAG_POSITION + TAG_LENGTH;

/**
 * Get encryption key from environment
 * In production, this should come from a secure key management system
 */
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY || 'your-super-secret-encryption-key-change-in-production';
  // Use PBKDF2 to derive a proper key from the environment key
  return crypto.pbkdf2Sync(key, 'salt', 100000, KEY_LENGTH, 'sha256');
}

/**
 * Encrypt sensitive data (tokens, secrets, etc.)
 */
export function encrypt(plaintext: string): string {
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const salt = crypto.randomBytes(SALT_LENGTH);
    const key = getEncryptionKey();

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // Combine salt + iv + authTag + encrypted
    const combined = Buffer.concat([
      salt,
      iv,
      authTag,
      Buffer.from(encrypted, 'hex')
    ]);

    return combined.toString('base64');
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypt sensitive data
 */
export function decrypt(ciphertext: string): string {
  try {
    const combined = Buffer.from(ciphertext, 'base64');

    const salt = combined.slice(0, SALT_LENGTH);
    const iv = combined.slice(SALT_LENGTH, TAG_POSITION);
    const authTag = combined.slice(TAG_POSITION, ENCRYPTED_POSITION);
    const encrypted = combined.slice(ENCRYPTED_POSITION);

    const key = getEncryptionKey();

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt data');
  }
}

/**
 * Hash sensitive identifiers (like tokens) for comparison
 * This allows us to check if a token has changed without storing the actual token
 */
export function hashToken(token: string): string {
  return crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');
}

/**
 * Generate a secure random token for API keys or session tokens
 */
export function generateSecureToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Mask sensitive data for logging/display
 * Shows first 4 and last 4 characters with asterisks in between
 */
export function maskToken(token: string): string {
  if (!token || token.length < 8) return '****';
  return `${token.slice(0, 4)}${'*'.repeat(Math.min(token.length - 8, 20))}${token.slice(-4)}`;
}