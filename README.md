# Estate Standard

**The Standard of Home Maintenance**

<p align="center">
  <img src="https://img.shields.io/badge/Status-MVP-blue" alt="Status: MVP"/>
  <img src="https://img.shields.io/badge/Design-Japandi-tan" alt="Design: Japandi"/>
  <img src="https://img.shields.io/badge/Platform-iOS%20%7C%20Android-green" alt="Platform"/>
</p>

Estate Standard is a white-glove homeowner concierge platform designed to become the **standard of home maintenance** for affluent homeowners and estate-level properties.

## What is Estate Standard?

Estate Standard is **NOT**:
- Yelp
- Angi
- Thumbtack
- A task app
- A gig marketplace

Estate Standard **IS**:
- A private home office
- A personal estate manager
- The assistant wealthy households already rely on to make their home "just work"
- The **baseline expectation for modern homeownership**

## Core Value Proposition

Estate Standard removes the mental load of home maintenance by:

✅ **Automating maintenance tracking** - 38 predefined categories with intelligent cadences
✅ **Live scheduling** - Instant booking with vetted vendors
✅ **Recurring automation** - Set it once, never think about it again
✅ **AI-powered triage** - Intelligent categorization and urgency detection
✅ **Job confirmation & proof** - Trust through transparency
✅ **Fair vendor payments** - Vendors paid only for real, confirmed work
✅ **White-glove experience** - Premium, calm, and trustworthy

## Design Philosophy: Japandi

Estate Standard follows a **Japandi** design philosophy (Japanese minimalism + Scandinavian warmth):

- **Calm**: Reduces cognitive load during home issues
- **Cozy**: Warm neutrals, soft shadows, generous spacing
- **Premium**: Feels like a high-end property management experience
- **Functional**: Every design choice supports the user's goal

**Not**: Flashy tech app, marketplace UI, or loud SaaS interface
**Is**: A quiet, capable assistant that handles everything

## Key Features (MVP)

### For Homeowners

- **38 Maintenance Categories** - The complete standard of home care
- **Service Request Creation** - Photo upload, AI triage, instant categorization
- **3 Vetted Vendor Recommendations** - No bidding wars, just trust
- **Live Booking** - See real availability, book instantly
- **Recurring Services** - Monthly, quarterly, semi-annual, yearly automation
- **Job Tracking** - Full lifecycle from request to completion
- **Completion Confirmation** - Explicit proof before vendor payment
- **Warranty Tracking** - Triggered only when replacement needed

### For Vendors

- **Verified Status** - Trust badge, background checks
- **Live Availability Management** - Set your schedule, auto-accept bookings
- **Request Inbox** - See matched opportunities
- **Job Confirmation Flow** - Accept → Check-in → Complete with proof → Get paid
- **Fair Payment** - Charged only after homeowner confirms completion
- **Sponsored Placement** - Featured slots in recommendations ($750-$1000/mo)

### Intelligent Systems

- **AI Triage** (Rules-based MVP, LLM-ready V1)
  - Urgency detection (CRITICAL, HIGH, NORMAL, LOW)
  - Category detection from natural language
  - Replacement need detection (triggers warranty tracking)
  - Sentiment analysis and escalation (V1)

- **Job Ledger** - Single source of truth
  - Explicit job states (REQUEST_CREATED → COMPLETED_CONFIRMED)
  - Completion proof requirements (2+ of: photos, timestamps, invoice, notes)
  - Homeowner confirmation with auto-confirm after 48 hours
  - Payment eligibility tracking
  - Immutable audit trail

- **Recurring Visit Engine**
  - Auto-generates future appointments (daily at 2 AM)
  - Reserves vendor availability with optimistic locking
  - Sends 24-hour advance reminders
  - Maintains service history

### Production-Ready Backend Features

- **Idempotency Protection**
  - Prevents duplicate payment charges from network retries
  - UUID-based request deduplication
  - 24-hour response caching
  - Required for all payment mutations

- **Multi-Channel Notifications**
  - SMS via Twilio (respects user preferences)
  - Email via SendGrid/Resend
  - Mobile push via Expo
  - 14 notification types across job lifecycle
  - Graceful fallback handling

- **Background Workers** (4 automated processes)
  - **Auto-Confirmation Worker** (hourly) - Confirms jobs after 48h, releases vendor payouts
  - **Reminder Worker** (hourly) - Sends 24h advance appointment reminders
  - **Recurring Appointment Worker** (daily 2 AM) - Generates recurring maintenance appointments
  - **Cleanup Worker** (daily 3 AM) - Removes expired idempotency keys, tokens, audit logs

