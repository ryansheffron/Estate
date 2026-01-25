// Estate Standard - Idempotency Middleware
// Prevents duplicate payment charges from request retries

import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { prisma } from '../server';
import { AppError } from './errorHandler';
import { v4 as uuidv4, validate as uuidValidate } from 'uuid';

const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';
const IDEMPOTENCY_EXPIRATION_HOURS = 24;

/**
 * Idempotency middleware for payment endpoints
 *
 * Usage:
 * - Client sends a UUID in the 'Idempotency-Key' header
 * - If the same key is used within 24 hours, return the cached response
 * - This prevents duplicate charges from retries
 *
 * CRITICAL: Only use on endpoints that modify financial state
 */
export const idempotencyMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const idempotencyKey = req.headers[IDEMPOTENCY_KEY_HEADER.toLowerCase()] as string;

    // Require idempotency key for POST/PUT/PATCH requests
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      if (!idempotencyKey) {
        throw new AppError(
          `${IDEMPOTENCY_KEY_HEADER} header required for ${req.method} requests`,
          400
        );
      }

      // Validate UUID format
      if (!uuidValidate(idempotencyKey)) {
        throw new AppError(
          `${IDEMPOTENCY_KEY_HEADER} must be a valid UUID`,
          400
        );
      }
    } else {
      // GET/DELETE don't require idempotency keys
      return next();
    }

    // Check if we've seen this key before
    const existingKey = await prisma.idempotencyKey.findUnique({
      where: { key: idempotencyKey },
    });

    if (existingKey) {
      // Check if expired
      if (new Date() > existingKey.expiresAt) {
        // Key expired - delete it and allow new request
        await prisma.idempotencyKey.delete({
          where: { id: existingKey.id },
        });
      } else if (existingKey.completedAt && existingKey.response) {
        // Request already completed - return cached response
        console.log(`[Idempotency] Returning cached response for key: ${idempotencyKey}`);

        return res
          .status(existingKey.statusCode || 200)
          .json(existingKey.response);
      } else {
        // Request in progress - client should retry later
        throw new AppError(
          'Request with this idempotency key is already in progress. Please retry later.',
          409
        );
      }
    }

    // Create new idempotency key record
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + IDEMPOTENCY_EXPIRATION_HOURS);

    await prisma.idempotencyKey.create({
      data: {
        key: idempotencyKey,
        userId: req.user?.id,
        endpoint: req.path,
        method: req.method,
        expiresAt,
      },
    });

    // Store key in request for later use
    (req as any).idempotencyKey = idempotencyKey;

    // Override res.json to cache the response
    const originalJson = res.json.bind(res);
    res.json = function (data: any) {
      // Cache the response asynchronously (don't block response)
      setImmediate(async () => {
        try {
          await prisma.idempotencyKey.update({
            where: { key: idempotencyKey },
            data: {
              statusCode: res.statusCode,
              response: data,
              completedAt: new Date(),
            },
          });
          console.log(`[Idempotency] Cached response for key: ${idempotencyKey}`);
        } catch (error) {
          console.error('[Idempotency] Failed to cache response:', error);
          // Don't throw - response already sent
        }
      });

      return originalJson(data);
    };

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Cleanup expired idempotency keys (run as background job)
 */
export async function cleanupExpiredIdempotencyKeys(): Promise<void> {
  try {
    const result = await prisma.idempotencyKey.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });

    console.log(`[Idempotency] Cleaned up ${result.count} expired keys`);
  } catch (error) {
    console.error('[Idempotency] Cleanup failed:', error);
  }
}

export default idempotencyMiddleware;
