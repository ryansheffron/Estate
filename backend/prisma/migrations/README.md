# Estate Standard - Database Migrations

This directory contains database migration scripts for Estate Standard.

## Running Migrations

### Method 1: Using Prisma (Recommended)

```bash
cd backend

# Generate Prisma client
npm run generate

# Run all pending migrations
npx prisma migrate dev

# Or create a new migration from schema.prisma changes
npx prisma migrate dev --name add_security_features
```

### Method 2: Manual SQL Execution

If you prefer to run the SQL file directly:

```bash
# Using psql
psql -d estate_standard -U postgres -f prisma/migrations/add_security_features.sql

# Or if using Docker
docker exec -i estate-postgres psql -U postgres -d estate_standard < prisma/migrations/add_security_features.sql
```

## Security Features Migration

The `add_security_features.sql` migration adds the following to your database:

### User Table Enhancements

**Email Verification:**
- `emailVerified` - Boolean flag
- `emailVerifyToken` - Unique token for verification
- `emailVerifyExpires` - Token expiration timestamp

**Password Reset:**
- `passwordResetToken` - Unique token for password reset
- `passwordResetExpires` - Token expiration timestamp
- `passwordResetAttempts` - Counter to prevent abuse

**Password Security:**
- `passwordHistory` - Array of last 5 password hashes
- `lastPasswordChange` - Timestamp of last password change

**Two-Factor Authentication:**
- `twoFactorSecret` - TOTP secret key
- `twoFactorEnabled` - Boolean flag
- `twoFactorBackupCodes` - Array of backup codes

**Account Security:**
- `failedLoginAttempts` - Counter for failed logins
- `accountLockedUntil` - Timestamp until account is locked
- `lastLoginAt` - Last successful login timestamp
- `lastLoginIp` - Last login IP address

### New Tables

**AuditLog Table:**
- Comprehensive audit logging
- Tracks all sensitive operations
- Indexes for efficient querying

### Utility Functions

**cleanup_expired_tokens():**
- Clears expired email verification tokens
- Clears expired password reset tokens
- Unlocks accounts after lockout period

**cleanup_old_audit_logs():**
- Removes audit logs older than 90 days
- Helps maintain database performance

## Setting Up Scheduled Cleanup

### Using cron (Linux/Mac)

Add to your crontab:

```bash
# Run token cleanup daily at 2 AM
0 2 * * * psql -U postgres -d estate_standard -c "SELECT cleanup_expired_tokens();"

# Run audit log cleanup weekly on Sunday at 3 AM
0 3 * * 0 psql -U postgres -d estate_standard -c "SELECT cleanup_old_audit_logs();"
```

### Using pg_cron Extension

```sql
-- Install pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule daily token cleanup at 2 AM
SELECT cron.schedule('cleanup-tokens', '0 2 * * *', 'SELECT cleanup_expired_tokens();');

-- Schedule weekly audit log cleanup on Sunday at 3 AM
SELECT cron.schedule('cleanup-audit-logs', '0 3 * * 0', 'SELECT cleanup_old_audit_logs();');
```

## Post-Migration Checklist

After running the migration, ensure you:

1. ✅ Install new npm dependencies:
   ```bash
   npm install
   ```

2. ✅ Generate encryption key and add to .env:
   ```bash
   openssl rand -hex 32
   # Add result to .env as ENCRYPTION_KEY
   ```

3. ✅ Update .env with all new security variables (see .env.example)

4. ✅ Restart your backend server:
   ```bash
   npm run dev
   ```

5. ✅ Test authentication flows:
   - Registration with email verification
   - Login with account lockout
   - Password reset
   - 2FA enrollment

6. ✅ Verify audit logging:
   ```sql
   SELECT * FROM "AuditLog" ORDER BY "createdAt" DESC LIMIT 10;
   ```

## Rollback

If you need to rollback this migration:

```sql
-- Remove new columns from User table
ALTER TABLE "User"
  DROP COLUMN IF EXISTS "emailVerified",
  DROP COLUMN IF EXISTS "emailVerifyToken",
  DROP COLUMN IF EXISTS "emailVerifyExpires",
  DROP COLUMN IF EXISTS "passwordResetToken",
  DROP COLUMN IF EXISTS "passwordResetExpires",
  DROP COLUMN IF EXISTS "passwordResetAttempts",
  DROP COLUMN IF EXISTS "passwordHistory",
  DROP COLUMN IF EXISTS "twoFactorSecret",
  DROP COLUMN IF EXISTS "twoFactorEnabled",
  DROP COLUMN IF EXISTS "twoFactorBackupCodes",
  DROP COLUMN IF EXISTS "failedLoginAttempts",
  DROP COLUMN IF EXISTS "accountLockedUntil",
  DROP COLUMN IF EXISTS "lastPasswordChange",
  DROP COLUMN IF EXISTS "lastLoginAt",
  DROP COLUMN IF EXISTS "lastLoginIp";

-- Drop AuditLog table
DROP TABLE IF EXISTS "AuditLog";

-- Drop cleanup functions
DROP FUNCTION IF EXISTS cleanup_expired_tokens();
DROP FUNCTION IF EXISTS cleanup_old_audit_logs();
```

## Troubleshooting

### Migration fails with "column already exists"

This is normal if you've partially run the migration. The script uses `IF NOT EXISTS` clauses to be idempotent.

### Prisma client out of sync

```bash
npx prisma generate
```

### Migration stuck

Check for locks:

```sql
SELECT * FROM pg_locks WHERE NOT granted;
```

Kill blocking queries if needed:

```sql
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle in transaction';
```

## Verification Queries

### Check User table structure

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'User'
ORDER BY ordinal_position;
```

### Check indexes

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'User' OR tablename = 'AuditLog';
```

### Test cleanup functions

```sql
-- Test token cleanup (safe to run anytime)
SELECT cleanup_expired_tokens();

-- Test audit log cleanup (safe to run anytime)
SELECT cleanup_old_audit_logs();
```

## Support

For issues with migrations:
1. Check the SECURITY_IMPLEMENTATION.md guide
2. Review Prisma migration docs: https://www.prisma.io/docs/concepts/components/prisma-migrate
3. Check PostgreSQL logs for detailed error messages
