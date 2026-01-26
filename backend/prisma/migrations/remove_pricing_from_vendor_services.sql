-- Estate Standard - Remove Pricing Fields Migration
-- Removes pricing information from vendor services to maintain premium positioning
-- and avoid pricing competition focus

-- ============================================================================
-- REMOVE PRICING FIELDS FROM VENDOR SERVICES
-- ============================================================================

-- Remove pricing columns from vendor_services table
ALTER TABLE "vendor_services" DROP COLUMN IF EXISTS "basePrice";
ALTER TABLE "vendor_services" DROP COLUMN IF EXISTS "hourlyRate";
ALTER TABLE "vendor_services" DROP COLUMN IF EXISTS "priceNote";

-- ============================================================================
-- MIGRATION VERIFICATION
-- ============================================================================

-- Verify columns were removed
DO $$
DECLARE
    remaining_columns TEXT[];
BEGIN
    SELECT ARRAY_AGG(c.column_name)
    INTO remaining_columns
    FROM (
        VALUES
            ('basePrice'),
            ('hourlyRate'),
            ('priceNote')
    ) AS expected(column_name)
    WHERE EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'vendor_services'
        AND column_name = expected.column_name
    );

    IF remaining_columns IS NOT NULL THEN
        RAISE EXCEPTION 'Migration incomplete. Columns still exist: %', array_to_string(remaining_columns, ', ');
    ELSE
        RAISE NOTICE '✅ All pricing columns removed successfully';
    END IF;
END $$;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

DO $$ BEGIN
    RAISE NOTICE '
═══════════════════════════════════════════════════
  Estate Standard - Pricing Removal Migration
═══════════════════════════════════════════════════
  ✓ Removed basePrice from vendor_services
  ✓ Removed hourlyRate from vendor_services
  ✓ Removed priceNote from vendor_services
═══════════════════════════════════════════════════
  Rationale:
  - Maintains premium, trust-based positioning
  - Focuses on quality over price competition
  - Simplifies vendor onboarding
  - Reduces decision paralysis for homeowners
═══════════════════════════════════════════════════
';
END $$;
