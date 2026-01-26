-- Estate Standard - Idempotency & Enhanced Tracking Migration
-- This migration adds idempotency protection and enhanced payment/appointment tracking
-- Run with: psql -d estate_standard -f migrations/add_idempotency_and_enhanced_tracking.sql

-- ============================================================================
-- ENUMS
-- ============================================================================

-- Create VendorPayoutStatus enum
DO $$ BEGIN
    CREATE TYPE "VendorPayoutStatus" AS ENUM ('PENDING', 'PROCESSING', 'RELEASED', 'FAILED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create PayoutStatus enum
DO $$ BEGIN
    CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'PROCESSING', 'RELEASED', 'FAILED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- IDEMPOTENCY KEY TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS "IdempotencyKey" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "userId" TEXT,
    "endpoint" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "statusCode" INTEGER,
    "response" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- Create unique index for idempotency key lookup
CREATE UNIQUE INDEX IF NOT EXISTS "IdempotencyKey_key_key" ON "IdempotencyKey"("key");

-- Add foreign key constraint to User
ALTER TABLE "IdempotencyKey" DROP CONSTRAINT IF EXISTS "IdempotencyKey_userId_fkey";
ALTER TABLE "IdempotencyKey" ADD CONSTRAINT "IdempotencyKey_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Indexes for idempotency key queries
CREATE INDEX IF NOT EXISTS "IdempotencyKey_userId_idx" ON "IdempotencyKey"("userId");
CREATE INDEX IF NOT EXISTS "IdempotencyKey_expiresAt_idx" ON "IdempotencyKey"("expiresAt");
CREATE INDEX IF NOT EXISTS "IdempotencyKey_createdAt_idx" ON "IdempotencyKey"("createdAt");

-- ============================================================================
-- PAYMENT TABLE ENHANCEMENTS
-- ============================================================================

-- Add platform fee and vendor payout tracking
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "platformFee" DOUBLE PRECISION;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "vendorPayoutAmount" DOUBLE PRECISION;

-- Add payment lifecycle timestamps
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "authorizedAt" TIMESTAMP(3);
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "capturedAt" TIMESTAMP(3);
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "failedAt" TIMESTAMP(3);
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "failureReason" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "refundedAt" TIMESTAMP(3);

-- Add vendor payout status tracking
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "vendorPayoutStatus" "VendorPayoutStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "vendorPayoutReleasedAt" TIMESTAMP(3);

-- Indexes for payment queries
CREATE INDEX IF NOT EXISTS "Payment_vendorPayoutStatus_idx" ON "Payment"("vendorPayoutStatus");
CREATE INDEX IF NOT EXISTS "Payment_capturedAt_idx" ON "Payment"("capturedAt");
CREATE INDEX IF NOT EXISTS "Payment_authorizedAt_idx" ON "Payment"("authorizedAt");

-- ============================================================================
-- APPOINTMENT TABLE ENHANCEMENTS
-- ============================================================================

-- Add completion tracking
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "autoConfirmed" BOOLEAN NOT NULL DEFAULT false;

-- Add state history for audit trail (JSONB array)
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "stateHistory" JSONB[] DEFAULT ARRAY[]::JSONB[];

-- Indexes for appointment queries
CREATE INDEX IF NOT EXISTS "Appointment_completedAt_idx" ON "Appointment"("completedAt");
CREATE INDEX IF NOT EXISTS "Appointment_autoConfirmed_idx" ON "Appointment"("autoConfirmed") WHERE "autoConfirmed" = true;

-- ============================================================================
-- JOBLEGER TABLE ENHANCEMENTS
-- ============================================================================

-- Add payout status tracking
ALTER TABLE "JobLedger" ADD COLUMN IF NOT EXISTS "payoutStatus" "PayoutStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "JobLedger" ADD COLUMN IF NOT EXISTS "payoutReleasedAt" TIMESTAMP(3);
ALTER TABLE "JobLedger" ADD COLUMN IF NOT EXISTS "payoutFailureReason" TEXT;

-- Indexes for job ledger queries
CREATE INDEX IF NOT EXISTS "JobLedger_payoutStatus_idx" ON "JobLedger"("payoutStatus");
CREATE INDEX IF NOT EXISTS "JobLedger_payoutReleasedAt_idx" ON "JobLedger"("payoutReleasedAt");

-- ============================================================================
-- VENDOR TABLE ENHANCEMENTS
-- ============================================================================

-- Add Stripe Connect onboarding status
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "stripeOnboardingComplete" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "stripeChargesEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "stripePayoutsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Indexes for vendor queries
CREATE INDEX IF NOT EXISTS "Vendor_stripeOnboardingComplete_idx" ON "Vendor"("stripeOnboardingComplete");
CREATE INDEX IF NOT EXISTS "Vendor_stripeAccountId_idx" ON "Vendor"("stripeAccountId") WHERE "stripeAccountId" IS NOT NULL;

-- ============================================================================
-- CLEANUP FUNCTIONS
-- ============================================================================

-- Function to cleanup expired idempotency keys (run daily via cron)
CREATE OR REPLACE FUNCTION cleanup_expired_idempotency_keys() RETURNS void AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM "IdempotencyKey"
    WHERE "expiresAt" < NOW();

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % expired idempotency keys', deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- MIGRATION VERIFICATION
-- ============================================================================

-- Verify IdempotencyKey table exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_name = 'IdempotencyKey'
    ) THEN
        RAISE EXCEPTION 'Migration incomplete. IdempotencyKey table not created';
    ELSE
        RAISE NOTICE '✅ IdempotencyKey table created successfully';
    END IF;
