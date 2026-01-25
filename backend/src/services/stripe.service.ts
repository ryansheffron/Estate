// Estate Standard - Stripe Connect Service
// Handles payment processing, vendor payouts, and Connect account management

import Stripe from 'stripe';
import { prisma } from '../server';
import { AppError } from '../middleware/errorHandler';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-11-20.acacia',
  typescript: true,
});

export class StripeService {
  /**
   * Create a Stripe Connect account for a vendor
   * @param vendorId Vendor database ID
   * @param email Vendor email
   * @param businessName Vendor business name
   * @returns Stripe account ID
   */
  static async createConnectAccount(
    vendorId: string,
    email: string,
    businessName: string
  ): Promise<string> {
    try {
      const account = await stripe.accounts.create({
        type: 'express', // Express Connect for faster onboarding
        country: 'US',
        email,
        business_type: 'individual', // Can be 'company' for businesses
        capabilities: {
          transfers: { requested: true },
          card_payments: { requested: true },
        },
        business_profile: {
          name: businessName,
          product_description: 'Home maintenance and repair services',
        },
        metadata: {
          vendorId,
          platform: 'estate-standard',
        },
      });

      // Save Stripe account ID to database
      await prisma.vendor.update({
        where: { id: vendorId },
        data: {
          stripeAccountId: account.id,
          stripeOnboardingComplete: false,
        },
      });

      return account.id;
    } catch (error) {
      console.error('Failed to create Stripe Connect account:', error);
      throw new AppError('Failed to create payment account', 500);
    }
  }

  /**
   * Generate onboarding link for vendor to complete Stripe setup
   * @param stripeAccountId Vendor's Stripe account ID
   * @param refreshUrl URL to return to if user refreshes
   * @param returnUrl URL to return to after completion
   * @returns Onboarding link URL
   */
  static async createAccountLink(
    stripeAccountId: string,
    refreshUrl: string,
    returnUrl: string
  ): Promise<string> {
    try {
      const accountLink = await stripe.accountLinks.create({
        account: stripeAccountId,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: 'account_onboarding',
      });

      return accountLink.url;
    } catch (error) {
      console.error('Failed to create account link:', error);
      throw new AppError('Failed to generate onboarding link', 500);
    }
  }

  /**
   * Create a payment intent for homeowner payment
   * @param appointmentId Appointment ID
   * @param amount Amount in cents
   * @param homeownerId Homeowner ID
   * @param vendorStripeAccountId Vendor's Stripe Connect account ID
   * @returns Payment intent client secret
   */
  static async createPaymentIntent(
    appointmentId: string,
    amount: number,
    homeownerId: string,
    vendorStripeAccountId: string
  ): Promise<{ clientSecret: string; paymentIntentId: string }> {
    try {
      // Platform fee: 15% of total (configurable)
      const platformFeePercent = 0.15;
      const platformFee = Math.round(amount * platformFeePercent);
      const vendorAmount = amount - platformFee;

      const paymentIntent = await stripe.paymentIntents.create({
        amount,
        currency: 'usd',
        application_fee_amount: platformFee,
        transfer_data: {
          destination: vendorStripeAccountId,
        },
        metadata: {
          appointmentId,
          homeownerId,
          platformFee: platformFee.toString(),
          vendorAmount: vendorAmount.toString(),
        },
        // Hold funds until job completion
        capture_method: 'manual', // Requires explicit capture after job confirmed
        description: `Estate Standard - Appointment ${appointmentId}`,
      });

      // Record payment in database
      await prisma.payment.create({
        data: {
          appointmentId,
          homeownerId,
          amount,
          platformFee,
          vendorPayoutAmount: vendorAmount,
          stripePaymentIntentId: paymentIntent.id,
          status: 'PENDING',
        },
      });

      return {
        clientSecret: paymentIntent.client_secret!,
        paymentIntentId: paymentIntent.id,
      };
    } catch (error) {
      console.error('Failed to create payment intent:', error);
      throw new AppError('Failed to process payment', 500);
    }
  }

  /**
   * Capture payment after job completion is confirmed
   * @param paymentIntentId Stripe payment intent ID
   * @returns Captured payment intent
   */
  static async capturePayment(paymentIntentId: string): Promise<void> {
    try {
      const paymentIntent = await stripe.paymentIntents.capture(paymentIntentId);

      // Update payment record
      await prisma.payment.update({
        where: { stripePaymentIntentId: paymentIntentId },
        data: {
          status: 'COMPLETED',
          capturedAt: new Date(),
        },
      });

      console.log(`Payment captured: ${paymentIntent.id}`);
    } catch (error) {
      console.error('Failed to capture payment:', error);
      throw new AppError('Failed to capture payment', 500);
    }
  }

  /**
   * Refund payment if job is disputed or cancelled
   * @param paymentIntentId Stripe payment intent ID
   * @param reason Refund reason
   * @returns Refund ID
   */
  static async refundPayment(
    paymentIntentId: string,
    reason?: string
  ): Promise<string> {
    try {
      const refund = await stripe.refunds.create({
        payment_intent: paymentIntentId,
        reason: 'requested_by_customer',
        metadata: {
          reason: reason || 'Job disputed or cancelled',
        },
      });

      // Update payment record
      await prisma.payment.update({
        where: { stripePaymentIntentId: paymentIntentId },
        data: {
          status: 'REFUNDED',
          refundedAt: new Date(),
        },
      });

      return refund.id;
    } catch (error) {
      console.error('Failed to refund payment:', error);
      throw new AppError('Failed to process refund', 500);
    }
  }

