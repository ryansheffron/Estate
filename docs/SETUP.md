# Estate Standard - Setup Guide

**The Standard of Home Maintenance**

This guide will help you get Estate Standard running locally in under 15 minutes.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** >= 18.0.0 ([Download](https://nodejs.org/))
- **npm** >= 9.0.0 (comes with Node.js)
- **PostgreSQL** >= 14.0 ([Download](https://www.postgresql.org/download/))
- **Git** ([Download](https://git-scm.com/))
- **Expo CLI** (for mobile development)

Optional but recommended:
- **Docker** (for containerized PostgreSQL)
- **iOS Simulator** (macOS only, for iOS testing)
- **Android Studio** (for Android emulator)

## Architecture Overview

Estate Standard consists of two main parts:

1. **Backend API** (`/backend`) - Node.js + Express + PostgreSQL
2. **Mobile App** (`/mobile`) - React Native + Expo

```
Estate/
├── backend/          # API server
│   ├── prisma/       # Database schema & migrations
│   ├── src/          # Source code
│   └── package.json
├── mobile/           # React Native app
│   ├── src/          # App source code
│   ├── App.tsx       # App entry point
│   └── package.json
├── docs/             # Documentation
└── ARCHITECTURE.md   # System architecture
```

## Quick Start (15 minutes)

### Step 1: Clone and Install (2 min)

```bash
# Clone the repository
git clone <repository-url>
cd Estate

# Install backend dependencies
cd backend
npm install

# Install mobile dependencies
cd ../mobile
npm install
cd ..
```

### Step 2: Database Setup (5 min)

#### Option A: Local PostgreSQL

```bash
# Create database
createdb estate_standard

# Or using psql
psql postgres
CREATE DATABASE estate_standard;
\q
```

#### Option B: Docker PostgreSQL (Recommended)

```bash
# Create and run PostgreSQL container
docker run --name estate-postgres \
  -e POSTGRES_DB=estate_standard \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 \
  -d postgres:14

# Verify it's running
docker ps
```

### Step 3: Backend Configuration (3 min)

```bash
cd backend

# Create environment file
cp .env.example .env

# Edit .env with your database credentials
# For Docker setup, defaults should work
nano .env  # or use your preferred editor
```

**Minimal .env for local development:**

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/estate_standard?schema=public"
NODE_ENV="development"
PORT=3000
JWT_SECRET="your-dev-secret-change-in-production"
JWT_REFRESH_SECRET="your-dev-refresh-secret"
```

### Step 4: Database Migration & Seeding (2 min)

```bash
# Still in /backend directory

# Generate Prisma client
npm run generate

# Run migrations to create tables
npm run migrate

# Seed database with sample data
npm run seed
```

You should see output with test credentials:

```
🎉 Seeding complete!
──────────────────────────────────────
Test Credentials:
──────────────────────────────────────
Admin:
  Email: admin@estatestandard.com
  Password: EstateAdmin2026!

Homeowner:
  Email: sarah.mitchell@example.com
  Password: Homeowner123!
  Home: 1234 Oak Ridge Drive, Northlake, TX

Vendors:
  1. contact@coolbreezehvac.com
  2. info@dfwplumbingpros.com
  3. service@greenhorizonlandscaping.com
  All vendor passwords: Vendor123!
──────────────────────────────────────
```

### Step 5: Start Backend Server (1 min)

```bash
# In /backend directory
npm run dev
```

You should see:

```
✅ Database connected

═══════════════════════════════════════════════════
  Estate Standard API
  The Standard of Home Maintenance
═══════════════════════════════════════════════════
  Environment: development
  Server:      http://localhost:3000
  Health:      http://localhost:3000/health
═══════════════════════════════════════════════════
```

Test the API:

```bash
curl http://localhost:3000/health
```

### Step 6: Mobile App Configuration (1 min)

In a new terminal:

```bash
cd mobile

# Create .env file (optional for MVP)
echo "API_URL=http://localhost:3000" > .env
```

### Step 7: Start Mobile App (1 min)

```bash
# In /mobile directory
npm start
```

This will start Expo. You'll see a QR code and menu:

```
› Press a │ open Android
› Press i │ open iOS simulator
› Press w │ open web

› Press r │ reload app
› Press m │ toggle menu
› Press ? │ show all commands
```

**To run on iOS Simulator:**
```bash
Press 'i' or run: npm run ios
```

**To run on Android Emulator:**
```bash
Press 'a' or run: npm run android
```

**To run in web browser:**
```bash
Press 'w' or run: npm run web
```

**To run on physical device:**
1. Install "Expo Go" app from App Store / Play Store
2. Scan the QR code displayed in terminal

## Verify Everything Works

### Backend API Test

```bash
# Get maintenance categories
curl http://localhost:3000/api/maintenance/categories

# Login as homeowner
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "sarah.mitchell@example.com",
    "password": "Homeowner123!"
  }'
```

### Mobile App Test

1. Open the app (iOS, Android, or web)
2. Navigate through all 4 tabs:
   - **Home**: See dashboard with upcoming maintenance
   - **Guide**: Browse 38 maintenance categories
   - **Customer Care**: View requests and appointments
   - **Profile**: See user profile

You should see the Japandi design:
- Warm, neutral color palette (sand, stone, linen)
- Clean typography
- Generous spacing
- Soft shadows
- Calm, reassuring microcopy

## Development Workflow

### Backend Development

```bash
cd backend

# Run in development mode (auto-reload)
npm run dev

# View database in Prisma Studio
npm run studio

# Run migrations after schema changes
npm run migrate

# Format code
npm run format

# Lint code
npm run lint
```

### Mobile Development

```bash
cd mobile

# Start Expo
npm start

# Clear cache if needed
npx expo start -c

# Format code
npm run format

# Lint code
npm run lint
```

### Database Management

```bash
cd backend

# Open Prisma Studio (GUI for database)
npm run studio
# Opens at http://localhost:5555

# Create new migration
npx prisma migrate dev --name description_of_change

# Reset database (WARNING: deletes all data)
npx prisma migrate reset

# Re-seed
npm run seed
```

## Project Structure

### Backend (`/backend`)

```
backend/
├── prisma/
│   ├── schema.prisma          # Database schema
│   └── seed.ts                # Seed data
├── src/
│   ├── controllers/           # Route handlers
│   │   ├── auth.controller.ts
│   │   ├── serviceRequest.controller.ts
│   │   └── appointment.controller.ts
│   ├── routes/                # API routes
│   │   ├── auth.routes.ts
│   │   ├── serviceRequest.routes.ts
│   │   └── appointment.routes.ts
│   ├── middleware/            # Express middleware
│   │   ├── auth.ts
│   │   ├── errorHandler.ts
│   │   └── rateLimiter.ts
│   ├── ai/                    # AI triage
│   │   └── triage.service.ts
│   └── server.ts              # Express app
└── package.json
```

### Mobile (`/mobile`)

```
mobile/
├── src/
│   ├── screens/               # App screens
│   │   ├── HomeScreen.tsx
│   │   ├── GuideScreen.tsx
│   │   ├── CustomerCareScreen.tsx
│   │   └── ProfileScreen.tsx
│   ├── navigation/            # Navigation setup
│   │   └── index.tsx
│   ├── theme/                 # Japandi design system
│   │   └── index.ts
│   ├── components/            # Reusable components
│   ├── services/              # API services
│   ├── hooks/                 # Custom hooks
│   └── types/                 # TypeScript types
├── App.tsx                    # App entry point
├── app.json                   # Expo config
└── package.json
```

## Testing

### Backend API Endpoints

Use the included test credentials to test all flows:

#### 1. Authentication

```bash
# Register new homeowner
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123!",
    "firstName": "Test",
    "lastName": "User",
    "role": "HOMEOWNER",
    "phone": "+14691234567"
  }'

# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "sarah.mitchell@example.com",
    "password": "Homeowner123!"
  }'
```

Save the `accessToken` from the response.

#### 2. Create Service Request

```bash
curl -X POST http://localhost:3000/api/service-requests \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "homeId": "HOME_ID_FROM_SEED",
    "title": "AC not cooling",
    "description": "Air conditioner running but not cooling properly. Checked filters.",
    "photos": []
  }'
```

#### 3. Get Recommended Vendors

```bash
curl http://localhost:3000/api/service-requests/REQUEST_ID/vendors \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## Sample Data

The seed script creates:

### Homeowner Account
- **Email**: sarah.mitchell@example.com
- **Password**: Homeowner123!
- **Home**: 1234 Oak Ridge Drive, Northlake, TX 76262
- **Subscription**: Annual plan (active)

### 3 Verified Vendors (DFW Area)

1. **Cool Breeze HVAC**
   - Service: HVAC
   - Coverage: Northlake, Trophy Club, Roanoke
   - Rating: 4.8/5
   - Status: Verified, Sponsored

2. **DFW Plumbing Pros**
   - Service: Plumbing
   - Coverage: Fort Worth, Keller, Southlake
   - Rating: 4.9/5
   - Status: Verified

3. **Green Horizon Landscaping**
   - Service: Landscaping
   - Coverage: Northlake, Argyle, Denton
   - Rating: 4.7/5
   - Status: Verified

### 38 Maintenance Categories

All predefined categories from HVAC to Mold Disclosure are pre-seeded with:
- Default maintenance cadence
- Recommended tasks
- Seasonal notes

### Sample Maintenance Records

The homeowner's home has 3 active maintenance records:
- HVAC: Quarterly (next due Mar 2026)
- Plumbing: Semi-annual (next due Apr 2026)
- Landscaping: Monthly (next due Jan 2026)

## Troubleshooting

### Backend Issues

**Database connection failed**
```bash
# Check PostgreSQL is running
docker ps  # if using Docker
# or
pg_isready

# Verify DATABASE_URL in .env
cat backend/.env | grep DATABASE_URL

# Test connection manually
psql postgresql://postgres:postgres@localhost:5432/estate_standard
```

**Prisma errors**
```bash
# Regenerate Prisma client
cd backend
npx prisma generate

# Reset database (WARNING: deletes data)
npx prisma migrate reset
npm run seed
```

**Port 3000 already in use**
```bash
# Change PORT in backend/.env
echo "PORT=3001" >> backend/.env
```

### Mobile App Issues

**Expo won't start**
```bash
# Clear cache
cd mobile
npx expo start -c

# Reinstall dependencies
rm -rf node_modules
npm install
```

**App won't load on device**
- Ensure phone and computer are on same WiFi
- Try tunnel mode: `npx expo start --tunnel`
- Check firewall isn't blocking ports

**Metro bundler errors**
```bash
# Clear Metro cache
npx expo start -c

# Reset cache
watchman watch-del-all  # if watchman is installed
rm -rf node_modules
npm install
```

## Environment Variables

### Backend Required

```env
DATABASE_URL              # PostgreSQL connection string
NODE_ENV                  # development | production
JWT_SECRET                # Secret for access tokens
JWT_REFRESH_SECRET        # Secret for refresh tokens
```

### Backend Optional (for full features)

```env
STRIPE_SECRET_KEY         # Stripe payments
TWILIO_ACCOUNT_SID        # SMS notifications
SENDGRID_API_KEY          # Email notifications
AWS_ACCESS_KEY_ID         # S3 file uploads
OPENAI_API_KEY            # AI triage (V1)
```

### Mobile

```env
API_URL                   # Backend API URL (default: http://localhost:3000)
```

## Next Steps

Now that you have Estate Standard running locally:

1. **Explore the codebase**
   - Review `ARCHITECTURE.md` for system design
   - Check `backend/prisma/schema.prisma` for database structure
   - Browse `mobile/src/theme/index.ts` for Japandi design system

2. **Test core workflows**
   - Create a service request
   - Get vendor recommendations
   - Book an appointment
   - Complete job lifecycle (vendor confirmation → completion → homeowner confirmation)

3. **Customize for your use case**
   - Add more maintenance categories
   - Customize AI triage rules
   - Extend Japandi theme colors
   - Add new screens/features

4. **Deploy to production**
   - See `docs/DEPLOYMENT.md` (coming soon)
   - Set up Stripe Connect for payments
   - Configure Twilio for SMS
   - Set up S3 for file uploads

## Support

Having issues? Check:

1. **ARCHITECTURE.md** - System design and decisions
2. **GitHub Issues** - Known issues and solutions
3. **Prisma Docs** - Database queries: https://www.prisma.io/docs
4. **Expo Docs** - Mobile development: https://docs.expo.dev
5. **React Native Docs** - Component reference: https://reactnative.dev

## Development Tips

### Recommended VS Code Extensions

```json
{
  "recommendations": [
    "prisma.prisma",
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "expo.vscode-expo-tools"
  ]
}
```

### Useful Commands

```bash
# Backend: Watch database changes
cd backend
npm run studio

# Mobile: Debug with React DevTools
cd mobile
npx expo start
# Press 'm' then select "Open React DevTools"

# Both: Format all code
npm run format

# Both: Check for issues
npm run lint
```

---

**Estate Standard**: The Standard of Home Maintenance

Built with Japandi design philosophy: calm, cozy, premium, and functional.
