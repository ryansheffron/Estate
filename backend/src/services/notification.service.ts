// Estate Standard - Notification Service
// Handles SMS, email, and in-app notifications

import { prisma } from '../server';

// SMS Provider (Twilio)
interface SMSConfig {
  accountSid: string;
  authToken: string;
  fromNumber: string;
}

// Email Provider (SendGrid/Resend)
interface EmailConfig {
  apiKey: string;
  fromEmail: string;
  fromName: string;
}

export enum NotificationType {
  // Appointment notifications
  APPOINTMENT_REQUESTED = 'appointment_requested',
  APPOINTMENT_CONFIRMED = 'appointment_confirmed',
  APPOINTMENT_REMINDER = 'appointment_reminder',
  APPOINTMENT_CANCELLED = 'appointment_cancelled',

  // Job completion notifications
  JOB_STARTED = 'job_started',
  JOB_COMPLETED = 'job_completed',
  JOB_AUTO_CONFIRMED = 'job_auto_confirmed',

  // Payment notifications
  PAYMENT_AUTHORIZED = 'payment_authorized',
  PAYMENT_CAPTURED = 'payment_captured',
  PAYMENT_FAILED = 'payment_failed',
  PAYOUT_RELEASED = 'payout_released',

  // Service request notifications
  SERVICE_REQUEST_RECEIVED = 'service_request_received',
  VENDOR_MATCHED = 'vendor_matched',

  // Dispute notifications
  DISPUTE_RAISED = 'dispute_raised',
  DISPUTE_RESOLVED = 'dispute_resolved',
}

interface NotificationRecipient {
  userId: string;
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
}

interface NotificationData {
  [key: string]: any;
}

export class NotificationService {
  private static smsConfig: SMSConfig | null = null;
  private static emailConfig: EmailConfig | null = null;

  /**
   * Initialize notification service with provider configs
   */
  static initialize(sms?: SMSConfig, email?: EmailConfig) {
    this.smsConfig = sms || null;
    this.emailConfig = email || null;
    console.log('[Notification Service] Initialized');
  }

  /**
   * Send notification via all enabled channels
   */
  static async send(
    type: NotificationType,
    recipient: NotificationRecipient,
    data: NotificationData
  ): Promise<void> {
    try {
      // Get user preferences
      const homeowner = await prisma.homeowner.findUnique({
        where: { userId: recipient.userId },
        select: { preferredContactMethod: true },
      });

      const vendor = await prisma.vendor.findUnique({
        where: { userId: recipient.userId },
        select: { id: true },
      });

      const preferredMethod = homeowner?.preferredContactMethod || 'in_app';

      // Send via preferred channel
      switch (preferredMethod) {
        case 'sms':
          if (recipient.phone) {
            await this.sendSMS(type, recipient, data);
          } else {
            // Fallback to email if no phone
            await this.sendEmail(type, recipient, data);
          }
          break;

        case 'email':
          if (recipient.email) {
            await this.sendEmail(type, recipient, data);
          }
          break;

        case 'in_app':
        default:
          // Always send in-app notification
          break;
      }

      // Always create in-app notification record
      await this.createInAppNotification(type, recipient, data);

      console.log(`[Notification] Sent ${type} to user ${recipient.userId}`);
    } catch (error) {
      console.error(`[Notification] Failed to send ${type}:`, error);
      // Don't throw - notifications shouldn't block core operations
    }
  }

  /**
   * Send SMS notification
   */
  private static async sendSMS(
    type: NotificationType,
    recipient: NotificationRecipient,
    data: NotificationData
  ): Promise<void> {
    if (!this.smsConfig) {
      console.warn('[Notification] SMS not configured');
      return;
    }

    const message = this.getSMSTemplate(type, recipient, data);

    // TODO: Integrate with Twilio
    // const twilio = require('twilio')(this.smsConfig.accountSid, this.smsConfig.authToken);
    // await twilio.messages.create({
    //   body: message,
    //   from: this.smsConfig.fromNumber,
    //   to: recipient.phone,
    // });

    console.log(`[Notification] SMS sent to ${recipient.phone}: ${message}`);
  }

  /**
   * Send email notification
   */
  private static async sendEmail(
    type: NotificationType,
    recipient: NotificationRecipient,
    data: NotificationData
  ): Promise<void> {
    if (!this.emailConfig) {
      console.warn('[Notification] Email not configured');
      return;
    }

    const { subject, html } = this.getEmailTemplate(type, recipient, data);

    // TODO: Integrate with SendGrid/Resend
    // const sgMail = require('@sendgrid/mail');
    // sgMail.setApiKey(this.emailConfig.apiKey);
    // await sgMail.send({
    //   to: recipient.email,
    //   from: { email: this.emailConfig.fromEmail, name: this.emailConfig.fromName },
    //   subject,
    //   html,
    // });

    console.log(`[Notification] Email sent to ${recipient.email}: ${subject}`);
  }

