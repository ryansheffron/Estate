-- Estate Standard - Service Fee Agreement & Estate Standard Rating Migration
-- This migration adds:
-- 1. Service fee agreement workflow (both parties must agree after appointment confirmed)
-- 2. Invoice verification (upload + amount must match)
-- 3. Completion confirmation from both customer and vendor
-- 4. Estate Standard Rating system with specific questions

-- ============================================================================
-- ENUMS
-- ============================================================================

-- Create CompletionOutcome enum
DO $$ BEGIN
    CREATE TYPE "CompletionOutcome" AS ENUM ('ISSUE_FIXED', 'RETURN_TRIP_NEEDED', 'SERVICE_NOT_AGREED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- APPOINTMENT TABLE ENHANCEMENTS
-- ============================================================================

-- Service fee agreement (after appointment confirmed, before work starts)
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "agreedServiceFee" DOUBLE PRECISION;
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "serviceFeeAgreedAt" TIMESTAMP(3);
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "serviceFeeAgreedByHomeowner" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "serviceFeeAgreedByVendor" BOOLEAN NOT NULL DEFAULT false;

-- Invoice verification (amount must match uploaded invoice)
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "invoiceAmount" DOUBLE PRECISION;

-- Completion confirmation from vendor
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "vendorCompletionOutcome" "CompletionOutcome";
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "vendorCompletionConfirmedAt" TIMESTAMP(3);
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "vendorCompletionNotes" TEXT;

-- Completion confirmation from homeowner
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "homeownerCompletionOutcome" "CompletionOutcome";
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "homeownerCompletionConfirmedAt" TIMESTAMP(3);
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "homeownerCompletionNotes" TEXT;

-- Indexes for appointment queries
CREATE INDEX IF NOT EXISTS "appointments_agreedServiceFee_idx" ON "appointments"("agreedServiceFee") WHERE "agreedServiceFee" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "appointments_serviceFeeAgreedAt_idx" ON "appointments"("serviceFeeAgreedAt");
CREATE INDEX IF NOT EXISTS "appointments_vendorCompletionConfirmedAt_idx" ON "appointments"("vendorCompletionConfirmedAt");
CREATE INDEX IF NOT EXISTS "appointments_homeownerCompletionConfirmedAt_idx" ON "appointments"("homeownerCompletionConfirmedAt");

-- ============================================================================
-- VENDOR TABLE ENHANCEMENTS
-- ============================================================================

-- Add Estate Standard Rating tracking
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "estateStandardRating" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Index for Estate Standard Rating (for sorting/filtering vendors)
CREATE INDEX IF NOT EXISTS "vendors_estateStandardRating_idx" ON "vendors"("estateStandardRating");

-- ============================================================================
-- REVIEW TABLE ENHANCEMENTS
-- ============================================================================

-- Estate Standard Rating Questions (1-5, 1 being the least)
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "arrivalTimeRating" INTEGER;
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "informationProvidedRating" INTEGER;
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "workmanshipCleanlinessRating" INTEGER;

-- Calculated Estate Standard Rating (average of three questions)
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "estateStandardRating" DOUBLE PRECISION;

-- Index for Estate Standard Rating
CREATE INDEX IF NOT EXISTS "reviews_estateStandardRating_idx" ON "reviews"("estateStandardRating");

-- ============================================================================
-- VALIDATION CONSTRAINTS
-- ============================================================================

-- Ensure Estate Standard ratings are between 1 and 5
ALTER TABLE "reviews" DROP CONSTRAINT IF EXISTS "reviews_arrivalTimeRating_check";
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_arrivalTimeRating_check"
    CHECK ("arrivalTimeRating" IS NULL OR ("arrivalTimeRating" >= 1 AND "arrivalTimeRating" <= 5));

ALTER TABLE "reviews" DROP CONSTRAINT IF EXISTS "reviews_informationProvidedRating_check";
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_informationProvidedRating_check"
    CHECK ("informationProvidedRating" IS NULL OR ("informationProvidedRating" >= 1 AND "informationProvidedRating" <= 5));

ALTER TABLE "reviews" DROP CONSTRAINT IF EXISTS "reviews_workmanshipCleanlinessRating_check";
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_workmanshipCleanlinessRating_check"
    CHECK ("workmanshipCleanlinessRating" IS NULL OR ("workmanshipCleanlinessRating" >= 1 AND "workmanshipCleanlinessRating" <= 5));

-- Ensure Estate Standard Rating is between 1 and 5
ALTER TABLE "reviews" DROP CONSTRAINT IF EXISTS "reviews_estateStandardRating_check";
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_estateStandardRating_check"
    CHECK ("estateStandardRating" IS NULL OR ("estateStandardRating" >= 1.0 AND "estateStandardRating" <= 5.0));

-- Ensure Vendor Estate Standard Rating is between 0 and 5 (0 means no reviews yet)
ALTER TABLE "vendors" DROP CONSTRAINT IF EXISTS "vendors_estateStandardRating_check";
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_estateStandardRating_check"
    CHECK ("estateStandardRating" >= 0.0 AND "estateStandardRating" <= 5.0);

-- Ensure invoice amount matches uploaded invoice (both required or both null)
-- This is enforced at application layer, but we can add a check for positive amounts
ALTER TABLE "appointments" DROP CONSTRAINT IF EXISTS "appointments_invoiceAmount_check";
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_invoiceAmount_check"
    CHECK ("invoiceAmount" IS NULL OR "invoiceAmount" > 0);

-- Ensure agreed service fee is positive
ALTER TABLE "appointments" DROP CONSTRAINT IF EXISTS "appointments_agreedServiceFee_check";
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_agreedServiceFee_check"
    CHECK ("agreedServiceFee" IS NULL OR "agreedServiceFee" > 0);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to calculate Estate Standard Rating from three questions
CREATE OR REPLACE FUNCTION calculate_estate_standard_rating(
    arrival_time INT,
    information_provided INT,
    workmanship_cleanliness INT
) RETURNS DOUBLE PRECISION AS $$
BEGIN
    IF arrival_time IS NULL OR information_provided IS NULL OR workmanship_cleanliness IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN ROUND(
        (arrival_time + information_provided + workmanship_cleanliness)::NUMERIC / 3.0,
        2
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to update vendor Estate Standard Rating
CREATE OR REPLACE FUNCTION update_vendor_estate_standard_rating(vendor_id_param TEXT) RETURNS void AS $$
DECLARE
    avg_rating DOUBLE PRECISION;
BEGIN
    SELECT AVG("estateStandardRating")
    INTO avg_rating
    FROM "reviews"
    WHERE "vendorId" = vendor_id_param
    AND "estateStandardRating" IS NOT NULL;

    IF avg_rating IS NULL THEN
        avg_rating := 0;
    END IF;

    UPDATE "vendors"
    SET "estateStandardRating" = ROUND(avg_rating::NUMERIC, 2)
    WHERE "id" = vendor_id_param;

    RAISE NOTICE 'Updated Estate Standard Rating for vendor % to %', vendor_id_param, avg_rating;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically calculate Estate Standard Rating when review is created/updated
CREATE OR REPLACE FUNCTION trigger_calculate_estate_standard_rating() RETURNS TRIGGER AS $$
BEGIN
    NEW."estateStandardRating" := calculate_estate_standard_rating(
        NEW."arrivalTimeRating",
        NEW."informationProvidedRating",
        NEW."workmanshipCleanlinessRating"
    );

    -- Also update vendor's average Estate Standard Rating
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW."estateStandardRating" IS DISTINCT FROM OLD."estateStandardRating") THEN
        PERFORM update_vendor_estate_standard_rating(NEW."vendorId");
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS calculate_estate_standard_rating_trigger ON "reviews";
CREATE TRIGGER calculate_estate_standard_rating_trigger
    BEFORE INSERT OR UPDATE ON "reviews"
    FOR EACH ROW
    EXECUTE FUNCTION trigger_calculate_estate_standard_rating();

-- ============================================================================
-- MIGRATION VERIFICATION
-- ============================================================================

-- Verify Appointment columns were added
DO $$
DECLARE
    missing_columns TEXT[];
BEGIN
    SELECT ARRAY_AGG(c.column_name)
    INTO missing_columns
    FROM (
        VALUES
            ('agreedServiceFee'),
            ('serviceFeeAgreedAt'),
            ('serviceFeeAgreedByHomeowner'),
            ('serviceFeeAgreedByVendor'),
            ('invoiceAmount'),
            ('vendorCompletionOutcome'),
            ('vendorCompletionConfirmedAt'),
            ('vendorCompletionNotes'),
            ('homeownerCompletionOutcome'),
            ('homeownerCompletionConfirmedAt'),
            ('homeownerCompletionNotes')
    ) AS expected(column_name)
    WHERE NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'appointments'
        AND column_name = expected.column_name
    );

    IF missing_columns IS NOT NULL THEN
        RAISE EXCEPTION 'Migration incomplete. Missing Appointment columns: %', array_to_string(missing_columns, ', ');
    ELSE
        RAISE NOTICE '✅ All Appointment columns added successfully';
    END IF;