  /**
   * Release payout to vendor after homeowner confirmation
   * Funds are automatically transferred via Stripe Connect
   * @param appointmentId Appointment ID
   */
  static async releaseVendorPayout(appointmentId: string): Promise<void> {
    try {
      const payment = await prisma.payment.findUnique({
        where: { appointmentId },
      });

      if (!payment) {
        throw new AppError('Payment record not found', 404);
      }

      if (payment.status !== 'COMPLETED') {
        throw new AppError('Payment must be captured before releasing payout', 400);
      }

      // With Stripe Connect destination charges, payout happens automatically
      // when payment is captured. This just updates our records.
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          vendorPayoutStatus: 'RELEASED',
          vendorPayoutReleasedAt: new Date(),
        },
      });

      // Update job ledger
      await prisma.jobLedger.updateMany({
        where: { appointmentId },
        data: {
          payoutStatus: 'RELEASED',
          payoutReleasedAt: new Date(),
        },
      });

      console.log(`Payout released for appointment: ${appointmentId}`);
    } catch (error) {
      console.error('Failed to release payout:', error);
      throw new AppError('Failed to release payout', 500);
    }
  }

  /**
   * Verify webhook signature from Stripe
   * CRITICAL FOR SECURITY - prevents webhook spoofing
   * @param payload Raw request body
   * @param signature Stripe signature header
   * @returns Verified webhook event
   */
  static verifyWebhookSignature(
    payload: string | Buffer,
    signature: string
  ): Stripe.Event {
    try {
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

      return stripe.webhooks.constructEvent(
        payload,
        signature,
        webhookSecret
      );
    } catch (error) {
      console.error('Webhook signature verification failed:', error);
      throw new AppError('Invalid webhook signature', 401);
    }
  }

  /**
   * Handle Stripe webhook events
   * @param event Verified Stripe webhook event
   */
  static async handleWebhookEvent(event: Stripe.Event): Promise<void> {
    console.log(`Processing webhook: ${event.type}`);

    switch (event.type) {
      case 'payment_intent.succeeded':
        await this.handlePaymentSucceeded(event.data.object as Stripe.PaymentIntent);
        break;

      case 'payment_intent.payment_failed':
        await this.handlePaymentFailed(event.data.object as Stripe.PaymentIntent);
        break;

      case 'account.updated':
        await this.handleAccountUpdated(event.data.object as Stripe.Account);
        break;

      case 'charge.refunded':
        await this.handleChargeRefunded(event.data.object as Stripe.Charge);
        break;

      default:
        console.log(`Unhandled webhook type: ${event.type}`);
    }
  }

  /**
   * Handle successful payment
   */
  private static async handlePaymentSucceeded(
    paymentIntent: Stripe.PaymentIntent
  ): Promise<void> {
    await prisma.payment.update({
      where: { stripePaymentIntentId: paymentIntent.id },
      data: {
        status: 'AUTHORIZED',
        authorizedAt: new Date(),
      },
    });
  }

  /**
   * Handle failed payment
   */
  private static async handlePaymentFailed(
    paymentIntent: Stripe.PaymentIntent
  ): Promise<void> {
    await prisma.payment.update({
      where: { stripePaymentIntentId: paymentIntent.id },
      data: {
        status: 'FAILED',
        failedAt: new Date(),
        failureReason: paymentIntent.last_payment_error?.message || 'Unknown error',
      },
    });

    // Notify homeowner and vendor of payment failure
    // TODO: Send notification
  }

  /**
   * Handle Stripe account updates (onboarding completion, etc.)
   */
  private static async handleAccountUpdated(
    account: Stripe.Account
  ): Promise<void> {
    const vendorId = account.metadata.vendorId;

    if (!vendorId) return;

    const onboardingComplete = account.charges_enabled && account.payouts_enabled;

    await prisma.vendor.update({
      where: { id: vendorId },
      data: {
        stripeOnboardingComplete: onboardingComplete,
      },
    });
  }

  /**
   * Handle charge refunds
   */
  private static async handleChargeRefunded(
    charge: Stripe.Charge
  ): Promise<void> {
    if (charge.payment_intent) {
      await prisma.payment.update({
        where: { stripePaymentIntentId: charge.payment_intent as string },
        data: {
          status: 'REFUNDED',
          refundedAt: new Date(),
        },
      });
    }
  }

  /**
   * Get vendor's Stripe dashboard login link
   * @param stripeAccountId Vendor's Stripe account ID
   * @returns Login link URL
   */
  static async createLoginLink(stripeAccountId: string): Promise<string> {
    try {
      const loginLink = await stripe.accounts.createLoginLink(stripeAccountId);
      return loginLink.url;
    } catch (error) {
      console.error('Failed to create login link:', error);
      throw new AppError('Failed to generate dashboard link', 500);
    }
  }

  /**
   * Check if vendor can receive payouts
   * @param stripeAccountId Vendor's Stripe account ID
   * @returns true if vendor can receive payouts
   */
  static async canReceivePayouts(stripeAccountId: string): Promise<boolean> {
    try {
      const account = await stripe.accounts.retrieve(stripeAccountId);
      return account.charges_enabled && account.payouts_enabled;
    } catch (error) {
      console.error('Failed to check account status:', error);
      return false;
    }
  }
}

export default StripeService;