  /**
   * Create in-app notification record
   */
  private static async createInAppNotification(
    type: NotificationType,
    recipient: NotificationRecipient,
    data: NotificationData
  ): Promise<void> {
    // In-app notifications would be stored in a separate table
    // For now, we'll log them
    console.log(`[Notification] In-app notification created for user ${recipient.userId}`);
  }

  /**
   * Get SMS message template
   */
  private static getSMSTemplate(
    type: NotificationType,
    recipient: NotificationRecipient,
    data: NotificationData
  ): string {
    const firstName = recipient.firstName || 'there';

    const templates: Record<NotificationType, string> = {
      [NotificationType.APPOINTMENT_REQUESTED]: `Hi ${firstName}, your service appointment has been requested. We'll notify you once confirmed.`,

      [NotificationType.APPOINTMENT_CONFIRMED]: `Hi ${firstName}, your appointment for ${data.date} at ${data.time} has been confirmed with ${data.vendorName}.`,

      [NotificationType.APPOINTMENT_REMINDER]: `Reminder: Your appointment with ${data.vendorName} is tomorrow at ${data.time}.`,

      [NotificationType.APPOINTMENT_CANCELLED]: `Your appointment for ${data.date} has been cancelled. Reason: ${data.reason}`,

      [NotificationType.JOB_STARTED]: `${data.vendorName} has started working on your service request.`,

      [NotificationType.JOB_COMPLETED]: `${data.vendorName} has marked your job as complete. Please confirm in the app.`,

      [NotificationType.JOB_AUTO_CONFIRMED]: `Your job with ${data.vendorName} has been auto-confirmed. Payment has been processed.`,

      [NotificationType.PAYMENT_AUTHORIZED]: `Payment of $${data.amount} has been authorized for your appointment.`,

      [NotificationType.PAYMENT_CAPTURED]: `Payment of $${data.amount} has been processed successfully.`,

      [NotificationType.PAYMENT_FAILED]: `Payment failed: ${data.reason}. Please update your payment method.`,

      [NotificationType.PAYOUT_RELEASED]: `Your payout of $${data.amount} has been released and will arrive in 2-3 business days.`,

      [NotificationType.SERVICE_REQUEST_RECEIVED]: `We've received your service request. We're matching you with qualified vendors.`,

      [NotificationType.VENDOR_MATCHED]: `Great news! We've found ${data.vendorCount} vendors for your request.`,

      [NotificationType.DISPUTE_RAISED]: `A dispute has been raised for appointment ${data.appointmentId}. Our team will review it.`,

      [NotificationType.DISPUTE_RESOLVED]: `Your dispute has been resolved. ${data.resolution}`,
    };

    return templates[type] || `Estate Standard notification: ${type}`;
  }