END $$;

-- Verify Vendor columns were added
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'vendors'
        AND column_name = 'estateStandardRating'
    ) THEN
        RAISE EXCEPTION 'Migration incomplete. Missing estateStandardRating column in vendors table';
    ELSE
        RAISE NOTICE '✅ Vendor estateStandardRating column added successfully';
    END IF;
END $$;

-- Verify Review columns were added
DO $$
DECLARE
    missing_columns TEXT[];
BEGIN
    SELECT ARRAY_AGG(c.column_name)
    INTO missing_columns
    FROM (
        VALUES
            ('arrivalTimeRating'),
            ('informationProvidedRating'),
            ('workmanshipCleanlinessRating'),
            ('estateStandardRating')
    ) AS expected(column_name)
    WHERE NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'reviews'
        AND column_name = expected.column_name
    );

    IF missing_columns IS NOT NULL THEN
        RAISE EXCEPTION 'Migration incomplete. Missing Review columns: %', array_to_string(missing_columns, ', ');
    ELSE
        RAISE NOTICE '✅ All Review columns added successfully';
    END IF;
END $$;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

DO $$ BEGIN
    RAISE NOTICE '
═══════════════════════════════════════════════════════════════════
  Estate Standard - Service Fee Agreement & Rating Migration
═══════════════════════════════════════════════════════════════════
  ✓ CompletionOutcome enum created
  ✓ Service fee agreement workflow added to appointments
  ✓ Invoice verification fields added (invoiceAmount)
  ✓ Completion confirmation added for both parties
  ✓ Estate Standard Rating questions added to reviews
  ✓ Estate Standard Rating calculation function created
  ✓ Vendor Estate Standard Rating tracking added
  ✓ Automatic rating calculation trigger created
  ✓ Validation constraints added
  ✓ Indexes created for performance
═══════════════════════════════════════════════════════════════════
  New Workflow:
  1. Appointment confirmed → Both parties agree on service fee
  2. Work completed → Vendor uploads invoice + enters amount
  3. Both parties confirm outcome (ISSUE_FIXED/RETURN_TRIP_NEEDED/SERVICE_NOT_AGREED)
  4. Customer rates vendor on 3 Estate Standard questions (1-5)
  5. Estate Standard Rating automatically calculated and updated
═══════════════════════════════════════════════════════════════════
';
END $$;
