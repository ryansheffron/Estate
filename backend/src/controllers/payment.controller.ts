// Estate Standard - Payment Controller
// Handles Stripe payments, payouts, and webhook events

import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../server';
import { AppError } from '../middleware/errorHandler';
import StripeService from '../services/stripe.service';

/**
 * Create payment intent for appointment
 * POST /api/payments/create-intent
 */
export const createPaymentIntent = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { appointmentId, amount } = req.body;

    if (!appointmentId || !amount) {
      throw new AppError('Appointment ID and amount required', 400);
    }

    // Get homeowner
    const homeowner = await prisma.homeowner.findUnique({
      where: { userId: req.user!.id },
    });

    if (!homeowner) {
      throw new AppError('Homeowner profile not found', 404);
    }

    // Get appointment
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        vendor: true,
      },
    });

    if (!appointment) {
      throw new AppError('Appointment not found', 404);
    }

    if (appointment.homeownerId !== homeowner.id) {
      throw new AppError('Unauthorized', 403);
    }

    // Verify vendor has completed Stripe onboarding
    if (!appointment.vendor.stripeAccountId) {
      throw new AppError('Vendor payment account not set up', 400);
    }

    const canReceivePayouts = await StripeService.canReceivePayouts(
      appointment.vendor.stripeAccountId
    );

    if (!canReceivePayouts) {
      throw new AppError('Vendor cannot receive payouts yet', 400);
    }

    // Create payment intent
    const { clientSecret, paymentIntentId } = await StripeService.createPaymentIntent(
      appointmentId,
      amount,
      homeowner.id,
      appointment.vendor.stripeAccountId
    );

    res.json({
      status: 'success',
      data: {
        clientSecret,
        paymentIntentId,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Capture payment after job completion
 * POST /api/payments/:paymentIntentId/capture
 */
export const capturePayment = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { paymentIntentId } = req.params;

    // Verify admin or system
    if (req.user!.role !== 'ADMIN') {
      throw new AppError('Unauthorized', 403);
    }

    await StripeService.capturePayment(paymentIntentId);

    res.json({
      status: 'success',
      message: 'Payment captured successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Refund payment
 * POST /api/payments/:paymentIntentId/refund
 */
export const refundPayment = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { paymentIntentId } = req.params;
    const { reason } = req.body;

    // Verify admin
    if (req.user!.role !== 'ADMIN') {
      throw new AppError('Unauthorized', 403);
    }

    const refundId = await StripeService.refundPayment(paymentIntentId, reason);

    res.json({
      status: 'success',
      data: { refundId },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get payment history for homeowner
 * GET /api/payments
 */
export const getPaymentHistory = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const homeowner = await prisma.homeowner.findUnique({
      where: { userId: req.user!.id },
    });

    if (!homeowner) {
      throw new AppError('Homeowner profile not found', 404);
    }

    const payments = await prisma.payment.findMany({
      where: { homeownerId: homeowner.id },
      include: {
        appointment: {
          include: {
            vendor: {
              include: {
                user: {
                  select: {
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      status: 'success',
      data: { payments },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get vendor payouts
 * GET /api/payments/payouts
 */
export const getPayouts = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const vendor = await prisma.vendor.findUnique({
      where: { userId: req.user!.id },
    });

    if (!vendor) {
      throw new AppError('Vendor profile not found', 404);
    }

    const payouts = await prisma.payment.findMany({
      where: {
        appointment: {
          vendorId: vendor.id,
        },
        vendorPayoutStatus: 'RELEASED',
      },
      include: {
        appointment: {
          include: {
            homeowner: {
              include: {
                user: {
                  select: {
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { vendorPayoutReleasedAt: 'desc' },
    });

    res.json({
      status: 'success',
      data: { payouts },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create Stripe Connect account for vendor
 * POST /api/payments/vendor/connect-account
 */
export const createVendorConnectAccount = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const vendor = await prisma.vendor.findUnique({
      where: { userId: req.user!.id },
      include: {
        user: true,
      },
    });

    if (!vendor) {
      throw new AppError('Vendor profile not found', 404);
    }

    if (vendor.stripeAccountId) {
      throw new AppError('Stripe account already exists', 400);
    }

    const stripeAccountId = await StripeService.createConnectAccount(
      vendor.id,
      vendor.user.email,
      vendor.businessName
    );

    res.json({
      status: 'success',
      data: { stripeAccountId },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Stripe onboarding link for vendor
 * GET /api/payments/vendor/onboarding-link
 */
export const getVendorOnboardingLink = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const vendor = await prisma.vendor.findUnique({
      where: { userId: req.user!.id },
    });

    if (!vendor || !vendor.stripeAccountId) {
      throw new AppError('Stripe account not found', 404);
    }

    const refreshUrl = `${process.env.FRONTEND_URL}/vendor/settings/payments`;
    const returnUrl = `${process.env.FRONTEND_URL}/vendor/settings/payments/success`;

    const onboardingLink = await StripeService.createAccountLink(
      vendor.stripeAccountId,
      refreshUrl,
      returnUrl
    );

    res.json({
      status: 'success',
      data: { url: onboardingLink },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Stripe dashboard link for vendor
 * GET /api/payments/vendor/dashboard-link
 */
export const getVendorDashboardLink = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const vendor = await prisma.vendor.findUnique({
      where: { userId: req.user!.id },
    });

    if (!vendor || !vendor.stripeAccountId) {
      throw new AppError('Stripe account not found', 404);
    }

    const dashboardLink = await StripeService.createLoginLink(vendor.stripeAccountId);

    res.json({
      status: 'success',
      data: { url: dashboardLink },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Stripe webhook endpoint
 * POST /api/payments/webhook
 *
 * CRITICAL: This endpoint MUST verify webhook signature to prevent spoofing
 * Raw body required - middleware should not parse as JSON
 */
export const stripeWebhook = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const signature = req.headers['stripe-signature'];

    if (!signature || typeof signature !== 'string') {
      throw new AppError('Missing Stripe signature', 400);
    }

    // Verify webhook signature (CRITICAL FOR SECURITY)
    const event = StripeService.verifyWebhookSignature(
      req.body, // Must be raw body buffer
      signature
    );

    // Handle the verified event
    await StripeService.handleWebhookEvent(event);

    // Return 200 to acknowledge receipt
    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);

    if (error instanceof AppError && error.statusCode === 401) {
      // Invalid signature - reject immediately
      res.status(401).json({ error: 'Invalid signature' });
    } else {
      next(error);
    }
  }
};

export default {
  createPaymentIntent,
  capturePayment,
  refundPayment,
  getPaymentHistory,
  getPayouts,
  createVendorConnectAccount,
  getVendorOnboardingLink,
  getVendorDashboardLink,
  stripeWebhook,
};
