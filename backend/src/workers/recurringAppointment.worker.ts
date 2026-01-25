// Estate Standard - Recurring Appointment Worker
// Automatically generates appointments based on recurring rules

import cron from 'node-cron';
import { prisma } from '../server';
import { RecurringFrequency } from '@prisma/client';
import NotificationService, { NotificationType } from '../services/notification.service';

/**
 * Generate recurring appointments based on active recurring rules
 * Runs daily at 2 AM
 */
export function startRecurringAppointmentWorker() {
  // Run daily at 2 AM
  cron.schedule('0 2 * * *', async () => {
    console.log('[Recurring Appointment Worker] Running...');

    try {
      const now = new Date();
      const lookAheadDays = 30; // Generate appointments up to 30 days in advance
      const lookAheadDate = new Date(now.getTime() + lookAheadDays * 24 * 60 * 60 * 1000);

      // Find active recurring rules that need to generate appointments
      const recurringRules = await prisma.recurringRule.findMany({
        where: {
          isActive: true,
          OR: [
            { nextScheduledDate: null },
            {
              nextScheduledDate: {
                lte: lookAheadDate,
              },
            },
          ],
        },
      });

      console.log(
        `[Recurring Appointment Worker] Found ${recurringRules.length} recurring rules to process`
      );

      for (const rule of recurringRules) {
        try {
          await generateAppointmentFromRule(rule.id);
        } catch (error) {
          console.error(
            `[Recurring Appointment Worker] Failed to generate appointment for rule ${rule.id}:`,
            error
          );
          // Continue with next rule
        }
      }

      console.log('[Recurring Appointment Worker] Completed successfully');
    } catch (error) {
      console.error('[Recurring Appointment Worker] Error:', error);
    }
  });

  console.log('[Recurring Appointment Worker] Started - runs daily at 2 AM');
}

/**
 * Generate appointment from a recurring rule
 * @param recurringRuleId Recurring rule ID
 */
export async function generateAppointmentFromRule(recurringRuleId: string): Promise<void> {
  const rule = await prisma.recurringRule.findUnique({
    where: { id: recurringRuleId },
  });

  if (!rule || !rule.isActive) {
    throw new Error('Recurring rule not found or inactive');
  }

  // Calculate next appointment date
  const nextDate = rule.nextScheduledDate || calculateNextDate(new Date(), rule.frequency);

  // Check if appointment already exists for this date
  const existingAppointment = await prisma.appointment.findFirst({
    where: {
      recurringRuleId: rule.id,
      scheduledStart: {
        gte: new Date(nextDate.setHours(0, 0, 0, 0)),
        lt: new Date(nextDate.setHours(23, 59, 59, 999)),
      },
    },
  });

  if (existingAppointment) {
    console.log(
      `[Recurring Appointment] Appointment already exists for rule ${rule.id} on ${nextDate.toDateString()}`
    );
    return;
  }

  // Get vendor availability for the preferred time slot
  const { scheduledStart, scheduledEnd } = await findAvailableSlot(
    rule.vendorId,
    nextDate,
    rule.preferredTimeSlot || 'morning',
    rule.preferredDayOfWeek
  );

  if (!scheduledStart || !scheduledEnd) {
    console.warn(
      `[Recurring Appointment] No available slots for rule ${rule.id} on ${nextDate.toDateString()}`
    );
    // Schedule for next occurrence
    const nextOccurrence = calculateNextDate(nextDate, rule.frequency);
    await prisma.recurringRule.update({
      where: { id: rule.id },
      data: { nextScheduledDate: nextOccurrence },
    });
    return;
  }

  // Create the appointment
  const appointment = await prisma.appointment.create({
    data: {
      homeownerId: rule.homeownerId,
      homeId: rule.homeId,
      vendorId: rule.vendorId,
      recurringRuleId: rule.id,
      scheduledStart,
      scheduledEnd,
      status: rule.autoBook ? 'SCHEDULED' : 'REQUESTED',
      vendorAcceptedAt: rule.autoBook ? new Date() : undefined,
    },
    include: {
      homeowner: {
        include: { user: true },
      },
      vendor: {
        include: { user: true },
      },
    },
  });

  // Update recurring rule
  const nextOccurrence = calculateNextDate(nextDate, rule.frequency);
  await prisma.recurringRule.update({
    where: { id: rule.id },
    data: {
      nextScheduledDate: nextOccurrence,
      lastGeneratedDate: new Date(),
    },
  });

  // Send notification to homeowner
  await NotificationService.send(
    NotificationType.APPOINTMENT_CONFIRMED,
    {
      userId: appointment.homeowner.userId,
      email: appointment.homeowner.user.email,
      phone: appointment.homeowner.user.phone || undefined,
      firstName: appointment.homeowner.user.firstName,
      lastName: appointment.homeowner.user.lastName,
    },
    {
      vendorName: appointment.vendor.businessName,
      date: scheduledStart.toLocaleDateString(),
      time: scheduledStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      serviceName: 'Recurring Maintenance',
    }
  );

  console.log(
    `[Recurring Appointment] Created appointment ${appointment.id} from rule ${rule.id}`
  );
}

