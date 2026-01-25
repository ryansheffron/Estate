# Estate Standard API Documentation

**Version:** 1.0.0
**Base URL:** `http://localhost:3000/api`
**Environment:** Development (DFW - Northlake/Fort Worth)

## Table of Contents

1. [Authentication](#authentication)
2. [Service Requests](#service-requests)
3. [Vendor Matching & Scheduling](#vendor-matching--scheduling)
4. [Appointments & Job Management](#appointments--job-management)
5. [Payments & Payouts](#payments--payouts)
6. [Maintenance Tracking](#maintenance-tracking)
7. [Recurring Services](#recurring-services)
8. [Job State Machine](#job-state-machine)
9. [Error Handling](#error-handling)
10. [Webhooks](#webhooks)
11. [Idempotency](#idempotency)
12. [Background Workers](#background-workers)

---

## Authentication

All endpoints except `/auth/*` and `/webhooks/*` require JWT authentication.

### Register User
```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "sarah@example.com",
  "password": "SecurePass123!",
  "firstName": "Sarah",
  "lastName": "Mitchell",
  "phone": "+14695550123",
  "role": "HOMEOWNER" | "VENDOR" | "ADMIN"
}
```

**Response (201):**
```json
{
  "status": "success",
  "data": {
    "user": {
      "id": "usr_abc123",
      "email": "sarah@example.com",
      "role": "HOMEOWNER",
      "verified": false
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "sarah@example.com",
  "password": "SecurePass123!"
}
```

**Response (200):**
```json
{
  "status": "success",
  "data": {
    "user": {
      "id": "usr_abc123",
      "email": "sarah@example.com",
      "role": "HOMEOWNER"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

---

## Service Requests

### Create Service Request
```http
POST /api/service-requests
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "homeId": "home_xyz789",
  "categoryId": "cat_hvac",
  "description": "My HVAC system is making a loud grinding noise and it's not cooling the house below 75°F. It's 95°F outside and we have young kids. Please help!",
  "urgency": "HIGH",
  "photos": ["https://s3.amazonaws.com/estate/photo1.jpg"],
  "preferredTimeSlots": ["2024-01-05T08:00:00Z", "2024-01-05T12:00:00Z"]
}
```

**AI Triage Response (201):**
```json
{
  "status": "success",
  "data": {
    "serviceRequest": {
      "id": "sr_def456",
      "homeId": "home_xyz789",
      "categoryId": "cat_hvac",
      "description": "My HVAC system is making a loud grinding noise...",
      "aiTriage": {
        "urgency": "HIGH",
        "category": "HVAC System",
        "schedulingWindow": "24-48 hours",
        "estimatedCost": {
          "min": 200,
          "max": 400
        },
        "replacementLikely": false,
        "suggestedResponse": "Urgent service needed. We'll match you with verified HVAC specialists available within 24-48 hours."
      },
      "status": "REQUESTED",
      "createdAt": "2024-01-05T14:30:00Z"
    }
  }
}
```

### Get 3 Vendor Recommendations
```http
GET /api/service-requests/{id}/vendors
Authorization: Bearer {accessToken}
```

**Response (200):**
```json
{
  "status": "success",
  "data": {
    "vendors": [
      {
        "id": "vendor_001",
        "businessName": "Cool Breeze HVAC",
        "rating": 4.9,
        "reviewCount": 127,
        "distance": 2.3,
        "sponsored": true,
        "hourlyRate": 85,
        "availability": "Available today",
        "licensed": true,
        "insured": true,
        "verified": true
      },
      {
        "id": "vendor_002",
        "businessName": "DFW Climate Control",
        "rating": 4.8,
        "reviewCount": 89,
        "distance": 4.7,
        "sponsored": false,
        "hourlyRate": 95,
        "availability": "Available today"
      },
      {
        "id": "vendor_003",
        "businessName": "Texas Temp Solutions",
        "rating": 4.7,
        "reviewCount": 64,
        "distance": 8.2,
        "sponsored": false,
        "hourlyRate": 80,
        "availability": "Available tomorrow"
      }
    ],
    "algorithm": "1 sponsored + 2 organic (sorted by rating)"
  }
}
```

---

## Vendor Matching & Scheduling

### Get Vendor Availability
```http
GET /api/vendors/{vendorId}/availability?date=2024-01-05
Authorization: Bearer {accessToken}
```

**Response (200):**
```json
{
  "status": "success",
  "data": {
    "slots": [
      {
        "id": "slot_001",
        "startTime": "2024-01-05T08:00:00Z",
        "endTime": "2024-01-05T12:00:00Z",
        "isBooked": false,
        "label": "8-12 AM"
      },
      {
        "id": "slot_002",
        "startTime": "2024-01-05T12:00:00Z",
        "endTime": "2024-01-05T17:00:00Z",
        "isBooked": false,
        "label": "12-5 PM"
      }
    ]
  }
}
```

---

## Appointments & Job Management

### Create Appointment (Atomic Booking)
```http
POST /api/appointments
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "homeId": "home_xyz789",
  "vendorId": "vendor_001",
  "serviceRequestId": "sr_def456",
  "scheduledStart": "2024-01-05T12:00:00Z",
  "scheduledEnd": "2024-01-05T17:00:00Z"
}
```

**Response (201):**
```json
{
  "status": "success",
  "data": {
    "appointment": {
      "id": "appt_ghi789",
      "status": "VENDOR_ACCEPTED",
      "scheduledStart": "2024-01-05T12:00:00Z",
      "scheduledEnd": "2024-01-05T17:00:00Z",
      "vendor": {
        "businessName": "Cool Breeze HVAC",
        "contact": {
          "phone": "+14695551234"
        }
      },
      "autoAccepted": true,
      "createdAt": "2024-01-05T14:35:00Z"
    }
  }
}
```

**Error (409 - Slot Already Booked):**
```json
{
  "status": "error",
  "message": "Time slot no longer available",
  "code": "SLOT_BOOKED"
}
```

### Vendor Accept Appointment
```http
POST /api/appointments/{id}/accept
Authorization: Bearer {accessToken}
```

**Response (200):**
```json
{
  "status": "success",
  "data": {
    "appointment": {
      "id": "appt_ghi789",
      "status": "VENDOR_ACCEPTED",
      "vendorAcceptedAt": "2024-01-05T14:40:00Z",
      "stateHistory": [
        {
          "fromStatus": "REQUESTED",
          "toStatus": "VENDOR_ACCEPTED",
          "timestamp": "2024-01-05T14:40:00Z",
          "triggeredBy": "vendor_001",
          "reason": "Vendor accepted appointment"
        }
      ]
    }
  }
}
```

### Vendor Start Job (Check-In)
```http
POST /api/appointments/{id}/start
Authorization: Bearer {accessToken}
```

**Response (200):**
```json
{
  "status": "success",
  "data": {
    "appointment": {
      "id": "appt_ghi789",
      "status": "IN_PROGRESS",
      "actualStart": "2024-01-05T12:15:00Z",
      "checkInTimestamp": "2024-01-05T12:15:00Z"
    }
  }
}
```

### Vendor Complete Job
```http
POST /api/appointments/{id}/complete
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "completionNotes": "Replaced compressor fan motor. System running normally.",
  "completionPhotos": [
    "https://s3.amazonaws.com/estate/before.jpg",
    "https://s3.amazonaws.com/estate/after.jpg"
  ],
  "invoiceUrl": "https://s3.amazonaws.com/estate/invoice.pdf",
  "actualPrice": 28500
}
```

**Response (200):**
```json
{
  "status": "success",
  "data": {
    "appointment": {
      "id": "appt_ghi789",
      "status": "COMPLETED_BY_VENDOR",
      "completedAt": "2024-01-05T14:30:00Z",
      "actualEnd": "2024-01-05T14:30:00Z",
      "completionProof": {
        "hasPhotos": true,
        "hasInvoice": true,
        "hasTimestamps": true,
        "hasNotes": true,
        "proofCount": 4
      }
    }
  }
}
```

### Homeowner Confirm Completion
```http
POST /api/appointments/{id}/confirm
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "rating": 5,
  "review": "Excellent service! John was professional and fixed the issue quickly."
}
```

**Response (200):**
```json
{
  "status": "success",
  "data": {
    "appointment": {
      "id": "appt_ghi789",
      "status": "COMPLETED_CONFIRMED",
      "homeownerConfirmedAt": "2024-01-05T15:00:00Z",
      "autoConfirmed": false
    },
    "payment": {
      "status": "CAPTURED",
      "capturedAt": "2024-01-05T15:00:00Z"
    },
    "payout": {
      "status": "RELEASED",
      "vendorAmount": 24225,
      "platformFee": 4275,
      "releasedAt": "2024-01-05T15:00:00Z"
    }
  }
}
```

**Note:** If homeowner doesn't confirm within 48 hours, job is auto-confirmed and payment/payout are automatically processed.

---

## Payments & Payouts

### Create Payment Intent
```http
POST /api/payments/create-intent
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "appointmentId": "appt_ghi789",
  "amount": 28500
}
```

**Response (200):**
```json
{
  "status": "success",
  "data": {
    "clientSecret": "pi_3ABC123_secret_DEF456",
    "paymentIntentId": "pi_3ABC123DEF456",
    "breakdown": {
      "total": 28500,
      "platformFee": 4275,
      "vendorAmount": 24225,
      "platformFeePercent": 15
    }
  }
}
```

### Get Payment History (Homeowner)
```http
GET /api/payments
Authorization: Bearer {accessToken}
```

**Response (200):**
```json
{
  "status": "success",
  "data": {
    "payments": [
      {
        "id": "pay_001",
        "appointmentId": "appt_ghi789",
        "amount": 28500,
        "status": "COMPLETED",
        "capturedAt": "2024-01-05T15:00:00Z",
        "vendor": {
          "businessName": "Cool Breeze HVAC"
        },
        "createdAt": "2024-01-05T14:35:00Z"
      }
    ]
  }
}
```

### Get Vendor Payouts
```http
GET /api/payments/payouts
Authorization: Bearer {accessToken}
```

**Response (200):**
```json
{
  "status": "success",
  "data": {
    "payouts": [
      {
        "id": "pay_001",
        "appointmentId": "appt_ghi789",
        "vendorPayoutAmount": 24225,
        "vendorPayoutStatus": "RELEASED",
        "vendorPayoutReleasedAt": "2024-01-05T15:00:00Z",
        "homeowner": {
          "firstName": "Sarah",
          "lastName": "Mitchell"
        }
      }
    ],
    "summary": {
      "totalEarnings": 24225,
      "pendingPayouts": 0,
      "releasedPayouts": 1
    }
  }
}
```

### Create Vendor Stripe Connect Account
```http
POST /api/payments/vendor/connect-account
Authorization: Bearer {accessToken}
```

**Response (200):**
```json
{
  "status": "success",
  "data": {
    "stripeAccountId": "acct_1ABC123DEF456"
  }
}
```

### Get Vendor Onboarding Link
```http
GET /api/payments/vendor/onboarding-link
Authorization: Bearer {accessToken}
```

**Response (200):**
```json
{
  "status": "success",
  "data": {
    "url": "https://connect.stripe.com/setup/s/acct_1ABC123DEF456/AbCdEf123456"
  }
}
```

---

## Maintenance Tracking

### Get All Maintenance Categories
```http
GET /api/maintenance
Authorization: Bearer {accessToken}
```

**Response (200):**
```json
{
  "status": "success",
  "data": {
    "categories": [
      {
        "id": "cat_hvac",
        "name": "HVAC System",
        "defaultCadence": "QUARTERLY",
        "icon": "🌡️",
        "importance": "CRITICAL"
      },
      // ... 37 more categories
    ],
    "total": 38
  }
}
```

### Track Maintenance Completion
```http
POST /api/maintenance/homes/{homeId}/categories/{categoryId}/complete
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "vendorId": "vendor_001",
  "cost": 15000,
  "notes": "Annual HVAC inspection completed. All systems functioning properly."
}
```

**Response (200):**
```json
{
  "status": "success",
  "data": {
    "record": {
      "id": "rec_001",
      "categoryId": "cat_hvac",
      "completedAt": "2024-01-05T15:00:00Z",
      "nextDueAt": "2024-04-05T15:00:00Z",
      "cadence": "QUARTERLY"
    }
  }
}
```

---

## Recurring Services

### Create Recurring Schedule
```http
POST /api/recurring
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "homeId": "home_xyz789",
  "categoryId": "cat_landscaping",
  "vendorId": "vendor_005",
  "cadence": "MONTHLY",
  "startDate": "2024-01-15T00:00:00Z",
  "preferredDayOfWeek": 1,
  "preferredTimeSlot": "8-12 AM"
}
```

**Response (201):**
```json
{
  "status": "success",
  "data": {
    "recurringSchedule": {
      "id": "rec_sched_001",
      "cadence": "MONTHLY",
      "nextRunAt": "2024-02-15T08:00:00Z",
      "active": true
    }
  }
}
```

---

## Job State Machine

### Valid State Transitions

```
REQUESTED → VENDOR_MATCHED → VENDOR_ACCEPTED → SCHEDULED → IN_PROGRESS → COMPLETED_BY_VENDOR → COMPLETED_CONFIRMED

Any state → CANCELLED (except COMPLETED_CONFIRMED)
COMPLETED_BY_VENDOR → DISPUTED
DISPUTED → COMPLETED_CONFIRMED (admin resolution)
```

### Invalid Transition Example
```http
POST /api/appointments/{id}/complete
Authorization: Bearer {accessToken}
```

**Error (400 - when status is REQUESTED):**
```json
{
  "status": "error",
  "message": "Invalid state transition: REQUESTED → COMPLETED_BY_VENDOR. Allowed transitions: VENDOR_MATCHED, CANCELLED",
  "code": "INVALID_STATE_TRANSITION"
}
```

---

## Error Handling

### Standard Error Response
```json
{
  "status": "error",
  "message": "Human-readable error message",
  "code": "ERROR_CODE",
  "details": {
    "field": "email",
    "constraint": "unique_violation"
  }
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `SLOT_BOOKED` | 409 | Time slot already booked by another request |
| `INVALID_STATE_TRANSITION` | 400 | Job state transition not allowed |
| `PAYMENT_FAILED` | 402 | Payment processing failed |
| `VENDOR_NOT_VERIFIED` | 403 | Vendor not verified to receive jobs |
| `INSUFFICIENT_PROOF` | 400 | Completion requires 2+ proof types |
| `AUTO_CONFIRM_PENDING` | 200 | Job will auto-confirm in X hours |

---

## Webhooks

### Stripe Webhook
```http
POST /api/payments/webhook
Stripe-Signature: t=1234567890,v1=abc123def456...
Content-Type: application/json

{
  "type": "payment_intent.succeeded",
  "data": {
    "object": {
      "id": "pi_3ABC123DEF456",
      "amount": 28500,
      "status": "succeeded"
    }
  }
}
```

**Response (200):**
```json
{
  "received": true
}
```

**Security:**
- Webhook signature MUST be verified using `stripe.webhooks.constructEvent()`
- Invalid signatures return 401 Unauthorized
- Prevents webhook spoofing attacks

### Supported Webhook Events
- `payment_intent.succeeded` - Payment authorized
- `payment_intent.payment_failed` - Payment failed
- `account.updated` - Vendor Stripe account updated
- `charge.refunded` - Payment refunded

---

## Idempotency

Critical payment endpoints require an `Idempotency-Key` header to prevent duplicate charges from request retries.

### How Idempotency Works

1. **Client generates a unique UUID** for each unique operation
2. **Include in header**: `Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000`
3. **Server caches response** for 24 hours
4. **Retry with same key** returns cached response without re-processing

### Endpoints Requiring Idempotency Key

All payment mutation endpoints require idempotency:

- `POST /api/payments/create-intent` - Create payment intent
- `POST /api/payments/:id/capture` - Capture payment
- `POST /api/payments/:id/refund` - Refund payment
- `POST /api/payments/vendor/connect-account` - Create Stripe Connect account

### Example Request

```http
POST /api/payments/create-intent
Authorization: Bearer {accessToken}
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
Content-Type: application/json

{
  "appointmentId": "appt_123",
  "amount": 15000
}
```

### Error Responses

**Missing Idempotency Key (400):**
```json
{
  "status": "error",
  "message": "Idempotency-Key header required for POST requests"
}
```

**Invalid UUID Format (400):**
```json
{
  "status": "error",
  "message": "Idempotency-Key must be a valid UUID"
}
```

**Request In Progress (409):**
```json
{
  "status": "error",
  "message": "Request with this idempotency key is already in progress. Please retry later."
}
```

### Best Practices

- Generate a new UUID for each unique operation
- Store the UUID on the client before making the request
- Use the same UUID when retrying failed requests
- Don't reuse UUIDs across different operations
- Keys expire after 24 hours

---

## Background Workers

The Estate Standard backend runs several automated background workers to ensure smooth operations.

### Auto-Confirmation Worker

**Schedule:** Runs every hour
**Purpose:** Auto-confirms jobs if homeowner doesn't respond within 48 hours

**Process:**
1. Find jobs in `COMPLETED_BY_VENDOR` status for 48+ hours
2. Transition status to `COMPLETED_CONFIRMED`
3. Capture payment via Stripe
4. Release payout to vendor
5. Update job ledger
6. Send notifications to homeowner and vendor

**Triggered Jobs:**
- All jobs marked complete by vendor 48+ hours ago
- Ensures vendors get paid even if homeowner is unresponsive

### Appointment Reminder Worker

**Schedule:** Runs every hour
**Purpose:** Sends appointment reminders 24 hours before scheduled time

**Process:**
1. Find appointments scheduled in 24-25 hours
2. Send reminder to homeowner (SMS/email/in-app based on preference)
3. Send reminder to vendor (SMS/email/in-app)

**Reminder Window:**
- Sends between 23-25 hours before appointment
- Reduces no-shows and improves preparation

### Recurring Appointment Worker

**Schedule:** Runs daily at 2 AM
**Purpose:** Generates appointments from recurring maintenance rules

**Process:**
1. Find active recurring rules needing appointments
2. Calculate next appointment date based on frequency
3. Find available vendor time slots
4. Create appointment (auto-scheduled or requested based on settings)
5. Update recurring rule with next occurrence date
6. Send confirmation to homeowner

**Supported Frequencies:**
- `MONTHLY` - Every month
- `QUARTERLY` - Every 3 months
- `SEMI_ANNUAL` - Every 6 months
- `YEARLY` - Every year

### Cleanup Worker

**Schedule:** Runs daily at 3 AM
**Purpose:** Removes expired temporary data

**Process:**
1. Delete expired idempotency keys (24+ hours old)
2. Delete old refresh tokens (7+ days expired)
3. Delete old audit logs (90+ days old)
4. Frees database space and maintains performance

### Manual Worker Triggers (Admin)

Admins can manually trigger workers via API:

```http
POST /api/admin/workers/auto-confirm
Authorization: Bearer {adminToken}

{
  "appointmentId": "appt_123"
}
```

```http
POST /api/admin/workers/send-reminder
Authorization: Bearer {adminToken}

{
  "appointmentId": "appt_123"
}
```

```http
POST /api/admin/workers/generate-recurring
Authorization: Bearer {adminToken}

{
  "recurringRuleId": "rule_123"
}
```

```http
POST /api/admin/workers/cleanup
Authorization: Bearer {adminToken}
```

---

## Rate Limiting

| Endpoint Type | Limit |
|--------------|-------|
| Authentication | 5 requests / 15 minutes |
| API Endpoints | 100 requests / 15 minutes |
| Webhooks | No limit (signature verified) |

---

## Data Model Summary

### Key Entities

1. **User** - Authentication and profile
2. **Homeowner** - Links to homes
3. **Vendor** - Service provider with categories
4. **Home** - Property with maintenance needs
5. **MaintenanceCategory** - 38 predefined categories
6. **ServiceRequest** - Initial help request
7. **Appointment** - Canonical job record
8. **JobLedger** - Single source of truth
9. **Payment** - Stripe payment tracking
10. **AvailabilitySlot** - Vendor time slots
11. **RecurringMaintenance** - Automated scheduling

---

## Production Deployment Checklist

### Required Environment Variables
- [ ] Set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`
- [ ] Configure `DATABASE_URL` (PostgreSQL, not SQLite)
- [ ] Set `JWT_SECRET` (32+ random characters)
- [ ] Set `JWT_REFRESH_SECRET` (different from JWT_SECRET)
- [ ] Configure `CORS_ORIGIN` (comma-separated frontend URLs)

### Optional Notification Services
- [ ] Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` (SMS)
- [ ] Set `EMAIL_API_KEY`, `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME` (Email)
- [ ] Configure notification preferences per user

### Infrastructure
- [ ] Enable HTTPS (SSL/TLS certificates)
- [ ] Set up automated database backups
- [ ] Configure monitoring (Sentry, DataDog, or New Relic)
- [ ] Set up log aggregation (CloudWatch, Papertrail)
- [ ] Configure S3 for file uploads

### Security
- [ ] Test webhook signature verification
- [ ] Verify rate limiting is working
- [ ] Test idempotency key validation
- [ ] Enable audit logging
- [ ] Set up PII encryption keys

### Background Workers
- [ ] Verify auto-confirmation worker runs hourly
- [ ] Verify reminder worker runs hourly
- [ ] Verify recurring appointment worker runs daily at 2 AM
- [ ] Verify cleanup worker runs daily at 3 AM
- [ ] Test manual worker triggers (admin endpoints)

### Database
- [ ] Run Prisma migrations: `npx prisma migrate deploy`
- [ ] Seed maintenance categories: `npx prisma db seed`
- [ ] Create indexes for performance
- [ ] Set up read replicas (if needed)

### Testing
- [ ] Test complete payment flow (intent → capture → payout)
- [ ] Test auto-confirmation after 48 hours
- [ ] Test appointment reminders
- [ ] Test recurring appointment generation
- [ ] Verify idempotency prevents duplicate charges

---

## Support

**Documentation:** https://docs.estatestandard.com
**API Status:** https://status.estatestandard.com
**Support:** support@estatestandard.com
