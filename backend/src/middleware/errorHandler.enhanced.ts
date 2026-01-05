// Estate Standard - Enhanced Error Handler Middleware
// Secure error handling with proper disclosure controls

import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { getClientIp } from '../utils/security';
import { logger } from '../utils/logger';

export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;
  code?: string;

  constructor(message: string, statusCode: number, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.code = code;

    Error.captureStackTrace(this, this.constructor);
  }
}

// Specific error classes
export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}

export class RateLimitError extends AppError {
  constructor() {
    super('Too many requests. Please try again later.', 429, 'RATE_LIMIT_EXCEEDED');
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message: string = 'Service temporarily unavailable') {
    super(message, 503, 'SERVICE_UNAVAILABLE');
  }
}

// Error response interface
interface ErrorResponse {
  status: 'error';
  code: string;
  message: string;
  requestId?: string;
  details?: any;
}

export const errorHandler = (
  err: Error | AppError,
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  // Generate unique request ID for tracking
  const requestId = req.headers['x-request-id'] as string ||
                    Math.random().toString(36).substring(7);

  // Log full error details internally
  logger.error('Unhandled error', {
    error: {
      name: err.name,
      message: err.message,
      stack: err.stack,
      ...(err instanceof AppError && { code: err.code, statusCode: err.statusCode })
    },
    request: {
      requestId,
      method: req.method,
      path: req.path,
      query: req.query,
      params: req.params,
      userId: req.user?.id,
      ip: getClientIp(req),
      userAgent: req.get('user-agent')
    }
  });

  // Handle operational errors (expected errors)
  if (err instanceof AppError && err.isOperational) {
    const response: ErrorResponse = {
      status: 'error',
      code: err.code || 'OPERATIONAL_ERROR',
      message: err.message,
      requestId
    };

    return res.status(err.statusCode).json(response);
  }

  // Handle Prisma errors
  if (err.name === 'PrismaClientKnownRequestError') {
    return handlePrismaError(err as any, res, requestId);
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({
      status: 'error',
      code: 'INVALID_TOKEN',
      message: 'Invalid or expired token',
      requestId
    });
  }

  // Handle Joi validation errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      status: 'error',
      code: 'VALIDATION_ERROR',
      message: err.message,
      requestId
    });
  }

  // Handle Multer errors (file upload)
  if (err.name === 'MulterError') {
    return res.status(400).json({
      status: 'error',
      code: 'FILE_UPLOAD_ERROR',
      message: 'File upload error: ' + err.message,
      requestId
    });
  }

  // Handle unexpected errors (don't leak internals in production)
  const response: ErrorResponse = {
    status: 'error',
    code: 'INTERNAL_SERVER_ERROR',
    message: process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred. Our team has been notified.'
      : err.message,
    requestId
  };

  // Include stack trace only in development
  if (process.env.NODE_ENV === 'development') {
    response.details = {
      stack: err.stack,
      name: err.name
    };
  }

  return res.status(500).json(response);
};

function handlePrismaError(err: any, res: Response, requestId: string) {
  const { code, meta } = err;

  // Unique constraint violation
  if (code === 'P2002') {
    const field = meta?.target?.[0] || 'field';
    return res.status(409).json({
      status: 'error',
      code: 'DUPLICATE_ENTRY',
      message: `${field} already exists`,
      requestId
    });
  }

  // Foreign key constraint violation
  if (code === 'P2003') {
    return res.status(400).json({
      status: 'error',
      code: 'INVALID_REFERENCE',
      message: 'Invalid reference to related resource',
      requestId
    });
  }

  // Record not found
  if (code === 'P2025') {
    return res.status(404).json({
      status: 'error',
      code: 'NOT_FOUND',
      message: 'Resource not found',
      requestId
    });
  }

  // Generic Prisma error
  return res.status(500).json({
    status: 'error',
    code: 'DATABASE_ERROR',
    message: process.env.NODE_ENV === 'production'
      ? 'A database error occurred'
      : `Database error: ${code}`,
    requestId
  });
}

// Async error wrapper to avoid try-catch in every route
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