/**
 * Calculate next date based on frequency
 */
function calculateNextDate(fromDate: Date, frequency: RecurringFrequency): Date {
  const next = new Date(fromDate);

  switch (frequency) {
    case 'MONTHLY':
      next.setMonth(next.getMonth() + 1);
      break;
    case 'QUARTERLY':
      next.setMonth(next.getMonth() + 3);
      break;
    case 'SEMI_ANNUAL':
      next.setMonth(next.getMonth() + 6);
      break;
    case 'YEARLY':
      next.setFullYear(next.getFullYear() + 1);
      break;
  }

  return next;
}

/**
 * Find available slot for vendor based on preferences
 */
async function findAvailableSlot(
  vendorId: string,
  targetDate: Date,
  timeSlot: string,
  preferredDayOfWeek?: number | null
): Promise<{ scheduledStart: Date | null; scheduledEnd: Date | null }> {
  // Adjust target date to preferred day of week if specified
  let searchDate = new Date(targetDate);
  if (preferredDayOfWeek !== null && preferredDayOfWeek !== undefined) {
    const currentDay = searchDate.getDay();
    const daysToAdd = (preferredDayOfWeek - currentDay + 7) % 7;
    searchDate.setDate(searchDate.getDate() + daysToAdd);
  }

  // Set time based on preference
  let startHour = 9; // Default morning
  let endHour = 12;

  if (timeSlot === 'afternoon') {
    startHour = 13;
    endHour = 17;
  } else if (timeSlot === 'evening') {
    startHour = 17;
    endHour = 20;
  }

  // Find available slot
  const dayStart = new Date(searchDate);
  dayStart.setHours(startHour, 0, 0, 0);

  const dayEnd = new Date(searchDate);
  dayEnd.setHours(endHour, 0, 0, 0);

  const availableSlot = await prisma.availabilitySlot.findFirst({
    where: {
      vendorId,
      startTime: {
        gte: dayStart,
        lte: dayEnd,
      },
      isBooked: false,
    },
    orderBy: {
      startTime: 'asc',
    },
  });

  if (availableSlot) {
    return {
      scheduledStart: availableSlot.startTime,
      scheduledEnd: availableSlot.endTime,
    };
  }

  // No slot found
  return { scheduledStart: null, scheduledEnd: null };
}

/**
 * Manually trigger recurring appointment generation (admin function)
 * @param recurringRuleId Recurring rule ID
 */
export async function manuallyGenerateRecurringAppointment(
  recurringRuleId: string
): Promise<void> {
  await generateAppointmentFromRule(recurringRuleId);
}

export default {
  startRecurringAppointmentWorker,
  generateAppointmentFromRule,
  manuallyGenerateRecurringAppointment,
};
