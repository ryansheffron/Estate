// Estate Standard - PII Encryption Middleware
// Automatic encryption/decryption of sensitive fields using Prisma middleware

import { Prisma } from '@prisma/client';
import { encrypt, decrypt } from '../utils/security';
import { logger } from '../utils/logger';

// Fields that should be encrypted at rest
const ENCRYPTED_FIELDS: Record<string, string[]> = {
  User: ['phone'],
  Home: ['streetAddress', 'unit'],
  Homeowner: [],
  Vendor: ['businessPhone']
};

export function setupPIIEncryption(prisma: any) {
  // Encryption middleware - runs before write operations
  prisma.$use(async (params: Prisma.MiddlewareParams, next: any) => {
    const model = params.model;
    const fieldsToEncrypt = model ? ENCRYPTED_FIELDS[model] : [];

    if (!fieldsToEncrypt || fieldsToEncrypt.length === 0) {
      return next(params);
    }

    // Encrypt before create/update
    if (params.action === 'create' || params.action === 'update') {
      if (params.args.data) {
        for (const field of fieldsToEncrypt) {
          if (params.args.data[field] && typeof params.args.data[field] === 'string') {
            try {
              // Only encrypt if not already encrypted (check format)
              const value = params.args.data[field];
              if (!isEncrypted(value)) {
                params.args.data[field] = encrypt(value);
              }
            } catch (error) {
              logger.error(`Failed to encrypt field ${field} in ${model}:`, error);
              // Don't fail the request - log and continue
            }
          }
        }
      }
    }

    // Encrypt before updateMany
    if (params.action === 'updateMany') {
      if (params.args.data) {
        for (const field of fieldsToEncrypt) {
          if (params.args.data[field]) {
            try {
              const value = params.args.data[field];
              if (!isEncrypted(value)) {
                params.args.data[field] = encrypt(value);
              }
            } catch (error) {
              logger.error(`Failed to encrypt field ${field} in ${model}:`, error);
            }
          }
        }
      }
    }

    const result = await next(params);

    // Decrypt after read operations
    if (result) {
      decryptResult(result, model, fieldsToEncrypt);
    }

    return result;
  });

  logger.info('✅ PII encryption middleware enabled');
}

// Helper to decrypt results
function decryptResult(result: any, model: string | undefined, fieldsToEncrypt: string[]) {
  if (!model || !fieldsToEncrypt || fieldsToEncrypt.length === 0) {
    return;
  }

  if (Array.isArray(result)) {
    // Handle arrays (findMany, etc.)
    for (const item of result) {
      decryptFields(item, fieldsToEncrypt);
    }
  } else if (result && typeof result === 'object') {
    // Handle single object (findUnique, etc.)
    decryptFields(result, fieldsToEncrypt);
  }
}

// Helper to decrypt individual fields
function decryptFields(obj: any, fields: string[]) {
  for (const field of fields) {
    if (obj[field] && typeof obj[field] === 'string' && isEncrypted(obj[field])) {
      try {
        obj[field] = decrypt(obj[field]);
      } catch (error) {
        logger.error(`Failed to decrypt field ${field}:`, error);
        // Leave encrypted value if decryption fails
      }
    }
  }
}

// Check if value is already encrypted (has our format: iv:authTag:encrypted)
function isEncrypted(value: string): boolean {
  return value.split(':').length === 3 && value.length > 50;
}

// Helper to mask PII for logging
export function maskPII(value: string, type: 'phone' | 'email' | 'address'): string {
  if (!value) return '';

  switch (type) {
    case 'phone':
      // Show last 4 digits: (XXX) XXX-1234
      return value.length > 4 ? '***-***-' + value.slice(-4) : '****';

    case 'email':
      // Show first letter and domain: a***@example.com
      const [local, domain] = value.split('@');
      if (!domain) return '***';
      return local[0] + '***@' + domain;

    case 'address':
      // Show only city/state: *** Northlake, TX
      const parts = value.split(',');
      if (parts.length > 1) {
        return '*** ' + parts.slice(-2).join(',').trim();
      }
      return '***';

    default:
      return '***';
  }
}
