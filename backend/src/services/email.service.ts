// Estate Standard - Email Service
// SendGrid integration for transactional emails

import sgMail from '@sendgrid/mail';
import { logger } from '../utils/logger';

// Initialize SendGrid
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(options: EmailOptions): Promise<void> {
  try {
    // In development, just log the email
    if (process.env.NODE_ENV === 'development' && !process.env.SENDGRID_API_KEY) {
      logger.info('📧 Email (dev mode - not sent):', {
        to: options.to,
        subject: options.subject,
        preview: options.html.substring(0, 100)
      });
      return;
    }

    const msg = {
      to: options.to,
      from: {
        email: process.env.SENDGRID_FROM_EMAIL || 'concierge@estatestandard.com',
        name: process.env.SENDGRID_FROM_NAME || 'Estate Standard'
      },
      subject: options.subject,
      html: options.html,
      text: options.text || stripHtml(options.html)
    };

    await sgMail.send(msg);

    logger.info('✅ Email sent successfully', {
      to: options.to,
      subject: options.subject
    });
  } catch (error: any) {
    logger.error('❌ Failed to send email', {
      error: error.message,
      to: options.to,
      subject: options.subject
    });

    // Don't throw error - email failures shouldn't break the request
    // Log and alert monitoring system instead
  }
}

// Helper to strip HTML for plain text version
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

// Template helpers for common emails
export const emailTemplates = {
  welcome: (name: string) => ({
    subject: 'Welcome to Estate Standard',
    html: `
      <h1>Welcome, ${name}!</h1>
      <p>Thank you for joining Estate Standard, the standard of home maintenance.</p>
      <p>We're here to remove the mental load of home ownership and make your home just work.</p>
    `
  }),

  appointmentConfirmation: (vendorName: string, date: string, time: string) => ({
    subject: 'Appointment Confirmed',
    html: `
      <h2>Your appointment is confirmed</h2>
      <p><strong>Vendor:</strong> ${vendorName}</p>
      <p><strong>Date:</strong> ${date}</p>
      <p><strong>Time:</strong> ${time}</p>
      <p>We'll remind you before the appointment.</p>
    `
  }),

  appointmentReminder: (vendorName: string, date: string, time: string) => ({
    subject: 'Appointment Reminder - Tomorrow',
    html: `
      <h2>Reminder: Appointment Tomorrow</h2>
      <p><strong>Vendor:</strong> ${vendorName}</p>
      <p><strong>Time:</strong> ${time}</p>
      <p>Everything is on schedule.</p>
    `
  }),

  jobCompleted: (vendorName: string, category: string) => ({
    subject: 'Service Completed',
    html: `
      <h2>Service completed</h2>
      <p>${vendorName} has completed your ${category} service.</p>
      <p>Please review and confirm the work in your Estate Standard app.</p>
    `
  })
};
