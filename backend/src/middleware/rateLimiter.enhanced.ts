// Estate Standard - Enhanced Rate Limiter Middleware
// Granular rate limiting for different endpoint types

import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { prisma } from '../server';
import { getClientIp } from '../utils/security';

// Generic API rate limiter (default)
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again later.',
  handler: async (req: Request, res: Response) => {
    await logRateLimitExceeded(req, 'api');
    res.status(429).json({
      status: 'error',
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please try again later.',
      retryAfter: res.getHeader('Retry-After')
    });
  }
});

// Authentication endpoints (stricter)
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per 15 minutes
  skipSuccessfulRequests: true, // Don't count successful logins
  keyGenerator: (req: Request) => {
    // Rate limit by IP + email for login attempts
    const email = req.body?.email || '';
    return `${getClientIp(req)}:${email}`;
  },
  handler: async (req: Request, res: Response) => {
    await logRateLimitExceeded(req, 'auth');

    // Log suspicious activity
    await prisma.auditLog.create({
      data: {
        action: 'auth.rate_limit_exceeded',
        ipAddress: getClientIp(req),
        userAgent: req.get('user-agent'),
        metadata: {
          endpoint: req.path,
          email: req.body?.email,
          timestamp: new Date().toISOString()
        }
      }
    });

    res.status(429).json({
      status: 'error',
      code: 'TOO_MANY_LOGIN_ATTEMPTS',
      message: 'Too many login attempts. Please try again in 15 minutes.',
      retryAfter: res.getHeader('Retry-After')
    });
  }
});

// Password reset (prevent abuse)
export const passwordResetRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 reset requests per hour
  keyGenerator: (req: Request) => {
    const email = req.body?.email || '';
    return `password_reset:${email}`;
  },
  handler: async (req: Request, res: Response) => {
    await logRateLimitExceeded(req, 'password_reset');
    res.status(429).json({
      status: 'error',
      code: 'TOO_MANY_RESET_ATTEMPTS',
      message: 'Too many password reset requests. Please try again later.',
      retryAfter: res.getHeader('Retry-After')
    });
  }
});

// Email verification resend
export const emailVerificationRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // 3 resends per 15 minutes
  handler: async (req: Request, res: Response) => {
    await logRateLimitExceeded(req, 'email_verification');
    res.status(429).json({
      status: 'error',
      code: 'TOO_MANY_VERIFICATION_ATTEMPTS',
      message: 'Too many verification requests. Please check your email.',
      retryAfter: res.getHeader('Retry-After')
    });
  }
});

// File upload (prevent storage abuse)
export const uploadRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 uploads per hour
  handler: async (req: Request, res: Response) => {
    await logRateLimitExceeded(req, 'upload');
    res.status(429).json({
      status: 'error',
      code: 'TOO_MANY_UPLOADS',
      message: 'Upload limit exceeded. Please try again later.',
      retryAfter: res.getHeader('Retry-After')
    });
  }
});

// Expensive operations (search, reports, etc.)
export const expensiveOperationRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute
  handler: async (req: Request, res: Response) => {
    await logRateLimitExceeded(req, 'expensive_operation');
    res.status(429).json({
      status: 'error',
      code: 'TOO_MANY_REQUESTS',
      message: 'Request limit exceeded. Please slow down.',
      retryAfter: res.getHeader('Retry-After')
    });
  }
});

// SMS/Email sending (prevent spam)
export const messagingRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 messages per hour
  handler: async (req: Request, res: Response) => {
    await logRateLimitExceeded(req, 'messaging');
    res.status(429).json({
      status: 'error',
      code: 'TOO_MANY_MESSAGES',
      message: 'Message limit exceeded. Please try again later.',
      retryAfter: res.getHeader('Retry-After')
    });
  }
});

// Payment operations (critical)
export const paymentRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 3, // 3 payment attempts per 5 minutes
  handler: async (req: Request, res: Response) => {
    await logRateLimitExceeded(req, 'payment');

    // Alert on payment abuse
    await prisma.auditLog.create({
      data: {
        action: 'payment.rate_limit_exceeded',
        ipAddress: getClientIp(req),
        userAgent: req.get('user-agent'),
        metadata: {
          severity: 'high',
          endpoint: req.path,
          timestamp: new Date().toISOString()
        }
      }
    });

    res.status(429).json({
      status: 'error',
      code: 'TOO_MANY_PAYMENT_ATTEMPTS',
      message: 'Too many payment attempts. Please contact support.',
      retryAfter: res.getHeader('Retry-After')
    });
  }
});

// 2FA verification (prevent brute force)
export const twoFactorRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5, // 5 attempts per 5 minutes
  skipSuccessfulRequests: true,
  handler: async (req: Request, res: Response) => {
    await logRateLimitExceeded(req, '2fa');
    res.status(429).json({
      status: 'error',
      code: 'TOO_MANY_2FA_ATTEMPTS',
      message: 'Too many 2FA attempts. Please try again later.',
      retryAfter: res.getHeader('Retry-After')
    });
  }
});

// Helper function to log rate limit violations
async function logRateLimitExceeded(req: Request, limiterType: string) {
  try {
    await prisma.auditLog.create({
      data: {
        action: `rate_limit.${limiterType}.exceeded`,
        ipAddress: getClientIp(req),
        userAgent: req.get('user-agent'),
        metadata: {
          endpoint: req.path,
          method: req.method,
          timestamp: new Date().toISOString(),
          limiterType
        }
      }
    });
  } catch (error) {
    console.error('Failed to log rate limit exceeded:', error);
  }
}
