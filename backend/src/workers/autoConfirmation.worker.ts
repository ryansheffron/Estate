// Estate Standard - Auto-Confirmation Worker
// Automatically confirms job completion after 48 hours if homeowner doesn't respond

import cron from 'node-cron';
import { prisma } from '../server';
import StripeService from '../services/stripe.service';
import { JobStateMachine, createStateTransitionLog } from '../utils/stateMachine';
import NotificationService, { NotificationType } from '../services/notification.service';

const AUTO_CONFIRM_TIMEOUT_HOURS = 48;

/**
 * Auto-confirm jobs that have been completed by vendor but not confirmed by homeowner
 * Runs every hour
 */
export function startAutoConfirmationWorker() {
  // Run every hour
  cron.schedule('0 * * * *', async () => {
    console.log('[Auto-Confirmation Worker] Running...');

    try {
      const cutoffTime = new Date();
      cutoffTime.setHours(cutoffTime.getHours() - AUTO_CONFIRM_TIMEOUT_HOURS);

      // Find jobs completed by vendor but not yet confirmed
      const pendingJobs = await prisma.appointment.findMany({
        where: {
          status: 'COMPLETED_BY_VENDOR',
          completedAt: {
            lte: cutoffTime, // Completed more than 48 hours ago
          },
        },
        include: {
          vendor: true,
          homeowner: true,
        },
      });

      console.log(`[Auto-Confirmation Worker] Found ${pendingJobs.length} jobs to auto-confirm`);

      for (const job of pendingJobs) {
        try {
          // Validate state transition
          JobStateMachine.validateTransition(job.status, 'COMPLETED_CONFIRMED');

          const stateLog = createStateTransitionLog(
            job.status,
            'COMPLETED_CONFIRMED',
            'system',
            `Auto-confirmed after ${AUTO_CONFIRM_TIMEOUT_HOURS} hours timeout`
          );

          // Update appointment status
          await prisma.appointment.update({
            where: { id: job.id },
            data: {
              status: 'COMPLETED_CONFIRMED',
              homeownerConfirmedAt: new Date(),
              autoConfirmed: true,
              stateHistory: {
                push: stateLog,
              },
            },
          });

          // Update job ledger
          await prisma.jobLedger.updateMany({
            where: {
              OR: [
                { appointmentId: job.id },
                { serviceRequestId: job.serviceRequestId || undefined },
              ],
            },
            data: {
              status: 'COMPLETED_CONFIRMED',
              homeownerConfirmedAt: new Date(),
              autoConfirmed: true,
            },
          });

          // Capture payment (if exists)
          const payment = await prisma.payment.findUnique({
            where: { appointmentId: job.id },
          });

          if (payment && payment.stripePaymentIntentId) {
            await StripeService.capturePayment(payment.stripePaymentIntentId);
            console.log(`[Auto-Confirmation Worker] Payment captured for job ${job.id}`);
          }

          // Release vendor payout
          if (payment) {
            await StripeService.releaseVendorPayout(job.id);
            console.log(`[Auto-Confirmation Worker] Payout released for job ${job.id}`);

            // Notify vendor about payout release
            await NotificationService.send(
              NotificationType.PAYOUT_RELEASED,
              {
                userId: job.vendor.userId,
                email: job.vendor.user.email,
                phone: job.vendor.user.phone || undefined,
                firstName: job.vendor.user.firstName,
                lastName: job.vendor.user.lastName,
              },
              {
                amount: payment.vendorPayoutAmount?.toFixed(2) || '0.00',
                jobDescription: `Job #${job.id}`,
              }
            );
          }

          // Notify homeowner about auto-confirmation
          await NotificationService.send(
            NotificationType.JOB_AUTO_CONFIRMED,
            {
              userId: job.homeowner.userId,
              email: job.homeowner.user.email,
              phone: job.homeowner.user.phone || undefined,
              firstName: job.homeowner.user.firstName,
              lastName: job.homeowner.user.lastName,
            },
            {
              vendorName: job.vendor.businessName,
              appointmentId: job.id,
            }
          );

          console.log(`[Auto-Confirmation Worker] Auto-confirmed job ${job.id}`);
        } catch (error) {
          console.error(`[Auto-Confirmation Worker] Failed to auto-confirm job ${job.id}:`, error);
          // Continue with next job
        }
      }

      console.log('[Auto-Confirmation Worker] Completed successfully');
    } catch (error) {
      console.error('[Auto-Confirmation Worker] Error:', error);
    }
  });

  console.log('[Auto-Confirmation Worker] Started - runs every hour');
}

/**
 * Manually trigger auto-confirmation for a specific job (admin function)
 * @param appointmentId Appointment ID to confirm
 */
export async function manuallyConfirmJob(appointmentId: string): Promise<void> {
  const job = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      vendor: true,
      homeowner: true,
    },
  });

  if (!job) {
    throw new Error('Job not found');
  }

  if (job.status !== 'COMPLETED_BY_VENDOR') {
    throw new Error('Job must be in COMPLETED_BY_VENDOR status');
  }

  // Validate state transition
  JobStateMachine.validateTransition(job.status, 'COMPLETED_CONFIRMED');

  const stateLog = createStateTransitionLog(
    job.status,
    'COMPLETED_CONFIRMED',
    'admin',
    'Manual confirmation by admin'
  );

  // Update appointment
  await prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      status: 'COMPLETED_CONFIRMED',
      homeownerConfirmedAt: new Date(),
      autoConfirmed: false,
      stateHistory: {
        push: stateLog,
      },
    },
  });

  // Update job ledger
  await prisma.jobLedger.updateMany({
    where: {
      OR: [
        { appointmentId },
        { serviceRequestId: job.serviceRequestId || undefined },
      ],
    },
    data: {
      status: 'COMPLETED_CONFIRMED',
      homeownerConfirmedAt: new Date(),
      autoConfirmed: false,
    },
  });

  // Capture payment and release payout
  const payment = await prisma.payment.findUnique({
    where: { appointmentId },
  });

  if (payment && payment.stripePaymentIntentId) {
    await StripeService.capturePayment(payment.stripePaymentIntentId);
    await StripeService.releaseVendorPayout(appointmentId);
  }

  console.log(`[Manual Confirmation] Job ${appointmentId} confirmed by admin`);
}

export default {
  startAutoConfirmationWorker,
  manuallyConfirmJob,
};