  /**
   * Get email template
   */
  private static getEmailTemplate(
    type: NotificationType,
    recipient: NotificationRecipient,
    data: NotificationData
  ): { subject: string; html: string } {
    const firstName = recipient.firstName || 'there';

    const templates: Record<NotificationType, { subject: string; html: string }> = {
      [NotificationType.APPOINTMENT_CONFIRMED]: {
        subject: 'Your Appointment is Confirmed',
        html: `
          <h2>Hi ${firstName},</h2>
          <p>Your appointment has been confirmed!</p>
          <p><strong>Date:</strong> ${data.date}</p>
          <p><strong>Time:</strong> ${data.time}</p>
          <p><strong>Vendor:</strong> ${data.vendorName}</p>
          <p><strong>Service:</strong> ${data.serviceName}</p>
          <p>We'll send you a reminder 24 hours before your appointment.</p>
          <p>Thank you for using Estate Standard!</p>
        `,
      },

      [NotificationType.JOB_COMPLETED]: {
        subject: 'Job Completed - Please Confirm',
        html: `
          <h2>Hi ${firstName},</h2>
          <p>${data.vendorName} has marked your job as complete.</p>
          <p>Please log in to the Estate Standard app to:</p>
          <ul>
            <li>Review the work completed</li>
            <li>Confirm job completion</li>
            <li>Leave a review</li>
          </ul>
          <p><em>If you don't confirm within 48 hours, the job will be auto-confirmed and payment will be processed.</em></p>
        `,
      },

      [NotificationType.PAYOUT_RELEASED]: {
        subject: 'Payout Released',
        html: `
          <h2>Hi ${firstName},</h2>
          <p>Great news! Your payout has been released.</p>
          <p><strong>Amount:</strong> $${data.amount}</p>
          <p><strong>Job:</strong> ${data.jobDescription}</p>
          <p>Funds will arrive in your bank account within 2-3 business days.</p>
          <p>Thank you for being part of Estate Standard!</p>
        `,
      },

      [NotificationType.PAYMENT_FAILED]: {
        subject: 'Payment Failed - Action Required',
        html: `
          <h2>Hi ${firstName},</h2>
          <p>We were unable to process your payment.</p>
          <p><strong>Reason:</strong> ${data.reason}</p>
          <p>Please update your payment method in the app to complete your appointment booking.</p>
        `,
      },

      // Default template for other types
      [NotificationType.APPOINTMENT_REQUESTED]: {
        subject: 'Service Request Received',
        html: `<h2>Hi ${firstName},</h2><p>We've received your service request and are matching you with qualified vendors.</p>`,
      },
      [NotificationType.APPOINTMENT_REMINDER]: {
        subject: 'Appointment Reminder',
        html: `<h2>Hi ${firstName},</h2><p>Your appointment with ${data.vendorName} is tomorrow at ${data.time}.</p>`,
      },
      [NotificationType.APPOINTMENT_CANCELLED]: {
        subject: 'Appointment Cancelled',
        html: `<h2>Hi ${firstName},</h2><p>Your appointment has been cancelled.</p>`,
      },
      [NotificationType.JOB_STARTED]: {
        subject: 'Job Started',
        html: `<h2>Hi ${firstName},</h2><p>${data.vendorName} has started working on your service.</p>`,
      },
      [NotificationType.JOB_AUTO_CONFIRMED]: {
        subject: 'Job Auto-Confirmed',
        html: `<h2>Hi ${firstName},</h2><p>Your job has been auto-confirmed and payment processed.</p>`,
      },
      [NotificationType.PAYMENT_AUTHORIZED]: {
        subject: 'Payment Authorized',
        html: `<h2>Hi ${firstName},</h2><p>Payment of $${data.amount} has been authorized.</p>`,
      },
      [NotificationType.PAYMENT_CAPTURED]: {
        subject: 'Payment Processed',
        html: `<h2>Hi ${firstName},</h2><p>Payment of $${data.amount} has been processed.</p>`,
      },
      [NotificationType.SERVICE_REQUEST_RECEIVED]: {
        subject: 'Service Request Received',
        html: `<h2>Hi ${firstName},</h2><p>We've received your request.</p>`,
      },
      [NotificationType.VENDOR_MATCHED]: {
        subject: 'Vendors Found',
        html: `<h2>Hi ${firstName},</h2><p>We've found ${data.vendorCount} vendors.</p>`,
      },
      [NotificationType.DISPUTE_RAISED]: {
        subject: 'Dispute Raised',
        html: `<h2>Hi ${firstName},</h2><p>A dispute has been raised.</p>`,
      },
      [NotificationType.DISPUTE_RESOLVED]: {
        subject: 'Dispute Resolved',
        html: `<h2>Hi ${firstName},</h2><p>Your dispute has been resolved.</p>`,
      },
    };

    return templates[type];
  }

  /**
   * Send appointment reminder (called by background worker)
   */
  static async sendAppointmentReminder(appointmentId: string): Promise<void> {
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

    if (!appointment) return;

    // Send reminder to homeowner
    await this.send(
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
  }

  /**
   * Send job completion notification
   */
  static async sendJobCompletionNotification(appointmentId: string): Promise<void> {
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

    if (!appointment) return;

    await this.send(
      NotificationType.JOB_COMPLETED,
      {
        userId: appointment.homeowner.userId,
        email: appointment.homeowner.user.email,
        phone: appointment.homeowner.user.phone || undefined,
        firstName: appointment.homeowner.user.firstName,
        lastName: appointment.homeowner.user.lastName,
      },
      {
        vendorName: appointment.vendor.businessName,
        appointmentId: appointment.id,
      }
    );
  }

  /**
   * Send payout released notification
   */
  static async sendPayoutReleasedNotification(
    appointmentId: string,
    amount: number
  ): Promise<void> {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        vendor: {
          include: { user: true },
        },
      },
    });

    if (!appointment) return;

    await this.send(
      NotificationType.PAYOUT_RELEASED,
      {
        userId: appointment.vendor.userId,
        email: appointment.vendor.user.email,
        phone: appointment.vendor.user.phone || undefined,
        firstName: appointment.vendor.user.firstName,
        lastName: appointment.vendor.user.lastName,
      },
      {
        amount: amount.toFixed(2),
        jobDescription: `Job #${appointment.id}`,
      }
    );
  }
}

export default NotificationService;
