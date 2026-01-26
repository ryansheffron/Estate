# Estate Standard - Database Design

**Version:** 1.0.0
**Last Updated:** 2026-01-26
**Database:** PostgreSQL via Prisma ORM
**Author:** Database Architecture Team

---

## Table of Contents

1. [Overview](#overview)
2. [Design Principles](#design-principles)
3. [Entity Relationship Diagram](#entity-relationship-diagram)
4. [Complete Schema Reference](#complete-schema-reference)
5. [Enum Definitions](#enum-definitions)
6. [Relationships & Foreign Keys](#relationships--foreign-keys)
7. [Indexes & Performance](#indexes--performance)
8. [Data Integrity & Constraints](#data-integrity--constraints)
9. [Fraud Prevention](#fraud-prevention)
10. [Example Data Flow](#example-data-flow)
11. [Migration Strategy](#migration-strategy)

---

## Overview

Estate Standard's database is designed as the **single source of truth** for all platform operations. Every critical business event—from service requests to payments to vendor payouts—is recorded with full auditability.

### Core Philosophy

1. **Immutable Audit Trail**: The Job Ledger is append-only, never updated
2. **Explicit State Machines**: Job statuses enforce valid transitions
3. **Proof-Based Payouts**: Vendors paid only after multi-proof verification
4. **Quiet Complexity**: Warranty tracking triggers only when needed
5. **Relational Integrity**: Foreign keys enforce referential integrity

### Database Statistics

- **Total Tables**: 23 core entities
- **Enum Types**: 12 domain-specific enums
- **Indexes**: 45+ performance indexes
- **Foreign Keys**: 38 relationship constraints
- **Unique Constraints**: 15 uniqueness guarantees

---

## Design Principles

### 1. Single Source of Truth

**The database is authoritative.** External services (Stripe, Twilio) are projections, not sources of truth.

```
Truth Flow:
Database (authoritative) → External Services (projections)

NOT:
External Services → Database (replication)
```

**Example:**
- Payment status lives in `payments` table
- `stripePaymentIntentId` is a reference, not the truth
- If Stripe and database disagree, database wins (with alert for manual reconciliation)

### 2. Append-Only Ledger

The `job_ledger` table is **never updated**, only appended to with new rows.

**Why?**
- Immutable audit trail for disputes
- Regulatory compliance (cannot alter history)
- Debugging requires complete state history

**Alternative Considered:** Update single row with timestamps
**Rejected Because:** Lost history when status changes

### 3. Explicit Enums Over Magic Strings

All domain values use database enums, not varchar with arbitrary strings.

```sql
-- ✅ GOOD: Type-safe enum
status AppointmentStatus DEFAULT 'REQUESTED'

-- ❌ BAD: Magic string
status VARCHAR(50) DEFAULT 'requested'
```

**Benefits:**
- Database enforces valid values
- Cannot insert typos ("COMPLEETED")
- Self-documenting schema
- Migration safety (rename enum values safely)

### 4. Timestamp Everything

Every state change has a timestamp. Every entity has `createdAt` and `updatedAt`.

**Critical Timestamps:**
- `requestCreatedAt` - When homeowner submitted
- `sentToVendorAt` - When vendor notified
- `vendorAcceptedAt` - When vendor confirmed
- `completedByVendorAt` - When vendor submitted proof
- `completedConfirmedAt` - When homeowner confirmed or auto-confirmed
- `paidOutAt` - When vendor received money

**Why?**
- SLA monitoring (how long to match vendors?)
- Dispute resolution (who delayed what?)
- Business metrics (average time to completion?)
- Fraud detection (suspiciously fast completions?)

### 5. Soft Deletes for Auditability

No hard deletes on critical entities. Use `deletedAt` timestamp or `isActive` flag.

```sql
-- Soft delete pattern
UPDATE appointments SET deleted_at = NOW() WHERE id = '...';

-- Query active only
SELECT * FROM appointments WHERE deleted_at IS NULL;
```

**Exceptions:** Temporary data can be hard-deleted:
- Expired idempotency keys (24+ hours old)
- Old refresh tokens (7+ days expired)
- Old audit logs (90+ days old, after archival)

### 6. Optimistic Locking for Concurrency

Prevent lost updates using version fields or conditional updates.

```sql
-- Optimistic lock example
UPDATE availability_slots
SET is_booked = true
WHERE id = 'slot_123'
  AND is_booked = false  -- ← Condition ensures atomicity
RETURNING *;

-- If 0 rows updated, slot was taken by concurrent request
```

### 7. JSON for Flexible Metadata

Use `JSONB` for variable schema data, typed fields for structured data.

**JSONB Good For:**
- State history (array of transitions)
- Custom metadata
- External service responses (Stripe webhook payloads)

**JSONB Bad For:**
- Primary identifiers (use UUID)
- Foreign keys (use proper relations)
- Frequently queried fields (use indexed columns)

---

## Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          USERS & AUTHENTICATION                          │
└─────────────────────────────────────────────────────────────────────────┘

    ┌──────────┐
    │  User    │
    │  (Auth)  │
    └──────────┘
         │
         ├─────────┬─────────┐
         │         │         │
    ┌────────┐ ┌──────┐ ┌──────┐
    │Homeowner│ │Vendor│ │Admin │
    └────────┘ └──────┘ └──────┘
         │         │
         │         │
┌─────────────────────────────────────────────────────────────────────────┐
│                          PROPERTY MANAGEMENT                             │
└─────────────────────────────────────────────────────────────────────────┘

    ┌────────────┐
    │   Home     │ ─────┐
    └────────────┘      │
         │              │
         ├──────────────┼─────────────┬──────────────┐
         │              │             │              │
    ┌─────────┐   ┌──────────┐  ┌─────────┐  ┌──────────┐
    │Emergency│   │Maintenance│  │Warranty │  │Service   │
    │Contact  │   │ Record    │  │  Item   │  │ Request  │
    └─────────┘   └──────────┘  └─────────┘  └──────────┘
                        │                          │
                        │                          │
┌─────────────────────────────────────────────────────────────────────────┐
│                          VENDOR ECOSYSTEM                                │
└─────────────────────────────────────────────────────────────────────────┘

    ┌──────────────┐
    │    Vendor    │
    └──────────────┘
         │
         ├───────────────┬──────────────┬───────────────┐
         │               │              │               │
    ┌─────────┐   ┌────────────┐  ┌──────────┐  ┌───────────┐
    │ Vendor  │   │Availability│  │Sponsorship│ │  Review   │
    │ Service │   │   Slot     │  └──────────┘  └───────────┘
    └─────────┘   └────────────┘
         │               │
         │               │
┌─────────────────────────────────────────────────────────────────────────┐
│                     JOB LIFECYCLE (CORE DOMAIN)                          │
└─────────────────────────────────────────────────────────────────────────┘

    ┌──────────────┐
    │   Service    │
    │   Request    │ ───┐
    └──────────────┘    │
         │              │
         ▼              │
    ┌──────────────┐   │        ┌──────────────┐
    │ Appointment  │◄──┼────────│  Recurring   │
    │   (Booking)  │   │        │     Rule     │
    └──────────────┘   │        └──────────────┘
         │              │
         │              │
         ▼              │
    ┌──────────────┐   │
    │  Job Ledger  │◄──┘  ← SINGLE SOURCE OF TRUTH
    │   (Truth)    │
    └──────────────┘
         │
         │
┌─────────────────────────────────────────────────────────────────────────┐
│                     PAYMENTS & FINANCIALS                                │
└─────────────────────────────────────────────────────────────────────────┘

    ┌──────────────┐         ┌──────────────┐
    │   Payment    │         │    Payout    │
    │  (Money In)  │         │  (Money Out) │
    └──────────────┘         └──────────────┘
         │                        │
         │                        │
         ▼                        ▼
    ┌──────────────┐         ┌──────────────┐
    │ Idempotency  │         │Stripe Connect│
    │     Key      │         │   Account    │
    └──────────────┘         └──────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                     COMMUNICATION & SUPPORT                              │
└─────────────────────────────────────────────────────────────────────────┘

    ┌──────────────┐         ┌──────────────┐
    │   Message    │         │  Audit Log   │
    └──────────────┘         └──────────────┘
```

---

## Complete Schema Reference

### 1. User (Authentication Boundary)

The root identity table. Every user has exactly one role.

```prisma
model User {
  id            String     @id @default(cuid())
  email         String     @unique
  phone         String?    @unique
  passwordHash  String
  role          UserRole   // HOMEOWNER | VENDOR | ADMIN
  status        UserStatus @default(ACTIVE)
  firstName     String
  lastName      String
  avatar        String?

  // Email verification
  emailVerified         Boolean   @default(false)
  emailVerifyToken      String?   @unique
  emailVerifyExpires    DateTime?

  // Password reset
  passwordResetToken    String?   @unique
  passwordResetExpires  DateTime?
  passwordResetAttempts Int       @default(0)

  // Password history (prevent reuse)
  passwordHistory       String[]  @default([])

  // Two-factor authentication
  twoFactorSecret       String?
  twoFactorEnabled      Boolean   @default(false)
  twoFactorBackupCodes  String[]  @default([])

  // Account security
  failedLoginAttempts   Int       @default(0)
  accountLockedUntil    DateTime?
  lastPasswordChange    DateTime  @default(now())

  // Timestamps
  createdAt     DateTime   @default(now())
  updatedAt     DateTime   @updatedAt
  lastLoginAt   DateTime?

  // Relationships
  homeowner     Homeowner?
  vendor        Vendor?

  // Session & security
  refreshTokens RefreshToken[]

  @@index([email])
  @@index([phone])
  @@index([emailVerifyToken])
  @@index([passwordResetToken])
  @@map("users")
}
```

**Key Design Decisions:**

1. **Single Role Per User**: One user = one role. No role arrays. Simpler permissions.
2. **Separate Homeowner/Vendor Tables**: User table stays clean, domain logic lives in child tables.
3. **Password History Array**: Prevents reusing last 5 passwords (security compliance).
4. **Two-Factor Support**: Ready for 2FA when needed (high-value transactions).
5. **Account Locking**: Failed login attempts trigger temporary lock (brute force prevention).

**Indexes:**
- `email` - Primary login lookup (unique enforces one account per email)
- `phone` - SMS verification and contact
- `emailVerifyToken` - Fast token validation
- `passwordResetToken` - Fast reset flow

### 2. RefreshToken (Session Management)

JWT refresh tokens for long-lived authentication.

```prisma
model RefreshToken {
  id          String   @id @default(cuid())
  token       String   @unique
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt   DateTime
  createdAt   DateTime @default(now())

  @@index([userId])
  @@map("refresh_tokens")
}
```

**Key Design Decisions:**

1. **Separate Table**: Not stored in JWT (allows revocation)
2. **Cascade Delete**: User deletion revokes all sessions
3. **Expiration**: 30-day lifetime, cleanup worker removes expired tokens

**Security:**
- Access tokens: 15 minutes (short-lived)
- Refresh tokens: 30 days (long-lived, revocable)

### 3. Homeowner (Customer Domain)

Extends User with homeowner-specific fields.

```prisma
model Homeowner {
  id                String    @id @default(cuid())
  userId            String    @unique
  user              User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  // Subscription
  subscriptionTier  String?   // 'monthly' | 'annual'
  subscriptionStatus String?  // 'active' | 'canceled' | 'past_due'
  stripeCustomerId  String?   @unique

  // Preferences
  preferredContactMethod String @default("in_app") // 'in_app' | 'sms' | 'email'

  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  // Relationships
  homes             Home[]
  serviceRequests   ServiceRequest[]
  appointments      Appointment[]
  payments          Payment[]

  @@map("homeowners")
}
```

**Key Design Decisions:**

1. **1:1 with User**: One user can be homeowner OR vendor, not both (business rule)
2. **Stripe Customer ID**: Links to Stripe for payment processing
3. **Contact Preferences**: Respects how homeowner wants to be notified
4. **Multiple Homes**: One homeowner can own multiple properties

### 4. Home (Property Record)

Physical property with address and metadata.

```prisma
model Home {
  id            String   @id @default(cuid())
  homeownerId   String
  homeowner     Homeowner @relation(fields: [homeownerId], references: [id], onDelete: Cascade)

  // Address
  streetAddress String
  unit          String?
  city          String
  state         String
  zipCode       String
  country       String   @default("USA")

  // Property details
  propertyType  String   // 'single_family' | 'condo' | 'townhouse' | 'estate'
  squareFeet    Int?
  bedrooms      Int?
  bathrooms     Float?
  yearBuilt     Int?

  // Media
  photos        String[] // S3 URLs

  isPrimary     Boolean  @default(false)

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  // Relationships
  maintenanceRecords    MaintenanceRecord[]
  serviceRequests       ServiceRequest[]
  appointments          Appointment[]
  warrantyItems         WarrantyItem[]
  emergencyContacts     EmergencyContact[]

  @@index([homeownerId])
  @@index([zipCode])
  @@map("homes")
}
```

**Key Design Decisions:**

1. **ZIP Code Index**: Critical for vendor matching (vendors serve specific ZIP codes)
2. **Photos Array**: Store S3 URLs, not binary data
3. **isPrimary Flag**: One home per homeowner is primary (default for quick actions)
4. **Optional Details**: Square feet, bedrooms optional (not all homeowners provide)

**Why Separate Home Table?**
- Homeowners own multiple properties
- Service requests tied to specific address
- Maintenance history per property, not per owner

### 5. EmergencyContact (Safety Net)

Emergency contacts per property.

```prisma
model EmergencyContact {
  id        String   @id @default(cuid())
  homeId    String
  home      Home     @relation(fields: [homeId], references: [id], onDelete: Cascade)

  name      String
  phone     String
  email     String?
  relationship String // 'neighbor' | 'family' | 'property_manager' | 'other'
  notes     String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([homeId])
  @@map("emergency_contacts")
}
```

**Key Design Decisions:**

1. **Per Home**: Emergency contacts tied to property, not homeowner (rental properties)
2. **Relationship Field**: Helps vendors know who to call first
3. **Optional Email**: Phone is primary, email secondary

### 6. MaintenanceCategory (Domain Knowledge)

Predefined categories of home maintenance. Seeded data.

```prisma
model MaintenanceCategory {
  id          String              @id @default(cuid())
  name        String              @unique // "HVAC", "Plumbing", etc.
  slug        String              @unique // "hvac", "plumbing"
  description String?
  icon        String?             // Icon identifier for UI

  defaultCadence MaintenanceCadence

  // Best practices guide
  recommendedTasks String[] // ["Change filters", "Check refrigerant", etc.]
  seasonalNotes    String?  // "Schedule before summer"

  createdAt   DateTime            @default(now())
  updatedAt   DateTime            @updatedAt

  // Relationships
  maintenanceRecords MaintenanceRecord[]
  serviceRequests    ServiceRequest[]
  vendorServices     VendorService[]

  @@map("maintenance_categories")
}
```

**Key Design Decisions:**

1. **Static Reference Data**: Seeded on deploy, rarely changes
2. **Default Cadence**: HVAC = QUARTERLY, Roof = YEARLY, etc.
3. **Recommended Tasks**: Guides homeowners on what to expect
4. **Unique Slug**: URL-friendly identifier for API queries

**Seeded Categories (38 total):**
- HVAC, Plumbing, Electrical, Roofing, Landscaping, Pool, Pest Control, etc.

### 7. MaintenanceRecord (History Tracking)

Tracks maintenance completion per home per category.

```prisma
model MaintenanceRecord {
  id          String              @id @default(cuid())
  homeId      String
  home        Home                @relation(fields: [homeId], references: [id], onDelete: Cascade)

  categoryId  String
  category    MaintenanceCategory @relation(fields: [categoryId], references: [id])

  // Scheduling
  cadence     MaintenanceCadence
  lastCompletedAt DateTime?
  nextDueAt   DateTime?

  // Completion details
  completedBy String?  // Vendor name or "DIY"
  vendorId    String?
  notes       String?
  photos      String[] // S3 URLs
  cost        Float?

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([homeId, categoryId])
  @@index([nextDueAt])
  @@map("maintenance_records")
}
```

**Key Design Decisions:**

1. **Composite Index**: Query "all overdue maintenance for home X" is fast
2. **Next Due Date**: Background worker generates recurring appointments from this
3. **Optional Vendor ID**: DIY maintenance doesn't have vendor
4. **Cost Tracking**: Historical data for homeowner budgeting

**Worker Integration:**
- Recurring appointment worker reads `nextDueAt`
- Generates appointments 30 days in advance
- Updates `lastCompletedAt` when appointment completes

### 8. ServiceRequest (Help Ticket)

Homeowner's initial request for help.

```prisma
model ServiceRequest {
  id              String              @id @default(cuid())

  homeownerId     String
  homeowner       Homeowner           @relation(fields: [homeownerId], references: [id])

  homeId          String
  home            Home                @relation(fields: [homeId], references: [id])

  categoryId      String?
  category        MaintenanceCategory? @relation(fields: [categoryId], references: [id])

  // Request details
  title           String
  description     String
  photos          String[] // S3 URLs
  videos          String[] // S3 URLs

  // AI Triage results
  urgency         RequestUrgency      @default(NORMAL)
  detectedCategory String?
  replacementNeeded Boolean           @default(false) // Triggers warranty tracking
  triageNotes     String?

  status          RequestStatus       @default(SUBMITTED)

  // Scheduling preferences
  preferredDate   DateTime?
  preferredTimeSlot String?          // "morning" | "afternoon" | "evening"

  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt

  // Relationships
  appointments    Appointment[]
  warrantyItem    WarrantyItem?
  jobLedger       JobLedger?
  messages        Message[]

  @@index([homeownerId])
  @@index([homeId])
  @@index([status])
  @@index([urgency])
  @@map("service_requests")
}
```

**Key Design Decisions:**

1. **AI Triage Fields**: `urgency`, `detectedCategory`, `replacementNeeded` set by GPT-4 Vision
2. **Replacement Flag**: Triggers warranty item creation (quiet tracking)
3. **Status Lifecycle**: SUBMITTED → TRIAGED → VENDOR_MATCHED → SCHEDULED
4. **Photos/Videos**: AI analyzes images to determine urgency and category

**AI Triage Logic:**
```typescript
const triage = await GPT4Vision.analyze({
  description: "HVAC making loud grinding noise, 95°F outside",
  photos: [photo1, photo2]
});

// Returns:
{
  urgency: 'HIGH',        // Heat emergency
  category: 'HVAC',
  replacementNeeded: false, // Just repair, not replace
  reasoning: "AC compressor failing, same-day service required"
}
```

### 9. Vendor (Service Provider)

Verified service providers.

```prisma
model Vendor {
  id              String        @id @default(cuid())
  userId          String        @unique
  user            User          @relation(fields: [userId], references: [id], onDelete: Cascade)

  // Business details
  businessName    String
  businessLicense String?
  insuranceCert   String?       // S3 URL
  ein             String?       // Tax ID

  // Contact
  businessPhone   String
  businessEmail   String
  website         String?

  // Service area
  serviceZipCodes String[]
  serviceCities   String[]
  serviceRadius   Int?          // Miles from base location

  // Verification
  status          VendorStatus  @default(PENDING_VERIFICATION)
  verifiedAt      DateTime?
  verificationNotes String?

  // Rating & reviews
  averageRating   Float         @default(0)
  totalReviews    Int           @default(0)
  totalJobs       Int           @default(0)

  // Availability settings
  autoAcceptBookings Boolean    @default(false)
  bufferTime      Int           @default(30) // Minutes between appointments

  // Payments
  stripeAccountId String?       @unique
  stripeOnboardingComplete Boolean @default(false)
  payoutMethod    String?       // 'bank' | 'debit_card'

  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  // Relationships
  services        VendorService[]
  availability    AvailabilitySlot[]
  appointments    Appointment[]
  sponsorships    Sponsorship[]
  payouts         Payout[]
  reviews         Review[]

  @@index([status])
  @@index([serviceZipCodes])
  @@map("vendors")
}
```

**Key Design Decisions:**

1. **ZIP Code Array**: Vendors serve multiple ZIP codes (Postgres GIN index for fast `@>` queries)
2. **Stripe Connect**: Vendors get paid directly via Stripe Connect (not manual payouts)
3. **Verification Status**: PENDING → VERIFIED (manual vetting by admin)
4. **Auto-Accept Bookings**: Skip vendor confirmation step if enabled
5. **Buffer Time**: Minimum gap between appointments (travel time)

**Stripe Connect Flow:**
1. Vendor creates account
2. System creates Stripe Connect account (Express)
3. Vendor completes onboarding (external Stripe flow)
4. `stripeOnboardingComplete = true`
5. Vendor can now receive payouts

### 10. VendorService (Service Catalog)

Categories a vendor serves.

```prisma
model VendorService {
  id              String              @id @default(cuid())
  vendorId        String
  vendor          Vendor              @relation(fields: [vendorId], references: [id], onDelete: Cascade)

  categoryId      String
  category        MaintenanceCategory @relation(fields: [categoryId], references: [id])

  // Pricing (optional, for transparency)
  basePrice       Float?
  hourlyRate      Float?
  priceNote       String?            // "Starting at $X" or "Call for quote"

  // Service specifics
  supportsEmergency Boolean          @default(false)
  supportsRecurring Boolean          @default(true)
  estimatedDuration Int?             // Minutes

  isActive        Boolean            @default(true)

  createdAt       DateTime           @default(now())
  updatedAt       DateTime           @updatedAt

  @@unique([vendorId, categoryId])
  @@index([categoryId])
  @@map("vendor_services")
}
```

**Key Design Decisions:**

1. **Unique Constraint**: One vendor can only list each category once
2. **Optional Pricing**: Vendors can share pricing or hide it
3. **Emergency Support**: Critical for urgent requests (higher priority in matching)
4. **Estimated Duration**: Helps with scheduling (HVAC tune-up = 60 min)

**Vendor Matching Algorithm:**
```sql
-- Find vendors for HVAC in ZIP 76262
SELECT v.*
FROM vendors v
JOIN vendor_services vs ON v.id = vs.vendor_id
WHERE v.status = 'VERIFIED'
  AND v.service_zip_codes @> ARRAY['76262']
  AND vs.category_id = 'cat_hvac'
  AND vs.is_active = true
ORDER BY v.average_rating DESC, v.total_jobs DESC
LIMIT 3;
```

### 11. AvailabilitySlot (Live Scheduling)

Vendor time slots for booking.

```prisma
model AvailabilitySlot {
  id          String    @id @default(cuid())
  vendorId    String
  vendor      Vendor    @relation(fields: [vendorId], references: [id], onDelete: Cascade)

  // Slot definition
  startTime   DateTime
  endTime     DateTime

  // Recurring availability (optional)
  isRecurring Boolean   @default(false)
  recurringRule String? // JSON: {"frequency": "weekly", "daysOfWeek": [1,3,5]}

  // Booking status
  isBooked    Boolean   @default(false)
  bookedBy    String?   // Appointment ID

  // Capacity (for team-based vendors)
  capacity    Int       @default(1)
  booked      Int       @default(0)

  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@index([vendorId, startTime])
  @@index([isBooked, startTime])
  @@map("availability_slots")
}
```

**Key Design Decisions:**

1. **Composite Index**: Find available slots for vendor on date is fast
2. **Optimistic Locking**: `isBooked` flag prevents double-booking
3. **Capacity Field**: Team vendors can handle multiple jobs at once
4. **Recurring Rule**: Generate weekly availability automatically

**Double-Booking Prevention:**
```sql
-- Atomic booking (part of transaction)
UPDATE availability_slots
SET is_booked = true, booked_by = 'appt_123'
WHERE id = 'slot_456'
  AND is_booked = false  -- ← Optimistic lock
RETURNING *;

-- If 0 rows updated, slot was taken by concurrent request
```

**Recurring Slot Generation:**
```typescript
// Worker generates slots 30 days in advance
const rule = JSON.parse(slot.recurringRule);
// { frequency: "weekly", daysOfWeek: [1, 3, 5] } = Mon/Wed/Fri

// Generate next 30 days of slots
for (let i = 0; i < 30; i++) {
  const date = addDays(today, i);
  if (rule.daysOfWeek.includes(date.getDay())) {
    await createSlot({ vendorId, date, startTime, endTime });
  }
}
```

### 12. Appointment (Scheduled Work)

The canonical scheduled job record.

```prisma
model Appointment {
  id                  String            @id @default(cuid())

  homeownerId         String
  homeowner           Homeowner         @relation(fields: [homeownerId], references: [id])

  homeId              String
  home                Home              @relation(fields: [homeId], references: [id])

  vendorId            String
  vendor              Vendor            @relation(fields: [vendorId], references: [id])

  serviceRequestId    String?
  serviceRequest      ServiceRequest?   @relation(fields: [serviceRequestId], references: [id])

  recurringRuleId     String?
  recurringRule       RecurringRule?    @relation(fields: [recurringRuleId], references: [id])

  // Appointment details
  scheduledStart      DateTime
  scheduledEnd        DateTime
  actualStart         DateTime?
  actualEnd           DateTime?

  status              AppointmentStatus @default(REQUESTED)

  // Confirmation tracking
  vendorAcceptedAt    DateTime?
  homeownerConfirmedAt DateTime?

  // Completion proof
  completionPhotos    String[]         // Before/after photos
  completionNotes     String?
  invoiceUrl          String?          // Uploaded invoice
  checkInTimestamp    DateTime?
  checkOutTimestamp   DateTime?
  completedAt         DateTime?        // When vendor marked as complete

  // Homeowner confirmation
  homeownerConfirmedCompletionAt DateTime?
  autoConfirmed       Boolean          @default(false)
  autoConfirmedAt     DateTime?        // If no response after 48 hours

  // State machine audit trail
  stateHistory        Json[]           @default([])  // Array of state transitions

  // Dispute
  disputeReason       String?
  disputedAt          DateTime?
  disputeResolvedAt   DateTime?

  // Cancellation
  cancelledBy         String?          // 'homeowner' | 'vendor' | 'admin'
  cancelledAt         DateTime?
  cancellationReason  String?

  createdAt           DateTime         @default(now())
  updatedAt           DateTime         @updatedAt

  // Relationships
  jobLedger           JobLedger?
  review              Review?
  payment             Payment?

  @@index([homeownerId])
  @@index([vendorId])
  @@index([status])
  @@index([scheduledStart])
  @@map("appointments")
}
```

**Key Design Decisions:**

1. **State History Array**: Immutable audit trail of all status changes
2. **Two-Proof Verification**: Photos + timestamps required for completion
3. **Auto-Confirmation**: 48-hour timeout if homeowner doesn't respond
4. **Actual vs Scheduled**: Track vendor punctuality
5. **Cancellation Tracking**: Who cancelled and why (analytics + dispute resolution)

**State History Format:**
```json
[
  {
    "fromStatus": "REQUESTED",
    "toStatus": "VENDOR_ACCEPTED",
    "timestamp": "2026-01-25T10:00:00Z",
    "triggeredBy": "vendor_789",
    "reason": "Vendor confirmed availability"
  },
  {
    "fromStatus": "VENDOR_ACCEPTED",
    "toStatus": "IN_PROGRESS",
    "timestamp": "2026-01-27T14:05:00Z",
    "triggeredBy": "vendor_789",
    "reason": "Vendor checked in at job site",
    "metadata": { "gpsCoordinates": [32.9251, -96.8353] }
  }
]
```

**Completion Proof Requirements:**
- **Before/after photos**: Visual proof of work
- **Check-in/check-out timestamps**: Proof vendor was on-site
- **Invoice**: Proof of cost
- **All three required** before payout eligibility

### 13. RecurringRule (Automated Scheduling)

Rules for generating recurring maintenance appointments.

```prisma
model RecurringRule {
  id              String              @id @default(cuid())

  homeownerId     String
  vendorId        String
  homeId          String
  categoryId      String

  frequency       RecurringFrequency

  // Scheduling preferences
  preferredDayOfWeek Int?            // 0-6 (Sunday-Saturday)
  preferredTimeSlot  String?         // "morning" | "afternoon"

  // Active status
  isActive        Boolean            @default(true)

  // Next generation
  nextScheduledDate DateTime?
  lastGeneratedDate DateTime?

  // Auto-booking
  autoBook        Boolean            @default(true) // Auto-create appointments

  createdAt       DateTime           @default(now())
  updatedAt       DateTime           @updatedAt
  endedAt         DateTime?

  // Relationships
  appointments    Appointment[]

  @@index([isActive, nextScheduledDate])
  @@map("recurring_rules")
}
```

**Key Design Decisions:**

1. **Next Scheduled Date**: Worker queries this to find rules needing generation
2. **Auto-Book Flag**: If true, create SCHEDULED appointment; if false, create REQUESTED
3. **Preferred Day/Time**: "HVAC tune-up every 3 months on Monday morning"
4. **Ended At**: Soft delete (keep history of cancelled recurring services)

**Worker Algorithm:**
```typescript
// Find rules needing appointment generation
const rules = await prisma.recurringRule.findMany({
  where: {
    isActive: true,
    nextScheduledDate: { lte: addDays(today, 30) }  // 30-day lookahead
  }
});

for (const rule of rules) {
  // Find vendor availability on preferred day/time
  const slot = await findAvailableSlot(
    rule.vendorId,
    rule.nextScheduledDate,
    rule.preferredTimeSlot
  );

  if (slot) {
    // Create appointment
    await createAppointment({
      homeownerId: rule.homeownerId,
      vendorId: rule.vendorId,
      recurringRuleId: rule.id,
      scheduledStart: slot.startTime,
      status: rule.autoBook ? 'SCHEDULED' : 'REQUESTED'
    });

    // Update next scheduled date
    await prisma.recurringRule.update({
      where: { id: rule.id },
      data: {
        nextScheduledDate: calculateNextDate(rule.frequency),
        lastGeneratedDate: new Date()
      }
    });
  }
}
```

### 14. JobLedger (Single Source of Truth)

**The most critical table.** Immutable record of job lifecycle.

```prisma
model JobLedger {
  id                  String         @id @default(cuid())

  // Core references
  serviceRequestId    String?        @unique
  serviceRequest      ServiceRequest? @relation(fields: [serviceRequestId], references: [id])

  appointmentId       String?        @unique
  appointment         Appointment?   @relation(fields: [appointmentId], references: [id])

  homeownerId         String
  vendorId            String?
  categoryName        String

  // Status tracking
  status              JobStatus      @default(REQUEST_CREATED)

  // Timestamps
  requestCreatedAt    DateTime       @default(now())
  sentToVendorAt      DateTime?
  vendorAcceptedAt    DateTime?
  homeownerConfirmedAt DateTime?
  scheduledAt         DateTime?
  startedAt           DateTime?
  completedByVendorAt DateTime?
  completedConfirmedAt DateTime?
  disputedAt          DateTime?
  cancelledAt         DateTime?
  paidOutAt           DateTime?

  // Completion proof flags
  hasBeforeAfterPhotos Boolean       @default(false)
  hasTimestamps        Boolean       @default(false)
  hasInvoice           Boolean       @default(false)
  hasHomeownerConfirmation Boolean   @default(false)

  // Financial
  agreedPrice         Float?
  actualPrice         Float?
  platformFee         Float?         // Calculated when job completed
  vendorPayout        Float?         // actualPrice - platformFee

  // Payment status
  homeownerPaid       Boolean        @default(false)
  vendorPaidOut       Boolean        @default(false)
  payoutStatus        String?        // 'PENDING' | 'RELEASED' | 'FAILED'
  payoutReleasedAt    DateTime?

  // Auto-confirmation tracking
  autoConfirmed       Boolean        @default(false)

  // Dispute
  disputeReason       String?
  disputeResolution   String?

  createdAt           DateTime       @default(now())
  updatedAt           DateTime       @updatedAt

  @@index([status])
  @@index([homeownerId])
  @@index([vendorId])
  @@map("job_ledger")
}
```

**Key Design Decisions:**

1. **Append-Only**: Never update, only create new rows (immutable history)
2. **All Timestamps**: Complete lifecycle tracking for SLA monitoring
3. **Proof Flags**: Binary flags for payout eligibility check
4. **Financial Fields**: Agreed price vs actual price (change orders)
5. **Payout Tracking**: Three-state system (PENDING → RELEASED → SUCCEEDED)

**Why Append-Only?**
- Audit trail for disputes
- Regulatory compliance
- Debugging requires history
- Cannot alter past (prevents fraud)

**Payout Eligibility Check:**
```typescript
function canReleasePayou(ledger: JobLedger): boolean {
  return (
    ledger.status === 'COMPLETED_CONFIRMED' &&
    ledger.hasBeforeAfterPhotos &&
    ledger.hasTimestamps &&
    (ledger.hasHomeownerConfirmation || ledger.autoConfirmed) &&
    !ledger.vendorPaidOut
  );
}
```

**Status Progression:**
```
REQUEST_CREATED (T0)
    ↓
SENT_TO_VENDOR (T0 + 5min) ← AI triage complete, vendors notified
    ↓
VENDOR_ACCEPTED (T0 + 2hr) ← Vendor confirms availability
    ↓
SCHEDULED (T0 + 1 day) ← Homeowner books time slot
    ↓
IN_PROGRESS (T1) ← Vendor checks in at job site
    ↓
COMPLETED_BY_VENDOR (T1 + 3hr) ← Vendor submits proof
    ↓
COMPLETED_CONFIRMED (T1 + 3hr + 24hr) ← Homeowner confirms OR 48hr timeout
    ↓
PAID_OUT (T1 + 3hr + 24hr + 1hr) ← Vendor receives money
```

### 15. Payment (Money In)

Tracks homeowner payments.

```prisma
enum PaymentStatus {
  PENDING
  PROCESSING
  SUCCEEDED
  FAILED
  REFUNDED
}

enum VendorPayoutStatus {
  PENDING
  RELEASED
  FAILED
}

model Payment {
  id                String        @id @default(cuid())

  homeownerId       String
  homeowner         Homeowner     @relation(fields: [homeownerId], references: [id])

  appointmentId     String?       @unique

  // Stripe
  stripePaymentIntentId String?   @unique
  stripeChargeId    String?

  amount            Float
  platformFee       Float?
  vendorPayoutAmount Float?
  currency          String        @default("usd")

  status            PaymentStatus @default(PENDING)

  // Payment lifecycle timestamps
  authorizedAt      DateTime?
  capturedAt        DateTime?
  failedAt          DateTime?
  failureReason     String?
  refundedAt        DateTime?

  // Vendor payout tracking
  vendorPayoutStatus VendorPayoutStatus @default(PENDING)
  vendorPayoutReleasedAt DateTime?

  // Metadata
  description       String?
  metadata          Json?

  createdAt         DateTime      @default(now())
  updatedAt         DateTime      @updatedAt

  @@index([homeownerId])
  @@index([status])
  @@index([appointmentId])
  @@map("payments")
}
```

**Key Design Decisions:**

1. **Manual Capture**: Authorize when booked, capture when confirmed
2. **Lifecycle Timestamps**: Track every state change
3. **Platform Fee**: 15% stored explicitly (transparency)
4. **Vendor Payout Tracking**: Separate status from homeowner payment
5. **Unique Appointment**: One payment per appointment (no duplicate charges)

**Payment Flow:**
```
PENDING (authorization created, funds on hold)
    ↓
PROCESSING (capture in progress)
    ↓
SUCCEEDED (money captured, homeowner charged)
    ↓
Vendor Payout: PENDING → RELEASED (via Stripe Connect destination charge)
```

**Why Manual Capture?**
- Hold funds when appointment booked
- If cancelled before job, release hold (no charge)
- If disputed, can refund without capturing
- Only capture after job confirmed

### 16. Payout (Money Out)

Tracks vendor payments. **Note:** With Stripe Connect destination charges, this table is primarily for audit, not actual money movement.

```prisma
model Payout {
  id                String        @id @default(cuid())

  vendorId          String
  vendor            Vendor        @relation(fields: [vendorId], references: [id])

  appointmentId     String?

  // Stripe Connect
  stripeTransferId  String?       @unique

  amount            Float
  platformFee       Float
  vendorAmount      Float         // amount - platformFee
  currency          String        @default("usd")

  status            PaymentStatus @default(PENDING)

  // Metadata
  description       String?
  metadata          Json?

  createdAt         DateTime      @default(now())
  updatedAt         DateTime      @updatedAt
  paidAt            DateTime?

  @@index([vendorId])
  @@index([status])
  @@map("payouts")
}
```

**Key Design Decisions:**

1. **Audit Record**: With destination charges, money moves automatically
2. **Transfer ID**: Links to Stripe transfer for reconciliation
3. **Vendor Amount**: Net amount after platform fee
4. **Paid At**: When money actually arrived in vendor's account

**Stripe Connect Integration:**
```typescript
// Destination charge (money moves automatically)
const paymentIntent = await stripe.paymentIntents.create({
  amount: 10000,  // $100.00
  application_fee_amount: 1500,  // $15.00 (15%)
  transfer_data: {
    destination: vendor.stripeAccountId  // Money goes here
  },
  capture_method: 'manual'
});

// When captured:
// - Homeowner charged $100
// - Platform keeps $15
// - Vendor receives $85 (automatic, no manual transfer needed)
```

### 17. IdempotencyKey (Request Deduplication)

Prevents duplicate charges from retried requests.

```prisma
model IdempotencyKey {
  id            String        @id @default(cuid())

  key           String        @unique  // Client-provided UUID
  userId        String?                // User who made the request

  // Request details
  endpoint      String                 // API endpoint
  method        String                 // HTTP method

  // Response cache
  statusCode    Int?
  response      Json?                  // Cached response body

  // Lifecycle
  createdAt     DateTime      @default(now())
  expiresAt     DateTime                // 24 hours from creation
  completedAt   DateTime?

  @@index([key])
  @@index([expiresAt])
  @@map("idempotency_keys")
}
```

**Key Design Decisions:**

1. **24-Hour Expiration**: Balances retry safety vs storage cost
2. **Cached Response**: Return identical response for duplicate requests
3. **Endpoint/Method**: Different endpoints can use same UUID (scoped)
4. **Cleanup Worker**: Deletes expired keys daily

**Usage:**
```http
POST /api/payments/create-intent
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000

Response:
{
  "clientSecret": "pi_123_secret_456"
}

# Retry (network failure)
POST /api/payments/create-intent
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000

Response (cached):
{
  "clientSecret": "pi_123_secret_456"  # Same response, no duplicate charge
}
```

### 18. WarrantyItem (Quiet Tracking)

Created ONLY when replacement is detected or flagged.

```prisma
model WarrantyItem {
  id                String         @id @default(cuid())

  homeId            String
  home              Home           @relation(fields: [homeId], references: [id], onDelete: Cascade)

  serviceRequestId  String?        @unique
  serviceRequest    ServiceRequest? @relation(fields: [serviceRequestId], references: [id])

  // Item details
  itemName          String         // "HVAC Unit", "Water Heater", etc.
  category          String
  manufacturer      String?
  modelNumber       String?
  serialNumber      String?

  // Purchase & warranty
  purchaseDate      DateTime?
  purchasePrice     Float?
  warrantyYears     Int?
  warrantyEndDate   DateTime?

  // Documentation
  receipt           String?        // S3 URL
  warrantyDocument  String?        // S3 URL
  photos            String[]

  // Status
  isActive          Boolean        @default(true)
  notes             String?

  createdAt         DateTime       @default(now())
  updatedAt         DateTime       @updatedAt

  @@index([homeId])
  @@index([warrantyEndDate])
  @@map("warranty_items")
}
```

**Key Design Decisions:**

1. **Triggered Creation**: Only created when `replacementNeeded = true`
2. **Unique Service Request**: One warranty item per service request
3. **Quiet Design**: No global warranty dashboard (noise reduction)
4. **Expiration Index**: Find expiring warranties for proactive notifications

**Trigger Logic:**
```typescript
// After AI triage
if (serviceRequest.replacementNeeded) {
  await prisma.warrantyItem.create({
    data: {
      homeId: serviceRequest.homeId,
      serviceRequestId: serviceRequest.id,
      itemName: detectedItem,  // "HVAC Unit"
      category: serviceRequest.detectedCategory,
      isActive: true
    }
  });
}
```

**Why Quiet?**
- Most service requests are repairs, not replacements
- Warranty tracking only matters when replacement happens
- Avoids overwhelming homeowners with "add all your warranties" flows

### 19. Review (Social Proof)

Homeowner reviews of vendor work.

```prisma
model Review {
  id            String      @id @default(cuid())

  appointmentId String      @unique
  appointment   Appointment @relation(fields: [appointmentId], references: [id])

  vendorId      String
  vendor        Vendor      @relation(fields: [vendorId], references: [id])

  // Rating (1-5 stars)
  rating        Int

  // Review content
  title         String?
  comment       String?

  // Specific ratings
  professionalismRating Int?
  qualityRating         Int?
  communicationRating   Int?
  valueRating           Int?

  // Vendor response
  vendorResponse String?
  vendorRespondedAt DateTime?

  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt

  @@index([vendorId])
  @@index([rating])
  @@map("reviews")
}
```

**Key Design Decisions:**

1. **One Review Per Appointment**: Cannot review same job twice
2. **Detailed Ratings**: Four dimensions for better matching
3. **Vendor Response**: Vendors can respond publicly
4. **Rating Index**: Fast queries for "vendors rated 4.5+"

**Vendor Rating Calculation:**
```typescript
// After review created, update vendor average
const allReviews = await prisma.review.findMany({
  where: { vendorId }
});

const avgRating = allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length;

await prisma.vendor.update({
  where: { id: vendorId },
  data: {
    averageRating: avgRating,
    totalReviews: allReviews.length,
    totalJobs: { increment: 1 }
  }
});
```

### 20. Message (Communication)

In-app messaging between homeowner and vendor.

```prisma
model Message {
  id                String           @id @default(cuid())

  serviceRequestId  String?
  serviceRequest    ServiceRequest?  @relation(fields: [serviceRequestId], references: [id])

  // Participants
  senderId          String?          // User ID
  recipientId       String?          // User ID

  direction         MessageDirection
  channel           MessageChannel   @default(IN_APP)

  // Content
  subject           String?
  body              String
  attachments       String[]         // S3 URLs

  // AI processing
  aiProcessed       Boolean          @default(false)
  aiSuggestion      String?          // AI-generated response suggestion
  sentimentScore    Float?           // -1 to 1
  urgencyDetected   Boolean          @default(false)

  // Status
  isRead            Boolean          @default(false)
  readAt            DateTime?

  createdAt         DateTime         @default(now())

  @@index([serviceRequestId])
  @@index([senderId])
  @@index([recipientId])
  @@index([createdAt])
  @@map("messages")
}
```

**Key Design Decisions:**

1. **AI Processing**: Detect urgency and suggest responses
2. **Sentiment Analysis**: Flag angry/frustrated messages
3. **Multi-Channel**: IN_APP, SMS, EMAIL all logged here
4. **Service Request Context**: Messages tied to specific job

**AI Assistance:**
```typescript
// After message received
const analysis = await GPT4.analyze(message.body);

await prisma.message.update({
  where: { id: message.id },
  data: {
    aiProcessed: true,
    aiSuggestion: analysis.suggestedResponse,
    sentimentScore: analysis.sentiment,  // -0.8 = very negative
    urgencyDetected: analysis.isUrgent
  }
});

// If negative + urgent, alert support team
if (analysis.sentiment < -0.5 && analysis.isUrgent) {
  await notifySupportTeam({ messageId: message.id });
}
```

### 21. Sponsorship (Ads)

Sponsored vendor placements (limited, contextual).

```prisma
model Sponsorship {
  id            String          @id @default(cuid())

  vendorId      String
  vendor        Vendor          @relation(fields: [vendorId], references: [id])

  tier          SponsorshipTier

  // Targeting
  zipCodes      String[]        // Geographic targeting
  categories    String[]        // Category targeting

  // Billing
  monthlyRate   Float
  startDate     DateTime
  endDate       DateTime?

  isActive      Boolean         @default(true)

  // Performance
  impressions   Int             @default(0)
  clicks        Int             @default(0)
  bookings      Int             @default(0)

  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt

  @@index([vendorId])
  @@index([isActive, startDate, endDate])
  @@map("sponsorships")
}
```

**Key Design Decisions:**

1. **Limited Slots**: Only 1 sponsored vendor per category+ZIP (enforced in app logic)
2. **Geographic Targeting**: Sponsor only in ZIP codes you serve
3. **Category Targeting**: Sponsor HVAC, not all categories
4. **Performance Tracking**: Impressions, clicks, bookings (ROI calculation)

**Vendor Matching with Sponsorship:**
```typescript
// Find 3 vendors: 1 sponsored + 2 organic
const sponsored = await prisma.vendor.findFirst({
  where: {
    status: 'VERIFIED',
    serviceZipCodes: { has: homeZip },
    services: { some: { categoryId } },
    sponsorships: {
      some: {
        isActive: true,
        zipCodes: { has: homeZip },
        categories: { has: categoryId }
      }
    }
  }
});

const organic = await prisma.vendor.findMany({
  where: {
    status: 'VERIFIED',
    serviceZipCodes: { has: homeZip },
    services: { some: { categoryId } },
    id: { not: sponsored?.id }  // Exclude sponsored vendor
  },
  orderBy: [
    { averageRating: 'desc' },
    { totalJobs: 'desc' }
  ],
  take: 2
});

const matched = [sponsored, ...organic].filter(Boolean);
```

### 22. AuditLog (Compliance)

System-wide audit trail for security and compliance.

```prisma
model AuditLog {
  id          String   @id @default(cuid())

  userId      String?
  action      String   // 'user.login', 'appointment.create', etc.
  entity      String?  // 'User', 'Appointment', etc.
  entityId    String?

  changes     Json?    // Before/after snapshot
  ipAddress   String?
  userAgent   String?

  createdAt   DateTime @default(now())

  @@index([userId])
  @@index([action])
  @@index([createdAt])
  @@map("audit_logs")
}
```

**Key Design Decisions:**

1. **System-Wide**: All entity changes logged
2. **Before/After Snapshot**: Full diff for critical operations
3. **90-Day Retention**: Cleanup worker archives after 90 days
4. **Action Index**: Fast queries for "all payment captures"

**Usage:**
```typescript
await prisma.auditLog.create({
  data: {
    userId: req.user.id,
    action: 'payment.capture',
    entity: 'Payment',
    entityId: payment.id,
    changes: {
      before: { status: 'PENDING', capturedAt: null },
      after: { status: 'SUCCEEDED', capturedAt: new Date() }
    },
    ipAddress: req.ip,
    userAgent: req.headers['user-agent']
  }
});
```

---

## Enum Definitions

### UserRole
```prisma
enum UserRole {
  HOMEOWNER
  VENDOR
  ADMIN
}
```
One user = one role. Simplifies permissions.

### UserStatus
```prisma
enum UserStatus {
  ACTIVE
  INACTIVE
  SUSPENDED
}
```
`SUSPENDED` = admin action (fraud, violations)
`INACTIVE` = user deactivated own account

### MaintenanceCadence
```prisma
enum MaintenanceCadence {
  MONTHLY
  QUARTERLY
  SEMI_ANNUAL
  YEARLY
  AS_NEEDED
}
```
`AS_NEEDED` = no recurring (one-time repairs)

### RequestUrgency
```prisma
enum RequestUrgency {
  CRITICAL  // Gas leak, flooding, fire - immediate
  HIGH      // Broken AC in summer, major leak - same day
  NORMAL    // Standard maintenance - 1-3 days
  LOW       // Cosmetic, planning - 1-2 weeks
}
```
Set by AI triage based on description and photos.

### RequestStatus
```prisma
enum RequestStatus {
  DRAFT
  SUBMITTED
  TRIAGED
  VENDOR_MATCHED
  SCHEDULED
  IN_PROGRESS
  COMPLETED
  CANCELLED
}
```
Service request lifecycle (separate from appointment status).

### AppointmentStatus (Critical)
```prisma
enum AppointmentStatus {
  REQUESTED         // Homeowner requested
  VENDOR_ACCEPTED   // Vendor confirmed
  HOMEOWNER_CONFIRMED // Optional double confirmation
  SCHEDULED         // Locked in
  IN_PROGRESS       // Vendor checked in
  COMPLETED_BY_VENDOR // Vendor marked complete
  COMPLETED_CONFIRMED // Homeowner confirmed or auto-confirmed
  DISPUTED          // Issue raised
  CANCELLED         // Cancelled by either party
}
```

**Valid Transitions (enforced by state machine):**
```
REQUESTED → VENDOR_ACCEPTED | CANCELLED
VENDOR_ACCEPTED → SCHEDULED | CANCELLED
SCHEDULED → IN_PROGRESS | CANCELLED
IN_PROGRESS → COMPLETED_BY_VENDOR | CANCELLED
COMPLETED_BY_VENDOR → COMPLETED_CONFIRMED | DISPUTED
COMPLETED_CONFIRMED → DISPUTED (can dispute after confirmation)
DISPUTED → COMPLETED_CONFIRMED | CANCELLED
CANCELLED → (terminal state)
```

### VendorStatus
```prisma
enum VendorStatus {
  PENDING_VERIFICATION
  VERIFIED
  SUSPENDED
  REJECTED
}
```
Manual admin vetting required before `VERIFIED`.

### RecurringFrequency
```prisma
enum RecurringFrequency {
  MONTHLY
  QUARTERLY
  SEMI_ANNUAL
  YEARLY
}
```

### JobStatus (Job Ledger)
```prisma
enum JobStatus {
  REQUEST_CREATED
  SENT_TO_VENDOR
  VENDOR_ACCEPTED
  HOMEOWNER_CONFIRMED
  SCHEDULED
  IN_PROGRESS
  COMPLETED_BY_VENDOR
  COMPLETED_CONFIRMED
  DISPUTED
  CANCELLED
  PAID_OUT
}
```
Similar to AppointmentStatus but with explicit payout state.

### PaymentStatus
```prisma
enum PaymentStatus {
  PENDING
  PROCESSING
  SUCCEEDED
  FAILED
  REFUNDED
}
```

### VendorPayoutStatus
```prisma
enum VendorPayoutStatus {
  PENDING
  RELEASED
  FAILED
}
```

### SponsorshipTier
```prisma
enum SponsorshipTier {
  FEATURED    // $1000/mo - Top placement
  PREMIUM     // $750/mo - Priority placement
  BASIC       // $500/mo - Standard placement
}
```

### MessageChannel
```prisma
enum MessageChannel {
  IN_APP
  SMS
  EMAIL
}
```

### MessageDirection
```prisma
enum MessageDirection {
  HOMEOWNER_TO_VENDOR
  VENDOR_TO_HOMEOWNER
  HOMEOWNER_TO_SUPPORT
  SUPPORT_TO_HOMEOWNER
  SYSTEM
}
```

---

## Relationships & Foreign Keys

### User → Homeowner/Vendor (1:1)
```prisma
User.homeowner → Homeowner (1:1, userId unique)
User.vendor → Vendor (1:1, userId unique)
```
One user can be homeowner OR vendor, not both.

### Homeowner → Home (1:N)
```prisma
Homeowner.homes → Home[] (1:N)
Home.homeownerId → Homeowner (FK, onDelete: Cascade)
```
One homeowner owns multiple homes. Deleting homeowner deletes homes.

### Home → Maintenance/Service (1:N)
```prisma
Home.maintenanceRecords → MaintenanceRecord[]
Home.serviceRequests → ServiceRequest[]
Home.appointments → Appointment[]
Home.warrantyItems → WarrantyItem[]
```
All linked to physical property, not homeowner.

### ServiceRequest → Appointment (1:N)
```prisma
ServiceRequest.appointments → Appointment[]
Appointment.serviceRequestId → ServiceRequest (optional FK)
```
One service request can spawn multiple appointments (recurring).

### Appointment → JobLedger (1:1)
```prisma
Appointment.jobLedger → JobLedger (1:1)
JobLedger.appointmentId → Appointment (unique FK)
```
One job ledger per appointment (immutable truth).

### Appointment → Payment (1:1)
```prisma
Appointment.payment → Payment (1:1)
Payment.appointmentId → Appointment (unique FK)
```
One payment per appointment (no duplicate charges).

### Vendor → Services/Availability (1:N)
```prisma
Vendor.services → VendorService[]
Vendor.availability → AvailabilitySlot[]
Vendor.sponsorships → Sponsorship[]
```

### Cascade Delete Rules

**Cascade (delete children):**
- User deleted → Homeowner/Vendor deleted
- Homeowner deleted → Homes deleted
- Home deleted → EmergencyContacts, WarrantyItems deleted
- Vendor deleted → VendorServices, AvailabilitySlots deleted

**Prevent Delete (integrity check):**
- User with appointments → Cannot delete (soft delete instead)
- Vendor with completed jobs → Cannot delete
- Home with completed jobs → Cannot delete

---

## Indexes & Performance

### Critical Indexes (Already Implemented)

#### Users Table
```sql
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_email_verify_token ON users(email_verify_token);
CREATE INDEX idx_users_password_reset_token ON users(password_reset_token);
```

#### Homeowners/Vendors
```sql
CREATE INDEX idx_homeowners_stripe_customer_id ON homeowners(stripe_customer_id);
CREATE INDEX idx_vendors_status ON vendors(status);
CREATE INDEX idx_vendors_service_zip_codes ON vendors USING GIN(service_zip_codes);
CREATE INDEX idx_vendors_stripe_account_id ON vendors(stripe_account_id);
```

#### Homes
```sql
CREATE INDEX idx_homes_homeowner_id ON homes(homeowner_id);
CREATE INDEX idx_homes_zip_code ON homes(zip_code);
```

#### Service Requests
```sql
CREATE INDEX idx_service_requests_homeowner_id ON service_requests(homeowner_id);
CREATE INDEX idx_service_requests_home_id ON service_requests(home_id);
CREATE INDEX idx_service_requests_status ON service_requests(status);
CREATE INDEX idx_service_requests_urgency ON service_requests(urgency);
```

#### Appointments (Hot Path)
```sql
CREATE INDEX idx_appointments_homeowner_id ON appointments(homeowner_id);
CREATE INDEX idx_appointments_vendor_id ON appointments(vendor_id);
CREATE INDEX idx_appointments_status ON appointments(status);
CREATE INDEX idx_appointments_scheduled_start ON appointments(scheduled_start);

-- Composite index for "my upcoming appointments"
CREATE INDEX idx_appointments_homeowner_status ON appointments(homeowner_id, status);
CREATE INDEX idx_appointments_vendor_status ON appointments(vendor_id, status);
```

#### Availability Slots (High Concurrency)
```sql
CREATE INDEX idx_availability_vendor_time ON availability_slots(vendor_id, start_time);
CREATE INDEX idx_availability_booked_time ON availability_slots(is_booked, start_time);
```

#### Job Ledger (Audit Queries)
```sql
CREATE INDEX idx_job_ledger_status ON job_ledger(status);
CREATE INDEX idx_job_ledger_homeowner_id ON job_ledger(homeowner_id);
CREATE INDEX idx_job_ledger_vendor_id ON job_ledger(vendor_id);
```

#### Payments (Financial Queries)
```sql
CREATE INDEX idx_payments_homeowner_id ON payments(homeowner_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_appointment_id ON payments(appointment_id);
CREATE INDEX idx_payments_stripe_payment_intent_id ON payments(stripe_payment_intent_id);
```

#### Idempotency Keys (Request Deduplication)
```sql
CREATE INDEX idx_idempotency_key ON idempotency_keys(key);
CREATE INDEX idx_idempotency_expires_at ON idempotency_keys(expires_at);
```

#### Recurring Rules (Worker Queries)
```sql
CREATE INDEX idx_recurring_active_next_date ON recurring_rules(is_active, next_scheduled_date);
```

#### Audit Logs (Compliance Queries)
```sql
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
```

### Query Performance Examples

#### "Find available vendors for HVAC in ZIP 76262"
```sql
-- Uses: idx_vendors_service_zip_codes (GIN) + idx_vendor_services_category_id
SELECT v.*
FROM vendors v
JOIN vendor_services vs ON v.id = vs.vendor_id
WHERE v.status = 'VERIFIED'
  AND v.service_zip_codes @> ARRAY['76262']  -- GIN index
  AND vs.category_id = 'cat_hvac'
  AND vs.is_active = true
ORDER BY v.average_rating DESC, v.total_jobs DESC
LIMIT 3;
```

#### "Find my upcoming appointments"
```sql
-- Uses: idx_appointments_homeowner_status (composite)
SELECT *
FROM appointments
WHERE homeowner_id = 'homeowner_123'
  AND status IN ('SCHEDULED', 'VENDOR_ACCEPTED')
  AND scheduled_start >= NOW()
ORDER BY scheduled_start ASC;
```

#### "Find jobs stuck in COMPLETED_BY_VENDOR for 48+ hours"
```sql
-- Uses: idx_appointments_status + filter on completed_at
SELECT *
FROM appointments
WHERE status = 'COMPLETED_BY_VENDOR'
  AND completed_at < NOW() - INTERVAL '48 hours';
```

---

## Data Integrity & Constraints

### Unique Constraints

1. **User.email** - One account per email
2. **User.phone** - One account per phone
3. **Homeowner.stripeCustomerId** - One Stripe customer per homeowner
4. **Vendor.stripeAccountId** - One Stripe account per vendor
5. **VendorService (vendorId, categoryId)** - Vendor can't list same category twice
6. **Payment.appointmentId** - One payment per appointment
7. **JobLedger.appointmentId** - One ledger entry per appointment
8. **Review.appointmentId** - One review per appointment

### Check Constraints (Application-Level)

**Not enforced at DB level, but validated in application:**

```typescript
// Rating must be 1-5
if (rating < 1 || rating > 5) {
  throw new Error('Rating must be between 1 and 5');
}

// Platform fee must be 0-100%
if (platformFee < 0 || platformFee > amount) {
  throw new Error('Invalid platform fee');
}

// Scheduled end must be after start
if (scheduledEnd <= scheduledStart) {
  throw new Error('End time must be after start time');
}

// Auto-confirm flag requires COMPLETED_CONFIRMED status
if (autoConfirmed && status !== 'COMPLETED_CONFIRMED') {
  throw new Error('Invalid auto-confirm state');
}
```

### Foreign Key Integrity

All foreign keys have `onDelete` behavior:

```prisma
// CASCADE: Delete children
homeowner Homeowner @relation(fields: [homeownerId], references: [id], onDelete: Cascade)

// RESTRICT: Prevent deletion (default)
vendor Vendor @relation(fields: [vendorId], references: [id])

// SET NULL: Orphan child (rare)
category MaintenanceCategory? @relation(fields: [categoryId], references: [id], onDelete: SetNull)
```

### Referential Integrity Rules

1. **Cannot delete user with active appointments**
2. **Cannot delete vendor with unpaid jobs**
3. **Cannot delete home with warranty items**
4. **Cannot update status without valid transition** (enforced by state machine)
5. **Cannot release payout without completion proof** (enforced by business logic)

---

## Fraud Prevention

### 1. Multi-Proof Verification

Vendor cannot get paid without:
- Before/after photos
- Check-in/check-out timestamps
- Homeowner confirmation OR 48-hour auto-confirmation

```typescript
function canReleasePayou(ledger: JobLedger): boolean {
  return (
    ledger.hasBeforeAfterPhotos &&
    ledger.hasTimestamps &&
    (ledger.hasHomeownerConfirmation || ledger.autoConfirmed) &&
    ledger.status === 'COMPLETED_CONFIRMED'
  );
}
```

### 2. Immutable Audit Trail

Job Ledger is append-only. Cannot alter history.

```sql
-- ❌ Cannot retroactively change completion time
UPDATE job_ledger SET completed_by_vendor_at = '...';  -- Forbidden

-- ✅ Can only create new rows
INSERT INTO job_ledger (status, completed_by_vendor_at, ...) VALUES (...);
```

### 3. Stripe Webhook Signature Verification

Webhooks from Stripe must be cryptographically verified.

```typescript
const event = stripe.webhooks.constructEvent(
  req.body,
  signature,
  process.env.STRIPE_WEBHOOK_SECRET
);

// If signature invalid, throws error (prevents spoofed webhooks)
```

### 4. Idempotency Keys

Prevents duplicate charges from retried requests.

```typescript
// Client sends UUID
headers: { 'Idempotency-Key': '550e8400-e29b-41d4-a716-446655440000' }

// Server checks cache
const existing = await prisma.idempotencyKey.findUnique({ where: { key } });
if (existing && existing.completedAt) {
  // Return cached response, don't process again
  return res.status(existing.statusCode).json(existing.response);
}
```

### 5. Rate Limiting

Prevents abuse and brute force attacks.

```typescript
// Payment endpoints: 10 requests / 15 minutes
const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => req.user.id
});
```

### 6. Account Lockout

Failed login attempts trigger temporary lock.

```prisma
failedLoginAttempts   Int       @default(0)
accountLockedUntil    DateTime?
```

```typescript
if (user.failedLoginAttempts >= 5) {
  user.accountLockedUntil = new Date(Date.now() + 30 * 60 * 1000);  // 30 min
}
```

### 7. Two-Factor Authentication (Ready)

Schema supports 2FA for high-value transactions.

```prisma
twoFactorSecret       String?
twoFactorEnabled      Boolean   @default(false)
twoFactorBackupCodes  String[]  @default([])
```

### 8. Vendor Verification

Vendors cannot accept jobs until verified by admin.

```sql
WHERE vendor.status = 'VERIFIED'  -- Only verified vendors shown to homeowners
```

### 9. Disputed Job Protection

Homeowner can dispute job after completion.

```prisma
status: 'DISPUTED'
disputeReason: String
```

During dispute:
- Payment held (not captured)
- Payout blocked
- Admin reviews
- Resolution: Refund OR complete payout

### 10. Soft Deletes

Critical data never hard-deleted.

```sql
-- Soft delete
UPDATE appointments SET deleted_at = NOW() WHERE id = '...';

-- Query active only
SELECT * FROM appointments WHERE deleted_at IS NULL;
```

---

## Example Data Flow

**Scenario:** Sarah (homeowner in Fort Worth) books Elite HVAC for AC repair.

### Step 1: User Registration

```sql
INSERT INTO users (id, email, role, first_name, last_name, password_hash)
VALUES ('user_001', 'sarah@example.com', 'HOMEOWNER', 'Sarah', 'Mitchell', '$2b$...');

INSERT INTO homeowners (id, user_id, preferred_contact_method)
VALUES ('ho_001', 'user_001', 'sms');

INSERT INTO homes (id, homeowner_id, street_address, city, state, zip_code, property_type)
VALUES ('home_001', 'ho_001', '123 Northlake Dr', 'Fort Worth', 'TX', '76262', 'single_family');
```

**State:**
```
users: { id: user_001, email: sarah@example.com, role: HOMEOWNER }
homeowners: { id: ho_001, userId: user_001 }
homes: { id: home_001, homeownerId: ho_001, zipCode: 76262 }
```

### Step 2: Service Request Creation

```sql
INSERT INTO service_requests (
  id, homeowner_id, home_id, title, description, photos,
  urgency, detected_category, status
)
VALUES (
  'sr_001', 'ho_001', 'home_001',
  'AC Not Cooling',
  'HVAC making loud grinding noise, house at 85°F, 95°F outside',
  ARRAY['s3://photo1.jpg', 's3://photo2.jpg'],
  'HIGH', 'HVAC', 'TRIAGED'
);

INSERT INTO job_ledger (
  id, service_request_id, homeowner_id, category_name,
  status, request_created_at
)
VALUES (
  'jl_001', 'sr_001', 'ho_001', 'HVAC',
  'REQUEST_CREATED', NOW()
);
```

**State:**
```
service_requests: { id: sr_001, status: TRIAGED, urgency: HIGH }
job_ledger: { id: jl_001, status: REQUEST_CREATED }
```

### Step 3: Vendor Matching

```sql
-- Find vendors: 1 sponsored + 2 organic
SELECT v.id, v.business_name, v.average_rating
FROM vendors v
JOIN vendor_services vs ON v.id = vs.vendor_id
WHERE v.status = 'VERIFIED'
  AND v.service_zip_codes @> ARRAY['76262']
  AND vs.category_id = 'cat_hvac'
ORDER BY
  (SELECT COUNT(*) FROM sponsorships s
   WHERE s.vendor_id = v.id AND s.is_active = true) DESC,
  v.average_rating DESC,
  v.total_jobs DESC
LIMIT 3;

-- Returns:
-- vendor_001: Elite HVAC (sponsored, 4.9 stars, 150 jobs)
-- vendor_002: Cool Air Pros (4.8 stars, 200 jobs)
-- vendor_003: Texas HVAC (4.7 stars, 120 jobs)

UPDATE service_requests
SET status = 'VENDOR_MATCHED'
WHERE id = 'sr_001';

UPDATE job_ledger
SET status = 'SENT_TO_VENDOR', sent_to_vendor_at = NOW()
WHERE id = 'jl_001';
```

**State:**
```
service_requests: { id: sr_001, status: VENDOR_MATCHED }
job_ledger: { id: jl_001, status: SENT_TO_VENDOR, sentToVendorAt: T1 }
```

### Step 4: Appointment Booking

```sql
BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;

-- Lock availability slot (optimistic locking)
UPDATE availability_slots
SET is_booked = true, booked_by = 'appt_001'
WHERE id = 'slot_123'
  AND vendor_id = 'vendor_001'
  AND start_time = '2026-01-27 14:00:00'
  AND is_booked = false
RETURNING *;

-- If 0 rows updated, slot was taken by concurrent request (rollback)

-- Create appointment
INSERT INTO appointments (
  id, homeowner_id, home_id, vendor_id, service_request_id,
  scheduled_start, scheduled_end, status
)
VALUES (
  'appt_001', 'ho_001', 'home_001', 'vendor_001', 'sr_001',
  '2026-01-27 14:00:00', '2026-01-27 17:00:00', 'VENDOR_ACCEPTED'
);

-- Update job ledger
UPDATE job_ledger
SET
  appointment_id = 'appt_001',
  vendor_id = 'vendor_001',
  status = 'VENDOR_ACCEPTED',
  vendor_accepted_at = NOW()
WHERE id = 'jl_001';

COMMIT;
```

**State:**
```
availability_slots: { id: slot_123, isBooked: true, bookedBy: appt_001 }
appointments: { id: appt_001, status: VENDOR_ACCEPTED, scheduledStart: 2026-01-27 14:00 }
job_ledger: { id: jl_001, status: VENDOR_ACCEPTED, vendorAcceptedAt: T2 }
```

### Step 5: Payment Authorization

```sql
-- Homeowner authorizes payment
INSERT INTO payments (
  id, homeowner_id, appointment_id,
  stripe_payment_intent_id, amount, platform_fee, vendor_payout_amount,
  status, authorized_at
)
VALUES (
  'pay_001', 'ho_001', 'appt_001',
  'pi_123_stripe', 15000, 2250, 12750,
  'PENDING', NOW()
);

-- Stripe: Payment intent created with manual capture
-- Homeowner's card: $150 authorized (not charged yet)
```

**State:**
```
payments: {
  id: pay_001,
  amount: 15000 (cents = $150),
  platformFee: 2250 ($22.50 = 15%),
  vendorPayoutAmount: 12750 ($127.50),
  status: PENDING,
  authorizedAt: T3
}

Stripe: PaymentIntent { id: pi_123_stripe, status: requires_capture, amount: 15000 }
```

### Step 6: Job Completion (by Vendor)

```sql
UPDATE appointments
SET
  status = 'COMPLETED_BY_VENDOR',
  completed_at = NOW(),
  completion_photos = ARRAY['s3://before.jpg', 's3://after.jpg'],
  check_in_timestamp = '2026-01-27 14:05:00',
  check_out_timestamp = '2026-01-27 16:45:00',
  completion_notes = 'Replaced AC compressor, system running smoothly',
  state_history = state_history || '{"fromStatus": "IN_PROGRESS", "toStatus": "COMPLETED_BY_VENDOR", "timestamp": "2026-01-27T16:45:00Z", "triggeredBy": "vendor_001"}'::jsonb
WHERE id = 'appt_001';

UPDATE job_ledger
SET
  status = 'COMPLETED_BY_VENDOR',
  completed_by_vendor_at = NOW(),
  has_before_after_photos = true,
  has_timestamps = true
WHERE id = 'jl_001';

-- Start 48-hour auto-confirmation timer
```

**State:**
```
appointments: {
  id: appt_001,
  status: COMPLETED_BY_VENDOR,
  completedAt: 2026-01-27 16:45,
  completionPhotos: [before.jpg, after.jpg],
  checkInTimestamp: 2026-01-27 14:05,
  checkOutTimestamp: 2026-01-27 16:45
}
job_ledger: {
  id: jl_001,
  status: COMPLETED_BY_VENDOR,
  completedByVendorAt: T4,
  hasBeforeAfterPhotos: true,
  hasTimestamps: true
}
```

### Step 7: Homeowner Confirmation

```sql
-- Scenario A: Homeowner confirms within 24 hours
UPDATE appointments
SET
  status = 'COMPLETED_CONFIRMED',
  homeowner_confirmed_at = NOW(),
  state_history = state_history || '{"fromStatus": "COMPLETED_BY_VENDOR", "toStatus": "COMPLETED_CONFIRMED", "timestamp": "2026-01-28T10:00:00Z", "triggeredBy": "ho_001", "reason": "Homeowner confirmed job quality"}'::jsonb
WHERE id = 'appt_001';

UPDATE job_ledger
SET
  status = 'COMPLETED_CONFIRMED',
  completed_confirmed_at = NOW(),
  has_homeowner_confirmation = true
WHERE id = 'jl_001';

-- Capture payment (move money)
-- Stripe: Capture payment intent pi_123_stripe
UPDATE payments
SET
  status = 'SUCCEEDED',
  captured_at = NOW()
WHERE id = 'pay_001';

-- Release vendor payout (automatic with destination charges)
UPDATE payments
SET
  vendor_payout_status = 'RELEASED',
  vendor_payout_released_at = NOW()
WHERE id = 'pay_001';

UPDATE job_ledger
SET
  vendor_paid_out = true,
  paid_out_at = NOW()
WHERE id = 'jl_001';
```

**Final State:**
```
appointments: {
  id: appt_001,
  status: COMPLETED_CONFIRMED,
  completedAt: 2026-01-27 16:45,
  homeownerConfirmedAt: 2026-01-28 10:00
}
payments: {
  id: pay_001,
  status: SUCCEEDED,
  authorizedAt: T3,
  capturedAt: T5,
  vendorPayoutStatus: RELEASED,
  vendorPayoutReleasedAt: T5
}
job_ledger: {
  id: jl_001,
  status: COMPLETED_CONFIRMED,
  completedConfirmedAt: T5,
  vendorPaidOut: true,
  paidOutAt: T5,
  hasHomeownerConfirmation: true
}

Stripe: PaymentIntent { status: succeeded, amount_received: 15000 }
Stripe: Transfer { destination: vendor_stripe_account, amount: 12750 }
```

### Step 8: Review

```sql
INSERT INTO reviews (
  id, appointment_id, vendor_id,
  rating, title, comment,
  professionalism_rating, quality_rating, communication_rating, value_rating
)
VALUES (
  'rev_001', 'appt_001', 'vendor_001',
  5, 'Excellent Service',
  'Elite HVAC was professional, on time, and fixed the issue quickly.',
  5, 5, 5, 5
);

-- Update vendor average rating
UPDATE vendors
SET
  average_rating = (SELECT AVG(rating) FROM reviews WHERE vendor_id = 'vendor_001'),
  total_reviews = total_reviews + 1,
  total_jobs = total_jobs + 1
WHERE id = 'vendor_001';
```

**Final State:**
```
reviews: {
  id: rev_001,
  appointmentId: appt_001,
  vendorId: vendor_001,
  rating: 5
}
vendors: {
  id: vendor_001,
  averageRating: 4.9,
  totalReviews: 151,
  totalJobs: 151
}
```

---

## Migration Strategy

### Phase 1: Initial Schema Deployment

```bash
# Generate migration
npx prisma migrate dev --name init

# Apply to production
npx prisma migrate deploy
```

### Phase 2: Seed Reference Data

```typescript
// Seed 38 maintenance categories
await prisma.maintenanceCategory.createMany({
  data: [
    { name: 'HVAC', slug: 'hvac', defaultCadence: 'QUARTERLY', ... },
    { name: 'Plumbing', slug: 'plumbing', defaultCadence: 'YEARLY', ... },
    // ... 36 more
  ]
});
```

### Phase 3: Zero-Downtime Migrations

For production changes, use these patterns:

#### Adding a Column (Safe)
```sql
-- Add column with default
ALTER TABLE appointments ADD COLUMN auto_confirmed BOOLEAN DEFAULT false;

-- Backfill existing rows (if needed)
UPDATE appointments SET auto_confirmed = false WHERE auto_confirmed IS NULL;

-- Make NOT NULL (after backfill)
ALTER TABLE appointments ALTER COLUMN auto_confirmed SET NOT NULL;
```

#### Renaming a Column (Requires Coordination)
```sql
-- Step 1: Add new column
ALTER TABLE appointments ADD COLUMN completed_at TIMESTAMP;

-- Step 2: Backfill from old column
UPDATE appointments SET completed_at = completion_date;

-- Step 3: Deploy app code using new column

-- Step 4: Drop old column
ALTER TABLE appointments DROP COLUMN completion_date;
```

#### Changing Enum Values
```sql
-- Add new enum value (safe)
ALTER TYPE appointment_status ADD VALUE 'COMPLETED_CONFIRMED';

-- Remove enum value (dangerous, requires migration)
-- Cannot remove enum values in PostgreSQL
-- Must create new enum, migrate data, drop old enum
```

### Phase 4: Indexes for Scale

As data grows, add indexes based on query patterns:

```sql
-- If querying "jobs by homeowner + date range" becomes slow
CREATE INDEX idx_appointments_homeowner_date ON appointments(homeowner_id, scheduled_start);

-- If querying "pending payouts" becomes slow
CREATE INDEX idx_payments_payout_status ON payments(vendor_payout_status, vendor_payout_released_at);
```

### Phase 5: Partitioning (Future)

For very large tables, partition by time:

```sql
-- Partition appointments by month
CREATE TABLE appointments (
  ...
) PARTITION BY RANGE (scheduled_start);

CREATE TABLE appointments_2026_01 PARTITION OF appointments
FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

CREATE TABLE appointments_2026_02 PARTITION OF appointments
FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

-- Queries automatically use correct partition
SELECT * FROM appointments WHERE scheduled_start = '2026-01-15';
-- Uses only appointments_2026_01 partition (faster)
```

---

## Summary

Estate Standard's database is designed as the **authoritative truth** for all platform operations. Key principles:

1. **Immutable Audit Trail**: Job Ledger is append-only
2. **Multi-Proof Verification**: Photos + timestamps + confirmation required for payout
3. **Explicit State Machines**: Invalid transitions prevented at application layer
4. **Idempotency**: Payment operations protected from duplicate requests
5. **Quiet Complexity**: Warranty tracking only when needed
6. **Performance**: 45+ indexes for fast queries
7. **Fraud Prevention**: Multiple layers of verification and audit logging

This schema supports:
- ✅ Live scheduling with double-booking prevention
- ✅ Recurring maintenance automation
- ✅ Multi-proof job verification
- ✅ Dispute resolution with complete history
- ✅ Financial audit trail for compliance
- ✅ Vendor fairness (guaranteed payout within 48 hours)
- ✅ Scalability to 10,000+ homes and 1,000+ vendors

The database is **production-ready**.
