# Estate Standard - Architecture Overview

## Overview

Estate Standard is a white-glove homeowner concierge platform that becomes the **standard of home maintenance** for affluent homeowners. It removes mental load by centralizing home maintenance administration, recurring services, and issue resolution.

## Design Philosophy

**Japandi**: Japanese minimalism + Scandinavian warmth
- Calm, cozy, premium, functional
- Timeless and architectural
- Trust through simplicity
- White-glove without being flashy

## Core Value Proposition

1. **Remove Homeowner Mental Load**
   - Automated maintenance tracking
   - Smart reminders
   - One-tap scheduling
   - Centralized communication

2. **Enforce Trust & Verification**
   - Vetted vendors only
   - Explicit job confirmation
   - Completion proof required
   - Fair payment practices

3. **Premium Service Experience**
   - Live scheduling with instant booking
   - Recurring visit automation
   - AI-powered triage
   - Multi-channel concierge

## Technology Stack

### Frontend
- **React Native (Expo)**: Cross-platform mobile app (iOS/Android)
- **TypeScript**: Type safety and developer experience
- **React Navigation**: Native navigation patterns
- **React Query**: Server state management
- **Zustand**: Local state management
- **NativeWind**: Tailwind-like styling for Japandi design

### Backend
- **Node.js + Express**: RESTful API server
- **TypeScript**: End-to-end type safety
- **PostgreSQL**: Robust relational database for complex job tracking
- **Prisma**: Type-safe ORM with migrations
- **Redis**: Caching and session management

### Infrastructure
- **Stripe Connect**: Payment processing and vendor payouts
- **Twilio**: SMS notifications and 2-way communication
- **SendGrid**: Email notifications
- **AWS S3**: Photo/document storage
- **Vercel/Railway**: API deployment
- **Expo EAS**: Mobile app builds and updates

### AI & Intelligence
- **Pluggable Architecture**:
  - MVP: Rules-based triage (category detection, urgency, replacement detection)
  - V1: OpenAI GPT-4 for sentiment analysis and response drafting
  - V2: Custom fine-tuned models

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Estate Standard Mobile App              │
│                    (React Native + Expo)                     │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │   Home   │  │  Guide   │  │ Customer │  │ Profile  │   │
│  │Dashboard │  │(Maintain)│  │   Care   │  │          │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└─────────────────────────────────────────────────────────────┘
                            │
                    HTTPS / REST API
                            │
┌─────────────────────────────────────────────────────────────┐
│                      API Gateway (Express)                   │
│                                                              │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐            │
│  │   Auth     │  │  Service   │  │  Booking   │            │
│  │ Middleware │  │  Requests  │  │ & Schedule │            │
│  └────────────┘  └────────────┘  └────────────┘            │
│                                                              │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐            │
│  │   Vendor   │  │  Payment   │  │    AI      │            │
│  │  Matching  │  │  Ledger    │  │  Triage    │            │
│  └────────────┘  └────────────┘  └────────────┘            │
└─────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
┌───────▼────────┐  ┌──────▼──────┐  ┌────────▼────────┐
│   PostgreSQL   │  │    Redis    │  │   File Storage  │
│  (Primary DB)  │  │   (Cache)   │  │    (AWS S3)     │
└────────────────┘  └─────────────┘  └─────────────────┘

