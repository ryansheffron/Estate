// Estate Standard - Reminder Worker
// Sends appointment reminders 24 hours before scheduled time

import cron from 'node-cron';
import { prisma } from '../server';
import NotificationService, { NotificationType } from '../services/notification.service';

const REMINDER_HOURS_BEFORE = 24;

/**
 * Send appointment reminders 24 hours before scheduled time
 * Runs every hour
 */
export function startReminderWorker() {
  // Run every hour
  cron.schedule('0 * * * *', async () => {
    console.log('[Reminder Worker] Running...');

    try {
      const now = new Date();
      const reminderWindow = new Date(now.getTime() + REMINDER_HOURS_BEFORE * 60 * 60 * 1000);

      // Find appointments scheduled in 24-25 hours
      const windowStart = new Date(reminderWindow.getTime() - 60 * 60 * 1000); // 23 hours from now
      const windowEnd = new Date(reminderWindow.getTime() + 60 * 60 * 1000); // 25 hours from now

      const upcomingAppointments = await prisma.appointment.findMany({
        where: {
          scheduledStart: {
            gte: windowStart,
            lte: windowEnd,
          },
          status: {
            in: ['SCHEDULED', 'VENDOR_ACCEPTED', 'HOMEOWNER_CONFIRMED'],
          },
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

      console.log(`[Reminder Worker] Found ${upcomingAppointments.length} appointments to remind`);

      for (const appointment of upcomingAppointments) {
        try {
          // Send reminder to homeowner
          await NotificationService.send(
            NotificationType.APPOINTMENT_REMINDER,
            {
              userId: appointment.homeowner.userId,
              email: appointment.homeowner.user.email,
              phone: appointment.homeowner.user.phone || undefined,
              firstName: appointment.homeowner.user.firstName,
              lastName: appointment.homeowner.user.lastName,
            },
            {
              vendorName: appointment.vendor.businessName,
              date: appointment.scheduledStart.toLocaleDateString(),
              time: appointment.scheduledStart.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              }),
              address: 'Your home', // Could be enhanced with actual address
            }
          );

          // Send reminder to vendor
          await NotificationService.send(
            NotificationType.APPOINTMENT_REMINDER,
            {
              userId: appointment.vendor.userId,
              email: appointment.vendor.user.email,
              phone: appointment.vendor.user.phone || undefined,
              firstName: appointment.vendor.user.firstName,
              lastName: appointment.vendor.user.lastName,
            },
            {
              homeownerName: `${appointment.homeowner.user.firstName} ${appointment.homeowner.user.lastName}`,
              date: appointment.scheduledStart.toLocaleDateString(),
              time: appointment.scheduledStart.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              }),
            }
          );

          console.log(`[Reminder Worker] Sent reminders for appointment ${appointment.id}`);
        } catch (error) {
          console.error(
            `[Reminder Worker] Failed to send reminders for appointment ${appointment.id}:`,
            error
          );
          // Continue with next appointment
        }
      }

      console.log('[Reminder Worker] Completed successfully');
    } catch (error) {
      console.error('[Reminder Worker] Error:', error);
    }
  });

  console.log('[Reminder Worker] Started - runs every hour');
}

/**
 * Send immediate reminder for a specific appointment (admin function)
 * @param appointmentId Appointment ID
 */
export async function sendImmediateReminder(appointmentId: string): Promise<void> {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      homeowner: {
        include: { user: true },
      },
      vendor: {
        include: { user: true },
      },
    },
  });

  if (!appointment) {
    throw new Error('Appointment not found');
  }

  // Send reminder to homeowner
  await NotificationService.send(
    NotificationType.APPOINTMENT_REMINDER,
    {
      userId: appointment.homeowner.userId,
      email: appointment.homeowner.user.email,
      phone: appointment.homeowner.user.phone || undefined,
      firstName: appointment.homeowner.user.firstName,
      lastName: appointment.homeowner.user.lastName,
    },
    {
      vendorName: appointment.vendor.businessName,
      date: appointment.scheduledStart.toLocaleDateString(),
      time: appointment.scheduledStart.toLocaleTimeString(),
    }
  );

  // Send reminder to vendor
  await NotificationService.send(
    NotificationType.APPOINTMENT_REMINDER,
    {
      userId: appointment.vendor.userId,
      email: appointment.vendor.user.email,
      phone: appointment.vendor.user.phone || undefined,
      firstName: appointment.vendor.user.firstName,
      lastName: appointment.vendor.user.lastName,
    },
    {
      homeownerName: `${appointment.homeowner.user.firstName} ${appointment.homeowner.user.lastName}`,
      date: appointment.scheduledStart.toLocaleDateString(),
      time: appointment.scheduledStart.toLocaleTimeString(),
    }
  );

  console.log(`[Manual Reminder] Sent reminders for appointment ${appointmentId}`);
}

export default {
  startReminderWorker,
  sendImmediateReminder,
};
