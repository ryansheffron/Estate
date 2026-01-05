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

- **Recurring Visit Engine**
  - Auto-generates future appointments
  - Reserves vendor availability
  - Sends reminders and confirmations
  - Maintains service history

## Tech Stack

### Backend
- **Node.js + Express** - RESTful API
- **PostgreSQL + Prisma** - Robust relational database with type-safe ORM
- **TypeScript** - End-to-end type safety
- **JWT** - Secure authentication

### Frontend (Mobile)
- **React Native (Expo)** - Cross-platform iOS/Android
- **TypeScript** - Type safety
- **React Query** - Server state management
- **Zustand** - Local state management
- **Custom Japandi Design System** - Cohesive, premium UI

### Future Integrations (V1+)
- **Stripe Connect** - Payment processing and vendor payouts
- **Twilio** - SMS notifications
- **SendGrid** - Email notifications
- **AWS S3** - Photo/document storage
- **OpenAI GPT-4** - Advanced AI triage and sentiment analysis

## Project Structure

```
Estate/
├── backend/              # Node.js API server
│   ├── prisma/           # Database schema & migrations
│   │   ├── schema.prisma # 13 core entities + job ledger
│   │   └── seed.ts       # Sample DFW data
│   ├── src/
│   │   ├── controllers/  # Route handlers
│   │   ├── routes/       # API endpoints
│   │   ├── middleware/   # Auth, error handling, rate limiting
│   │   ├── ai/           # Triage service (pluggable architecture)
│   │   └── server.ts     # Express app
│   └── package.json
│
├── mobile/               # React Native mobile app
│   ├── src/
│   │   ├── screens/      # HomeScreen, GuideScreen, CustomerCareScreen, ProfileScreen
│   │   ├── navigation/   # Bottom tab navigation
│   │   ├── theme/        # Japandi design system
│   │   ├── components/   # Reusable UI components
│   │   └── services/     # API integration
│   ├── App.tsx           # App entry point
│   └── package.json
│
├── docs/
│   ├── SETUP.md          # Complete setup guide
│   └── DEPLOYMENT.md     # Deployment instructions (future)
│
├── ARCHITECTURE.md       # System architecture & design decisions
└── README.md             # This file
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

### ✅ MVP (Weeks 1-8) - **YOU ARE HERE**
- User registration & authentication
- 38 maintenance categories
- Service request creation with AI triage
- Vendor recommendations & live booking
- Appointment scheduling & job tracking
- Completion confirmation flow
- React Native app with Japandi design
- Sample DFW data

### 🚧 V1 - Payments & Vendor Portal (Weeks 9-16)
- Stripe Connect integration
- Vendor payout automation
- Vendor web portal (availability, earnings, requests)
- Recurring visit automation
- Advanced AI triage (OpenAI GPT-4)
- Warranty tracking (OCR receipts)
- Dispute resolution workflow
- Review & rating system

### 🔮 V2 - AI Concierge & Integrations (Weeks 17-24)
- Full AI concierge (multi-channel)
- SMS 2-way conversations (Twilio)
- Email integration (SendGrid inbound)
- Smart home integrations (Nest, Ring, leak sensors)
- Predictive maintenance (ML)
- API for property managers
- Referral program

### 🌟 V3 - Scale & Intelligence (6-12 months)
- Custom LLM fine-tuning
- Dynamic pricing optimization
- Vendor network expansion tools
- White-label for property management companies
- Enterprise features (multi-property)
- Advanced analytics

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

- **Authentication**: JWT with refresh token rotation
- **Password hashing**: bcrypt
- **Authorization**: Role-based access control (RBAC)
- **Data encryption**: At rest and in transit
- **PII handling**: GDPR-compliant
- **Payment security**: PCI-compliant via Stripe
- **API security**: Rate limiting, input validation, CORS, HTTPS only

## API Endpoints

See [ARCHITECTURE.md](ARCHITECTURE.md) for complete API documentation.

**Core endpoints**:
- `POST /api/auth/login` - Authentication
- `POST /api/service-requests` - Create service request
- `GET /api/service-requests/:id/vendors` - Get 3 recommended vendors
- `POST /api/appointments` - Book appointment
- `PATCH /api/appointments/:id/complete` - Vendor marks complete
- `PATCH /api/appointments/:id/confirm-completion` - Homeowner confirms
- `GET /api/maintenance/homes/:homeId` - Get maintenance overview

## Contributing

This is a white-glove MVP. Contributions should maintain:

1. **Japandi design principles** - Calm, cozy, premium
2. **Type safety** - TypeScript everywhere
3. **Trust & fairness** - Job confirmation, completion proof
4. **Premium positioning** - Never compromise on quality

## Documentation

- **[SETUP.md](docs/SETUP.md)** - Complete setup guide (15 min)
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - System design & decisions
- **Database Schema**: `backend/prisma/schema.prisma`
- **Design System**: `mobile/src/theme/index.ts`

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