External Services:
┌────────────────┐  ┌─────────────┐  ┌──────────────┐
│ Stripe Connect │  │   Twilio    │  │  SendGrid    │
│   (Payments)   │  │    (SMS)    │  │   (Email)    │
└────────────────┘  └─────────────┘  └──────────────┘
```

## Database Schema Overview

### Core Entities

1. **Users**
   - Homeowners, vendors, admins
   - Authentication and profiles

2. **Homes**
   - Property details
   - Address, size, type
   - Photos and documentation

3. **Maintenance Categories**
   - 38+ predefined categories (HVAC, Plumbing, etc.)
   - Default cadences (monthly/quarterly/semi-annual/yearly)
   - Last completed, next due dates

4. **Maintenance Records**
   - Historical log per home per category
   - Photos, notes, vendor info
   - Links to service requests

5. **Service Requests**
   - Homeowner-initiated issues
   - Category, description, photos
   - AI triage results
   - Status tracking

6. **Vendors**
   - Profile, verification status
   - Service categories offered
   - Sponsored/organic placement
   - Rating and review scores

7. **Availability Slots**
   - Vendor's live calendar
   - Available time windows
   - Booking status

8. **Appointments**
   - Scheduled service visits
   - Confirmation timestamps
   - Completion proof
   - Links to recurring rules

9. **Recurring Rules**
   - Frequency (monthly/quarterly/semi-annual/yearly)
   - Next generation date
   - Auto-booking preferences

10. **Job Ledger** (Single Source of Truth)
    - job_id, homeowner_id, vendor_id
    - Status states (REQUEST_CREATED → COMPLETED_CONFIRMED)
    - Confirmation and completion timestamps
    - Payment and payout eligibility
    - Dispute tracking

11. **Warranty Items**
    - Triggered only when replacement needed
    - Part/appliance details
    - Purchase date, warranty end date
    - Related service requests

12. **Payments & Payouts**
    - Homeowner payments (Stripe)
    - Vendor payouts (Stripe Connect)
    - Platform fees
    - Transaction ledger

13. **Ads**
    - Vendor-sponsored placements
    - Contextual targeting
    - Performance tracking

## API Endpoints

### Authentication
- `POST /auth/register` - Register user
- `POST /auth/login` - Login
- `POST /auth/refresh` - Refresh token
- `POST /auth/logout` - Logout

### Homeowner - Maintenance
- `GET /homes/:homeId/maintenance` - Get all maintenance categories
- `GET /homes/:homeId/maintenance/:category` - Get category details
- `POST /homes/:homeId/maintenance/:category/complete` - Mark maintenance done
- `GET /homes/:homeId/maintenance/upcoming` - Get upcoming due items

### Homeowner - Service Requests
- `POST /service-requests` - Create new request
- `GET /service-requests/:id` - Get request details
- `PATCH /service-requests/:id` - Update request
- `POST /service-requests/:id/photos` - Upload photos

### Vendor Matching
- `GET /service-requests/:id/vendors` - Get 3 recommended vendors
- `GET /vendors/:vendorId/availability` - Get live availability slots

### Booking & Scheduling
- `POST /appointments` - Create appointment (instant booking)
- `GET /appointments/:id` - Get appointment details
- `PATCH /appointments/:id/confirm` - Vendor confirms appointment
- `PATCH /appointments/:id/reschedule` - Reschedule appointment
- `PATCH /appointments/:id/cancel` - Cancel appointment

### Recurring Visits
- `POST /recurring-rules` - Create recurring service
- `GET /recurring-rules/:id` - Get recurring rule
- `PATCH /recurring-rules/:id` - Update recurring rule
- `DELETE /recurring-rules/:id` - Cancel recurring service

### Job Completion
- `POST /appointments/:id/start` - Vendor checks in
- `POST /appointments/:id/complete` - Vendor marks complete (with proof)
- `POST /appointments/:id/confirm-completion` - Homeowner confirms
- `POST /appointments/:id/dispute` - Raise dispute

### Payments
- `POST /payments/intent` - Create payment intent (Stripe)
- `GET /payments/:paymentId` - Get payment status
- `POST /payouts/vendor/:vendorId` - Trigger vendor payout

### Vendor Portal
- `GET /vendor/dashboard` - Vendor overview
- `GET /vendor/requests` - Pending service requests
- `PATCH /vendor/availability` - Update availability
- `GET /vendor/earnings` - Earnings and payouts

### AI Triage
- `POST /ai/triage` - Triage service request
- `POST /ai/respond` - Generate response draft

## Job Status State Machine

```
REQUEST_CREATED
    ↓
SENT_TO_VENDOR
    ↓
VENDOR_ACCEPTED ←→ HOMEOWNER_CONFIRMED (optional)
    ↓
SCHEDULED
    ↓
IN_PROGRESS
    ↓
COMPLETED_BY_VENDOR
    ↓
COMPLETED_CONFIRMED ←→ DISPUTED
    ↓