- **Enhanced Payment Lifecycle**
  - Stripe Connect destination charges
  - Manual capture (hold funds until job confirmed)
  - Platform fee calculation
  - Vendor payout tracking and release
  - Payment lifecycle timestamps (authorized → captured → refunded)

- **Security & Compliance**
  - Enhanced rate limiting (9 endpoint-specific limiters)
  - Audit logging for all sensitive operations
  - PII encryption at rest (AES-256)
  - Input validation and sanitization
  - Helmet.js security headers
  - CORS protection
  - Request timeout (30s)
  - Account lockout after failed login attempts
  - 2FA ready (TOTP)

## Tech Stack

### Backend
- **Node.js + Express** - RESTful API
- **PostgreSQL + Prisma** - Robust relational database with type-safe ORM
- **TypeScript** - End-to-end type safety
- **JWT** - Secure authentication with refresh token rotation

### Frontend (Mobile)
- **React Native (Expo)** - Cross-platform iOS/Android
- **TypeScript** - Type safety
- **React Query** - Server state management
- **Zustand** - Local state management
- **Custom Japandi Design System** - Cohesive, premium UI

### Production Integrations (Implemented)
- **Stripe Connect** - Payment processing and vendor payouts (destination charges)
- **Twilio** - SMS notifications
- **SendGrid/Resend** - Email notifications
- **Expo Push Notifications** - Mobile push notifications
- **Node-Cron** - Background job scheduling
- **Winston** - Structured logging
- **Sentry** - Error tracking (ready)

### Future Integrations (V2+)
- **AWS S3** - Photo/document storage (presigned URLs ready)
- **OpenAI GPT-4 Vision** - Advanced AI triage
- **DataDog** - APM and observability (scale phase)

## Project Structure

```
Estate/
├── backend/                     # Node.js API server (production-ready)
│   ├── prisma/                  # Database layer
│   │   ├── schema.prisma        # 23 tables, 12 enums, 45+ indexes
│   │   ├── migrations/          # SQL migrations
│   │   └── seed.ts              # Sample DFW data
│   ├── src/
│   │   ├── controllers/         # Route handlers
│   │   ├── routes/              # API endpoints (9 route files)
│   │   ├── middleware/          # Auth, error handling, rate limiting, idempotency
│   │   │   ├── auth.ts
│   │   │   ├── rateLimiter.enhanced.ts  # 9 endpoint-specific limiters
│   │   │   ├── idempotency.ts           # Payment deduplication
│   │   │   ├── auditLogger.ts
│   │   │   └── piiEncryption.ts
│   │   ├── services/            # Business logic
│   │   │   ├── notification.service.ts  # Multi-channel notifications
│   │   │   ├── stripe.service.ts        # Stripe Connect integration
│   │   │   └── ai/                      # Triage service (pluggable)
│   │   ├── workers/             # Background jobs
│   │   │   ├── autoConfirmation.worker.ts  # Hourly job confirmation
│   │   │   ├── reminder.worker.ts          # Hourly appointment reminders
│   │   │   ├── recurringAppointment.worker.ts  # Daily recurring generator
│   │   │   └── cleanup.worker.ts           # Daily data cleanup
│   │   ├── utils/               # Helpers, logger, security
│   │   └── server.ts            # Express app (enhanced security)
│   └── package.json
│
├── mobile/                      # React Native mobile app (Expo)
│   ├── src/
│   │   ├── screens/             # HomeScreen, GuideScreen, CustomerCareScreen, ProfileScreen
│   │   ├── navigation/          # Bottom tab navigation
│   │   ├── theme/               # Japandi design system
│   │   ├── components/          # Reusable UI components
│   │   └── services/            # API integration
│   ├── App.tsx                  # App entry point
│   └── package.json
│
├── docs/                        # Comprehensive technical documentation (~9,000 lines)
│   ├── SETUP.md                 # Complete setup guide (15 min)
│   ├── SYSTEM_ARCHITECTURE.md   # Systems architecture (3,113 lines)
│   ├── DATABASE_DESIGN.md       # Database schema (2,737 lines)
│   ├── INFRASTRUCTURE.md        # Infrastructure & integrations (3,005 lines)
│   └── API_DOCUMENTATION.md     # Complete API reference (765 lines)
│
└── README.md                    # This file
```

## Quick Start

**Full setup in 15 minutes** - See [docs/SETUP.md](docs/SETUP.md)

