-- Estate Standard - Security Features Migration
-- This migration adds all security-related fields to the User table
-- Run with: psql -d estate_standard -f migrations/add_security_features.sql
-- Or use: npx prisma migrate dev --name add_security_features

-- ============================================================================
-- EMAIL VERIFICATION
-- ============================================================================
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerifyToken" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerifyExpires" TIMESTAMP(3);

-- Create unique index for email verification token
CREATE UNIQUE INDEX IF NOT EXISTS "User_emailVerifyToken_key" ON "User"("emailVerifyToken");

-- ============================================================================
-- PASSWORD RESET
-- ============================================================================
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordResetToken" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordResetExpires" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordResetAttempts" INTEGER NOT NULL DEFAULT 0;

-- Create unique index for password reset token
CREATE UNIQUE INDEX IF NOT EXISTS "User_passwordResetToken_key" ON "User"("passwordResetToken");

-- ============================================================================
-- PASSWORD HISTORY (prevent reuse of last 5 passwords)
-- ============================================================================
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordHistory" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- ============================================================================
-- TWO-FACTOR AUTHENTICATION (2FA)
-- ============================================================================
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "twoFactorSecret" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "twoFactorBackupCodes" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- ============================================================================
-- ACCOUNT SECURITY
-- ============================================================================
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "accountLockedUntil" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastPasswordChange" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastLoginIp" TEXT;

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Index for account lockout queries
CREATE INDEX IF NOT EXISTS "User_accountLockedUntil_idx" ON "User"("accountLockedUntil") WHERE "accountLockedUntil" IS NOT NULL;

-- Index for email verification lookups
CREATE INDEX IF NOT EXISTS "User_emailVerified_idx" ON "User"("emailVerified") WHERE "emailVerified" = false;

-- Index for 2FA users
CREATE INDEX IF NOT EXISTS "User_twoFactorEnabled_idx" ON "User"("twoFactorEnabled") WHERE "twoFactorEnabled" = true;

-- ============================================================================
-- AUDIT LOG TABLE (if not exists)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT,
    "entityId" TEXT,
    "changes" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- Add foreign key constraint
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Indexes for audit log queries
CREATE INDEX IF NOT EXISTS "AuditLog_userId_idx" ON "AuditLog"("userId");
CREATE INDEX IF NOT EXISTS "AuditLog_action_idx" ON "AuditLog"("action");
CREATE INDEX IF NOT EXISTS "AuditLog_entity_idx" ON "AuditLog"("entity");
CREATE INDEX IF NOT EXISTS "AuditLog_entityId_idx" ON "AuditLog"("entityId");
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_ipAddress_idx" ON "AuditLog"("ipAddress");

-- ============================================================================
-- CLEANUP FUNCTIONS
-- ============================================================================

-- Function to cleanup expired tokens (run daily via cron)
CREATE OR REPLACE FUNCTION cleanup_expired_tokens() RETURNS void AS $$
BEGIN
    -- Clear expired email verification tokens
    UPDATE "User"
    SET "emailVerifyToken" = NULL, "emailVerifyExpires" = NULL
    WHERE "emailVerifyExpires" < NOW();

    -- Clear expired password reset tokens
    UPDATE "User"
    SET "passwordResetToken" = NULL, "passwordResetExpires" = NULL, "passwordResetAttempts" = 0
    WHERE "passwordResetExpires" < NOW();

    -- Clear expired account lockouts
    UPDATE "User"
    SET "accountLockedUntil" = NULL, "failedLoginAttempts" = 0
    WHERE "accountLockedUntil" < NOW();

    RAISE NOTICE 'Expired tokens cleaned up successfully';
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup old audit logs (keep last 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs() RETURNS void AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM "AuditLog"
    WHERE "createdAt" < NOW() - INTERVAL '90 days';

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % old audit log entries', deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- MIGRATION VERIFICATION
-- ============================================================================

-- Verify all columns were added
DO $$
DECLARE
    missing_columns TEXT[];
    column_name TEXT;
BEGIN
    SELECT ARRAY_AGG(c.column_name)
    INTO missing_columns
    FROM (
        VALUES
            ('emailVerified'),
            ('emailVerifyToken'),
            ('emailVerifyExpires'),
            ('passwordResetToken'),
            ('passwordResetExpires'),
            ('passwordResetAttempts'),
            ('passwordHistory'),
            ('twoFactorSecret'),
            ('twoFactorEnabled'),
            ('twoFactorBackupCodes'),
            ('failedLoginAttempts'),
            ('accountLockedUntil'),
            ('lastPasswordChange'),
            ('lastLoginAt'),
            ('lastLoginIp')
    ) AS expected(column_name)
    WHERE NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'User'
        AND column_name = expected.column_name
    );

    IF missing_columns IS NOT NULL THEN
        RAISE EXCEPTION 'Migration incomplete. Missing columns: %', array_to_string(missing_columns, ', ');
    ELSE
        RAISE NOTICE '✅ All security columns added successfully';
    END IF;
END $$;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

RAISE NOTICE '
═══════════════════════════════════════════════════
  Estate Standard - Security Migration Complete
═══════════════════════════════════════════════════
  ✓ Email verification fields added
  ✓ Password reset fields added
  ✓ Password history tracking added
  ✓ Two-factor authentication fields added
  ✓ Account security fields added
  ✓ Audit log table created
  ✓ Indexes created for performance
  ✓ Cleanup functions created
═══════════════════════════════════════════════════
  Next Steps:
  1. Run: npm install (to get new dependencies)
  2. Update .env with ENCRYPTION_KEY
  3. Restart server
  4. Test authentication flows
═══════════════════════════════════════════════════
';