PAID_OUT
```

### Status Rules

1. **VENDOR_ACCEPTED**: Vendor explicitly accepts via portal/SMS/email link
2. **SCHEDULED**: Appointment time is locked
3. **IN_PROGRESS**: Vendor checks in (timestamp)
4. **COMPLETED_BY_VENDOR**: Vendor uploads completion proof (2+ of):
   - Before/after photos
   - Invoice (photo or PDF)
   - Check-in/check-out timestamps
   - Completion notes
5. **COMPLETED_CONFIRMED**:
   - Homeowner confirms, OR
   - Auto-confirm after 48 hours (no dispute)
6. **PAID_OUT**: Vendor receives payout (minus platform fee)

## Payment & Payout Flow

### Option A: Platform Processes Payment (Stripe Connect)
1. Homeowner books service → Payment intent created
2. Homeowner charged when appointment scheduled
3. Funds held in escrow
4. Vendor completes job → uploads proof
5. Homeowner confirms (or auto-confirm)
6. Platform releases payout to vendor (minus fee)

### Option B: Off-Platform Payment (MVP Fallback)
1. Vendor completes job → uploads invoice
2. Homeowner confirms payment Yes/No
3. Vendor charged platform fee only after verified completion

**Recommendation**: Implement Option A for trust and automation

## Vendor Fairness Rules

Vendors are charged/credited ONLY when:
1. Job is confirmed (VENDOR_ACCEPTED)
2. Completion proof exists (COMPLETED_BY_VENDOR)
3. Homeowner confirms OR auto-confirms (COMPLETED_CONFIRMED)

No charges for:
- Rejected requests
- Cancellations before 24 hours
- Disputed jobs (pending resolution)

## AI Triage Logic (Rules-Based MVP)

### Urgency Detection
**CRITICAL** (immediate response):
- Keywords: gas leak, flooding, sparks, fire, smoke, electrical shock, burst pipe, no heat (winter), no AC (summer >90°F)
- Response time: < 5 minutes
- Vendor filter: emergency services only

**HIGH** (same day):
- Keywords: leak, broken, not working, urgent, help
- Response time: < 2 hours

**NORMAL** (1-3 days):
- Default for scheduled maintenance

**LOW** (1-2 weeks):
- Keywords: eventually, when you can, cosmetic, planning

### Category Detection
Pattern matching on keywords:
- "AC", "air conditioning", "heat" → HVAC
- "toilet", "faucet", "pipe", "leak" → Plumbing
- "outlet", "breaker", "wiring" → Electrical
- "mow", "lawn", "tree", "irrigation" → Landscaping
- (etc.)

### Replacement Detection (for Warranty)
Trigger warranty tracking when:
- Keywords: "replace", "new unit", "install new", "purchase", "buy"
- OR vendor notes indicate replacement
- Quiet: Only show warranty UI when triggered

### Sentiment Analysis (V1 with LLM)
- Detect frustration → escalate to human
- Detect threats (legal, reviews) → priority escalation
- Detect satisfaction → prompt for review

## Security & Privacy

### Authentication
- JWT tokens with refresh rotation
- Bcrypt password hashing
- Rate limiting on auth endpoints
- 2FA via SMS (optional, premium)

### Authorization
- Role-based access control (RBAC)
- Homeowners: Access own homes only
- Vendors: Access assigned jobs only
- Admins: Full access with audit logs

### Data Privacy
- PII encryption at rest
- Secure file upload with virus scanning
- GDPR-compliant data export/deletion
- Payment data: PCI-compliant via Stripe

### API Security
- HTTPS only
- CORS restrictions
- Rate limiting (express-rate-limit)
- Input validation (Joi/Zod)
- SQL injection prevention (Prisma parameterized queries)

## Monetization

### Homeowner Plans
- **Monthly**: $49/mo
- **Annual**: $490/yr (2 months free)
- Features:
  - Unlimited service requests
  - Maintenance tracking
  - Live scheduling
  - AI concierge
  - Recurring visit automation

### Vendor Revenue
1. **Featured Placement**: $750-$1000/month per zip code
   - 1 sponsored slot in vendor recommendations
   - Priority in search results
   - Badge in profile

2. **Per-Job Fee**: $50-$150 per completed, confirmed job
   - Charged only after COMPLETED_CONFIRMED
   - Transparent pricing
   - No charge for cancellations (>24hr notice)

3. **Subscription (Alternative)**: $299/mo for unlimited jobs

### Ads
- Contextual only (e.g., home improvement products)
- Local businesses (appliance stores, home decor)
- No interruption of core flows
- Performance-based (CPC/CPM)

## Phased Roadmap

### MVP (Weeks 1-8)
**Goal**: Validate core workflow with homeowners and vendors

Features:
- ✅ User registration (homeowners, vendors)
- ✅ Home profile creation
- ✅ 38 maintenance categories with tracking
- ✅ Service request creation
- ✅ AI triage (rules-based)
- ✅ 3 vendor recommendations
- ✅ Live availability viewing
- ✅ Appointment booking
- ✅ Job status tracking
- ✅ Completion confirmation
- ✅ Basic in-app messaging
- ✅ Sample data for DFW (HVAC, Plumbing, Landscaping)

Tech:
- React Native app (iOS + Android)
- Node.js API
- PostgreSQL database
- Twilio SMS (basic)
- Email notifications (SendGrid)
- File uploads (S3 or local)

### V1 - Payments & Vendor Portal (Weeks 9-16)
**Goal**: Full transaction lifecycle and vendor self-service

Features:
- ✅ Stripe Connect integration
- ✅ Payment processing (escrow)
- ✅ Vendor payout automation
- ✅ Vendor portal (web)
  - Availability management
  - Request inbox
  - Job history
  - Earnings dashboard
- ✅ Recurring visit automation
- ✅ Advanced AI triage (OpenAI GPT-4)
- ✅ Warranty tracking (replacement detection)
- ✅ Dispute resolution workflow
- ✅ Review and rating system

Tech:
- Stripe Connect platform
- Vendor web portal (Next.js)
- OpenAI API integration
- Enhanced analytics (Mixpanel)

### V2 - AI Concierge & Integrations (Weeks 17-24)
**Goal**: True white-glove experience with automation

Features:
- ✅ Full AI concierge (multi-channel)
  - Smart response drafting
  - Sentiment analysis
  - Proactive recommendations
- ✅ SMS 2-way conversations (Twilio)
- ✅ Email integration (SendGrid inbound)
- ✅ Smart home integrations
  - Nest/Ecobee (HVAC)
  - Ring (security)
  - Leak sensors
- ✅ Warranty auto-tracking (OCR receipts)
- ✅ Advanced scheduling
  - Team scheduling
  - Multi-service bundling
- ✅ Referral program
- ✅ API for property managers

Tech:
- Custom LLM fine-tuning
- IoT integrations (IFTTT/Zapier)
- OCR (AWS Textract)
- GraphQL API (for partners)

### V3 - Scale & Intelligence (6-12 months)
**Goal**: Market leader in home maintenance

Features:
- Predictive maintenance (ML)
- Dynamic pricing optimization
- Vendor network expansion tools
- White-label for property management companies
- Enterprise features (multi-property)
- Advanced analytics and insights

## Sample Data (DFW - Northlake / Fort Worth)

### Vendors
1. **Cool Breeze HVAC**
   - Services: HVAC maintenance, repair, replacement
   - Coverage: Northlake, Trophy Club, Roanoke
   - Rating: 4.8/5
   - Response time: < 4 hours
   - Sponsored: Yes

2. **DFW Plumbing Pros**
   - Services: Plumbing, leak detection, water heater
   - Coverage: Fort Worth, Keller, Southlake
   - Rating: 4.9/5
   - Response time: Same day
   - Sponsored: No

3. **Green Horizon Landscaping**
   - Services: Lawn care, irrigation, tree trimming
   - Coverage: Northlake, Argyle, Denton County
   - Rating: 4.7/5
   - Response time: 1-2 days
   - Sponsored: No

### Sample Maintenance Schedule (Northlake Home)
- **HVAC**: Quarterly (last: Dec 2025, next: Mar 2026)
- **Plumbing**: Semi-annual (last: Oct 2025, next: Apr 2026)
- **Landscaping**: Monthly (last: Dec 2025, next: Jan 2026)
- **Gutters**: Semi-annual (last: Nov 2025, next: May 2026)
- **Roof**: Yearly (last: Aug 2025, next: Aug 2026)

## Local Development Setup

See `docs/SETUP.md` for detailed instructions.

Quick start:
```bash
# Backend
cd backend
npm install
npm run migrate
npm run seed
npm run dev