```bash
# 1. Clone and install
git clone <repository-url>
cd Estate

cd backend && npm install
cd ../mobile && npm install

# 2. Setup PostgreSQL (Docker recommended)
docker run --name estate-postgres \
  -e POSTGRES_DB=estate_standard \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 -d postgres:14

# 3. Configure backend
cd backend
cp .env.example .env
# Edit .env with your database URL

# 4. Migrate and seed
npm run migrate
npm run seed

# 5. Start backend
npm run dev

# 6. Start mobile app (new terminal)
cd ../mobile
npm start
```

Access:
- **API**: http://localhost:3000
- **Mobile**: Expo QR code or `i` for iOS, `a` for Android

## Sample Data (DFW - Northlake)

The seed script creates a complete test environment:

**Homeowner Account**
- Email: sarah.mitchell@example.com
- Password: Homeowner123!
- Home: 1234 Oak Ridge Drive, Northlake, TX 76262

**3 Verified Vendors**
1. Cool Breeze HVAC (Sponsored, 4.8★)
2. DFW Plumbing Pros (4.9★)
3. Green Horizon Landscaping (4.7★)

**38 Maintenance Categories** - All pre-configured with:
- Default cadences
- Recommended tasks
- Seasonal notes

**Sample Maintenance Records**
- HVAC: Quarterly (next due Mar 2026)
- Plumbing: Semi-annual (next due Apr 2026)
- Landscaping: Monthly (next due Jan 2026)

## Core Workflows

### 1. Service Request Lifecycle

```
Homeowner creates request
  ↓
AI triage (urgency, category, replacement detection)
  ↓
3 vetted vendors recommended (1 sponsored + 2 organic)
  ↓
Homeowner books with live availability
  ↓
Vendor accepts appointment
  ↓
Vendor checks in (timestamp)
  ↓
Vendor completes job (uploads proof: photos, invoice, notes)
  ↓
Homeowner confirms completion (or auto-confirm after 48hrs)
  ↓
Vendor receives payout (minus platform fee)
```

### 2. Recurring Service Setup

```
Homeowner selects category (e.g., Landscaping)
  ↓
Chooses frequency (Monthly)
  ↓
Picks preferred vendor
  ↓
Sets day preference (e.g., 3rd Monday)
  ↓
System auto-generates future appointments
  ↓
Sends reminders before each visit
  ↓
Vendor auto-accepts (if enabled)
  ↓
Homeowner never thinks about it again
```

### 3. Job Confirmation & Payment

**Why this matters**: Ensures vendors are paid fairly and only for real work.

**Job States**:
```
REQUEST_CREATED → SENT_TO_VENDOR → VENDOR_ACCEPTED →
SCHEDULED → IN_PROGRESS → COMPLETED_BY_VENDOR →
COMPLETED_CONFIRMED → PAID_OUT
```

**Completion Requirements** (2+ required):
- Before/after photos
- Check-in/check-out timestamps
- Uploaded invoice
- Detailed completion notes

**Confirmation**:
- Homeowner has 48 hours to confirm
- Auto-confirm if no dispute raised
- Vendors receive payout within 24-48 hours after confirmation

## Monetization

### Homeowner Plans
- **Monthly**: $49/mo
- **Annual**: $490/yr (2 months free)

Features:
- Unlimited service requests
- Maintenance tracking (38 categories)
- Live scheduling & recurring automation
- AI concierge
- Premium support

### Vendor Revenue
1. **Featured Placement**: $750-$1000/mo per zip code
2. **Per-Job Fee**: $50-$150 per completed job (only after confirmation)
3. **Subscription**: $299/mo for unlimited jobs (alternative)

### Ads
- Contextual only (local home improvement businesses)
- Non-intrusive
- Performance-based (CPC/CPM)

## Roadmap

### ✅ Phase 1 - Core MVP (Weeks 1-8) - **COMPLETED**
- User registration & authentication (JWT + refresh tokens)
- 38 maintenance categories
- Service request creation with AI triage
- Vendor recommendations & live booking
- Appointment scheduling & job tracking
- Completion confirmation flow
- React Native app with Japandi design
- Sample DFW data
- PostgreSQL + Prisma ORM

### ✅ Phase 2 - Production Backend (Weeks 9-12) - **COMPLETED**
- Stripe Connect integration (destination charges + manual capture)
- Vendor payout automation (auto-release after 48h confirmation)
- Idempotency protection (payment deduplication)
- Multi-channel notifications (SMS, Email, Push)
- Background workers (4 automated processes)
- Enhanced security (rate limiting, audit logging, PII encryption)
- Complete documentation suite (~9,000 lines)
- Database migrations (23 tables, 45+ indexes)

