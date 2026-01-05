// Estate Standard - Security Utilities
// Encryption, password validation, token generation

import crypto from 'crypto';
import bcrypt from 'bcryptjs';

// ============================================================================
// ENCRYPTION (AES-256-GCM for PII)
// ============================================================================

const algorithm = 'aes-256-gcm';

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error('ENCRYPTION_KEY not set in environment');
  }
  return Buffer.from(key, 'base64');
}

export function encrypt(text: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decrypt(encryptedText: string): string {
  const key = getEncryptionKey();
  const [ivHex, authTagHex, encrypted] = encryptedText.split(':');

  if (!ivHex || !authTagHex || !encrypted) {
    throw new Error('Invalid encrypted text format');
  }

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv(algorithm, key, iv);

  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

// ============================================================================
// PASSWORD VALIDATION & HASHING
// ============================================================================

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
  strength: 'weak' | 'medium' | 'strong';
}

export function validatePassword(password: string): PasswordValidationResult {
  const errors: string[] = [];

  // Length check
  if (password.length < 12) {
    errors.push('Password must be at least 12 characters long');
  }

  if (password.length > 128) {
    errors.push('Password must be less than 128 characters');
  }

  // Complexity checks
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (!/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (!/[@$!%*?&]/.test(password)) {
    errors.push('Password must contain at least one special character (@$!%*?&)');
  }

  // Common password check
  const commonPasswords = [
    'password123', 'Password123!', 'Welcome123!',
    'Admin123!', 'User123!', 'Test123!'
  ];

  if (commonPasswords.some(common => password.toLowerCase().includes(common.toLowerCase()))) {
    errors.push('Password is too common');
  }

  // Calculate strength
  let strength: 'weak' | 'medium' | 'strong' = 'weak';
  if (errors.length === 0) {
    if (password.length >= 16 && /[^A-Za-z0-9@$!%*?&]/.test(password)) {
      strength = 'strong';
    } else if (password.length >= 12) {
      strength = 'medium';
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    strength
  };
}

export async function hashPassword(password: string): Promise<string> {
  const validation = validatePassword(password);
  if (!validation.valid) {
    throw new Error(`Invalid password: ${validation.errors.join(', ')}`);
  }

  return bcrypt.hash(password, 12); // Increased from 10 to 12 rounds
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function isPasswordInHistory(
  password: string,
  passwordHistory: string[]
): Promise<boolean> {
  for (const oldHash of passwordHistory) {
    if (await bcrypt.compare(password, oldHash)) {
      return true;
    }
  }
  return false;
}

// ============================================================================
// SECURE TOKEN GENERATION
// ============================================================================

export function generateSecureToken(bytes: number = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export async function hashToken(token: string): Promise<string> {
  return bcrypt.hash(token, 10);
}

export async function verifyToken(token: string, hash: string): Promise<boolean> {
  return bcrypt.compare(token, hash);
}

// ============================================================================
// EMAIL VALIDATION
// ============================================================================

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

// ============================================================================
// PHONE VALIDATION
// ============================================================================

export function validatePhone(phone: string): boolean {
  // E.164 format validation
  const phoneRegex = /^\+[1-9]\d{1,14}$/;
  return phoneRegex.test(phone);
}

export function normalizePhone(phone: string): string {
  // Remove all non-digit characters except leading +
  return phone.replace(/[^\d+]/g, '');
}

// ============================================================================
// SANITIZATION
// ============================================================================

export function sanitizeString(input: string): string {
  return input
    .trim()
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
    .slice(0, 10000); // Prevent extremely long strings
}

export function sanitizeHtml(input: string): string {
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

// ============================================================================
// TIMING-SAFE COMPARISON
// ============================================================================

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still compare to prevent timing attacks
    crypto.timingSafeEqual(Buffer.from(a), Buffer.from(a));
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// ============================================================================
// RATE LIMIT HELPERS
// ============================================================================

export function generateRateLimitKey(prefix: string, identifier: string): string {
  return `ratelimit:${prefix}:${identifier}`;
}

// ============================================================================
// IP ADDRESS VALIDATION
// ============================================================================

export function getClientIp(req: any): string {
  return (
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.headers['x-real-ip'] ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

export function isPrivateIp(ip: string): boolean {
  const privateRanges = [
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\./,
    /^::1$/,
    /^fc00:/
  ];

  return privateRanges.some(range => range.test(ip));
}

// ============================================================================
// FILE VALIDATION
// ============================================================================

export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

export function validateFileType(mimetype: string, allowedTypes: string[]): FileValidationResult {
  if (!allowedTypes.includes(mimetype)) {
    return {
      valid: false,
      error: `Invalid file type. Allowed types: ${allowedTypes.join(', ')}`
    };
  }

  return { valid: true };
}

export function validateFileSize(size: number, maxSize: number): FileValidationResult {
  if (size > maxSize) {
    return {
      valid: false,
      error: `File too large. Maximum size: ${maxSize / (1024 * 1024)}MB`
    };
  }

  return { valid: true };
}

export function generateSecureFilename(originalName: string): string {
  const ext = originalName.split('.').pop();
  const uuid = crypto.randomUUID();
  return `${uuid}.${ext}`;
}

// ============================================================================
// ENVIRONMENT VALIDATION
// ============================================================================

export function validateEnvironment(): void {
  const requiredSecrets = [
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'DATABASE_URL',
    'ENCRYPTION_KEY'
  ];

  for (const secret of requiredSecrets) {
    if (!process.env[secret]) {
      throw new Error(`Missing required environment variable: ${secret}`);
    }

    // Check minimum length
    if (process.env[secret]!.length < 32) {
      throw new Error(`Environment variable ${secret} must be at least 32 characters`);
    }

    // Warn if using placeholder values
    const dangerousValues = ['change-this', 'example', 'test', 'your-secret'];
    if (dangerousValues.some(val => process.env[secret]!.toLowerCase().includes(val))) {
      throw new Error(
        `Environment variable ${secret} appears to use a placeholder value. ` +
        `Generate a secure value using: openssl rand -base64 48`
      );
    }
  }

  // Validate NODE_ENV
  const validEnvironments = ['development', 'production', 'test'];
  if (!validEnvironments.includes(process.env.NODE_ENV || '')) {
    console.warn(`Warning: NODE_ENV should be one of: ${validEnvironments.join(', ')}`);
  }
}
