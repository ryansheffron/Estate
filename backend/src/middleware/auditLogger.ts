// Estate Standard - Audit Logger Middleware
// Comprehensive audit logging for compliance and forensics

import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { prisma } from '../server';
import { getClientIp } from '../utils/security';

// Sensitive endpoints that require audit logging
const AUDITED_PATTERNS = [
  /^\/api\/auth\/(login|logout|register)/,
  /^\/api\/payments/,
  /^\/api\/appointments\/.*\/(complete|confirm-completion|dispute)/,
  /^\/api\/users\/.*\/(delete|suspend)/,
  /^\/api\/vendor\/.*\/availability/,
  /^\/api\/recurring/,
  /^\/api\/service-requests/
];

// Fields to redact from logs (PII, credentials)
const REDACTED_FIELDS = [
  'password',
  'passwordHash',
  'currentPassword',
  'newPassword',
  'token',
  'refreshToken',
  'accessToken',
  'creditCard',
  'ssn',
  'twoFactorSecret'
];

function shouldAudit(path: string): boolean {
  return AUDITED_PATTERNS.some(pattern => pattern.test(path));
}

function redactSensitiveData(obj: any): any {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => redactSensitiveData(item));
  }

  const redacted: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (REDACTED_FIELDS.includes(key.toLowerCase())) {
      redacted[key] = '[REDACTED]';
    } else if (typeof value === 'object') {
      redacted[key] = redactSensitiveData(value);
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}

export const auditLogger = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!shouldAudit(req.path)) {
    return next();
  }

  const startTime = Date.now();
  const originalSend = res.send;

  let responseBody: any;
  let statusCode: number;

  // Capture response
  res.send = function (body: any): Response {
    responseBody = body;
    statusCode = res.statusCode;
    return originalSend.call(this, body);
  };

  // Wait for response to complete
  res.on('finish', async () => {
    try {
      const duration = Date.now() - startTime;

      const auditData = {
        // User context
        userId: req.user?.id,
        userEmail: req.user?.email,
        userRole: req.user?.role,

        // Request details
        action: `${req.method} ${req.path}`,
        method: req.method,
        endpoint: req.path,
        ipAddress: getClientIp(req),
        userAgent: req.get('user-agent') || 'unknown',

        // Request payload (redacted)
        requestBody: req.body ? redactSensitiveData(req.body) : null,
        requestParams: req.params ? redactSensitiveData(req.params) : null,
        requestQuery: req.query ? redactSensitiveData(req.query) : null,

        // Response details
        statusCode,
        success: statusCode < 400,
        duration,

        // Metadata
        metadata: {
          referrer: req.get('referer'),
          origin: req.get('origin'),
          timestamp: new Date().toISOString()
        }
      };

      // Store in database
      await prisma.auditLog.create({
        data: {
          userId: auditData.userId,
          action: auditData.action,
          entity: extractEntityFromPath(req.path),
          entityId: extractIdFromPath(req.path),
          changes: auditData.requestBody,
          ipAddress: auditData.ipAddress,
          userAgent: auditData.userAgent,
          metadata: auditData.metadata as any
        }
      });
    } catch (error) {
      // Log error but don't fail the request
      console.error('Audit logging failed:', error);
    }
  });

  next();
};

function extractEntityFromPath(path: string): string | null {
  const match = path.match(/\/api\/([^\/]+)/);
  return match ? match[1] : null;
}

function extractIdFromPath(path: string): string | null {
  // Extract UUID from path like /api/appointments/uuid-here/complete
  const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  const match = path.match(uuidRegex);
  return match ? match[0] : null;
}

// Specific audit log creators for critical actions
export async function logAuthAttempt(
  email: string,
  success: boolean,
  reason: string,
  req: Request
) {
  await prisma.auditLog.create({
    data: {
      userId: null,
      action: success ? 'auth.login.success' : 'auth.login.failure',
      entity: 'User',
      entityId: null,
      changes: { email, reason },
      ipAddress: getClientIp(req),
      userAgent: req.get('user-agent'),
      metadata: {
        timestamp: new Date().toISOString(),
        success
      }
    }
  });
}

export async function logPasswordChange(userId: string, req: AuthRequest) {
  await prisma.auditLog.create({
    data: {
      userId,
      action: 'user.password.changed',
      entity: 'User',
      entityId: userId,
      changes: {},
      ipAddress: getClientIp(req),
      userAgent: req.get('user-agent'),
      metadata: {
        timestamp: new Date().toISOString()
      }
    }
  });
}

export async function log2FAChange(
  userId: string,
  action: 'enabled' | 'disabled',
  req: AuthRequest
) {
  await prisma.auditLog.create({
    data: {
      userId,
      action: `user.2fa.${action}`,
      entity: 'User',
      entityId: userId,
      changes: { action },
      ipAddress: getClientIp(req),
      userAgent: req.get('user-agent'),
      metadata: {
        timestamp: new Date().toISOString()
      }
    }
  });
}

export async function logPaymentAction(
  userId: string,
  action: string,
  amount: number,
  currency: string,
  req: AuthRequest
) {
  await prisma.auditLog.create({
    data: {
      userId,
      action: `payment.${action}`,
      entity: 'Payment',
      entityId: null,
      changes: { amount, currency },
      ipAddress: getClientIp(req),
      userAgent: req.get('user-agent'),
      metadata: {
        timestamp: new Date().toISOString(),
        amount,
        currency
      }
    }
  });
}
