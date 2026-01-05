// Estate Standard - Payment Routes

import { Router } from 'express';
import * as paymentController from '../controllers/payment.controller';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

// Stripe webhook (public, verified by Stripe signature)
router.post('/webhook', paymentController.stripeWebhook);

// Authenticated routes
router.use(authenticate);

// Homeowner routes
router.post('/intent', requireRole('HOMEOWNER'), paymentController.createPaymentIntent);
router.get('/history', requireRole('HOMEOWNER'), paymentController.getPaymentHistory);

// Vendor routes
router.get('/payouts', requireRole('VENDOR'), paymentController.getPayouts);

export default router;
