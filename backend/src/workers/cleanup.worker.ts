// Estate Standard - Cleanup Worker
// Cleans up expired records and temporary data

import cron from 'node-cron';
import { prisma } from '../server';

/**
 * Cleanup expired idempotency keys and other temporary data
 * Runs daily at 3 AM
 */
export function startCleanupWorker() {
  // Run daily at 3 AM
  cron.schedule('0 3 * * *', async () => {
    console.log('[Cleanup Worker] Running...');

    try {
      // Clean up expired idempotency keys
      const idempotencyResult = await prisma.idempotencyKey.deleteMany({
        where: {
          expiresAt: {
            lt: new Date(),
          },
        },
      });

      console.log(`[Cleanup Worker] Deleted ${idempotencyResult.count} expired idempotency keys`);

      // Clean up old refresh tokens (expired more than 7 days ago)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const refreshTokenResult = await prisma.refreshToken.deleteMany({
        where: {
          expiresAt: {
            lt: sevenDaysAgo,
          },
        },
      });

      console.log(`[Cleanup Worker] Deleted ${refreshTokenResult.count} expired refresh tokens`);

      // Clean up old audit logs (older than 90 days)
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const auditLogResult = await prisma.auditLog.deleteMany({
        where: {
          createdAt: {
            lt: ninetyDaysAgo,
          },
        },
      });

      console.log(`[Cleanup Worker] Deleted ${auditLogResult.count} old audit logs`);

      console.log('[Cleanup Worker] Completed successfully');
    } catch (error) {
      console.error('[Cleanup Worker] Error:', error);
    }
  });

  console.log('[Cleanup Worker] Started - runs daily at 3 AM');
}

/**
 * Manually trigger cleanup (admin function)
 */
export async function manualCleanup(): Promise<{
  idempotencyKeys: number;
  refreshTokens: number;
  auditLogs: number;
}> {
  // Clean up expired idempotency keys
  const idempotencyResult = await prisma.idempotencyKey.deleteMany({
    where: {
      expiresAt: {
        lt: new Date(),
      },
    },
  });

  // Clean up old refresh tokens
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const refreshTokenResult = await prisma.refreshToken.deleteMany({
    where: {
      expiresAt: {
        lt: sevenDaysAgo,
      },
    },
  });

  // Clean up old audit logs
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const auditLogResult = await prisma.auditLog.deleteMany({
    where: {
      createdAt: {
        lt: ninetyDaysAgo,
      },
    },
  });

  console.log('[Manual Cleanup] Completed');

  return {
    idempotencyKeys: idempotencyResult.count,
    refreshTokens: refreshTokenResult.count,
    auditLogs: auditLogResult.count,
  };
}

export default {
  startCleanupWorker,
  manualCleanup,
};