### 🚧 Phase 3 - Mobile App & Vendor Portal (Weeks 13-16) - **YOU ARE HERE**
- Polish React Native mobile app UI
- Vendor web portal (availability, earnings, requests)
- Advanced AI triage (OpenAI GPT-4 Vision)
- Photo upload to S3 with presigned URLs
- Warranty tracking (OCR receipts)
- Dispute resolution workflow
- Review & rating system
- Admin dashboard

### 🔮 Phase 4 - AI Concierge & Integrations (Weeks 17-24)
- Full AI concierge (multi-modal)
- SMS 2-way conversations (Twilio)
- Email integration (SendGrid inbound parsing)
- Smart home integrations (Nest, Ring, leak sensors)
- Predictive maintenance (ML models)
- API for property managers
- Referral program

### 🌟 Phase 5 - Scale & Intelligence (6-12 months)
- AWS migration (ECS Fargate, RDS, SQS, Lambda)
- Custom LLM fine-tuning
- Dynamic pricing optimization
- Vendor network expansion tools
- White-label for property management companies
- Enterprise features (multi-property portfolios)
- Advanced analytics & BI dashboards
- DataDog APM integration

## Competitive Differentiation

| Feature | Estate Standard | Angi | Thumbtack | TaskRabbit |
|---------|----------------|------|-----------|------------|
| Mental load removal | ✅ **Core value** | ❌ | ❌ | ❌ |
| Maintenance tracking | ✅ **38 categories** | Limited | ❌ | ❌ |
| Live scheduling | ✅ **Instant** | ❌ | ❌ | Limited |
| Recurring automation | ✅ **Full support** | ❌ | ❌ | ❌ |
| Vetted vendors only | ✅ **3 max** | Marketplace | Marketplace | Marketplace |
| Job confirmation | ✅ **Required** | ❌ | ❌ | ✅ |
| Completion proof | ✅ **Multi-factor** | ❌ | ❌ | Limited |
| White-glove UX | ✅ **Japandi** | Transactional | Transactional | Gig economy |
| Premium positioning | ✅ **Core** | ❌ | ❌ | ❌ |

**Estate Standard doesn't compete on price or vendor volume.**

**We compete on**:
1. Trust
2. Ease
3. Reliability
4. Premium experience

## Security & Privacy

### Authentication & Authorization
- **JWT**: Access tokens (15 min) with refresh token rotation (7 days)
- **Password hashing**: bcrypt (12 rounds)
- **RBAC**: Role-based access control (HOMEOWNER, VENDOR, ADMIN)
- **2FA**: TOTP ready with backup codes
- **Account lockout**: After 5 failed login attempts (15 min lockout)
- **Email verification**: Required before account activation
- **Password history**: Prevents reuse of last 5 passwords

### Data Protection
- **PII encryption**: AES-256 at rest (Prisma middleware)
- **TLS/SSL**: In-transit encryption (HTTPS only)
- **GDPR-compliant**: Data export, deletion, consent tracking
- **Audit logging**: All sensitive operations logged (90-day retention)
- **Input sanitization**: XSS prevention, SQL injection protection

### API Security
- **Rate limiting**: 9 endpoint-specific limiters (100 req/15min global)
  - Auth: 5 req/15min
  - Password reset: 3 req/hour
  - Email verify: 5 req/hour
  - 2FA: 5 req/15min
  - Payment: 10 req/15min
  - Messaging: 20 req/15min
  - Upload: 10 req/hour
  - Expensive ops: 5 req/15min
- **Helmet.js**: Security headers (CSP, HSTS, XSS protection, frame guard)
- **CORS**: Whitelisted origins only
- **Request timeout**: 30 seconds max
- **Idempotency**: Prevents duplicate payment charges

### Payment Security
- **PCI-compliant**: Via Stripe (no card data stored)
- **Idempotency keys**: UUID-based deduplication (24h cache)
- **Manual capture**: Funds held until job confirmed
- **Webhook verification**: Stripe signature validation
- **Payout protection**: Released only after job confirmation + 48h window

## API Endpoints

See **[docs/API_DOCUMENTATION.md](docs/API_DOCUMENTATION.md)** for complete API documentation with examples.

