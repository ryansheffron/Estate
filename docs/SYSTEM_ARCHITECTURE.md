# Estate Standard - System Architecture

**Version:** 1.0.0
**Last Updated:** 2026-01-25
**Author:** Systems Architecture Team

---

## Table of Contents

1. [Architectural Overview](#architectural-overview)
2. [Core Design Principles](#core-design-principles)
3. [Data Models & Ownership](#data-models--ownership)
4. [State Machines](#state-machines)
5. [Event Flows](#event-flows)
6. [Background Workers](#background-workers)
7. [Failure Handling](#failure-handling)
8. [Scalability Patterns](#scalability-patterns)
9. [Observability](#observability)
10. [Complete Job Lifecycle](#complete-job-lifecycle)
11. [Failure Scenarios](#failure-scenarios)
12. [Non-Negotiable Architecture Rules](#non-negotiable-architecture-rules)

---

## Architectural Overview

Estate Standard is built as a **deterministic state machine orchestrator** wrapped in a REST API. It is NOT a loose collection of CRUD endpoints. Every operation either succeeds completely or fails completely. There are no partial states.

### The Core Abstraction

```
ServiceRequest → Appointment → Job Ledger → Payment → Payout
     ↓               ↓              ↓           ↓          ↓
  (Intent)      (Schedule)     (Truth)    (Money In)  (Money Out)
```

**Key Insight:** The system treats jobs as **financial transactions**, not just "bookings." This means:
- Every state change is audited
- Every money movement is tracked end-to-end
- Every failure leaves a trail for recovery
- No money moves until truth is established

### System Layers

```
┌─────────────────────────────────────────────────────────┐
│                    API Layer                            │
│  (HTTP endpoints, authentication, rate limiting)        │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│                 Business Logic Layer                    │
│  (State machine enforcement, validation, orchestration) │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│                  Domain Model Layer                     │
│  (Entities, value objects, domain invariants)           │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│              Data Access Layer (Prisma)                 │
│  (Transactions, optimistic locking, projections)        │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│                   PostgreSQL                            │
│  (Single source of truth, ACID guarantees)              │
└─────────────────────────────────────────────────────────┘

              ┌─────────────────────┐
              │  Background Workers │ ← Async operations
              │  (Cron-based)       │   (reminders, cleanup,
              └─────────────────────┘    auto-confirmation)

              ┌─────────────────────┐
              │  External Services  │ ← Idempotent calls only
              │  (Stripe, Twilio)   │   (never trusted as truth)
              └─────────────────────┘
```

### Why This Architecture?

1. **Explicit State Machines**: Prevent impossible transitions (can't payout before confirmation)
2. **Transactional Boundaries**: All related changes happen atomically or not at all
3. **Append-Only Truth**: Job Ledger is never updated, only appended to
4. **Idempotent Operations**: Safe to retry any operation without corruption
5. **Async Workers**: Long-running operations don't block API responses
6. **External Services as Projections**: Stripe/Twilio state is DERIVED from our truth, not the source

---

## Core Design Principles

### 1. Single Source of Truth

**Rule:** The database is the only source of truth. External services (Stripe, Twilio) are projections.

**Why:** External services can fail, return stale data, or become unavailable. If we treat them as truth, we introduce nondeterminism.

**Example:**
```typescript
// ❌ WRONG: Trusting Stripe as truth
const payment = await stripe.paymentIntents.retrieve(id);
await prisma.payment.update({ status: payment.status });

// ✅ CORRECT: Our database is truth, Stripe is projection
const payment = await prisma.payment.findUnique({ where: { id } });
if (payment.status === 'PENDING') {
  const intent = await stripe.paymentIntents.capture(payment.stripePaymentIntentId);
  // Update our truth AFTER successful external call
  await prisma.payment.update({
    status: 'CAPTURED',
    capturedAt: new Date(),
    stripeChargeId: intent.latest_charge
  });
}
```

### 2. Optimistic Locking for Concurrency

**Rule:** All write operations that modify shared state use optimistic locking.

**Why:** Prevents lost updates when two requests try to modify the same resource simultaneously.

**Implementation:**
```typescript
// Atomic slot booking with optimistic lock
const updatedSlot = await tx.availabilitySlot.updateMany({
  where: {
    id: slot.id,
    isBooked: false  // ← Optimistic lock condition
  },
  data: { isBooked: true }
});

if (updatedSlot.count === 0) {
  // Someone else booked it between our read and write
  throw new AppError('Time slot no longer available', 409);
}
```

### 3. Serializable Transactions for Critical Paths

**Rule:** Appointment booking uses `Serializable` isolation level.

**Why:** Prevents ALL concurrency anomalies (dirty reads, non-repeatable reads, phantom reads).

**Trade-off:** Higher latency (~50-100ms extra), but guarantees correctness. For a booking flow that happens once per job, this is acceptable.

```typescript
await prisma.$transaction(async (tx) => {
  // All reads/writes in this block are serialized
  // No other transaction can interleave
}, {
  isolationLevel: 'Serializable',
  timeout: 10000
});
```

### 4. Idempotency Keys for Payment Operations

**Rule:** All payment mutations require a client-provided UUID in the `Idempotency-Key` header.

**Why:** Network failures cause retries. Without idempotency, retries = duplicate charges.

**How It Works:**
```
Request 1: Idempotency-Key: abc-123
  → Create payment intent
  → Cache response with key "abc-123"
  → Return client secret

Request 2 (retry): Idempotency-Key: abc-123
  → Check cache for "abc-123"
  → Found! Return cached response
  → No duplicate charge created
```

**Expiration:** Keys expire after 24 hours (balances retry safety vs storage cost).

### 5. Explicit State Machines

**Rule:** Job status transitions are enforced server-side via a state machine. Invalid transitions throw errors.

**Why:** Without enforcement, bugs can create impossible states (e.g., "paid out but never confirmed").

**Example:**
```typescript
// State machine validates: COMPLETED_BY_VENDOR → COMPLETED_CONFIRMED
JobStateMachine.validateTransition(
  currentStatus,
  newStatus
); // Throws if invalid

// Only allowed transitions succeed
// COMPLETED_BY_VENDOR can ONLY go to:
//   - COMPLETED_CONFIRMED (homeowner confirms)
//   - DISPUTED (homeowner disputes)
```

### 6. Async Workers for Non-Blocking Operations

**Rule:** Operations that don't need immediate user feedback run asynchronously.

**Why:** API responses should be <200ms. Background work (reminders, cleanup) doesn't block users.

**Examples:**
- ✅ Auto-confirmation after 48 hours (async worker)
- ✅ Appointment reminders 24 hours in advance (async worker)
- ✅ Recurring appointment generation (async worker)
- ❌ Booking confirmation (sync, user needs immediate feedback)

### 7. Two-Proof Verification for Payouts

**Rule:** Vendor payout requires BOTH:
1. Vendor proof (before/after photos, timestamps)
2. Homeowner confirmation OR 48-hour timeout

**Why:** Prevents fraudulent payouts. Balances vendor protection (they get paid) with homeowner protection (they can dispute).

**State Flow:**
```
COMPLETED_BY_VENDOR (vendor submitted proof)
        ↓
  [48 hour timer starts]
        ↓
COMPLETED_CONFIRMED (homeowner confirmed OR timeout)
        ↓
  [Payment captured, payout released]
```

---

## Data Models & Ownership

### Canonical Entities

#### 1. User (Authentication Boundary)
**Owns:** Credentials, security settings, profile
**Immutable:** User ID, email (after verification)
**Mutable:** Password, 2FA settings, last login

**Why Separate User from Homeowner/Vendor?**
- User = authentication concern
- Homeowner/Vendor = business domain concern
- Allows one user to theoretically have both roles (admin scenarios)

#### 2. ServiceRequest (Intent Capture)
**Owns:** Problem description, urgency, photos
**Lifecycle:** Created → Triaged → Vendor Matched → Appointment Created
**Purpose:** Captures homeowner's INTENT before scheduling logistics

**Key Fields:**
- `urgency` - Derived from AI triage
- `detectedCategory` - AI classification
- `replacementNeeded` - Triggers warranty tracking if true

**Why Not Just Use Appointment?**
- Service request = "I have a problem"
- Appointment = "We scheduled a solution"
- These are conceptually different stages

#### 3. Appointment (Scheduled Work)
**Owns:** When, where, who, proof of completion
**Lifecycle:** REQUESTED → VENDOR_ACCEPTED → SCHEDULED → IN_PROGRESS → COMPLETED_BY_VENDOR → COMPLETED_CONFIRMED
**Purpose:** Represents a scheduled job with proofs

**Critical Fields:**
- `scheduledStart` / `scheduledEnd` - When work happens
- `completionPhotos` - Before/after proof
- `checkInTimestamp` / `checkOutTimestamp` - Time proof
- `invoiceUrl` - Cost proof
- `stateHistory` - Audit trail (JSON array of all transitions)

**Why Separate from ServiceRequest?**
- Not all service requests become appointments (cancelled, self-resolved)
- One service request might spawn multiple appointments (recurring)
- Appointment is the unit of WORK, not the unit of PROBLEM

#### 4. JobLedger (Single Source of Truth)
**Owns:** Financial truth, lifecycle timestamps, proof tracking
**Lifecycle:** Append-only, never updated
**Purpose:** Immutable record for auditing and dispute resolution

**Why Append-Only?**
- Every state change creates a NEW ledger entry
- Cannot retroactively change history
- Disputes can show "what really happened"
- Regulatory compliance (audit trail)

**Key Fields:**
```typescript
{
  requestCreatedAt: DateTime,
  sentToVendorAt: DateTime,
  vendorAcceptedAt: DateTime,
  completedByVendorAt: DateTime,
  completedConfirmedAt: DateTime,
  paidOutAt: DateTime,

  // Two-proof verification flags
  hasBeforeAfterPhotos: boolean,
  hasTimestamps: boolean,
  hasInvoice: boolean,
  hasHomeownerConfirmation: boolean,

  // Financial tracking
  agreedPrice: number,
  actualPrice: number,
  platformFee: number,
  vendorPayout: number,

  // Status tracking
  status: JobStatus,
  homeownerPaid: boolean,
  vendorPaidOut: boolean,
}
```

**Why This Matters:**
- Payment disputes need immutable proof
- Tax reporting needs accurate ledgers
- Vendor disputes need timestamps
- Platform fee calculations need transparency

#### 5. Payment (Money In)
**Owns:** Homeowner → Platform payment tracking
**Lifecycle:** PENDING → PROCESSING → SUCCEEDED → (CAPTURED | REFUNDED)
**Purpose:** Track money collection from homeowners

**Stripe Integration:**
- `stripePaymentIntentId` - Stripe's identifier
- `stripeChargeId` - Stripe's charge record
- Manual capture flow (hold funds until job confirmed)

**Why Manual Capture?**
- Authorize when appointment booked
- Capture when job confirmed
- If disputed, never capture (no charge)
- If refunded, release authorization

#### 6. Payout (Money Out)
**Owns:** Platform → Vendor payment tracking
**Lifecycle:** PENDING → RELEASED → (SUCCEEDED | FAILED)
**Purpose:** Track money disbursement to vendors

**Stripe Connect Integration:**
- Uses "destination charges" (automatic with platform fee)
- Payout happens when payment is captured
- Platform keeps 15%, vendor gets 85%

**Why Destination Charges?**
- Single API call (payment + payout combined)
- Automatic fee splitting
- Vendor gets paid directly from homeowner
- Platform fee deducted automatically

### Ownership Boundaries

```
┌─────────────────────────────────────────────────┐
│ HOMEOWNER DOMAIN                                │
│ - ServiceRequest (creates)                      │
│ - Appointment (confirms, disputes)              │
│ - Payment (authorizes)                          │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ VENDOR DOMAIN                                   │
│ - Appointment (accepts, completes)              │
│ - AvailabilitySlot (manages)                    │
│ - Payout (receives)                             │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ SYSTEM DOMAIN                                   │
│ - JobLedger (manages truth)                     │
│ - State transitions (enforces rules)            │
│ - Auto-confirmation (times out)                 │
│ - Recurring appointments (generates)            │
└─────────────────────────────────────────────────┘
```

**Why This Matters:**
- Homeowners can't modify vendor availability
- Vendors can't modify homeowner payments
- System owns the truth, not users
- Clear boundaries prevent privilege escalation bugs

### Read vs Write Models

**Write Model (Commands):**
- Book appointment
- Accept appointment
- Complete job
- Confirm completion
- Capture payment

**Read Model (Queries):**
- Get upcoming appointments
- Get payment history
- Get job status
- Get vendor availability

**Why Separate?**
- Writes are transactional, reads are fast
- Reads can use indexes, writes need locks
- Reads can use replicas, writes hit primary
- Eventual consistency for reads is acceptable

**Example:**
```typescript
// WRITE: Must be transactional
await prisma.$transaction(async (tx) => {
  await tx.appointment.create({ ... });
  await tx.jobLedger.create({ ... });
  await tx.availabilitySlot.update({ ... });
});

// READ: Can use read replica, cache, or index
const appointments = await prisma.appointment.findMany({
  where: { homeownerId, status: 'SCHEDULED' },
  orderBy: { scheduledStart: 'asc' },
  take: 10,
});
```

---

## State Machines

### Job Status State Machine

The job lifecycle is a **finite state machine** with 10 states and 14 allowed transitions.

```
REQUESTED
    ↓
VENDOR_MATCHED
    ↓
VENDOR_ACCEPTED ←──────┐
    ↓                  │
SCHEDULED              │
    ↓                  │
IN_PROGRESS            │
    ↓                  │
COMPLETED_BY_VENDOR    │
    ↓          ↓       │
    ↓      DISPUTED ───┘
    ↓
COMPLETED_CONFIRMED
    ↓
(Payment captured, payout released)

[CANCELLED] can be reached from any state except COMPLETED_CONFIRMED
```

### Allowed Transitions

```typescript
const STATE_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  REQUESTED: ['VENDOR_MATCHED', 'CANCELLED'],
  VENDOR_MATCHED: ['VENDOR_ACCEPTED', 'CANCELLED'],
  VENDOR_ACCEPTED: ['SCHEDULED', 'CANCELLED'],
  SCHEDULED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED_BY_VENDOR', 'CANCELLED'],
  COMPLETED_BY_VENDOR: ['COMPLETED_CONFIRMED', 'DISPUTED'],
  COMPLETED_CONFIRMED: ['DISPUTED'],  // Can dispute even after confirmation
  DISPUTED: ['COMPLETED_CONFIRMED', 'CANCELLED'],
  CANCELLED: [],  // Terminal state
};
```

### Server-Side Enforcement

**Every status change** goes through validation:

```typescript
export class JobStateMachine {
  static validateTransition(current: JobStatus, next: JobStatus): void {
    const allowed = STATE_TRANSITIONS[current];
    if (!allowed.includes(next)) {
      throw new AppError(
        `Invalid transition: ${current} → ${next}. ` +
        `Allowed: ${allowed.join(', ')}`,
        400
      );
    }
  }
}

// Usage in controller
JobStateMachine.validateTransition(
  appointment.status,  // COMPLETED_BY_VENDOR
  'COMPLETED_CONFIRMED'  // Valid!
);

JobStateMachine.validateTransition(
  appointment.status,  // COMPLETED_BY_VENDOR
  'REQUESTED'  // ❌ Throws error!
);
```

### Why This Prevents Chaos

**Without State Machine:**
```typescript
// ❌ Bug allows impossible transition
await prisma.appointment.update({
  where: { id },
  data: { status: 'COMPLETED_CONFIRMED' }  // From any status!
});
// Now a job that was never completed is marked confirmed
// Payout gets released for work never done
```

**With State Machine:**
```typescript
// ✅ Enforced validation
JobStateMachine.validateTransition(current, next);  // Throws if invalid
await prisma.appointment.update({
  where: { id },
  data: { status: next }  // Only gets here if valid
});
```

### State Transition Audit Trail

Every transition is logged:

```typescript
const stateLog = {
  fromStatus: 'COMPLETED_BY_VENDOR',
  toStatus: 'COMPLETED_CONFIRMED',
  timestamp: new Date(),
  triggeredBy: userId,  // Who made the change
  reason: 'Homeowner confirmed work quality',
  metadata: {
    rating: 5,
    comment: 'Excellent work!'
  }
};

await prisma.appointment.update({
  where: { id },
  data: {
    status: 'COMPLETED_CONFIRMED',
    stateHistory: {
      push: stateLog  // Append to JSON array
    }
  }
});
```

**Why This Matters:**
- Disputes need to show "who changed what when"
- Debugging requires knowing the state journey
- Compliance requires audit trails
- Can replay state changes to find bugs

### State-Based Business Rules

Certain operations are only valid in specific states:

```typescript
static canReleasePayou(status: JobStatus): boolean {
  return status === 'COMPLETED_CONFIRMED';
}

static canBeCancelled(status: JobStatus): boolean {
  const terminalStates = ['COMPLETED_CONFIRMED', 'CANCELLED'];
  return !terminalStates.includes(status);
}

static canBeDisputed(status: JobStatus): boolean {
  return ['COMPLETED_BY_VENDOR', 'COMPLETED_CONFIRMED'].includes(status);
}

static isTerminalState(status: JobStatus): boolean {
  return ['COMPLETED_CONFIRMED', 'CANCELLED'].includes(status);
}
```

**Usage:**
```typescript
// Before releasing payout
if (!JobStateMachine.canReleasePayou(appointment.status)) {
  throw new AppError('Cannot release payout in current state', 400);
}

// Before allowing cancellation
if (!JobStateMachine.canBeCancelled(appointment.status)) {
  throw new AppError('Cannot cancel completed job', 400);
}
```

---

## Event Flows

Estate Standard uses a **hybrid event model**: synchronous for critical path, asynchronous for side effects.

### Synchronous Events (Request-Response)

These happen **during the API request** and block the response:

1. **Appointment Booking**
   ```
   POST /appointments
     → Validate slot availability
     → Start database transaction (Serializable)
       → Lock availability slot (optimistic lock)
       → Create appointment
       → Update job ledger
       → Update service request status
       → Commit transaction
     ← Return appointment details (201)
   ```
   **Why Synchronous?** User needs immediate confirmation of booking.

2. **Payment Authorization**
   ```
   POST /payments/create-intent
     → Validate appointment exists
     → Validate vendor has Stripe account
     → Call Stripe API (create payment intent)
     → Store payment record in database
     ← Return client secret (200)
   ```
   **Why Synchronous?** Frontend needs client secret to show payment form.

3. **Job Completion (by Vendor)**
   ```
   POST /appointments/:id/complete
     → Validate vendor owns appointment
     → Validate state transition (IN_PROGRESS → COMPLETED_BY_VENDOR)
     → Update appointment status
     → Update job ledger
     → Start 48-hour auto-confirmation timer
     ← Return updated appointment (200)
   ```
   **Why Synchronous?** Vendor needs confirmation that submission succeeded.

### Asynchronous Events (Background Workers)

These happen **after the API response** and don't block users:

1. **Auto-Confirmation (48-Hour Timer)**
   ```
   [Cron Worker - Hourly]
     → Find jobs in COMPLETED_BY_VENDOR for 48+ hours
     → For each job:
         → Transition to COMPLETED_CONFIRMED
         → Capture payment via Stripe
         → Release vendor payout
         → Update job ledger
         → Send notifications (homeowner, vendor)
   ```
   **Why Asynchronous?** Happens in the future, doesn't block vendor's completion request.

2. **Appointment Reminders**
   ```
   [Cron Worker - Hourly]
     → Find appointments 24 hours away
     → For each appointment:
         → Send SMS/email to homeowner
         → Send SMS/email to vendor
         → Mark as "reminder sent"
   ```
   **Why Asynchronous?** Notification delivery can be slow, shouldn't block booking.

3. **Recurring Appointment Generation**
   ```
   [Cron Worker - Daily at 2 AM]
     → Find recurring rules needing appointments
     → For each rule:
         → Calculate next date
         → Find vendor availability
         → Create appointment
         → Update recurring rule
         → Send confirmation notification
   ```
   **Why Asynchronous?** Runs overnight, doesn't impact daytime API performance.

4. **Notification Delivery**
   ```
   [Triggered by events]
     → Check user notification preferences
     → Send via preferred channel (SMS, email, in-app)
     → Retry failed notifications (3 attempts)
     → Log delivery status
   ```
   **Why Asynchronous?** External APIs (Twilio, SendGrid) can be slow or fail.

### Event Emission Pattern

Instead of tight coupling, we use **event emission**:

```typescript
// ❌ WRONG: Tight coupling
await prisma.appointment.update({ status: 'CONFIRMED' });
await sendEmailToHomeowner(...);  // Blocks response
await sendSMSToVendor(...);  // Blocks response
await updateAnalytics(...);  // Blocks response

// ✅ CORRECT: Event emission + async handlers
await prisma.appointment.update({ status: 'CONFIRMED' });

// Emit event asynchronously (doesn't block response)
setImmediate(() => {
  NotificationService.send('APPOINTMENT_CONFIRMED', { appointmentId });
  AnalyticsService.track('appointment.confirmed', { appointmentId });
});

return res.json({ appointment });  // Response sent immediately
```

### Event Reliability (Future Enhancement)

For production at scale, replace `setImmediate()` with a **message queue**:

```typescript
// Production-grade event emission
await eventQueue.publish('appointment.confirmed', {
  appointmentId,
  homeownerId,
  vendorId,
  scheduledAt,
});

// Worker consumes events
eventQueue.subscribe('appointment.confirmed', async (event) => {
  await NotificationService.send('APPOINTMENT_CONFIRMED', event);
  // Automatic retry if fails
  // Dead-letter queue if exhausted
});
```

**Why?**
- `setImmediate()` is lost if server crashes
- Message queue persists events (Redis, SQS, RabbitMQ)
- Automatic retries with exponential backoff
- Dead-letter queue for poison messages

---

## Background Workers

Estate Standard runs 4 cron-based workers for async operations.

### 1. Auto-Confirmation Worker

**Schedule:** Every hour
**Purpose:** Auto-confirm jobs after 48-hour timeout
**Why:** Ensures vendors get paid even if homeowner is unresponsive

**Algorithm:**
```typescript
const cutoffTime = new Date();
cutoffTime.setHours(cutoffTime.getHours() - 48);

const pendingJobs = await prisma.appointment.findMany({
  where: {
    status: 'COMPLETED_BY_VENDOR',
    completedAt: { lte: cutoffTime },
  },
});

for (const job of pendingJobs) {
  // Validate transition
  JobStateMachine.validateTransition(job.status, 'COMPLETED_CONFIRMED');

  // Update status
  await prisma.appointment.update({
    where: { id: job.id },
    data: {
      status: 'COMPLETED_CONFIRMED',
      homeownerConfirmedAt: new Date(),
      autoConfirmed: true,
    },
  });

  // Capture payment
  const payment = await prisma.payment.findUnique({
    where: { appointmentId: job.id }
  });
  await StripeService.capturePayment(payment.stripePaymentIntentId);

  // Release payout
  await StripeService.releaseVendorPayout(job.id);

  // Notify both parties
  await NotificationService.send('JOB_AUTO_CONFIRMED', { ... });
}
```

**Failure Handling:**
- Each job processed independently (one failure doesn't stop others)
- Stripe failures logged but don't crash worker
- Worker runs again next hour (retry automatically)
- Failed jobs logged for manual review

**Why Hourly vs Real-Time?**
- Exact timing not critical (48-hour window has flexibility)
- Reduces database load (batch processing)
- Easier to monitor and debug

### 2. Reminder Worker

**Schedule:** Every hour
**Purpose:** Send appointment reminders 24 hours in advance
**Why:** Reduces no-shows and improves preparation

**Algorithm:**
```typescript
const now = new Date();
const reminderWindow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

// Find appointments 23-25 hours away (1-hour window)
const windowStart = new Date(reminderWindow.getTime() - 60 * 60 * 1000);
const windowEnd = new Date(reminderWindow.getTime() + 60 * 60 * 1000);

const upcomingAppointments = await prisma.appointment.findMany({
  where: {
    scheduledStart: { gte: windowStart, lte: windowEnd },
    status: { in: ['SCHEDULED', 'VENDOR_ACCEPTED'] },
  },
});

for (const appointment of upcomingAppointments) {
  // Send to homeowner
  await NotificationService.send('APPOINTMENT_REMINDER', {
    userId: appointment.homeownerId,
    data: { vendorName, date, time },
  });

  // Send to vendor
  await NotificationService.send('APPOINTMENT_REMINDER', {
    userId: appointment.vendorId,
    data: { homeownerName, date, time },
  });
}
```

**Why 1-Hour Window?**
- Worker runs every hour
- Window ensures each appointment gets exactly one reminder
- Overlapping windows would send duplicate reminders

### 3. Recurring Appointment Worker

**Schedule:** Daily at 2 AM
**Purpose:** Generate appointments from recurring maintenance rules
**Why:** Automates preventive maintenance scheduling

**Algorithm:**
```typescript
const lookAheadDays = 30;
const lookAheadDate = new Date();
lookAheadDate.setDate(lookAheadDate.getDate() + lookAheadDays);

const recurringRules = await prisma.recurringRule.findMany({
  where: {
    isActive: true,
    nextScheduledDate: { lte: lookAheadDate },
  },
});

for (const rule of recurringRules) {
  // Calculate next date based on frequency
  const nextDate = calculateNextDate(rule.nextScheduledDate, rule.frequency);

  // Find vendor availability
  const slot = await findAvailableSlot(
    rule.vendorId,
    nextDate,
    rule.preferredTimeSlot,
  );

  if (!slot) {
    // No availability, try next occurrence
    await updateNextScheduledDate(rule.id, nextDate);
    continue;
  }

  // Create appointment
  const appointment = await prisma.appointment.create({
    data: {
      homeownerId: rule.homeownerId,
      vendorId: rule.vendorId,
      recurringRuleId: rule.id,
      scheduledStart: slot.startTime,
      scheduledEnd: slot.endTime,
      status: rule.autoBook ? 'SCHEDULED' : 'REQUESTED',
    },
  });

  // Update recurring rule
  await prisma.recurringRule.update({
    where: { id: rule.id },
    data: {
      nextScheduledDate: calculateNextDate(nextDate, rule.frequency),
      lastGeneratedDate: new Date(),
    },
  });

  // Notify homeowner
  await NotificationService.send('APPOINTMENT_CONFIRMED', { ... });
}
```

**Frequency Calculation:**
```typescript
function calculateNextDate(from: Date, frequency: RecurringFrequency): Date {
  const next = new Date(from);

  switch (frequency) {
    case 'MONTHLY': next.setMonth(next.getMonth() + 1); break;
    case 'QUARTERLY': next.setMonth(next.getMonth() + 3); break;
    case 'SEMI_ANNUAL': next.setMonth(next.getMonth() + 6); break;
    case 'YEARLY': next.setFullYear(next.getFullYear() + 1); break;
  }

  return next;
}
```

**Why 30-Day Look-Ahead?**
- Gives homeowners advance notice
- Allows time to reschedule if needed
- Prevents last-minute scrambling

### 4. Cleanup Worker

**Schedule:** Daily at 3 AM
**Purpose:** Remove expired temporary data
**Why:** Maintains database performance and reduces storage costs

**Algorithm:**
```typescript
// Clean up expired idempotency keys (24+ hours old)
await prisma.idempotencyKey.deleteMany({
  where: { expiresAt: { lt: new Date() } },
});

// Clean up old refresh tokens (7+ days expired)
const sevenDaysAgo = new Date();
sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
await prisma.refreshToken.deleteMany({
  where: { expiresAt: { lt: sevenDaysAgo } },
});

// Clean up old audit logs (90+ days old)
const ninetyDaysAgo = new Date();
ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
await prisma.auditLog.deleteMany({
  where: { createdAt: { lt: ninetyDaysAgo } },
});
```

**Retention Policies:**
- Idempotency keys: 24 hours (retry window)
- Refresh tokens: 7 days after expiration (grace period)
- Audit logs: 90 days (compliance requirement)

**Why Not Archive Instead of Delete?**
- For production, archive to S3/Glacier before deleting
- Current implementation optimized for MVP simplicity
- Long-term: Separate hot (recent) from cold (archived) data

### Worker Reliability Patterns

**Idempotency:**
```typescript
// Each worker operation is idempotent
// Running twice doesn't cause issues
if (appointment.status === 'COMPLETED_BY_VENDOR') {
  // Transition to COMPLETED_CONFIRMED
  // If already confirmed, this is a no-op
}
```

**Error Isolation:**
```typescript
for (const job of jobs) {
  try {
    await processJob(job);
  } catch (error) {
    logger.error('Failed to process job', { jobId: job.id, error });
    // Continue with next job (don't crash entire worker)
  }
}
```

**Retry Strategy:**
```typescript
// Workers run on fixed schedule (automatic retry)
// If a job fails at 2:00 AM, it'll be retried at 3:00 AM
// No need for exponential backoff (not real-time sensitive)
```

**Dead-Letter Queue (Future):**
```typescript
// For jobs that fail repeatedly
const MAX_RETRIES = 3;

if (job.retryCount >= MAX_RETRIES) {
  await prisma.deadLetterQueue.create({
    data: {
      jobType: 'auto-confirmation',
      payload: job,
      failureReason: error.message,
    },
  });
  // Alert engineers
}
```

---

## Failure Handling

Estate Standard is designed to **fail gracefully** and **recover automatically**.

### Failure Categories

1. **Transient Failures** (retry automatically)
   - Network timeouts
   - Database connection errors
   - External API rate limits

2. **Permanent Failures** (manual intervention required)
   - Invalid payment method
   - Vendor Stripe account not onboarded
   - Appointment cancelled

3. **Partial Failures** (compensating transactions)
   - Payment authorized but slot booking failed
   - Job completed but notification failed
   - Payout released but database update failed

### Idempotency for Retries

**Problem:** Network failures cause retries. Retries without idempotency = data corruption.

**Solution:** Every mutation is idempotent (safe to retry).

#### Payment Idempotency

```typescript
// Client generates UUID
const idempotencyKey = uuid.v4();

// First request
await fetch('/api/payments/create-intent', {
  headers: { 'Idempotency-Key': idempotencyKey },
  body: JSON.stringify({ appointmentId, amount }),
});
// Network fails, no response received

// Retry (same idempotency key)
await fetch('/api/payments/create-intent', {
  headers: { 'Idempotency-Key': idempotencyKey },  // Same key!
  body: JSON.stringify({ appointmentId, amount }),
});
// Server checks cache, returns cached response
// No duplicate payment created
```

**Server Implementation:**
```typescript
const existingKey = await prisma.idempotencyKey.findUnique({
  where: { key: idempotencyKey },
});

if (existingKey && existingKey.completedAt) {
  // Request already processed, return cached response
  return res.status(existingKey.statusCode).json(existingKey.response);
}

// Process request normally
const result = await createPaymentIntent(...);

// Cache response
await prisma.idempotencyKey.update({
  where: { key: idempotencyKey },
  data: {
    statusCode: 200,
    response: result,
    completedAt: new Date(),
  },
});

return res.json(result);
```

#### Appointment Booking Idempotency

```typescript
// Optimistic locking prevents double-booking
const updatedSlot = await tx.availabilitySlot.updateMany({
  where: {
    id: slot.id,
    isBooked: false,  // Only succeed if still available
  },
  data: { isBooked: true },
});

if (updatedSlot.count === 0) {
  // Slot was booked by concurrent request
  throw new AppError('Time slot no longer available', 409);
  // Client should retry with different slot
}
```

**Why This Works:**
- First request: `isBooked = false`, update succeeds
- Retry: `isBooked = true` (updated by first request), update fails
- Client gets deterministic error code (409)
- No phantom bookings created

### Race Condition Handling

#### Concurrent Booking Attempts

**Scenario:** Two homeowners try to book the same slot simultaneously.

```
Request A: Book slot 123 at 2:00 PM
Request B: Book slot 123 at 2:00 PM (same time)

Timeline:
T1: A reads slot (isBooked = false)
T2: B reads slot (isBooked = false)  ← Both see available
T3: A writes (isBooked = true)
T4: B writes (isBooked = true)  ← Overwrites A's booking!
```

**Without Protection:** Both bookings succeed (double-booking).

**With Optimistic Locking:**
```typescript
// Serializable transaction prevents phantom reads
await prisma.$transaction(async (tx) => {
  // Step 1: Read with lock
  const slot = await tx.availabilitySlot.findFirst({
    where: { id: slotId, isBooked: false },
  });

  if (!slot) {
    throw new AppError('Slot not available', 409);
  }

  // Step 2: Update with condition
  const updated = await tx.availabilitySlot.updateMany({
    where: {
      id: slotId,
      isBooked: false  // ← Condition ensures atomicity
    },
    data: { isBooked: true },
  });

  if (updated.count === 0) {
    throw new AppError('Slot no longer available', 409);
  }

  // Step 3: Create appointment
  await tx.appointment.create({ ... });
}, { isolationLevel: 'Serializable' });
```

**Timeline with Protection:**
```
T1: A starts transaction (Serializable)
T2: B starts transaction (Serializable)
T3: A reads slot (isBooked = false, row locked)
T4: B tries to read slot (blocked, waits for A's lock)
T5: A updates slot (isBooked = true)
T6: A commits transaction (lock released)
T7: B reads slot (isBooked = true)
T8: B's update condition fails (count = 0)
T9: B throws error "Slot no longer available"
```

**Result:** Exactly one booking succeeds. Second request fails deterministically.

### Timeout Handling

**Problem:** External API calls (Stripe, Twilio) can hang indefinitely.

**Solution:** Timeouts at multiple layers.

#### HTTP Client Timeout

```typescript
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  timeout: 15000,  // 15 seconds
  maxNetworkRetries: 2,
});

try {
  const paymentIntent = await stripe.paymentIntents.create({ ... });
} catch (error) {
  if (error.type === 'StripeConnectionError') {
    // Network timeout
    throw new AppError('Payment service unavailable', 503);
  }
}
```

#### Database Transaction Timeout

```typescript
await prisma.$transaction(async (tx) => {
  // All operations here
}, {
  timeout: 10000,  // 10 seconds max
  isolationLevel: 'Serializable',
});

// If transaction takes >10s, it's rolled back
```

#### API Request Timeout

```typescript
app.use(timeout('30s'));  // Global 30-second timeout

app.post('/api/appointments', async (req, res) => {
  // If this takes >30s, middleware responds with 503
});
```

**Layered Timeouts:**
```
API Timeout: 30s
  └─ Transaction Timeout: 10s
      └─ Stripe Call Timeout: 15s
```

### Partial Failure Recovery

#### Scenario 1: Payment Authorized, Booking Failed

```typescript
try {
  // Step 1: Authorize payment (succeeds)
  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    capture_method: 'manual',  // Don't charge yet
  });

  // Step 2: Book appointment (fails)
  await prisma.appointment.create({ ... });
  // ❌ Database error thrown

} catch (error) {
  // Compensating transaction: Cancel the payment intent
  await stripe.paymentIntents.cancel(paymentIntent.id);
  throw error;
}
```

**Why Manual Capture?**
- Authorize = hold funds, don't charge
- If booking fails, cancel authorization (no charge)
- Only capture after booking confirmed

#### Scenario 2: Job Completed, Notification Failed

```typescript
try {
  // Step 1: Update job status (succeeds)
  await prisma.appointment.update({
    where: { id },
    data: { status: 'COMPLETED_BY_VENDOR' },
  });

  // Step 2: Send notification (fails)
  await NotificationService.send(...);
  // ❌ Twilio rate limit error

} catch (error) {
  // Don't rollback job status (vendor already submitted proof)
  // Log failure for retry
  logger.error('Notification failed', { appointmentId: id, error });

  // Background worker will retry
  await prisma.notificationQueue.create({
    data: { type: 'JOB_COMPLETED', appointmentId: id },
  });
}
```

**Why Not Rollback?**
- Vendor already did the work
- Notification is a side effect, not core truth
- Better to retry notification than lose job completion

#### Scenario 3: Payout Released, Database Update Failed

```typescript
try {
  // Step 1: Release payout via Stripe (succeeds)
  await stripe.transfers.create({ ... });

  // Step 2: Update payment record (fails)
  await prisma.payment.update({
    where: { id },
    data: { vendorPayoutStatus: 'RELEASED' },
  });
  // ❌ Database connection lost

} catch (error) {
  // Money already sent, can't rollback
  // Create alert for manual reconciliation
  await alertOpsTeam({
    severity: 'CRITICAL',
    message: 'Payout released but not recorded in database',
    paymentId: id,
  });
}
```

**Why Critical Alert?**
- Money movement is irreversible
- Database and Stripe are now out of sync
- Manual reconciliation required (ops team intervention)

**Prevention:**
```typescript
// Better: Update database FIRST, then release payout
await prisma.$transaction(async (tx) => {
  await tx.payment.update({
    data: { vendorPayoutStatus: 'RELEASED' },
  });

  // If this succeeds, commit transaction
});

// THEN release payout (idempotent, safe to retry)
await stripe.transfers.create({ ... });
```

### Error Response Standards

**Client Errors (4xx):** Client's fault, don't retry

```typescript
// 400 Bad Request - Invalid input
throw new AppError('Idempotency-Key must be a valid UUID', 400);

// 401 Unauthorized - Invalid credentials
throw new AppError('Invalid access token', 401);

// 403 Forbidden - Valid credentials, insufficient permissions
throw new AppError('Only vendors can accept appointments', 403);

// 404 Not Found - Resource doesn't exist
throw new AppError('Appointment not found', 404);

// 409 Conflict - State conflict (safe to retry with different params)
throw new AppError('Time slot no longer available', 409);
```

**Server Errors (5xx):** Server's fault, safe to retry

```typescript
// 500 Internal Server Error - Unexpected error
throw new AppError('Unexpected error occurred', 500);

// 503 Service Unavailable - Temporary outage
throw new AppError('Payment service temporarily unavailable', 503);

// 504 Gateway Timeout - External API timeout
throw new AppError('Request timed out', 504);
```

**Retry Strategy:**
```typescript
// Client should retry 5xx errors with exponential backoff
let retries = 0;
const maxRetries = 3;

while (retries < maxRetries) {
  try {
    const response = await fetch(url, options);
    if (response.status >= 500) {
      throw new Error('Server error');
    }
    return response;
  } catch (error) {
    retries++;
    const delay = Math.pow(2, retries) * 1000;  // 2s, 4s, 8s
    await sleep(delay);
  }
}
```

---

## Scalability Patterns

Estate Standard is designed to scale by **load**, not just users.

### Hot Paths vs Cold Paths

**Hot Paths (Optimize for Speed):**
- Appointment booking (hundreds per hour during peak)
- Payment authorization (coupled with booking)
- Availability lookup (thousands per hour during browsing)

**Cold Paths (Optimize for Correctness):**
- Payout reconciliation (once per job)
- Dispute resolution (rare, manual intervention)
- Recurring appointment generation (nightly batch)

**Optimization Strategy:**
```typescript
// HOT PATH: Cache vendor availability
const availability = await cache.get(`vendor:${vendorId}:availability`);
if (!availability) {
  availability = await prisma.availabilitySlot.findMany({ ... });
  await cache.set(`vendor:${vendorId}:availability`, availability, 300);  // 5min TTL
}

// COLD PATH: No caching, always fresh data
const payment = await prisma.payment.findUnique({ where: { id } });
const stripeCharge = await stripe.charges.retrieve(payment.stripeChargeId);
// Reconcile differences (rare operation, freshness critical)
```

### Database Scaling

#### Read Replicas

```
┌───────────────┐
│ Primary DB    │ ← All writes
│ (Master)      │
└───────────────┘
        ↓ Replication
┌───────────────┐
│ Replica 1     │ ← Read queries
└───────────────┘
┌───────────────┐
│ Replica 2     │ ← Read queries
└───────────────┘
```

**Usage:**
```typescript
// Write: Always use primary
await prisma.appointment.create({ ... });  // Primary

// Read: Can use replica (eventual consistency acceptable)
const appointments = await prisma.$queryRaw`
  SELECT * FROM appointments WHERE homeowner_id = ${userId}
`;  // Replica
```

**Acceptable Replication Lag:**
- Appointment list: 1-2 seconds lag acceptable
- Payment status: 1-2 seconds lag acceptable
- Job ledger: ALWAYS primary (truth can't be stale)

#### Connection Pooling

```typescript
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  // Connection pool settings
  pool: {
    min: 5,      // Minimum connections
    max: 20,     // Maximum connections (don't exceed DB limit)
    idleTimeout: 30000,  // Close idle connections after 30s
  },
});
```

**Why This Matters:**
- Each API request doesn't open a new DB connection
- Connections are reused from pool
- Limits total connections to DB (prevent overload)

### Queue-Based Scaling

**Current:** Synchronous background workers (cron)
**Future:** Message queue for horizontal scaling

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│  Worker 1   │      │  Worker 2   │      │  Worker 3   │
└─────────────┘      └─────────────┘      └─────────────┘
        ↓                    ↓                    ↓
┌──────────────────────────────────────────────────────────┐
│              Message Queue (SQS, Redis)                  │
│  - auto-confirm-job                                      │
│  - send-reminder                                         │
│  - generate-recurring-appointment                        │
└──────────────────────────────────────────────────────────┘
        ↑                    ↑                    ↑
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│  Publisher  │      │  Publisher  │      │  Publisher  │
│  (API)      │      │  (API)      │      │  (API)      │
└─────────────┘      └─────────────┘      └─────────────┘
```

**Benefits:**
- Horizontal scaling (add more workers under load)
- Persistent jobs (survives server restarts)
- Automatic retries with backoff
- Dead-letter queue for poison messages

**Migration Path:**
```typescript
// Current: Cron-based
cron.schedule('0 * * * *', async () => {
  await processAutoConfirmations();
});

// Future: Queue-based
queue.subscribe('auto-confirm-job', async (job) => {
  await processAutoConfirmation(job.appointmentId);
});

// API publishes to queue
await queue.publish('auto-confirm-job', {
  appointmentId,
  scheduledFor: new Date(Date.now() + 48 * 60 * 60 * 1000),
});
```

### Caching Strategy

#### Application-Level Cache

```typescript
// Redis cache for hot data
const redis = new Redis(process.env.REDIS_URL);

// Cache vendor availability (high read, low write)
const cacheKey = `vendor:${vendorId}:availability:${date}`;
let slots = await redis.get(cacheKey);

if (!slots) {
  slots = await prisma.availabilitySlot.findMany({ ... });
  await redis.setex(cacheKey, 300, JSON.stringify(slots));  // 5min TTL
}

return JSON.parse(slots);
```

**Cache Invalidation:**
```typescript
// When vendor updates availability
await prisma.availabilitySlot.update({ ... });

// Invalidate cache
await redis.del(`vendor:${vendorId}:availability:${date}`);
```

**What to Cache:**
- ✅ Vendor profiles (read-heavy)
- ✅ Availability slots (read-heavy, time-bound)
- ✅ Maintenance categories (static)
- ❌ Appointment status (write-heavy, critical accuracy)
- ❌ Payment status (financial data, never stale)
- ❌ Job ledger (single source of truth)

#### HTTP Cache Headers

```typescript
// Static data (maintenance categories)
res.setHeader('Cache-Control', 'public, max-age=86400');  // 24 hours

// User-specific data (appointment list)
res.setHeader('Cache-Control', 'private, max-age=300');  // 5 minutes

// Financial data (payment history)
res.setHeader('Cache-Control', 'no-store');  // Never cache
```

### Rate Limiting for Fairness

```typescript
// Per-user rate limits (prevent abuse)
const userLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 100,  // 100 requests per window
  keyGenerator: (req) => req.user.id,
});

// Per-IP rate limits (prevent DoS)
const ipLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  keyGenerator: (req) => req.ip,
});

// Payment endpoints (stricter limits)
const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,  // Only 10 payment attempts per 15 minutes
  keyGenerator: (req) => req.user.id,
});
```

### Database Indexing

**Critical Indexes (Already Exist):**
```sql
-- Appointment lookups by homeowner
CREATE INDEX idx_appointments_homeowner ON appointments(homeowner_id);

-- Appointment lookups by vendor
CREATE INDEX idx_appointments_vendor ON appointments(vendor_id);

-- Appointment lookups by status (for workers)
CREATE INDEX idx_appointments_status ON appointments(status);

-- Availability slot lookups by vendor and time
CREATE INDEX idx_availability_vendor_time ON availability_slots(vendor_id, start_time);

-- Idempotency key lookups
CREATE INDEX idx_idempotency_key ON idempotency_keys(key);

-- Job ledger lookups
CREATE INDEX idx_job_ledger_status ON job_ledger(status);
```

**Query Optimization:**
```typescript
// ❌ BAD: No index on scheduledStart
const appointments = await prisma.appointment.findMany({
  where: {
    scheduledStart: { gte: new Date() },
  },
});
// Full table scan!

// ✅ GOOD: Index on (status, scheduledStart)
const appointments = await prisma.appointment.findMany({
  where: {
    status: 'SCHEDULED',
    scheduledStart: { gte: new Date() },
  },
});
// Index scan (fast)
```

---

## Observability

Estate Standard uses **structured logging** and **business metrics** for debugging.

### Structured Logging

**Format:**
```json
{
  "timestamp": "2026-01-25T10:30:00.000Z",
  "level": "info",
  "message": "Appointment booked successfully",
  "context": {
    "appointmentId": "appt_123",
    "homeownerId": "user_456",
    "vendorId": "vendor_789",
    "scheduledStart": "2026-01-27T14:00:00.000Z",
    "duration": 127,
    "requestId": "req_abc"
  }
}
```

**Benefits:**
- Machine-readable (can query with tools like DataDog, Splunk)
- Context-rich (includes all relevant IDs)
- Duration tracking (performance monitoring)
- Request tracing (follow request across services)

**Implementation:**
```typescript
logger.info('Appointment booked successfully', {
  appointmentId: appointment.id,
  homeownerId: appointment.homeownerId,
  vendorId: appointment.vendorId,
  scheduledStart: appointment.scheduledStart,
  duration: Date.now() - startTime,
  requestId: req.id,
});
```

### Business Metrics

**Job Funnel:**
```
Service Request Created: 1000
  ↓ 95%
Vendor Matched: 950
  ↓ 90%
Appointment Booked: 855
  ↓ 85%
Appointment Completed: 727
  ↓ 98%
Homeowner Confirmed: 712
  ↓ 100%
Payout Released: 712
```

**Metrics to Track:**
```typescript
// Conversion rates
const bookingRate = booked / matched;  // Should be >80%
const completionRate = completed / booked;  // Should be >90%
const confirmationRate = confirmed / completed;  // Should be >95%

// Time-based metrics
const avgTimeToMatch = avg(matchedAt - requestedAt);  // Target <1 hour
const avgTimeToBook = avg(bookedAt - matchedAt);  // Target <24 hours
const avgTimeToComplete = avg(completedAt - bookedAt);  // Depends on service
const avgTimeToConfirm = avg(confirmedAt - completedAt);  // Target <24 hours

// Quality metrics
const disputeRate = disputed / completed;  // Should be <5%
const autoConfirmRate = autoConfirmed / confirmed;  // Should be <30%
const cancellationRate = cancelled / booked;  // Should be <10%

// Financial metrics
const avgJobValue = avg(actualPrice);
const platformRevenue = sum(platformFee);
const vendorPayoutVolume = sum(vendorPayout);
const payoutLag = avg(paidOutAt - confirmedAt);  // Target <1 hour
```

### Alerts (What Actually Matters)

**Critical Alerts (Wake up engineer):**
```typescript
// Payout released but database not updated
if (stripeTransferSucceeded && !paymentRecordUpdated) {
  alert('CRITICAL: Payout/database mismatch', { paymentId });
}

// Job stuck in COMPLETED_BY_VENDOR for >72 hours
if (completedAt < Date.now() - 72 * 60 * 60 * 1000) {
  alert('CRITICAL: Job stuck, auto-confirm failed', { appointmentId });
}

// Dispute rate exceeds 10%
if (disputeRate > 0.10) {
  alert('CRITICAL: High dispute rate', { rate: disputeRate });
}

// Payment capture failure rate exceeds 5%
if (paymentCaptureFailureRate > 0.05) {
  alert('CRITICAL: Payment capture issues', { rate });
}
```

**Warning Alerts (Review within 24 hours):**
```typescript
// Auto-confirm rate exceeds 40% (homeowners not engaging)
if (autoConfirmRate > 0.40) {
  alert('WARNING: High auto-confirm rate', { rate: autoConfirmRate });
}

// Average time to match exceeds 2 hours
if (avgTimeToMatch > 2 * 60 * 60 * 1000) {
  alert('WARNING: Slow vendor matching', { avgTime: avgTimeToMatch });
}

// Worker hasn't run in 2 hours (should run hourly)
if (lastWorkerRun < Date.now() - 2 * 60 * 60 * 1000) {
  alert('WARNING: Auto-confirm worker down', { lastRun: lastWorkerRun });
}
```

### Debugging Workflow

**Scenario:** Vendor reports "I completed the job but haven't been paid"

**Step 1: Find the appointment**
```sql
SELECT * FROM appointments
WHERE vendor_id = 'vendor_789'
  AND status = 'COMPLETED_BY_VENDOR'
  AND completed_at < NOW() - INTERVAL '48 hours';
```

**Step 2: Check state history**
```sql
SELECT state_history FROM appointments WHERE id = 'appt_123';
-- Output:
[
  { "fromStatus": "IN_PROGRESS", "toStatus": "COMPLETED_BY_VENDOR", "timestamp": "2026-01-23T10:00:00Z", "triggeredBy": "vendor_789" },
  // No further transitions (stuck!)
]
```

**Step 3: Check job ledger**
```sql
SELECT * FROM job_ledger WHERE appointment_id = 'appt_123';
-- Output:
{
  "status": "COMPLETED_BY_VENDOR",
  "completedByVendorAt": "2026-01-23T10:00:00Z",
  "completedConfirmedAt": null,  ← Not confirmed yet
  "paidOutAt": null,  ← Not paid out yet
  "hasBeforeAfterPhotos": true,
  "hasTimestamps": true,
  "hasInvoice": true,
  "hasHomeownerConfirmation": false,  ← Missing!
}
```

**Step 4: Check payment record**
```sql
SELECT * FROM payments WHERE appointment_id = 'appt_123';
-- Output:
{
  "status": "PENDING",  ← Payment authorized but not captured
  "authorizedAt": "2026-01-22T09:00:00Z",
  "capturedAt": null,
  "vendorPayoutStatus": "PENDING",
  "vendorPayoutReleasedAt": null,
}
```

**Step 5: Check auto-confirm worker logs**
```bash
grep "appt_123" /var/log/estate-standard/workers.log
# Output:
[2026-01-25 02:00:00] [Auto-Confirmation Worker] Found 5 jobs to auto-confirm
[2026-01-25 02:00:00] [Auto-Confirmation Worker] Processing appt_123
[2026-01-25 02:00:01] [Auto-Confirmation Worker] Failed to auto-confirm appt_123: Stripe API timeout
```

**Diagnosis:** Auto-confirm worker is trying but Stripe API is timing out.

**Resolution:**
1. Manually confirm the job via admin endpoint
2. Investigate Stripe API issues
3. Add retry logic with exponential backoff to worker

### Request Tracing

**Add Request ID to all logs:**
```typescript
app.use((req, res, next) => {
  req.id = uuid.v4();
  res.setHeader('X-Request-ID', req.id);
  next();
});

logger.info('Request started', {
  requestId: req.id,
  method: req.method,
  path: req.path,
});
```

**Trace a single request across logs:**
```bash
grep "req_abc" /var/log/estate-standard/*.log
# Shows entire request lifecycle
```

**Example Trace:**
```
[10:30:00.000] [API] Request started { requestId: "req_abc", method: "POST", path: "/appointments" }
[10:30:00.050] [Auth] User authenticated { requestId: "req_abc", userId: "user_456" }
[10:30:00.100] [DB] Transaction started { requestId: "req_abc", isolationLevel: "Serializable" }
[10:30:00.150] [DB] Slot locked { requestId: "req_abc", slotId: "slot_789" }
[10:30:00.200] [DB] Appointment created { requestId: "req_abc", appointmentId: "appt_123" }
[10:30:00.250] [DB] Transaction committed { requestId: "req_abc", duration: 150 }
[10:30:00.300] [Notification] Queued notification { requestId: "req_abc", type: "APPOINTMENT_CONFIRMED" }
[10:30:00.350] [API] Request completed { requestId: "req_abc", status: 201, duration: 350 }
```

---

## Complete Job Lifecycle

**Full walkthrough from homeowner request to vendor payout.**

### Phase 1: Service Request Creation

**Actor:** Homeowner
**Trigger:** User taps "Request Help" in mobile app
**Duration:** ~200ms

```typescript
// POST /api/service-requests
const serviceRequest = await prisma.serviceRequest.create({
  data: {
    homeownerId: user.homeownerId,
    homeId,
    title,
    description,
    photos: uploadedPhotoUrls,
    urgency: 'NORMAL',  // Default, AI will override
    status: 'SUBMITTED',
  },
});

// AI triage (async, doesn't block response)
setImmediate(async () => {
  const triage = await AIService.triageRequest(description, photos);

  await prisma.serviceRequest.update({
    where: { id: serviceRequest.id },
    data: {
      urgency: triage.urgency,  // CRITICAL, HIGH, NORMAL, LOW
      detectedCategory: triage.category,  // "HVAC", "Plumbing", etc.
      replacementNeeded: triage.replacementNeeded,
      triageNotes: triage.reasoning,
      status: 'TRIAGED',
    },
  });
});

// Create initial job ledger entry
await prisma.jobLedger.create({
  data: {
    serviceRequestId: serviceRequest.id,
    homeownerId: user.homeownerId,
    categoryName: detectedCategory,
    status: 'REQUEST_CREATED',
    requestCreatedAt: new Date(),
  },
});

return { serviceRequest };
```

**Database State:**
```
serviceRequests: { id: sr_1, status: 'SUBMITTED', urgency: 'NORMAL' }
jobLedger: { id: jl_1, status: 'REQUEST_CREATED', requestCreatedAt: T1 }
```

### Phase 2: Vendor Matching

**Actor:** System
**Trigger:** AI triage completes
**Duration:** ~500ms

```typescript
// Find vendors who service this category and zip code
const vendors = await prisma.vendor.findMany({
  where: {
    status: 'VERIFIED',
    serviceZipCodes: { has: home.zipCode },
    services: {
      some: {
        categoryId: detectedCategoryId,
        isActive: true,
      },
    },
  },
});

// Matching algorithm: 1 sponsored + 2 organic
const sponsored = vendors
  .filter(v => v.sponsorships.some(s => s.isActive))
  .sort((a, b) => b.sponsorships[0].tier - a.sponsorships[0].tier)[0];

const organic = vendors
  .filter(v => v.id !== sponsored?.id)
  .sort((a, b) => {
    // Score by: rating (50%), total jobs (30%), response time (20%)
    const scoreA = a.averageRating * 0.5 + (a.totalJobs / 100) * 0.3;
    const scoreB = b.averageRating * 0.5 + (b.totalJobs / 100) * 0.3;
    return scoreB - scoreA;
  })
  .slice(0, 2);

const matched = [sponsored, ...organic].filter(Boolean).slice(0, 3);

// Update service request
await prisma.serviceRequest.update({
  where: { id: serviceRequest.id },
  data: { status: 'VENDOR_MATCHED' },
});

// Update job ledger
await prisma.jobLedger.updateMany({
  where: { serviceRequestId: serviceRequest.id },
  data: {
    status: 'SENT_TO_VENDOR',
    sentToVendorAt: new Date(),
  },
});

// Notify homeowner
await NotificationService.send('VENDOR_MATCHED', {
  userId: homeowner.userId,
  data: { vendorCount: matched.length },
});

return { vendors: matched };
```

**Database State:**
```
serviceRequests: { id: sr_1, status: 'VENDOR_MATCHED' }
jobLedger: { id: jl_1, status: 'SENT_TO_VENDOR', sentToVendorAt: T2 }
```

### Phase 3: Appointment Booking

**Actor:** Homeowner
**Trigger:** User selects vendor and time slot
**Duration:** ~300ms (includes Serializable transaction)

```typescript
// POST /api/appointments
await prisma.$transaction(async (tx) => {
  // 1. Lock availability slot (optimistic locking)
  const slot = await tx.availabilitySlot.findFirst({
    where: {
      vendorId,
      startTime: new Date(scheduledStart),
      isBooked: false,
    },
  });

  if (!slot) {
    throw new AppError('Time slot not available', 409);
  }

  const updatedSlot = await tx.availabilitySlot.updateMany({
    where: {
      id: slot.id,
      isBooked: false  // ← Optimistic lock
    },
    data: { isBooked: true },
  });

  if (updatedSlot.count === 0) {
    throw new AppError('Time slot no longer available', 409);
  }

  // 2. Create appointment
  const appointment = await tx.appointment.create({
    data: {
      homeownerId,
      homeId,
      vendorId,
      serviceRequestId,
      scheduledStart: new Date(scheduledStart),
      scheduledEnd: new Date(scheduledEnd),
      status: vendor.autoAcceptBookings ? 'VENDOR_ACCEPTED' : 'REQUESTED',
      vendorAcceptedAt: vendor.autoAcceptBookings ? new Date() : undefined,
    },
  });

  // 3. Link slot to appointment
  await tx.availabilitySlot.update({
    where: { id: slot.id },
    data: { bookedBy: appointment.id },
  });

  // 4. Update job ledger
  await tx.jobLedger.updateMany({
    where: { serviceRequestId },
    data: {
      appointmentId: appointment.id,
      status: 'VENDOR_ACCEPTED',
      vendorId,
      vendorAcceptedAt: new Date(),
    },
  });

  // 5. Update service request
  await tx.serviceRequest.update({
    where: { id: serviceRequestId },
    data: { status: 'SCHEDULED' },
  });

  return appointment;
}, {
  isolationLevel: 'Serializable',  // Prevents all concurrency issues
  timeout: 10000,
});

// Notify vendor (async)
setImmediate(async () => {
  await NotificationService.send('APPOINTMENT_REQUESTED', {
    userId: vendor.userId,
    data: { homeownerName, scheduledStart },
  });
});

return { appointment };
```

**Database State:**
```
appointments: { id: appt_1, status: 'VENDOR_ACCEPTED', scheduledStart: T3 }
availabilitySlots: { id: slot_1, isBooked: true, bookedBy: 'appt_1' }
serviceRequests: { id: sr_1, status: 'SCHEDULED' }
jobLedger: { id: jl_1, status: 'VENDOR_ACCEPTED', vendorAcceptedAt: T3 }
```

### Phase 4: Payment Authorization

**Actor:** Homeowner
**Trigger:** User enters payment method
**Duration:** ~1000ms (Stripe API call)

```typescript
// POST /api/payments/create-intent
// Requires: Idempotency-Key header

// Check idempotency
const existingKey = await prisma.idempotencyKey.findUnique({
  where: { key: idempotencyKey },
});

if (existingKey?.completedAt) {
  // Return cached response
  return res.status(existingKey.statusCode).json(existingKey.response);
}

// Create payment intent with Stripe
const paymentIntent = await stripe.paymentIntents.create({
  amount: 15000,  // $150.00
  currency: 'usd',
  application_fee_amount: 2250,  // 15% platform fee
  transfer_data: {
    destination: vendor.stripeAccountId,  // Direct to vendor
  },
  capture_method: 'manual',  // Don't charge yet, just authorize
  metadata: {
    appointmentId: appointment.id,
    homeownerId,
  },
});

// Record payment in database
const payment = await prisma.payment.create({
  data: {
    homeownerId,
    appointmentId: appointment.id,
    amount: 15000,
    platformFee: 2250,
    vendorPayoutAmount: 12750,
    stripePaymentIntentId: paymentIntent.id,
    status: 'PENDING',
    authorizedAt: new Date(),
  },
});

// Cache response
await prisma.idempotencyKey.update({
  where: { key: idempotencyKey },
  data: {
    statusCode: 200,
    response: { clientSecret: paymentIntent.client_secret },
    completedAt: new Date(),
  },
});

return {
  clientSecret: paymentIntent.client_secret,
  paymentIntentId: paymentIntent.id,
};
```

**Database State:**
```
payments: { id: pay_1, status: 'PENDING', amount: 15000, authorizedAt: T4 }
idempotencyKeys: { key: 'uuid_1', completedAt: T4, response: {...} }
```

**Stripe State (External):**
```
PaymentIntent: { id: pi_123, status: 'requires_capture', amount: 15000 }
```

### Phase 5: Appointment Reminder

**Actor:** System (Background Worker)
**Trigger:** 24 hours before appointment
**Duration:** ~500ms per appointment

```typescript
// Reminder Worker (runs hourly)
const now = new Date();
const reminderTime = new Date(now.getTime() + 24 * 60 * 60 * 1000);

const upcomingAppointments = await prisma.appointment.findMany({
  where: {
    scheduledStart: {
      gte: new Date(reminderTime.getTime() - 60 * 60 * 1000),
      lte: new Date(reminderTime.getTime() + 60 * 60 * 1000),
    },
    status: { in: ['SCHEDULED', 'VENDOR_ACCEPTED'] },
  },
});

for (const appointment of upcomingAppointments) {
  // Send to homeowner
  await NotificationService.send('APPOINTMENT_REMINDER', {
    userId: appointment.homeownerId,
    data: {
      vendorName: appointment.vendor.businessName,
      date: appointment.scheduledStart.toLocaleDateString(),
      time: appointment.scheduledStart.toLocaleTimeString(),
    },
  });

  // Send to vendor
  await NotificationService.send('APPOINTMENT_REMINDER', {
    userId: appointment.vendorId,
    data: {
      homeownerName: `${appointment.homeowner.user.firstName} ${appointment.homeowner.user.lastName}`,
      date: appointment.scheduledStart.toLocaleDateString(),
      time: appointment.scheduledStart.toLocaleTimeString(),
    },
  });
}
```

**No Database Changes** (notifications are side effects)

### Phase 6: Job Completion (by Vendor)

**Actor:** Vendor
**Trigger:** Vendor uploads proof and marks complete
**Duration:** ~200ms

```typescript
// POST /api/appointments/:id/complete

// Validate state transition
JobStateMachine.validateTransition(appointment.status, 'COMPLETED_BY_VENDOR');

const stateLog = createStateTransitionLog(
  appointment.status,
  'COMPLETED_BY_VENDOR',
  req.user.id,
  'Vendor submitted completion proof'
);

// Update appointment
const updated = await prisma.appointment.update({
  where: { id: appointmentId },
  data: {
    status: 'COMPLETED_BY_VENDOR',
    completedAt: new Date(),
    completionPhotos: uploadedPhotoUrls,
    completionNotes: notes,
    checkInTimestamp: checkInTime,
    checkOutTimestamp: checkOutTime,
    stateHistory: {
      push: stateLog,
    },
  },
});

// Update job ledger
await prisma.jobLedger.updateMany({
  where: { appointmentId },
  data: {
    status: 'COMPLETED_BY_VENDOR',
    completedByVendorAt: new Date(),
    hasBeforeAfterPhotos: true,
    hasTimestamps: true,
    hasInvoice: !!invoiceUrl,
  },
});

// Start 48-hour auto-confirmation timer (background worker handles this)

// Notify homeowner
await NotificationService.send('JOB_COMPLETED', {
  userId: appointment.homeownerId,
  data: {
    vendorName: appointment.vendor.businessName,
    appointmentId,
  },
});

return { appointment: updated };
```

**Database State:**
```
appointments: {
  id: appt_1,
  status: 'COMPLETED_BY_VENDOR',
  completedAt: T5,
  completionPhotos: ['url1', 'url2'],
  stateHistory: [
    { fromStatus: 'VENDOR_ACCEPTED', toStatus: 'COMPLETED_BY_VENDOR', timestamp: T5 }
  ]
}
jobLedger: {
  id: jl_1,
  status: 'COMPLETED_BY_VENDOR',
  completedByVendorAt: T5,
  hasBeforeAfterPhotos: true,
  hasTimestamps: true,
}
```

### Phase 7: Homeowner Confirmation (or Auto-Confirmation)

**Scenario A: Homeowner Confirms Within 48 Hours**

```typescript
// POST /api/appointments/:id/confirm

JobStateMachine.validateTransition(appointment.status, 'COMPLETED_CONFIRMED');

const stateLog = createStateTransitionLog(
  appointment.status,
  'COMPLETED_CONFIRMED',
  req.user.id,
  'Homeowner confirmed job completion'
);

// Update appointment
await prisma.appointment.update({
  where: { id: appointmentId },
  data: {
    status: 'COMPLETED_CONFIRMED',
    homeownerConfirmedAt: new Date(),
    stateHistory: { push: stateLog },
  },
});

// Update job ledger
await prisma.jobLedger.updateMany({
  where: { appointmentId },
  data: {
    status: 'COMPLETED_CONFIRMED',
    completedConfirmedAt: new Date(),
    hasHomeownerConfirmation: true,
  },
});

// Capture payment (move money from homeowner to platform+vendor)
const payment = await prisma.payment.findUnique({
  where: { appointmentId },
});

await stripe.paymentIntents.capture(payment.stripePaymentIntentId);

await prisma.payment.update({
  where: { id: payment.id },
  data: {
    status: 'SUCCEEDED',
    capturedAt: new Date(),
  },
});

// Release vendor payout (automatic with destination charges)
await prisma.payment.update({
  where: { id: payment.id },
  data: {
    vendorPayoutStatus: 'RELEASED',
    vendorPayoutReleasedAt: new Date(),
  },
});

await prisma.jobLedger.updateMany({
  where: { appointmentId },
  data: {
    vendorPaidOut: true,
    paidOutAt: new Date(),
  },
});

// Notify vendor
await NotificationService.send('PAYOUT_RELEASED', {
  userId: appointment.vendorId,
  data: {
    amount: payment.vendorPayoutAmount / 100,  // Convert cents to dollars
    jobDescription: `Job #${appointmentId}`,
  },
});

return { appointment };
```

**Scenario B: Auto-Confirmation After 48 Hours**

```typescript
// Auto-Confirmation Worker (runs hourly)
const cutoffTime = new Date();
cutoffTime.setHours(cutoffTime.getHours() - 48);

const pendingJobs = await prisma.appointment.findMany({
  where: {
    status: 'COMPLETED_BY_VENDOR',
    completedAt: { lte: cutoffTime },
  },
});

for (const job of pendingJobs) {
  // Same logic as manual confirmation, but:
  await prisma.appointment.update({
    data: {
      status: 'COMPLETED_CONFIRMED',
      homeownerConfirmedAt: new Date(),
      autoConfirmed: true,  // ← Flag indicating auto-confirmation
    },
  });

  await prisma.jobLedger.updateMany({
    data: {
      autoConfirmed: true,
    },
  });

  // Capture payment and release payout (same as manual)
  // ...

  // Notify both parties
  await NotificationService.send('JOB_AUTO_CONFIRMED', {
    userId: job.homeownerId,
    data: { vendorName, appointmentId },
  });

  await NotificationService.send('PAYOUT_RELEASED', {
    userId: job.vendorId,
    data: { amount, jobDescription },
  });
}
```

**Database State (Final):**
```
appointments: {
  id: appt_1,
  status: 'COMPLETED_CONFIRMED',
  completedAt: T5,
  homeownerConfirmedAt: T6,
  autoConfirmed: false,  // (or true if auto-confirmed)
}
payments: {
  id: pay_1,
  status: 'SUCCEEDED',
  authorizedAt: T4,
  capturedAt: T6,
  vendorPayoutStatus: 'RELEASED',
  vendorPayoutReleasedAt: T6,
}
jobLedger: {
  id: jl_1,
  status: 'COMPLETED_CONFIRMED',
  completedConfirmedAt: T6,
  vendorPaidOut: true,
  paidOutAt: T6,
  hasHomeownerConfirmation: true,
}
```

**Stripe State (Final):**
```
PaymentIntent: { id: pi_123, status: 'succeeded', amount_received: 15000 }
Transfer: { id: tr_456, amount: 12750, destination: vendor_stripe_account }
```

### Phase 8: Review (Optional)

```typescript
// POST /api/reviews

const review = await prisma.review.create({
  data: {
    appointmentId,
    vendorId,
    rating: 5,
    title: 'Excellent work!',
    comment: 'Very professional, arrived on time, fixed the issue quickly.',
    professionalismRating: 5,
    qualityRating: 5,
    communicationRating: 5,
    valueRating: 5,
  },
});

// Update vendor average rating
const allReviews = await prisma.review.findMany({
  where: { vendorId },
});

const avgRating = allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length;

await prisma.vendor.update({
  where: { id: vendorId },
  data: {
    averageRating: avgRating,
    totalReviews: allReviews.length,
    totalJobs: { increment: 1 },
  },
});

return { review };
```

---

## Failure Scenarios

Real-world failure modes and how the system handles them.

### Scenario 1: Concurrent Booking Attempts

**Failure:** Two homeowners try to book the same time slot simultaneously.

**Timeline:**
```
T1: Homeowner A reads slot_123 (isBooked = false)
T2: Homeowner B reads slot_123 (isBooked = false)
T3: Homeowner A starts transaction
T4: Homeowner B starts transaction
T5: Homeowner A locks slot_123
T6: Homeowner B tries to lock slot_123 (blocked, waits for A's lock)
T7: Homeowner A updates slot_123 (isBooked = true)
T8: Homeowner A commits transaction
T9: Homeowner B's lock acquired, reads slot_123 (isBooked = true)
T10: Homeowner B's optimistic lock check fails (count = 0)
T11: Homeowner B's transaction rolls back
T12: Homeowner B receives 409 error
```

**System Behavior:**
- ✅ Exactly one booking succeeds
- ✅ Second booking fails with deterministic error (409)
- ✅ No phantom bookings created
- ✅ Database consistency maintained

**User Experience:**
- Homeowner A: Success, appointment booked
- Homeowner B: Error message "Time slot no longer available", shown other available slots

### Scenario 2: Payment Authorized, Booking Failed

**Failure:** Stripe authorization succeeds but database transaction fails.

**Timeline:**
```
T1: Call stripe.paymentIntents.create() → Success (payment authorized)
T2: Start database transaction
T3: Database connection lost
T4: Transaction rolls back
T5: API returns 500 error to client
T6: Payment intent still exists in Stripe (money on hold)
```

**Without Compensation:**
- ❌ Homeowner's money held indefinitely
- ❌ No appointment created
- ❌ Manual intervention required

**With Compensation:**
```typescript
try {
  const paymentIntent = await stripe.paymentIntents.create({ ... });

  await prisma.$transaction(async (tx) => {
    await tx.appointment.create({ ... });
    // Database error thrown here
  });

} catch (error) {
  // Compensate: Cancel the payment intent
  await stripe.paymentIntents.cancel(paymentIntent.id);
  throw error;
}
```

**System Behavior:**
- ✅ Payment authorization cancelled
- ✅ Homeowner's money not held
- ✅ Client receives 500 error (can retry)
- ✅ No orphaned payment intents

### Scenario 3: Job Completed, Notification Failed

**Failure:** Vendor marks job complete but notification to homeowner fails.

**Timeline:**
```
T1: Update appointment.status = 'COMPLETED_BY_VENDOR' → Success
T2: Update jobLedger → Success
T3: Database transaction commits
T4: Send notification via Twilio → Failure (rate limit)
```

**Wrong Approach:**
```typescript
// ❌ Rolling back job completion because notification failed
await prisma.appointment.update({ status: 'COMPLETED_BY_VENDOR' });
await NotificationService.send(...);  // Fails
// Rollback job completion (wrong!)
```

**Why Wrong?**
- Vendor already did the work
- Vendor's proof is already submitted
- Notification is a side effect, not core truth

**Correct Approach:**
```typescript
// ✅ Job completion succeeds, notification retried later
try {
  await prisma.appointment.update({ status: 'COMPLETED_BY_VENDOR' });
  await NotificationService.send(...);
} catch (error) {
  logger.error('Notification failed', { appointmentId, error });

  // Queue for retry
  await prisma.notificationQueue.create({
    data: {
      type: 'JOB_COMPLETED',
      appointmentId,
      retryCount: 0,
    },
  });
}

// Separate worker retries failed notifications
setInterval(async () => {
  const pending = await prisma.notificationQueue.findMany({
    where: { retryCount: { lt: 3 } },
  });

  for (const notification of pending) {
    try {
      await NotificationService.send(...);
      await prisma.notificationQueue.delete({ where: { id: notification.id } });
    } catch (error) {
      await prisma.notificationQueue.update({
        where: { id: notification.id },
        data: { retryCount: { increment: 1 } },
      });
    }
  }
}, 60000);  // Every minute
```

**System Behavior:**
- ✅ Job completion recorded (truth established)
- ✅ Notification retried automatically
- ✅ After 3 failures, moved to dead-letter queue
- ✅ Ops team alerted for manual investigation

### Scenario 4: Auto-Confirmation Worker Crashes

**Failure:** Auto-confirmation worker crashes mid-processing.

**Timeline:**
```
T1: Worker starts processing 10 jobs
T2: Job 1 confirmed successfully
T3: Job 2 confirmed successfully
T4: Job 3 payment capture fails (Stripe timeout)
T5: Worker crashes (unhandled exception)
T6: Jobs 4-10 not processed
```

**Without Error Isolation:**
- ❌ Jobs 4-10 stuck forever
- ❌ Vendors not paid
- ❌ Manual intervention required for all jobs

**With Error Isolation:**
```typescript
for (const job of pendingJobs) {
  try {
    await processAutoConfirmation(job);
    logger.info('Job auto-confirmed', { jobId: job.id });
  } catch (error) {
    // Log error but continue with next job
    logger.error('Failed to auto-confirm job', { jobId: job.id, error });

    // Don't crash entire worker
    continue;
  }
}
```

**System Behavior:**
- ✅ Jobs 1-2: Confirmed successfully
- ✅ Job 3: Failed, logged, will retry next hour
- ✅ Jobs 4-10: Processed successfully
- ✅ Worker doesn't crash
- ✅ Next run (1 hour later) retries job 3

### Scenario 5: Idempotency Key Collision

**Failure:** Client generates same UUID twice (very rare but possible).

**Timeline:**
```
T1: Client generates UUID: "abc-123"
T2: Request 1 with key "abc-123" → Create payment intent pi_1
T3: Request 1 completes, caches response
T4: 10 hours later...
T5: Client generates same UUID: "abc-123" (collision!)
T6: Request 2 with key "abc-123" → Checks cache
T7: Cache hit! Returns payment intent pi_1
T8: Client tries to use pi_1 (already captured from 10 hours ago)
```

**Without Expiration:**
- ❌ Client gets stale payment intent
- ❌ Payment flow breaks
- ❌ Homeowner can't complete booking

**With Expiration (24 hours):**
```typescript
const existingKey = await prisma.idempotencyKey.findUnique({
  where: { key: idempotencyKey },
});

if (existingKey) {
  // Check if expired
  if (new Date() > existingKey.expiresAt) {
    // Expired, delete and allow new request
    await prisma.idempotencyKey.delete({ where: { id: existingKey.id } });
  } else if (existingKey.completedAt) {
    // Not expired, return cached response
    return res.status(existingKey.statusCode).json(existingKey.response);
  }
}
```

**System Behavior:**
- ✅ After 24 hours, key expires
- ✅ New request with same key creates new payment intent
- ✅ No stale data returned
- ✅ Edge case handled gracefully

### Scenario 6: Payout Released, Database Update Failed

**Failure:** Stripe transfer succeeds but database update fails (nightmare scenario).

**Timeline:**
```
T1: stripe.transfers.create() → Success (money sent to vendor)
T2: prisma.payment.update() → Failure (database timeout)
T3: Transaction rolls back
T4: Database says "payout not released"
T5: Stripe says "payout released"
T6: System state diverged
```

**Without Detection:**
- ❌ Vendor paid but system shows unpaid
- ❌ Vendor may get paid twice if retried
- ❌ Financial reconciliation breaks

**With Critical Alert:**
```typescript
try {
  await stripe.transfers.create({ ... });

  await prisma.payment.update({
    data: { vendorPayoutStatus: 'RELEASED' },
  });

} catch (error) {
  // Money already sent, can't rollback
  await alertOpsTeam({
    severity: 'CRITICAL',
    message: 'Payout released but database update failed',
    paymentId: payment.id,
    stripeTransferId: transfer.id,
    error: error.message,
  });

  // Also write to dead-letter queue for reconciliation
  await prisma.deadLetterQueue.create({
    data: {
      type: 'PAYOUT_DB_MISMATCH',
      payload: { paymentId: payment.id, transferId: transfer.id },
    },
  });
}
```

**Better Approach (Prevent Divergence):**
```typescript
// ALWAYS update database first, then call Stripe
await prisma.$transaction(async (tx) => {
  await tx.payment.update({
    data: { vendorPayoutStatus: 'RELEASING' },  // Intermediate state
  });
});

// If this fails, database rolls back and we never call Stripe
// If this succeeds, we have database record BEFORE money moves

try {
  const transfer = await stripe.transfers.create({ ... });

  // Update to final state
  await prisma.payment.update({
    data: {
      vendorPayoutStatus: 'RELEASED',
      stripeTransferId: transfer.id,
    },
  });

} catch (error) {
  // Stripe call failed, mark as FAILED in database
  await prisma.payment.update({
    data: {
      vendorPayoutStatus: 'FAILED',
      vendorPayoutFailureReason: error.message,
    },
  });

  // Alert ops team (may need manual transfer)
}
```

**System Behavior:**
- ✅ Database updated BEFORE money moves
- ✅ If Stripe fails, database reflects failure
- ✅ No divergence between systems
- ✅ Critical alerts for manual intervention

---

## Non-Negotiable Architecture Rules

These rules **must not be violated** under any circumstance.

### Rule 1: Database is Single Source of Truth

**Never trust external services as source of truth.**

❌ **WRONG:**
```typescript
const payment = await stripe.paymentIntents.retrieve(id);
if (payment.status === 'succeeded') {
  await releaseVendorPayout();  // Based on Stripe state
}
```

✅ **CORRECT:**
```typescript
const payment = await prisma.payment.findUnique({ where: { id } });
if (payment.status === 'SUCCEEDED') {
  await releaseVendorPayout();  // Based on our database
}
```

**Why?**
- External services can be unavailable
- Stripe can return stale data
- Our database is the canonical truth

### Rule 2: All State Transitions Must Be Validated

**Never update status without state machine validation.**

❌ **WRONG:**
```typescript
await prisma.appointment.update({
  data: { status: newStatus },  // No validation
});
```

✅ **CORRECT:**
```typescript
JobStateMachine.validateTransition(currentStatus, newStatus);
await prisma.appointment.update({
  data: { status: newStatus },
});
```

**Why?**
- Prevents impossible states (paid without confirmation)
- Enforces business rules
- Catches bugs at runtime

### Rule 3: Payment Operations Must Be Idempotent

**All payment endpoints require Idempotency-Key header.**

❌ **WRONG:**
```typescript
router.post('/create-intent', createPaymentIntent);  // No idempotency
```

✅ **CORRECT:**
```typescript
router.post('/create-intent', idempotencyMiddleware, createPaymentIntent);
```

**Why?**
- Network failures cause retries
- Retries without idempotency = double charges
- Financial operations must be deterministic

### Rule 4: Money Moves Last

**Update database BEFORE calling external payment APIs.**

❌ **WRONG:**
```typescript
await stripe.transfers.create({ ... });  // Money moves first
await prisma.payment.update({ ... });  // Database second
```

✅ **CORRECT:**
```typescript
await prisma.payment.update({ ... });  // Database first
await stripe.transfers.create({ ... });  // Money moves second
```

**Why?**
- If database fails after money moves, systems diverge
- Money movement is irreversible
- Database can be retried, money can't be "unsent"

### Rule 5: Critical Operations Use Serializable Isolation

**Appointment booking must use Serializable transactions.**

❌ **WRONG:**
```typescript
await prisma.$transaction(async (tx) => {
  // Default isolation (Read Committed)
});
```

✅ **CORRECT:**
```typescript
await prisma.$transaction(async (tx) => {
  // Serializable isolation
}, { isolationLevel: 'Serializable' });
```

**Why?**
- Read Committed allows phantom reads
- Concurrent bookings can create double-booking
- Serializable prevents ALL concurrency anomalies

### Rule 6: Background Workers Must Be Idempotent

**Workers must safely handle being run multiple times.**

❌ **WRONG:**
```typescript
for (const job of jobs) {
  await confirmJob(job);  // Not checking if already confirmed
}
```

✅ **CORRECT:**
```typescript
for (const job of jobs) {
  if (job.status === 'COMPLETED_BY_VENDOR') {
    await confirmJob(job);  // Only confirm if in correct state
  }
}
```

**Why?**
- Workers may crash mid-run and restart
- Cron jobs may run twice (clock skew)
- Idempotency prevents double-processing

### Rule 7: Errors Must Be Isolated

**One job failure must not crash entire worker.**

❌ **WRONG:**
```typescript
for (const job of jobs) {
  await processJob(job);  // Exception crashes entire loop
}
```

✅ **CORRECT:**
```typescript
for (const job of jobs) {
  try {
    await processJob(job);
  } catch (error) {
    logger.error('Job failed', { jobId: job.id, error });
    continue;  // Process next job
  }
}
```

**Why?**
- One bad job shouldn't block all other jobs
- Worker runs again next cycle (automatic retry)
- Errors are logged for investigation

### Rule 8: Financial State Must Trigger Alerts

**Payout mismatches must wake up engineers.**

❌ **WRONG:**
```typescript
try {
  await stripe.transfers.create({ ... });
  await prisma.payment.update({ ... });
} catch (error) {
  logger.error('Payout failed', error);  // Just log
}
```

✅ **CORRECT:**
```typescript
try {
  await stripe.transfers.create({ ... });
  await prisma.payment.update({ ... });
} catch (error) {
  logger.error('Payout failed', error);
  await alertOpsTeam({
    severity: 'CRITICAL',
    message: 'Payout database mismatch',
    ...
  });
}
```

**Why?**
- Financial errors require immediate attention
- Vendors expect timely payouts
- Divergence between systems is critical

### Rule 9: External APIs Must Have Timeouts

**All external calls must timeout to prevent hanging.**

❌ **WRONG:**
```typescript
const stripe = new Stripe(apiKey);  // No timeout
```

✅ **CORRECT:**
```typescript
const stripe = new Stripe(apiKey, {
  timeout: 15000,  // 15 second timeout
  maxNetworkRetries: 2,
});
```

**Why?**
- External APIs can hang indefinitely
- Hangs consume server resources
- Timeouts allow graceful failure

### Rule 10: State Changes Must Be Audited

**All status transitions must be logged in stateHistory.**

❌ **WRONG:**
```typescript
await prisma.appointment.update({
  data: { status: newStatus },
});
```

✅ **CORRECT:**
```typescript
await prisma.appointment.update({
  data: {
    status: newStatus,
    stateHistory: {
      push: {
        fromStatus: oldStatus,
        toStatus: newStatus,
        timestamp: new Date(),
        triggeredBy: userId,
      },
    },
  },
});
```

**Why?**
- Disputes require proof of what happened
- Debugging requires state history
- Compliance requires audit trails

---

## Summary

Estate Standard's architecture is built on three pillars:

1. **Correctness First**: Serializable transactions, state machines, and idempotency ensure the system can't enter invalid states.

2. **Explicit Systems**: Every operation has defined preconditions, postconditions, and failure modes. No magic.

3. **Graceful Degradation**: When things fail (and they will), the system fails safely with alerts and audit trails.

This architecture enables Estate Standard to handle real-world chaos: network failures, concurrent requests, partial outages, and human error.

The system is production-ready.
