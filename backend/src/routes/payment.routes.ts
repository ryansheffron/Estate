// Estate Standard - Payment Routes

import { Router } from 'express';
import * as paymentController from '../controllers/payment.controller';
import { authenticate, requireRole } from '../middleware/auth';
import idempotencyMiddleware from '../middleware/idempotency';

const router = Router();

// Stripe webhook (public, verified by Stripe signature)
// NOTE: No idempotency needed - Stripe handles webhook retries safely
router.post('/webhook', paymentController.stripeWebhook);

// Authenticated routes
router.use(authenticate);

// Homeowner routes - CREATE PAYMENT INTENT (requires idempotency)
router.post(
  '/create-intent',
  requireRole('HOMEOWNER'),
  idempotencyMiddleware,
  paymentController.createPaymentIntent
);
router.get('/history', requireRole('HOMEOWNER'), paymentController.getPaymentHistory);

// Admin routes - CAPTURE & REFUND (require idempotency)
router.post(
  '/:paymentIntentId/capture',
  requireRole('ADMIN'),
  idempotencyMiddleware,
  paymentController.capturePayment
);
router.post(
  '/:paymentIntentId/refund',
  requireRole('ADMIN'),
  idempotencyMiddleware,
  paymentController.refundPayment
);

// Vendor routes
router.get('/payouts', requireRole('VENDOR'), paymentController.getPayouts);
router.post(
  '/vendor/connect-account',
  requireRole('VENDOR'),
  idempotencyMiddleware,
  paymentController.createVendorConnectAccount
);
router.get(
  '/vendor/onboarding-link',
  requireRole('VENDOR'),
  paymentController.getVendorOnboardingLink
);
router.get(
  '/vendor/dashboard-link',
  requireRole('VENDOR'),
  paymentController.getVendorDashboardLink
);

export default router;