# Frontend
cd mobile
npm install
npx expo start
```

## Deployment Strategy

### MVP Deployment
- **Backend**: Railway or Render (free tier for testing)
- **Database**: Railway PostgreSQL or Supabase
- **Frontend**: Expo EAS (development builds)
- **Files**: AWS S3 free tier or Cloudinary

### Production Deployment
- **Backend**: AWS ECS or Google Cloud Run
- **Database**: AWS RDS PostgreSQL (Multi-AZ)
- **Frontend**: App Store + Google Play (via EAS)
- **CDN**: CloudFront
- **Monitoring**: Datadog or New Relic

## Success Metrics

### Homeowner Engagement
- Monthly active homes
- Service requests per home/month
- Recurring services set up
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
- Take rate (platform fee %)
- CAC (Customer Acquisition Cost)
- LTV (Lifetime Value)

## Competitive Differentiation

Estate Standard vs. Competitors:

| Feature | Estate Standard | Angi | Thumbtack | TaskRabbit |
|---------|----------------|------|-----------|------------|
| Mental load removal | ✅ Core value | ❌ | ❌ | ❌ |
| Maintenance tracking | ✅ Full engine | Limited | ❌ | ❌ |
| Live scheduling | ✅ Instant | ❌ | ❌ | Limited |
| Recurring automation | ✅ Full support | ❌ | ❌ | ❌ |
| Vetted vendors only | ✅ 3 max | Marketplace | Marketplace | Marketplace |
| Job confirmation | ✅ Required | ❌ | ❌ | ✅ |
| Completion proof | ✅ Multi-factor | ❌ | ❌ | Limited |
| White-glove UX | ✅ Japandi | Transactional | Transactional | Gig economy |
| Premium positioning | ✅ Core | ❌ | ❌ | ❌ |

Estate Standard is NOT competing on price or vendor volume. It competes on:
1. Trust
2. Ease
3. Reliability
4. Premium experience

---

**Estate Standard**: The standard of home maintenance.