END $$;

-- Verify Payment columns were added
DO $$
DECLARE
    missing_columns TEXT[];
BEGIN
    SELECT ARRAY_AGG(c.column_name)
    INTO missing_columns
    FROM (
        VALUES
            ('platformFee'),
            ('vendorPayoutAmount'),
            ('authorizedAt'),
            ('capturedAt'),
            ('failedAt'),
            ('failureReason'),
            ('refundedAt'),
            ('vendorPayoutStatus'),
            ('vendorPayoutReleasedAt')
    ) AS expected(column_name)
    WHERE NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'Payment'
        AND column_name = expected.column_name
    );

    IF missing_columns IS NOT NULL THEN
        RAISE EXCEPTION 'Migration incomplete. Missing Payment columns: %', array_to_string(missing_columns, ', ');
    ELSE
        RAISE NOTICE '✅ All Payment columns added successfully';
    END IF;
END $$;

-- Verify Appointment columns were added
DO $$
DECLARE
    missing_columns TEXT[];
BEGIN
    SELECT ARRAY_AGG(c.column_name)
    INTO missing_columns
    FROM (
        VALUES
            ('completedAt'),
            ('autoConfirmed'),
            ('stateHistory')
    ) AS expected(column_name)
    WHERE NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'Appointment'
        AND column_name = expected.column_name
    );

    IF missing_columns IS NOT NULL THEN
        RAISE EXCEPTION 'Migration incomplete. Missing Appointment columns: %', array_to_string(missing_columns, ', ');
    ELSE
        RAISE NOTICE '✅ All Appointment columns added successfully';
    END IF;
END $$;

-- Verify JobLedger columns were added
DO $$
DECLARE
    missing_columns TEXT[];
BEGIN
    SELECT ARRAY_AGG(c.column_name)
    INTO missing_columns
    FROM (
        VALUES
            ('payoutStatus'),
            ('payoutReleasedAt'),
            ('payoutFailureReason')
    ) AS expected(column_name)
    WHERE NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'JobLedger'
        AND column_name = expected.column_name
    );

    IF missing_columns IS NOT NULL THEN
        RAISE EXCEPTION 'Migration incomplete. Missing JobLedger columns: %', array_to_string(missing_columns, ', ');
    ELSE
        RAISE NOTICE '✅ All JobLedger columns added successfully';
    END IF;
END $$;

-- Verify Vendor columns were added
DO $$
DECLARE
    missing_columns TEXT[];
BEGIN
    SELECT ARRAY_AGG(c.column_name)
    INTO missing_columns
    FROM (
        VALUES
            ('stripeOnboardingComplete'),
            ('stripeChargesEnabled'),
            ('stripePayoutsEnabled')
    ) AS expected(column_name)
    WHERE NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'Vendor'
        AND column_name = expected.column_name
    );

    IF missing_columns IS NOT NULL THEN
        RAISE EXCEPTION 'Migration incomplete. Missing Vendor columns: %', array_to_string(missing_columns, ', ');
    ELSE
        RAISE NOTICE '✅ All Vendor columns added successfully';
    END IF;
END $$;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

DO $$ BEGIN
    RAISE NOTICE '
═══════════════════════════════════════════════════
  Estate Standard - Enhanced Tracking Migration
═══════════════════════════════════════════════════
  ✓ IdempotencyKey table created
  ✓ VendorPayoutStatus enum created
  ✓ PayoutStatus enum created
  ✓ Payment lifecycle tracking added
  ✓ Appointment completion tracking added
  ✓ JobLedger payout tracking added
  ✓ Vendor Stripe onboarding status added
  ✓ Indexes created for performance
  ✓ Cleanup function created
═══════════════════════════════════════════════════
  Next Steps:
  1. Update Prisma client: npx prisma generate
  2. Restart server
  3. Test idempotency with duplicate requests
  4. Verify payment lifecycle tracking
═══════════════════════════════════════════════════
';
END $$;