**Core endpoints**:

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - Login with JWT
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/verify-email` - Verify email address
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password with token

### Service Requests
- `POST /api/service-requests` - Create service request (AI triage)
- `GET /api/service-requests/:id` - Get request details
- `GET /api/service-requests/:id/vendors` - Get 3 recommended vendors
- `PATCH /api/service-requests/:id` - Update request

### Appointments
- `POST /api/appointments` - Book appointment with vendor
- `GET /api/appointments/:id` - Get appointment details
- `PATCH /api/appointments/:id/accept` - Vendor accepts
- `PATCH /api/appointments/:id/check-in` - Vendor checks in
- `PATCH /api/appointments/:id/complete` - Vendor marks complete
- `PATCH /api/appointments/:id/confirm-completion` - Homeowner confirms
- `DELETE /api/appointments/:id` - Cancel appointment

### Recurring Services
- `POST /api/recurring` - Create recurring rule
- `GET /api/recurring/home/:homeId` - Get all recurring rules
- `PATCH /api/recurring/:id` - Update rule
- `DELETE /api/recurring/:id` - Delete rule

### Payments (Idempotency Required)
- `POST /api/payments/create-intent` - Create payment intent (requires `Idempotency-Key` header)
- `POST /api/payments/:id/capture` - Capture authorized payment
- `POST /api/payments/:id/refund` - Issue refund
- `GET /api/payments/:id` - Get payment status

### Maintenance
- `GET /api/maintenance/homes/:homeId` - Get maintenance overview
- `GET /api/maintenance/categories` - Get all 38 categories

### Messages
- `POST /api/messages` - Send message
- `GET /api/messages/thread/:threadId` - Get message thread

**Security Headers Required**:
- `Authorization: Bearer <access_token>` - All authenticated endpoints
- `Idempotency-Key: <uuid>` - Payment mutations only

## Contributing

This is a white-glove MVP. Contributions should maintain:

1. **Japandi design principles** - Calm, cozy, premium
2. **Type safety** - TypeScript everywhere
3. **Trust & fairness** - Job confirmation, completion proof
4. **Premium positioning** - Never compromise on quality

## Documentation

### Comprehensive Technical Documentation (~9,000+ lines)

- **[SETUP.md](docs/SETUP.md)** - Complete setup guide (15 min)
- **[SYSTEM_ARCHITECTURE.md](docs/SYSTEM_ARCHITECTURE.md)** - Systems architecture, state machines, event flows, failure scenarios (3,113 lines)
- **[DATABASE_DESIGN.md](docs/DATABASE_DESIGN.md)** - Complete database schema, 23 tables, 45+ indexes, fraud prevention (2,737 lines)
- **[INFRASTRUCTURE.md](docs/INFRASTRUCTURE.md)** - Infrastructure architecture, deployment, integrations, cost analysis (3,005 lines)
- **[API_DOCUMENTATION.md](docs/API_DOCUMENTATION.md)** - Complete API reference with examples (765 lines)
- **Database Schema**: `backend/prisma/schema.prisma` (23 tables, 12 enums)
- **Design System**: `mobile/src/theme/index.ts`

### Key Documentation Highlights

- **Complete Job Lifecycle** - 8 phases from request → payout with SQL examples
- **6 Real-World Failure Scenarios** - Double-booking, payment failures, webhook issues
- **10 Non-Negotiable Architecture Rules** - Atomic operations, idempotency, immutable ledgers
- **DFW Homeowner → HVAC Repair Example** - Complete flow with database state snapshots
- **Infrastructure Migration Path** - Railway (MVP) → AWS (scale) with cost breakdowns
- **10 Fraud Prevention Mechanisms** - Multi-proof verification, webhook verification, idempotency

## Success Metrics

### Homeowner Engagement
- Monthly active homes
- Service requests per home/month
- Average time to book (goal: < 2 minutes)
- Completion rate (goal: > 95%)

### Vendor Performance
- Average response time (goal: < 4 hours)
- Completion confirmation rate (goal: > 98%)
- Dispute rate (goal: < 2%)
- Payout time (goal: 24-48 hours after confirmation)

### Business Metrics
- Homeowner retention (goal: > 85% annual)
- Vendor retention (goal: > 90% quarterly)
- GMV (Gross Merchandise Value)
- CAC vs LTV

## License

Unlicensed - Proprietary

## Support

- **Issues**: GitHub Issues
- **Docs**: `/docs` directory
- **Architecture**: `ARCHITECTURE.md`
- **Setup**: `docs/SETUP.md`

---

**Estate Standard**: Because your home deserves a standard.

Built with Japandi design: calm, cozy, premium, and functional.
