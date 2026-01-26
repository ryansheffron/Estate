# Estate Standard - Infrastructure & Integrations Architecture

**Version:** 1.0.0
**Last Updated:** 2026-01-26
**Author:** Infrastructure & Platform Architecture Team

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Recommended Infrastructure Stack](#recommended-infrastructure-stack)
3. [Architecture Diagram](#architecture-diagram)
4. [Application Hosting](#application-hosting)
5. [Authentication & Identity](#authentication--identity)
6. [Database & Storage](#database--storage)
7. [Messaging & Notifications](#messaging--notifications)
8. [Payments & Payouts Integration](#payments--payouts-integration)
9. [Background Jobs & Scheduling](#background-jobs--scheduling)
10. [Observability & Monitoring](#observability--monitoring)
11. [Security & Compliance](#security--compliance)
12. [Third-Party Integrations](#third-party-integrations)
13. [Environment Setup Guide](#environment-setup-guide)
14. [Secrets & Configuration Management](#secrets--configuration-management)
15. [Failure Modes & Graceful Degradation](#failure-modes--graceful-degradation)
16. [Backup & Disaster Recovery](#backup--disaster-recovery)
17. [Cost Analysis & Optimization](#cost-analysis--optimization)
18. [Day-1 MVP vs Scale-Ready Plan](#day-1-mvp-vs-scale-ready-plan)
19. [Security Checklist](#security-checklist)
20. [Deployment Runbook](#deployment-runbook)

---

## Executive Summary

Estate Standard's infrastructure is designed with three core principles:

1. **Invisible Reliability**: Infrastructure should "just work" like a private estate office—no surprises, no drama
2. **Graceful Degradation**: When things fail (and they will), the system degrades gracefully without data loss
3. **Audit-First Design**: Every critical operation leaves a trail for disputes, compliance, and debugging

### Technology Stack Overview

```
Mobile: React Native + Expo (iOS primary, TestFlight distribution)
Backend: Node.js + Express + PostgreSQL + Prisma ORM
Hosting: Railway (MVP) → AWS ECS Fargate (scale)
Database: Railway PostgreSQL (MVP) → AWS RDS PostgreSQL (scale)
Storage: AWS S3 (media, documents)
Auth: Custom JWT (already implemented)
Payments: Stripe Connect (destination charges)
Notifications: Twilio (SMS) + SendGrid (email) + Expo Push (mobile)
Monitoring: Sentry (errors) + DataDog (APM) + CloudWatch (logs)
Background Jobs: Node-cron (MVP) → AWS SQS + Lambda (scale)
```

### Philosophy: Progressive Enhancement

Start simple (Railway + managed services), scale deliberately (AWS + orchestration).

**Cost Estimate:**
- **MVP (0-100 homes)**: ~$300/month
- **Growth (100-1,000 homes)**: ~$1,500/month
- **Scale (1,000-10,000 homes)**: ~$8,000/month

---

## Recommended Infrastructure Stack

### Decision Framework

We recommend **Railway for MVP**, transitioning to **AWS for scale**. Here's why:

#### Railway (MVP Phase: 0-1,000 homes)

**Pros:**
- Zero DevOps: Deploy from GitHub, automatic HTTPS, managed PostgreSQL
- Fast iteration: Push to main branch → automatic deploy (~2 minutes)
- Founder-friendly: Simple dashboard, no Kubernetes complexity
- Cost-effective: $20/month base + usage-based scaling
- Built-in monitoring: Logs, metrics, deployment history

**Cons:**
- Vendor lock-in concerns (mitigated by containerized apps)
- Less control over infrastructure
- Limited to North America regions initially

**Verdict:** Perfect for MVP. Get to market fast, prove product-market fit, then migrate to AWS if needed.

#### AWS (Scale Phase: 1,000+ homes)

**Pros:**
- Battle-tested: Used by 90% of high-growth startups
- Complete control: VPC, security groups, IAM policies
- Regional expansion: Deploy to DFW, Austin, Houston separately
- Enterprise features: Private Link, compliance certifications
- Cost optimization: Reserved instances, spot instances

**Cons:**
- Complexity: Requires DevOps expertise (hire when revenue supports it)
- Slower iteration: More moving parts to manage
- Upfront learning curve

**Verdict:** Migrate when hitting Railway limits or raising Series A.

### Why Not Google Cloud Platform (GCP)?

**Pros:**
- Better machine learning tools (not critical for Estate Standard)
- Simpler pricing structure
- Good BigQuery for analytics

**Cons:**
- Less vendor support in Texas (DFW/Austin)
- Smaller marketplace for consultants/contractors
- Less mature managed services ecosystem

**Verdict:** GCP is fine, but AWS has better ecosystem for service businesses.

### Why Not Firebase?

**Pros:**
- Fastest MVP development
- Built-in auth, database, hosting
- Excellent mobile SDK

**Cons:**
- NoSQL database (Estate Standard needs relational with transactions)
- Difficult to migrate off (vendor lock-in)
- Limited backend control (can't run background workers easily)
- Pricing can spike unexpectedly at scale

**Verdict:** Firebase is better for consumer social apps, not service marketplaces with complex business logic.

### Recommended Stack by Component

| Component | MVP (Railway) | Scale (AWS) |
|-----------|---------------|-------------|
| **API Hosting** | Railway (containerized Node.js) | ECS Fargate (auto-scaling containers) |
| **Database** | Railway PostgreSQL | RDS PostgreSQL (Multi-AZ) |
| **Media Storage** | AWS S3 | AWS S3 + CloudFront CDN |
| **Background Jobs** | Node-cron (in-process) | SQS + Lambda (serverless) |
| **Cache** | None (MVP doesn't need it) | ElastiCache Redis |
| **Load Balancer** | Railway (built-in) | Application Load Balancer |
| **SSL/TLS** | Railway (automatic) | ACM (AWS Certificate Manager) |
| **DNS** | Cloudflare | Cloudflare (proxy to AWS) |
| **Monitoring** | Railway logs + Sentry | DataDog + CloudWatch + Sentry |

---

## Architecture Diagram

### MVP Architecture (Railway + Managed Services)

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                                 │
└─────────────────────────────────────────────────────────────────────┘

    ┌──────────────────┐         ┌──────────────────┐
    │  iOS App (Expo)  │         │  Android App     │
    │  TestFlight      │         │  (Optional)      │
    └──────────────────┘         └──────────────────┘
            │                             │
            └──────────────┬──────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────────┐
│                         CDN LAYER                                    │
└─────────────────────────────────────────────────────────────────────┘

                    ┌──────────────────┐
                    │   Cloudflare     │ ← DNS, DDoS protection, WAF
                    │   (Free Tier)    │
                    └──────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────────┐
│                      APPLICATION LAYER                               │
└─────────────────────────────────────────────────────────────────────┘

                    ┌──────────────────┐
                    │  Railway App     │
                    │  Node.js + Express│
                    │  (Auto-scaling)  │
                    └──────────────────┘
                           │
                           ├─────────────────────────┐
                           ↓                         ↓
                ┌────────────────┐         ┌──────────────────┐
                │ Railway        │         │  Background      │
                │ PostgreSQL     │         │  Workers (cron)  │
                │ (Managed)      │         │  (same container)│
                └────────────────┘         └──────────────────┘
                           │
                           ↓
┌─────────────────────────────────────────────────────────────────────┐
│                      EXTERNAL SERVICES                               │
└─────────────────────────────────────────────────────────────────────┘

    ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
    │  Stripe  │  │  Twilio  │  │SendGrid  │  │  AWS S3  │
    │ Connect  │  │   SMS    │  │  Email   │  │  Media   │
    └──────────┘  └──────────┘  └──────────┘  └──────────┘

    ┌──────────┐  ┌──────────┐  ┌──────────┐
    │  Sentry  │  │   Expo   │  │OpenAI API│
    │  Errors  │  │   Push   │  │  (AI)    │
    └──────────┘  └──────────┘  └──────────┘
```

### Scale Architecture (AWS + Orchestration)

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                                 │
└─────────────────────────────────────────────────────────────────────┘

    ┌──────────────────┐         ┌──────────────────┐
    │  iOS App (Expo)  │         │  Admin Dashboard │
    │  App Store       │         │  (React)         │
    └──────────────────┘         └──────────────────┘
            │                             │
            └──────────────┬──────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────────┐
│                      CDN & WAF LAYER                                 │
└─────────────────────────────────────────────────────────────────────┘

                    ┌──────────────────┐
                    │   Cloudflare     │ ← DNS, DDoS, bot protection
                    └──────────────────┘
                           ↓
                    ┌──────────────────┐
                    │  CloudFront CDN  │ ← Media delivery (S3 origin)
                    └──────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────────┐
│                      AWS VPC (us-south-1)                            │
└─────────────────────────────────────────────────────────────────────┘

                    ┌──────────────────┐
                    │  Application     │ ← SSL termination, routing
                    │  Load Balancer   │
                    └──────────────────┘
                           │
                ┌──────────┴──────────┐
                ↓                     ↓
    ┌─────────────────┐    ┌─────────────────┐
    │  ECS Fargate    │    │  ECS Fargate    │ ← Auto-scaling API
    │  API Container  │    │  API Container  │   (2+ instances)
    │  (Private)      │    │  (Private)      │
    └─────────────────┘    └─────────────────┘
                │                     │
                └──────────┬──────────┘
                           ↓
                ┌─────────────────────┐
                │  RDS PostgreSQL     │ ← Multi-AZ, automatic backups
                │  (Private Subnet)   │   Read replicas for analytics
                └─────────────────────┘
                           │
                           ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    BACKGROUND PROCESSING                             │
└─────────────────────────────────────────────────────────────────────┘

    ┌──────────────────┐         ┌──────────────────┐
    │  EventBridge     │         │  SQS Queues      │
    │  (Cron triggers) │────────▶│  (Jobs)          │
    └──────────────────┘         └──────────────────┘
                                          │
                ┌─────────────────────────┼─────────────────────────┐
                ↓                         ↓                         ↓
    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
    │  Lambda         │    │  Lambda         │    │  Lambda         │
    │  Auto-confirm   │    │  Reminders      │    │  Recurring      │
    └─────────────────┘    └─────────────────┘    └─────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                      STORAGE & CACHE                                 │
└─────────────────────────────────────────────────────────────────────┘

    ┌──────────────────┐         ┌──────────────────┐
    │  S3 Bucket       │         │  ElastiCache     │
    │  Media (photos)  │         │  Redis (sessions)│
    └──────────────────┘         └──────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    MONITORING & LOGGING                              │
└─────────────────────────────────────────────────────────────────────┘

    ┌──────────────────┐         ┌──────────────────┐
    │  DataDog APM     │         │  CloudWatch      │
    │  (Metrics)       │         │  Logs            │
    └──────────────────┘         └──────────────────┘
                           │
                           ↓
                ┌─────────────────────┐
                │  PagerDuty          │ ← Critical alerts only
                │  (On-call rotation) │
                └─────────────────────┘
```

**Key Differences:**
- MVP: Single container, in-process workers, no cache
- Scale: Auto-scaling containers, async workers, Redis cache
- Migration path: Containerized apps make transition smooth

---

## Application Hosting

### MVP: Railway

**Setup (5 minutes):**

1. **Connect GitHub Repository**
   ```bash
   # No config needed - Railway auto-detects Node.js
   # Dockerfile: Optional but recommended for consistency
   ```

2. **Environment Variables**
   ```bash
   # Railway dashboard → "Variables" tab
   NODE_ENV=production
   DATABASE_URL=${{Postgres.DATABASE_URL}}  # Auto-injected
   JWT_SECRET=<generate-strong-secret>
   STRIPE_SECRET_KEY=<from-stripe-dashboard>
   # ... (see Secrets section for complete list)
   ```

3. **Deploy**
   ```bash
   git push origin main  # Railway deploys automatically
   ```

**Health Check Endpoint:**
```javascript
// Already implemented in server.ts
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Estate Standard API',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    version: '1.0.0',
  });
});
```

**Auto-Scaling:**
Railway handles this automatically. No config needed for MVP.

**Custom Domain:**
1. Railway dashboard → Settings → Add custom domain
2. Point DNS (Cloudflare) → Railway's provided CNAME
3. SSL certificate issued automatically (Let's Encrypt)

### Scale: AWS ECS Fargate

**Why ECS Fargate over EC2?**
- No server management (serverless containers)
- Pay only for running containers
- Auto-scaling built-in
- Better security (no SSH access needed)

**Setup (requires DevOps knowledge):**

1. **Create ECR Repository**
   ```bash
   aws ecr create-repository --repository-name estate-standard-api
   ```

2. **Build and Push Docker Image**
   ```dockerfile
   # Dockerfile (already in repo)
   FROM node:18-alpine
   WORKDIR /app
   COPY package*.json ./
   RUN npm ci --only=production
   COPY . .
   RUN npx prisma generate
   EXPOSE 3000
   CMD ["npm", "start"]
   ```

   ```bash
   docker build -t estate-standard-api .
   docker tag estate-standard-api:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/estate-standard-api:latest
   docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/estate-standard-api:latest
   ```

3. **Create ECS Service**
   ```yaml
   # Terraform (recommended) or CloudFormation
   resource "aws_ecs_service" "api" {
     name            = "estate-standard-api"
     cluster         = aws_ecs_cluster.main.id
     task_definition = aws_ecs_task_definition.api.arn
     desired_count   = 2  # Start with 2 for redundancy
     launch_type     = "FARGATE"

     load_balancer {
       target_group_arn = aws_lb_target_group.api.arn
       container_name   = "api"
       container_port   = 3000
     }

     network_configuration {
       subnets         = aws_subnet.private[*].id
       security_groups = [aws_security_group.api.id]
     }
   }
   ```

4. **Auto-Scaling Policy**
   ```yaml
   resource "aws_appautoscaling_policy" "api" {
     name               = "estate-standard-api-cpu"
     service_namespace  = "ecs"
     resource_id        = "service/estate-standard/api"
     scalable_dimension = "ecs:service:DesiredCount"

     target_tracking_scaling_policy_configuration {
       target_value       = 70.0  # Scale when CPU > 70%
       predefined_metric_specification {
         predefined_metric_type = "ECSServiceAverageCPUUtilization"
       }
     }
   }
   ```

**Zero-Downtime Deployments:**
```yaml
deployment_configuration {
  maximum_percent         = 200  # Can deploy 2x capacity temporarily
  minimum_healthy_percent = 100  # Always keep 100% healthy
}
```

**Cost Comparison:**
- **Railway**: $20/month base + $0.000463/GB-second memory
- **ECS Fargate**: $0.04048/hour per vCPU + $0.004445/hour per GB memory
  - 2 containers (0.5 vCPU, 1 GB each) = ~$60/month
  - Scales to 10 containers during peak = ~$300/month

### Mobile App Hosting

**iOS (Expo + TestFlight):**

1. **Build Standalone App**
   ```bash
   # Install EAS CLI
   npm install -g eas-cli

   # Configure project
   eas build:configure

   # Build for iOS
   eas build --platform ios --profile production
   ```

2. **Submit to TestFlight**
   ```bash
   eas submit --platform ios
   ```

3. **Distribute to Beta Testers**
   - TestFlight supports 10,000 testers (way more than needed)
   - 90-day builds (auto-expires, good for security)
   - Automatic crash reporting

**Android (Future):**
Same process with `--platform android` and Google Play Console.

**Over-the-Air Updates (Expo):**
```bash
# Push JavaScript updates without App Store review
eas update --branch production --message "Fix: Payment confirmation bug"

# Users get updates on next app open
# Native code changes still require App Store review
```

**Cost:**
- Expo EAS: $99/month (for production builds)
- Apple Developer: $99/year
- Google Play: $25 one-time (if Android)

---

## Authentication & Identity

Estate Standard uses **custom JWT authentication** (already implemented). No Firebase Auth or Auth0 needed.

### Why Custom JWT?

**Pros:**
- Complete control over auth flow
- No vendor lock-in
- No per-user pricing
- Works with existing PostgreSQL users table

**Cons:**
- Must implement 2FA ourselves (schema ready, not implemented yet)
- No social login out-of-box (Google, Apple Sign-In)

**Verdict:** Custom JWT is fine for MVP. Add OAuth2 providers later if needed.

### Token Architecture

**Access Token (Short-lived):**
```javascript
// 15 minutes, stored in memory (React Native AsyncStorage)
const accessToken = jwt.sign(
  { userId, role, email },
  process.env.JWT_SECRET,
  { expiresIn: '15m' }
);
```

**Refresh Token (Long-lived):**
```javascript
// 30 days, stored in database (revocable)
const refreshToken = jwt.sign(
  { userId, tokenId },
  process.env.JWT_REFRESH_SECRET,
  { expiresIn: '30d' }
);

// Store in refresh_tokens table
await prisma.refreshToken.create({
  data: {
    token: refreshToken,
    userId,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  },
});
```

**Token Refresh Flow:**
```
Client: Access token expired
    ↓
Client: POST /api/auth/refresh with refresh token
    ↓
Server: Validate refresh token (check DB + JWT signature)
    ↓
Server: Issue new access token + new refresh token
    ↓
Server: Revoke old refresh token (one-time use)
    ↓
Client: Store new tokens
```

### Role-Based Access Control (RBAC)

**Roles:**
- `HOMEOWNER`: Can create service requests, book appointments, make payments
- `VENDOR`: Can accept bookings, submit completion proof, receive payouts
- `ADMIN`: Can manage disputes, vet vendors, view analytics

**Middleware:**
```typescript
// Already implemented in middleware/auth.ts
export const requireRole = (requiredRole: UserRole) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.user?.role !== requiredRole) {
      throw new AppError('Insufficient permissions', 403);
    }
    next();
  };
};

// Usage
router.post('/capture', requireRole('ADMIN'), capturePayment);
```

### Security Best Practices

1. **Password Hashing**
   ```typescript
   // bcrypt with 12 rounds (already implemented)
   const passwordHash = await bcrypt.hash(password, 12);
   ```

2. **Password History**
   ```typescript
   // Prevent reusing last 5 passwords (schema supports, not enforced yet)
   const passwordHistory = user.passwordHistory.slice(-5);
   for (const oldHash of passwordHistory) {
     if (await bcrypt.compare(password, oldHash)) {
       throw new AppError('Cannot reuse recent passwords', 400);
     }
   }
   ```

3. **Account Lockout**
   ```typescript
   // Lock account after 5 failed attempts for 30 minutes
   if (user.failedLoginAttempts >= 5) {
     if (user.accountLockedUntil && new Date() < user.accountLockedUntil) {
       throw new AppError('Account locked. Try again in 30 minutes.', 423);
     }
   }
   ```

4. **Two-Factor Authentication (Future)**
   ```typescript
   // Schema ready, not implemented yet
   // Use authenticator app (TOTP) via speakeasy library
   const secret = speakeasy.generateSecret();
   const qrCode = await QRCode.toDataURL(secret.otpauth_url);
   ```

### Session Management

**Mobile App:**
- Store access token in AsyncStorage (encrypted at OS level)
- Store refresh token in Keychain (iOS) / EncryptedSharedPreferences (Android)
- Clear tokens on logout

**Admin Dashboard (if built):**
- Store access token in memory (React state)
- Store refresh token in httpOnly cookie (cannot be accessed by JavaScript)
- Clear cookies on logout

### Multi-Device Support

**Current:** One user can log in on multiple devices simultaneously.
**Future:** Add `device_tokens` table to track active sessions per device.

---

## Database & Storage

### Primary Database: PostgreSQL

**MVP: Railway PostgreSQL**

**Setup:**
1. Railway dashboard → Add PostgreSQL plugin
2. Database URL auto-injected as `DATABASE_URL`
3. Automatic daily backups (7-day retention)

**Specs:**
- Shared CPU (sufficient for MVP)
- 1 GB RAM (scales automatically with usage)
- 1 GB storage (grows with data)
- **Cost:** ~$5/month + usage

**Connection Pooling:**
```typescript
// Prisma handles this automatically
const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL },
  },
  pool: {
    min: 2,
    max: 10,  // Don't exceed Railway's connection limit
  },
});
```

**Scale: AWS RDS PostgreSQL**

**Setup:**
```yaml
resource "aws_db_instance" "main" {
  identifier     = "estate-standard-db"
  engine         = "postgres"
  engine_version = "15.4"
  instance_class = "db.t4g.medium"  # 2 vCPU, 4 GB RAM

  allocated_storage     = 100  # GB
  max_allocated_storage = 1000 # Auto-scaling up to 1 TB

  multi_az               = true  # High availability
  backup_retention_period = 30   # 30-day backups
  backup_window          = "03:00-04:00"  # 3-4 AM CST

  storage_encrypted = true
  kms_key_id        = aws_kms_key.rds.arn

  vpc_security_group_ids = [aws_security_group.db.id]
  db_subnet_group_name   = aws_db_subnet_group.main.name

  # Performance Insights (monitoring)
  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]
  performance_insights_enabled    = true
}
```

**Read Replicas (for analytics):**
```yaml
resource "aws_db_instance" "read_replica" {
  identifier     = "estate-standard-db-read"
  replicate_source_db = aws_db_instance.main.id
  instance_class = "db.t4g.small"  # Smaller for read-only queries
}
```

**Cost:**
- **MVP (Railway)**: ~$5-20/month
- **Scale (RDS Multi-AZ)**: ~$200-400/month

### Media Storage: AWS S3

**Why S3 over Railway storage?**
- Cost: $0.023/GB/month (vs Railway at higher rates)
- Durability: 99.999999999% (eleven nines)
- CDN integration: CloudFront for fast delivery
- Scalability: Unlimited storage

**Setup:**

1. **Create S3 Bucket**
   ```yaml
   resource "aws_s3_bucket" "media" {
     bucket = "estate-standard-media-prod"

     versioning {
       enabled = true  # Keep old versions (rollback capability)
     }

     lifecycle_rule {
       id      = "archive-old-photos"
       enabled = true

       transition {
         days          = 90
         storage_class = "GLACIER"  # Archive after 90 days
       }
     }

     server_side_encryption_configuration {
       rule {
         apply_server_side_encryption_by_default {
           sse_algorithm = "AES256"
         }
       }
     }
   }
   ```

2. **Bucket Policy (Restrict Access)**
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Sid": "AllowAPIAccess",
         "Effect": "Allow",
         "Principal": {
           "AWS": "arn:aws:iam::ACCOUNT_ID:role/estate-standard-api"
         },
         "Action": [
           "s3:GetObject",
           "s3:PutObject",
           "s3:DeleteObject"
         ],
         "Resource": "arn:aws:s3:::estate-standard-media-prod/*"
       }
     ]
   }
   ```

3. **CloudFront CDN (Optional but Recommended)**
   ```yaml
   resource "aws_cloudfront_distribution" "media" {
     origin {
       domain_name = aws_s3_bucket.media.bucket_regional_domain_name
       origin_id   = "S3-estate-standard-media"
     }

     enabled = true
     default_cache_behavior {
       allowed_methods  = ["GET", "HEAD"]
       cached_methods   = ["GET", "HEAD"]
       target_origin_id = "S3-estate-standard-media"

       min_ttl     = 0
       default_ttl = 3600  # 1 hour
       max_ttl     = 86400 # 1 day
     }
   }
   ```

**Upload Flow:**

```typescript
// Backend generates presigned URL
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export async function generateUploadUrl(
  fileName: string,
  contentType: string
): Promise<{ uploadUrl: string; fileUrl: string }> {
  const s3 = new S3Client({ region: 'us-east-1' });

  const key = `uploads/${Date.now()}-${fileName}`;
  const command = new PutObjectCommand({
    Bucket: 'estate-standard-media-prod',
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 }); // 5 min

  return {
    uploadUrl,
    fileUrl: `https://cdn.estatestandard.com/${key}`,
  };
}

// Mobile app uploads directly to S3 (no backend bottleneck)
const { uploadUrl, fileUrl } = await fetch('/api/media/upload-url', {
  method: 'POST',
  body: JSON.stringify({ fileName: 'photo.jpg', contentType: 'image/jpeg' }),
});

await fetch(uploadUrl, {
  method: 'PUT',
  body: photoBlob,
  headers: { 'Content-Type': 'image/jpeg' },
});

// Save fileUrl to database
await fetch('/api/service-requests', {
  method: 'POST',
  body: JSON.stringify({ photos: [fileUrl] }),
});
```

**Security:**
- Presigned URLs expire after 5 minutes
- No public bucket access
- CloudFront serves with signed URLs (optional for extra security)

**Cost:**
- Storage: $0.023/GB/month (~$2.30 for 100 GB of photos)
- Requests: $0.0004/1000 PUT, $0.0004/1000 GET (~$1 for 10,000 uploads)
- CloudFront: $0.085/GB transfer (~$8.50 for 100 GB delivered)
- **Total for 1,000 homes**: ~$50/month

---

## Messaging & Notifications

Estate Standard uses **multi-channel notifications** respecting homeowner preferences.

### Push Notifications: Expo Push

**Why Expo Push over Firebase Cloud Messaging (FCM)?**
- Unified API for iOS + Android
- No separate APNs/FCM setup
- Built into Expo workflow
- Free (no per-message cost)

**Setup:**

1. **Get Push Token (Mobile App)**
   ```typescript
   import * as Notifications from 'expo-notifications';

   async function registerForPushNotifications() {
     const { status } = await Notifications.requestPermissionsAsync();
     if (status !== 'granted') {
       return null;
     }

     const token = await Notifications.getExpoPushTokenAsync();

     // Send token to backend
     await fetch('/api/users/push-token', {
       method: 'POST',
       body: JSON.stringify({ pushToken: token.data }),
     });

     return token.data;
   }
   ```

2. **Store Token in Database**
   ```typescript
   // Add to User table or separate DeviceTokens table
   await prisma.user.update({
     where: { id: userId },
     data: { expoPushToken: pushToken },
   });
   ```

3. **Send Push Notification (Backend)**
   ```typescript
   import { Expo } from 'expo-server-sdk';

   const expo = new Expo();

   async function sendPushNotification(userId: string, message: string) {
     const user = await prisma.user.findUnique({ where: { id: userId } });

     if (!user.expoPushToken || !Expo.isExpoPushToken(user.expoPushToken)) {
       return; // User doesn't have push enabled
     }

     const notification = {
       to: user.expoPushToken,
       sound: 'default',
       title: 'Estate Standard',
       body: message,
       data: { appointmentId: 'appt_123' },
       badge: 1,
     };

     const chunks = expo.chunkPushNotifications([notification]);

     for (const chunk of chunks) {
       try {
         await expo.sendPushNotificationsAsync(chunk);
       } catch (error) {
         console.error('Push notification failed:', error);
       }
     }
   }
   ```

**Quiet Notifications:**
Estate Standard should not spam. Only send pushes for:
- Appointment confirmed (homeowner + vendor)
- 24-hour reminder
- Job completed (homeowner)
- Payment processed
- Dispute resolved

**Cost:** Free (Expo handles delivery to APNs/FCM)

### SMS Notifications: Twilio

**Setup:**

1. **Create Twilio Account**
   - Sign up at twilio.com
   - Verify phone number
   - Buy a phone number ($1/month)

2. **Store Credentials**
   ```bash
   TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   TWILIO_AUTH_TOKEN=your_auth_token
   TWILIO_FROM_NUMBER=+14695550100
   ```

3. **Send SMS**
   ```typescript
   import twilio from 'twilio';

   const client = twilio(
     process.env.TWILIO_ACCOUNT_SID,
     process.env.TWILIO_AUTH_TOKEN
   );

   async function sendSMS(to: string, message: string) {
     try {
       await client.messages.create({
         body: message,
         from: process.env.TWILIO_FROM_NUMBER,
         to,
       });
     } catch (error) {
       console.error('SMS failed:', error);
       // Fall back to email or push notification
     }
   }
   ```

**Rate Limiting:**
Twilio has built-in rate limits. No config needed.

**Cost:**
- $0.0079/SMS in USA (less than 1 cent)
- 1,000 homes × 5 SMS/month = 5,000 SMS = ~$40/month

**Quiet SMS Best Practices:**
- Never send marketing/promotional messages (use email)
- Only transactional: appointment confirmed, reminder, completed
- Respect "Do Not Disturb" hours (no SMS between 9 PM - 8 AM)

### Email Notifications: SendGrid

**Why SendGrid over Mailgun/Postmark?**
- Free tier: 100 emails/day (3,000/month)
- Good deliverability (99%+ inbox rate)
- Templates for professional emails
- Webhooks for bounce/complaint tracking

**Setup:**

1. **Create SendGrid Account**
   - Sign up at sendgrid.com
   - Verify domain (estatestandard.com)
   - Create API key

2. **Store Credentials**
   ```bash
   SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   EMAIL_FROM_ADDRESS=noreply@estatestandard.com
   EMAIL_FROM_NAME=Estate Standard
   ```

3. **Send Email**
   ```typescript
   import sgMail from '@sendgrid/mail';

   sgMail.setApiKey(process.env.SENDGRID_API_KEY);

   async function sendEmail(
     to: string,
     subject: string,
     html: string
   ) {
     try {
       await sgMail.send({
         to,
         from: {
           email: process.env.EMAIL_FROM_ADDRESS,
           name: process.env.EMAIL_FROM_NAME,
         },
         subject,
         html,
       });
     } catch (error) {
       console.error('Email failed:', error);
     }
   }
   ```

4. **Email Templates**
   ```html
   <!-- SendGrid dashboard → Email API → Dynamic Templates -->
   <!-- Create templates for: -->
   <!-- - Welcome email -->
   <!-- - Appointment confirmed -->
   <!-- - Job completed -->
   <!-- - Payment receipt -->
   ```

**Deliverability Best Practices:**
- SPF record: `v=spf1 include:sendgrid.net ~all`
- DKIM: Configured in SendGrid dashboard
- DMARC: `v=DMARC1; p=quarantine; rua=mailto:dmarc@estatestandard.com`
- Warm up domain: Start with 50 emails/day, increase gradually

**Cost:**
- Free tier: 100 emails/day
- Essentials ($19.95/month): 50,000 emails/month
- **1,000 homes × 10 emails/month = 10,000 emails = Free tier sufficient for MVP**

### Notification Orchestration

**Respect User Preferences:**

```typescript
// NotificationService already implemented
await NotificationService.send(
  NotificationType.APPOINTMENT_CONFIRMED,
  {
    userId: homeowner.userId,
    email: homeowner.user.email,
    phone: homeowner.user.phone,
    firstName: homeowner.user.firstName,
  },
  {
    vendorName: 'Elite HVAC',
    date: '2026-01-27',
    time: '2:00 PM',
  }
);

// Service checks preferredContactMethod:
// - 'in_app' → Push notification only
// - 'sms' → SMS + push
// - 'email' → Email + push
```

**Fallback Strategy:**
```
1. Try preferred channel (SMS/email)
2. If fails, try push notification
3. If fails, log for manual review
4. Never fail silently on critical notifications (payment, dispute)
```

**Retry Logic:**
```typescript
async function sendWithRetry(fn: () => Promise<void>, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await fn();
      return; // Success
    } catch (error) {
      if (i === maxRetries - 1) {
        // Final retry failed
        await prisma.notificationQueue.create({
          data: { type: 'FAILED', error: error.message },
        });
      }
      await sleep(Math.pow(2, i) * 1000); // Exponential backoff: 1s, 2s, 4s
    }
  }
}
```

---

## Payments & Payouts Integration

Estate Standard uses **Stripe Connect** for vendor payouts.

### Why Stripe Connect?

**Alternatives Considered:**
- **PayPal Payouts**: Higher fees (2.9% + $0.30), worse UX
- **Wire Transfers**: Manual, slow (2-3 days), no automation
- **Check Mailing**: Ridiculous for 2026

**Stripe Connect Pros:**
- Automatic payouts to vendor bank accounts
- Platform fee (15%) deducted automatically
- Strong fraud prevention
- Excellent documentation
- Webhook reliability

**Stripe Connect Cons:**
- 2.9% + $0.30 per transaction (passed to homeowner)
- Vendor onboarding required (15 minutes)

**Verdict:** Industry standard for service marketplaces.

### Architecture: Destination Charges

**Flow:**
1. Homeowner pays $150 (authorize payment intent)
2. Platform captures $150 when job confirmed
3. Stripe automatically splits:
   - Platform: $22.50 (15%)
   - Vendor: $127.50 (85%)
4. Vendor receives $127.50 in their bank account (2-3 days)

**vs Separate Charges:**
- ❌ Homeowner pays platform → platform pays vendor (double fees)
- ✅ Destination charge (single fee, automatic split)

### Setup

**1. Create Stripe Account**
- Sign up at stripe.com
- Complete business verification (required for Connect)

**2. Enable Stripe Connect**
- Dashboard → Connect → Get started
- Choose "Platform or marketplace"
- Select "Express accounts" (easiest for vendors)

**3. Store Credentials**
```bash
STRIPE_SECRET_KEY=sk_live_your_stripe_secret_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
```

**4. Vendor Onboarding Flow**

```typescript
// Backend: Create Connect account
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function createVendorConnectAccount(vendorId: string) {
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });

  const account = await stripe.accounts.create({
    type: 'express',
    country: 'US',
    email: vendor.businessEmail,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    business_profile: {
      name: vendor.businessName,
      product_description: 'Home maintenance services',
    },
  });

  await prisma.vendor.update({
    where: { id: vendorId },
    data: { stripeAccountId: account.id },
  });

  return account.id;
}

// Generate onboarding link
export async function getVendorOnboardingLink(vendorId: string) {
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });

  const accountLink = await stripe.accountLinks.create({
    account: vendor.stripeAccountId,
    refresh_url: 'https://app.estatestandard.com/vendor/onboarding',
    return_url: 'https://app.estatestandard.com/vendor/dashboard',
    type: 'account_onboarding',
  });

  return accountLink.url;
}
```

**Mobile App:**
```typescript
// Vendor opens onboarding link in in-app browser
const { url } = await fetch('/api/payments/vendor/onboarding-link').then(r => r.json());
WebBrowser.openBrowserAsync(url);

// After onboarding, vendor returns to app
// Webhook updates stripeOnboardingComplete = true
```

**5. Payment Flow (Already Implemented)**

```typescript
// Create payment intent (authorize, don't capture)
const paymentIntent = await stripe.paymentIntents.create({
  amount: 15000, // $150
  currency: 'usd',
  application_fee_amount: 2250, // 15%
  transfer_data: {
    destination: vendor.stripeAccountId,
  },
  capture_method: 'manual', // Don't charge yet
});

// Homeowner confirms payment in mobile app
// Money is authorized (on hold)

// When job confirmed, capture payment
await stripe.paymentIntents.capture(paymentIntent.id);

// Stripe automatically:
// - Charges homeowner $150
// - Keeps platform fee $22.50
// - Sends vendor $127.50
```

### Webhook Handling

**Critical for State Synchronization:**

```typescript
// Verify webhook signature (SECURITY CRITICAL)
router.post('/api/payments/webhook', async (req, res) => {
  const signature = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body, // Must be raw body (not parsed JSON)
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (error) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Handle events
  switch (event.type) {
    case 'payment_intent.succeeded':
      await handlePaymentSucceeded(event.data.object);
      break;
    case 'payment_intent.payment_failed':
      await handlePaymentFailed(event.data.object);
      break;
    case 'account.updated':
      await handleAccountUpdated(event.data.object);
      break;
    case 'charge.refunded':
      await handleRefund(event.data.object);
      break;
  }

  res.json({ received: true });
});
```

**Webhook Endpoint Setup:**
1. Stripe Dashboard → Developers → Webhooks
2. Add endpoint: `https://api.estatestandard.com/api/payments/webhook`
3. Select events: `payment_intent.*`, `account.updated`, `charge.refunded`
4. Copy webhook signing secret to env vars

**Idempotency:**
Stripe webhooks may be sent multiple times. Always check:

```typescript
async function handlePaymentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  const payment = await prisma.payment.findUnique({
    where: { stripePaymentIntentId: paymentIntent.id },
  });

  if (payment.status === 'SUCCEEDED') {
    return; // Already processed, ignore duplicate webhook
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: 'SUCCEEDED',
      capturedAt: new Date(),
      stripeChargeId: paymentIntent.latest_charge,
    },
  });
}
```

### Testing

**Use Stripe Test Mode:**
```bash
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Test card numbers:
# Success: 4242 4242 4242 4242
# Decline: 4000 0000 0000 0002
# Requires authentication: 4000 0025 0000 3155
```

**Stripe CLI (Local Webhook Testing):**
```bash
stripe listen --forward-to localhost:3000/api/payments/webhook

# Trigger test webhook
stripe trigger payment_intent.succeeded
```

### Cost Structure

**Stripe Fees:**
- 2.9% + $0.30 per transaction (passed to homeowner)
- No monthly fee
- No payout fees

**Example:**
- Homeowner pays: $150
- Stripe fee: $4.65 (2.9% + $0.30)
- Net to platform: $145.35
- Platform fee (15%): $21.80
- Vendor receives: $123.55

**Who pays Stripe fee?**
- **MVP:** Homeowner pays (transparent pricing)
- **Scale:** Platform absorbs (marketing expense)

---

## Background Jobs & Scheduling

Estate Standard runs **4 background workers** for async operations.

### MVP: Node-cron (In-Process)

**Why Node-cron?**
- Simple: No external dependencies
- Cheap: No additional infrastructure
- Sufficient: Works fine for 1,000 homes

**Implementation (Already Done):**

```typescript
// server.ts
import { startAutoConfirmationWorker } from './workers/autoConfirmation.worker';
import { startReminderWorker } from './workers/reminder.worker';
import { startRecurringAppointmentWorker } from './workers/recurringAppointment.worker';
import { startCleanupWorker } from './workers/cleanup.worker';

startAutoConfirmationWorker();    // Runs every hour
startReminderWorker();             // Runs every hour
startRecurringAppointmentWorker(); // Runs daily at 2 AM
startCleanupWorker();              // Runs daily at 3 AM
```

**Pros:**
- Zero setup
- No cost
- Easy to debug (same logs as API)

**Cons:**
- Runs in same process as API (if API crashes, workers stop)
- No retry logic (if worker fails, wait until next run)
- No horizontal scaling (only one instance running workers)

**Mitigations:**
- Workers are idempotent (safe to run multiple times)
- Railway auto-restarts crashed processes
- Workers run frequently (hourly) so delays are acceptable

### Scale: AWS SQS + Lambda

**Why Separate Workers?**
- Horizontal scaling: Process jobs in parallel
- Resilience: Worker failures don't affect API
- Retry logic: Automatic exponential backoff
- Visibility: Separate monitoring for workers

**Architecture:**

```
EventBridge (Cron) → Lambda (Publisher) → SQS Queue → Lambda (Worker)
     ↓                       ↓                  ↓              ↓
Every hour         Find jobs needing    Job IDs     Process each job
                   processing                       (auto-retry on failure)
```

**Setup:**

1. **Create SQS Queues**
   ```yaml
   resource "aws_sqs_queue" "auto_confirm" {
     name = "estate-standard-auto-confirm"
     visibility_timeout_seconds = 300  # 5 minutes
     message_retention_seconds  = 1209600  # 14 days

     redrive_policy = jsonencode({
       deadLetterTargetArn = aws_sqs_queue.auto_confirm_dlq.arn
       maxReceiveCount     = 3  # After 3 failures, move to DLQ
     })
   }

   resource "aws_sqs_queue" "auto_confirm_dlq" {
     name = "estate-standard-auto-confirm-dlq"
   }
   ```

2. **Create Lambda Functions**
   ```yaml
   resource "aws_lambda_function" "auto_confirm_worker" {
     function_name = "estate-standard-auto-confirm-worker"
     runtime       = "nodejs18.x"
     handler       = "dist/workers/autoConfirmation.handler"

     environment {
       variables = {
         DATABASE_URL = var.database_url
         STRIPE_SECRET_KEY = var.stripe_secret_key
       }
     }

     # Trigger from SQS
     event_source_mapping {
       event_source_arn = aws_sqs_queue.auto_confirm.arn
       batch_size       = 10  # Process 10 jobs at once
     }
   }
   ```

3. **EventBridge Cron Trigger**
   ```yaml
   resource "aws_cloudwatch_event_rule" "auto_confirm" {
     name                = "estate-standard-auto-confirm-trigger"
     schedule_expression = "cron(0 * * * ? *)"  # Every hour
   }

   resource "aws_cloudwatch_event_target" "auto_confirm" {
     rule      = aws_cloudwatch_event_rule.auto_confirm.name
     target_id = "AutoConfirmPublisher"
     arn       = aws_lambda_function.auto_confirm_publisher.arn
   }
   ```

4. **Publisher Lambda (Finds Jobs)**
   ```typescript
   // Lambda that runs on cron, publishes job IDs to SQS
   export async function handler(event: any) {
     const cutoffTime = new Date();
     cutoffTime.setHours(cutoffTime.getHours() - 48);

     const pendingJobs = await prisma.appointment.findMany({
       where: {
         status: 'COMPLETED_BY_VENDOR',
         completedAt: { lte: cutoffTime },
       },
       select: { id: true }, // Only IDs
     });

     const sqs = new SQSClient({ region: 'us-east-1' });

     for (const job of pendingJobs) {
       await sqs.send(new SendMessageCommand({
         QueueUrl: process.env.AUTO_CONFIRM_QUEUE_URL,
         MessageBody: JSON.stringify({ jobId: job.id }),
       }));
     }

     return { jobsPublished: pendingJobs.length };
   }
   ```

5. **Worker Lambda (Processes Jobs)**
   ```typescript
   // Lambda triggered by SQS, processes individual jobs
   export async function handler(event: SQSEvent) {
     for (const record of event.Records) {
       const { jobId } = JSON.parse(record.body);

       try {
         await processAutoConfirmation(jobId);
       } catch (error) {
         console.error(`Failed to process job ${jobId}:`, error);
         throw error; // SQS will retry
       }
     }
   }
   ```

**Cost:**
- SQS: $0.40 per million requests (~$1/month for 1,000 homes)
- Lambda: $0.20 per million requests + $0.0000166667/GB-second (~$5/month)
- EventBridge: $1.00 per million events (~$0.01/month)
- **Total: ~$6/month** (vs $0 for node-cron, but better reliability)

### Monitoring Worker Health

**Node-cron (MVP):**
```typescript
// Log worker runs
cron.schedule('0 * * * *', async () => {
  console.log('[Auto-Confirmation Worker] Starting...');
  const startTime = Date.now();

  try {
    const result = await processAutoConfirmations();
    const duration = Date.now() - startTime;

    console.log('[Auto-Confirmation Worker] Completed', {
      jobsProcessed: result.count,
      duration,
    });
  } catch (error) {
    console.error('[Auto-Confirmation Worker] Failed', error);
    // Sentry captures this automatically
  }
});
```

**SQS + Lambda (Scale):**
- CloudWatch metrics: Queue depth, message age, worker errors
- Alarms: Alert if queue depth > 100 (workers can't keep up)
- Dead-letter queue: Manually review jobs that failed 3 times

---

## Observability & Monitoring

Estate Standard uses **layered observability**: errors (Sentry), performance (DataDog), logs (native).

### Error Tracking: Sentry

**Why Sentry?**
- Free tier: 5,000 errors/month (plenty for MVP)
- Source maps: See original TypeScript in stack traces
- Release tracking: Know which deploy introduced a bug
- User context: See which user hit the error

**Setup:**

1. **Create Sentry Account**
   - Sign up at sentry.io
   - Create project: "estate-standard-api"

2. **Install SDK**
   ```bash
   npm install @sentry/node @sentry/tracing
   ```

3. **Initialize in Server**
   ```typescript
   // server.ts (top of file)
   import * as Sentry from '@sentry/node';
   import * as Tracing from '@sentry/tracing';

   Sentry.init({
     dsn: process.env.SENTRY_DSN,
     environment: process.env.NODE_ENV,
     release: process.env.GIT_COMMIT_SHA, // From CI/CD

     tracesSampleRate: 0.1, // 10% of requests for performance monitoring

     beforeSend(event, hint) {
       // Don't send errors with PII in production
       if (event.request?.data) {
         delete event.request.data.password;
         delete event.request.data.creditCard;
       }
       return event;
     },
   });

   // Request handler (first middleware)
   app.use(Sentry.Handlers.requestHandler());
   app.use(Sentry.Handlers.tracingHandler());

   // ... routes ...

   // Error handler (last middleware)
   app.use(Sentry.Handlers.errorHandler());
   ```

4. **Capture Errors**
   ```typescript
   // Automatic: All unhandled errors sent to Sentry

   // Manual: Add context to errors
   try {
     await processPayment(paymentId);
   } catch (error) {
     Sentry.captureException(error, {
       tags: { paymentId },
       user: { id: userId, email: userEmail },
     });
     throw error;
   }
   ```

**Cost:**
- Free: 5,000 errors/month
- Team ($26/month): 50,000 errors/month
- **MVP: Free tier sufficient**

### Performance Monitoring: DataDog (Scale Only)

**Why DataDog over Sentry APM?**
- Better infrastructure metrics (CPU, memory, disk)
- Database query profiling
- Distributed tracing across services
- Custom metrics and dashboards

**Setup (Scale Phase):**

1. **Install DataDog Agent**
   ```yaml
   # ECS task definition
   {
     "name": "datadog-agent",
     "image": "gcr.io/datadoghq/agent:latest",
     "environment": [
       { "name": "DD_API_KEY", "value": "API_KEY" },
       { "name": "DD_SITE", "value": "datadoghq.com" },
       { "name": "ECS_FARGATE", "value": "true" }
     ]
   }
   ```

2. **Install APM SDK**
   ```bash
   npm install dd-trace
   ```

3. **Initialize Tracing**
   ```typescript
   // tracer.ts (import first in server.ts)
   import tracer from 'dd-trace';

   tracer.init({
     logInjection: true,
     analytics: true,
   });

   export default tracer;
   ```

**Cost:**
- APM: $31/host/month ($62/month for 2 ECS tasks)
- Infrastructure: $15/host/month ($30/month for 2 ECS tasks)
- **Total: ~$92/month** (only needed at scale)

### Logging Strategy

**MVP (Railway):**
- Railway dashboard → Logs tab
- Structured JSON logs (already implemented)
- 7-day retention (sufficient for MVP)

**Scale (AWS CloudWatch):**
- ECS logs → CloudWatch Logs
- 30-day retention (configurable)
- CloudWatch Insights for queries

**Log Format (Already Implemented):**
```typescript
logger.info('Payment captured', {
  paymentId: 'pay_123',
  appointmentId: 'appt_456',
  amount: 15000,
  vendorId: 'vendor_789',
  duration: 127,
  requestId: 'req_abc',
});

// Output:
{
  "timestamp": "2026-01-26T10:30:00.000Z",
  "level": "info",
  "message": "Payment captured",
  "context": {
    "paymentId": "pay_123",
    "appointmentId": "appt_456",
    "amount": 15000,
    "vendorId": "vendor_789",
    "duration": 127,
    "requestId": "req_abc"
  }
}
```

### Alerting Strategy

**Critical Alerts (Page on-call engineer):**
- Payment capture failure rate > 5%
- Job stuck in COMPLETED_BY_VENDOR for 72+ hours
- API error rate > 1%
- Database connection failures

**Warning Alerts (Review next business day):**
- Auto-confirmation rate > 40%
- Background worker hasn't run in 2+ hours
- Disk usage > 80%

**Never Alert On:**
- Individual errors (use error tracking instead)
- Transient network failures (retry logic handles it)
- Non-critical warnings

**Setup (Scale Phase):**
```yaml
# PagerDuty integration
resource "pagerduty_service" "api" {
  name                    = "Estate Standard API"
  auto_resolve_timeout    = 14400  # 4 hours
  acknowledgement_timeout = 600    # 10 minutes
  escalation_policy       = pagerduty_escalation_policy.engineering.id

  alert_creation          = "create_alerts_and_incidents"
}

# CloudWatch alarm
resource "aws_cloudwatch_metric_alarm" "payment_failure_rate" {
  alarm_name          = "estate-standard-payment-failure-rate"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "PaymentCaptureFailures"
  namespace           = "EstateStandard"
  period              = "300"  # 5 minutes
  statistic           = "Average"
  threshold           = "0.05"  # 5%

  alarm_actions = [pagerduty_service.api.integration_key]
}
```

**Cost:**
- PagerDuty: $19/user/month (only need 1-2 users for MVP)

---

## Security & Compliance

### PII Protection

**Encrypted at Rest:**
- Database: Railway uses encrypted storage (AES-256)
- S3: Server-side encryption enabled (AES-256)
- Backups: Encrypted with AWS KMS

**Encrypted in Transit:**
- All APIs use HTTPS (TLS 1.3)
- Database connections use SSL
- S3 uploads/downloads use HTTPS

**PII Fields:**
- User passwords: bcrypt hashed (12 rounds)
- User phone numbers: Stored as plaintext (needed for SMS)
- Credit cards: NEVER stored (Stripe handles tokenization)

**GDPR-Style Data Export (Future):**
```typescript
router.get('/api/users/me/data-export', authenticate, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: {
      homeowner: { include: { homes: true, serviceRequests: true } },
      vendor: { include: { services: true, appointments: true } },
    },
  });

  res.json({
    user,
    generatedAt: new Date().toISOString(),
    format: 'JSON',
  });
});
```

### Media Access Control

**Problem:** S3 URLs are public if you know the URL.
**Solution:** Presigned URLs with expiration.

```typescript
// Generate temporary URL (expires in 15 minutes)
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';

async function getSecurePhotoUrl(photoKey: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: 'estate-standard-media-prod',
    Key: photoKey,
  });

  return await getSignedUrl(s3Client, command, { expiresIn: 900 }); // 15 min
}

// Mobile app requests secure URL from API
const { url } = await fetch(`/api/media/photo/${photoId}`).then(r => r.json());
// url is valid for 15 minutes only
```

**Vendor Data Isolation:**
- Vendors can only see their own appointments
- Vendors cannot see other vendors' pricing/availability
- Enforced by row-level filtering in API

```typescript
// Get vendor appointments (filtered by vendor ID)
router.get('/api/appointments', authenticate, requireRole('VENDOR'), async (req, res) => {
  const vendorId = req.user.vendor.id;

  const appointments = await prisma.appointment.findMany({
    where: { vendorId }, // ← Filters to only this vendor's data
  });

  res.json({ appointments });
});
```

### API Authentication

**Rate Limiting (Already Implemented):**
- Global: 100 requests/15 minutes per IP
- Auth endpoints: 5 requests/15 minutes per IP
- Payment endpoints: 10 requests/15 minutes per user

**CORS (Already Configured):**
```typescript
const allowedOrigins = process.env.CORS_ORIGIN?.split(',') || [
  'http://localhost:8081', // Expo dev
  'https://app.estatestandard.com', // Production app
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
```

### Compliance Posture

**SOC 2 Readiness:**
- Audit logs (all critical operations logged)
- Encryption at rest and in transit
- Access control (RBAC)
- Incident response plan (documented below)

**PCI Compliance:**
- Not required (Stripe handles all card data)
- Platform never touches credit card numbers

**HIPAA:**
- Not applicable (no health data)

**Texas Data Privacy:**
- No specific state law yet (unlike California CCPA)
- Best practice: Treat all PII as sensitive

---

## Third-Party Integrations

### Integration Summary Table

| Service | Purpose | Cost (MVP) | Cost (Scale) |
|---------|---------|------------|--------------|
| **Railway** | Hosting | $20/month | N/A (migrate to AWS) |
| **AWS S3** | Media storage | $5/month | $50/month |
| **Stripe** | Payments | 2.9% + $0.30/txn | Same (volume discounts at $1M+) |
| **Twilio** | SMS | $40/month | $200/month |
| **SendGrid** | Email | Free | $19.95/month |
| **Expo** | Mobile app | $99/month | $99/month |
| **Sentry** | Error tracking | Free | $26/month |
| **Cloudflare** | DNS + DDoS | Free | Free (Pro $20/month optional) |
| **DataDog** | APM | N/A | $92/month |
| **OpenAI** | AI triage | $20/month | $200/month |

**Total MVP Cost:** ~$300/month (excluding transaction fees)
**Total Scale Cost:** ~$1,500/month base + usage (for 1,000 homes)

### OpenAI Integration (AI Triage)

**Already Implemented:** Service request triage uses GPT-4 Vision.

**Setup:**
```bash
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Usage:**
```typescript
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function triageServiceRequest(description: string, photos: string[]) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4-vision-preview',
    messages: [
      {
        role: 'system',
        content: 'You are an expert home maintenance advisor...',
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: description },
          ...photos.map(url => ({ type: 'image_url', image_url: { url } })),
        ],
      },
    ],
  });

  return JSON.parse(response.choices[0].message.content);
}
```

**Cost:**
- GPT-4 Vision: $0.01/image + $0.03/1K tokens
- 1,000 service requests/month × 3 images × $0.01 = $30/month
- Text processing: ~$10/month
- **Total: ~$40/month**

**Rate Limiting:**
OpenAI has tier-based limits. Monitor usage.

### Analytics Integration (Future)

**Recommended: Mixpanel or Amplitude**

**Why not Google Analytics?**
- GA4 is confusing and bloated
- Mixpanel/Amplitude designed for product analytics

**Setup (Future):**
```typescript
// Mobile app
import { Analytics } from '@segment/analytics-react-native';

const analytics = new Analytics({
  writeKey: 'SEGMENT_WRITE_KEY',
});

analytics.track('Appointment Booked', {
  vendorId: 'vendor_123',
  category: 'HVAC',
  amount: 15000,
});
```

**Cost:**
- Mixpanel: Free up to 1,000 monthly tracked users
- Amplitude: Free up to 10 million events/month

---

## Environment Setup Guide

### Local Development

**Prerequisites:**
- Node.js 18+
- PostgreSQL 15+
- Docker (optional but recommended)

**1. Clone Repository**
```bash
git clone https://github.com/yourorg/estate-standard.git
cd estate-standard
```

**2. Install Dependencies**
```bash
cd backend && npm install
cd ../mobile && npm install
```

**3. Setup Environment Variables**
```bash
# backend/.env.local
NODE_ENV=development
DATABASE_URL=postgresql://localhost:5432/estate_standard_dev
JWT_SECRET=dev_secret_replace_in_production
JWT_REFRESH_SECRET=dev_refresh_secret_replace_in_production
CORS_ORIGIN=http://localhost:8081

# Optional for local testing
STRIPE_SECRET_KEY=sk_test_xxxxx
TWILIO_ACCOUNT_SID=ACxxxxx
TWILIO_AUTH_TOKEN=xxxxx
SENDGRID_API_KEY=SG.xxxxx
OPENAI_API_KEY=sk-xxxxx
```

**4. Start Local Database (Docker)**
```bash
docker run --name estate-postgres \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=estate_standard_dev \
  -p 5432:5432 \
  -d postgres:15
```

**5. Run Migrations**
```bash
cd backend
npx prisma migrate dev
npx prisma db seed  # Seed maintenance categories
```

**6. Start Backend**
```bash
npm run dev  # Watches for changes, auto-restarts
```

**7. Start Mobile App**
```bash
cd mobile
npx expo start

# Press 'i' for iOS simulator
# Press 'a' for Android emulator
# Scan QR code for physical device
```

**Local URLs:**
- Backend API: http://localhost:3000
- Health check: http://localhost:3000/health
- Mobile app: http://localhost:8081 (Metro bundler)

### Staging Environment (Railway)

**Purpose:** TestFlight beta testing before production.

**1. Create Staging Project**
- Railway dashboard → New Project → "estate-standard-staging"
- Connect GitHub branch: `staging`

**2. Add PostgreSQL Plugin**
- Railway project → Add PostgreSQL
- Auto-generates `DATABASE_URL`

**3. Set Environment Variables**
```bash
NODE_ENV=staging
JWT_SECRET=<generate-strong-secret>
JWT_REFRESH_SECRET=<generate-strong-secret>
STRIPE_SECRET_KEY=sk_test_xxxxx  # Use test mode
CORS_ORIGIN=https://staging.estatestandard.com,exp://192.168.1.100:8081
```

**4. Deploy**
```bash
git push origin staging  # Railway auto-deploys
```

**5. Run Migrations**
```bash
railway run npx prisma migrate deploy
```

**6. Mobile App (TestFlight)**
```bash
# Update API URL in mobile app
# mobile/app.config.js
export default {
  extra: {
    apiUrl: 'https://estate-standard-staging.up.railway.app',
  },
};

# Build and submit to TestFlight
eas build --platform ios --profile staging
eas submit --platform ios
```

**Staging URL:** https://estate-standard-staging.up.railway.app

### Production Environment

**Phase 1: Railway (MVP)**

Same as staging, but:
- Branch: `main`
- Stripe: Live mode (`sk_live_xxxxx`)
- Custom domain: `api.estatestandard.com`
- Longer database backups (30 days)

**Phase 2: AWS (Scale)**

**1. Provision Infrastructure (Terraform)**
```bash
cd infrastructure/terraform
terraform init
terraform plan
terraform apply
```

**2. Build and Push Docker Image**
```bash
docker build -t estate-standard-api .
aws ecr get-login-password | docker login --username AWS --password-stdin <account>.dkr.ecr.us-east-1.amazonaws.com
docker push <account>.dkr.ecr.us-east-1.amazonaws.com/estate-standard-api:latest
```

**3. Deploy ECS Service**
```bash
aws ecs update-service \
  --cluster estate-standard \
  --service api \
  --force-new-deployment
```

**4. Run Migrations**
```bash
# SSH into ECS task (or use Lambda)
aws ecs execute-command \
  --cluster estate-standard \
  --task <task-id> \
  --command "npx prisma migrate deploy"
```

**Production URL:** https://api.estatestandard.com

---

## Secrets & Configuration Management

### Development (Local)

**Storage:** `.env.local` file (gitignored)

```bash
# backend/.env.local
DATABASE_URL=postgresql://localhost:5432/estate_standard_dev
JWT_SECRET=dev_secret
# ... other secrets
```

**Never commit:**
- `.env.local` in `.gitignore`
- Use `.env.example` as template for teammates

### Staging/Production (Railway)

**Storage:** Railway dashboard → Variables

**Best Practices:**
- One variable per secret (no `.env` file upload)
- Use Railway's built-in secrets encryption
- Variables auto-injected into container

**CI/CD Integration:**
```bash
# GitHub Actions can deploy to Railway
- name: Deploy to Railway
  env:
    RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
  run: railway up
```

### Production (AWS)

**Storage:** AWS Secrets Manager

**Why Secrets Manager over Parameter Store?**
- Automatic rotation (for database passwords)
- Fine-grained access control (IAM)
- Audit logging (who accessed what secret)

**Setup:**

1. **Create Secret**
   ```bash
   aws secretsmanager create-secret \
     --name estate-standard/prod/database-url \
     --secret-string "postgresql://user:pass@host:5432/db"
   ```

2. **Grant ECS Task Access**
   ```yaml
   # IAM policy
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "secretsmanager:GetSecretValue"
         ],
         "Resource": "arn:aws:secretsmanager:us-east-1:*:secret:estate-standard/prod/*"
       }
     ]
   }
   ```

3. **ECS Task Definition**
   ```yaml
   containerDefinitions:
     - name: api
       image: <ecr-image>
       secrets:
         - name: DATABASE_URL
           valueFrom: arn:aws:secretsmanager:us-east-1:...:secret:estate-standard/prod/database-url
         - name: JWT_SECRET
           valueFrom: arn:aws:secretsmanager:us-east-1:...:secret:estate-standard/prod/jwt-secret
   ```

**Cost:**
- $0.40/secret/month ($10/month for 25 secrets)
- $0.05 per 10,000 API calls (~$1/month)

### Secret Rotation

**Database Password Rotation:**
```yaml
resource "aws_secretsmanager_secret_rotation" "db" {
  secret_id           = aws_secretsmanager_secret.db_password.id
  rotation_lambda_arn = aws_lambda_function.rotate_db_password.arn

  rotation_rules {
    automatically_after_days = 30
  }
}
```

**JWT Secret Rotation:**
- Not automated (requires coordinated deploy)
- Rotate every 6 months manually
- Process:
  1. Generate new secret
  2. Accept both old + new for 24 hours
  3. Remove old secret
  4. All tokens auto-expire after 15 minutes (access) or 30 days (refresh)

---

## Failure Modes & Graceful Degradation

Estate Standard must degrade gracefully, never fail catastrophically.

### Scenario 1: Vendor Not Responding

**Problem:** Vendor doesn't accept appointment within 24 hours.

**System Behavior:**
1. Appointment remains in `REQUESTED` status
2. After 24 hours, send reminder notification to vendor
3. After 48 hours, mark appointment as `CANCELLED`, refund homeowner
4. Suggest alternative vendors to homeowner

**Implementation:**
```typescript
// Background worker runs daily
const staleRequests = await prisma.appointment.findMany({
  where: {
    status: 'REQUESTED',
    createdAt: { lte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
  },
});

for (const request of staleRequests) {
  // Cancel and refund
  await prisma.appointment.update({
    where: { id: request.id },
    data: { status: 'CANCELLED', cancelledBy: 'system' },
  });

  await stripe.paymentIntents.cancel(request.payment.stripePaymentIntentId);

  // Notify homeowner
  await NotificationService.send('APPOINTMENT_CANCELLED', {
    userId: request.homeownerId,
    data: { reason: 'Vendor did not respond within 48 hours' },
  });

  // Suggest alternatives
  const otherVendors = await findAlternativeVendors(request);
  // ... send suggestions
}
```

**User Experience:**
- Homeowner sees: "Vendor hasn't confirmed yet. We'll let you know soon."
- After 48 hours: "Vendor wasn't available. Here are 3 other options."
- Money never charged (only authorized, then cancelled)

### Scenario 2: SMS/Email Delivery Failure

**Problem:** Twilio rate limit or SendGrid bounce.

**System Behavior:**
1. Try preferred channel (SMS or email)
2. If fails, try push notification
3. Log failure for manual review
4. Retry 3 times with exponential backoff

**Implementation (Already Done):**
```typescript
async function sendNotificationWithFallback(userId, type, data) {
  const user = await getUser(userId);

  try {
    // Try preferred channel
    if (user.preferredContactMethod === 'sms') {
      await sendSMS(user.phone, message);
    } else if (user.preferredContactMethod === 'email') {
      await sendEmail(user.email, message);
    }
  } catch (error) {
    console.error('Primary notification failed, trying push', error);

    try {
      await sendPushNotification(user.expoPushToken, message);
    } catch (pushError) {
      console.error('Push notification also failed', pushError);

      // Log for manual review
      await prisma.notificationQueue.create({
        data: { userId, type, data, failureReason: pushError.message },
      });
    }
  }
}
```

**User Experience:**
- Transparent: User gets notification via backup channel
- Admin dashboard shows failed notifications for manual outreach

### Scenario 3: Payment Failure

**Problem:** Homeowner's card declined.

**System Behavior:**
1. Payment intent fails immediately (Stripe validates before confirming)
2. Appointment remains in `REQUESTED` (not `SCHEDULED` until payment authorized)
3. Notify homeowner: "Payment failed. Please update your card."
4. Appointment automatically cancelled after 24 hours if not paid

**Implementation:**
```typescript
// Payment controller
try {
  const paymentIntent = await stripe.paymentIntents.create({ ... });
} catch (error) {
  if (error.type === 'card_error') {
    throw new AppError('Payment failed: ' + error.message, 402);
  }
}

// Mobile app shows:
"Your card was declined. Please try a different payment method."
```

**User Experience:**
- Clear error message
- Retry button in app
- No appointment created until payment succeeds

### Scenario 4: Partial Booking Failure

**Problem:** Slot locked, appointment created, but job ledger update fails.

**System Behavior:**
1. Entire booking wrapped in database transaction
2. If any step fails, all rollback (no partial state)
3. Return 500 error to client
4. Client retries with exponential backoff

**Implementation (Already Done):**
```typescript
await prisma.$transaction(async (tx) => {
  // Lock slot
  await tx.availabilitySlot.update({ ... });

  // Create appointment
  await tx.appointment.create({ ... });

  // Update job ledger
  await tx.jobLedger.create({ ... });

  // If ANY step throws, entire transaction rolls back
}, {
  isolationLevel: 'Serializable',
  timeout: 10000,
});
```

**User Experience:**
- User sees: "Booking failed. Please try again."
- No phantom bookings
- Retry succeeds because slot was never locked

### Scenario 5: Database Downtime

**Problem:** Railway PostgreSQL maintenance or AWS RDS failover.

**System Behavior:**
1. API returns 503 Service Unavailable
2. Mobile app shows: "We're experiencing technical difficulties. Please try again in a few minutes."
3. Background workers pause (don't crash)
4. No data loss (transactions rolled back, not partially committed)

**Implementation:**
```typescript
// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok' });
  } catch (error) {
    res.status(503).json({ status: 'degraded', reason: 'Database unavailable' });
  }
});

// Middleware: Retry database connections
app.use(async (req, res, next) => {
  let retries = 3;
  while (retries > 0) {
    try {
      return next();
    } catch (error) {
      if (error.code === 'P2024') { // Prisma connection error
        retries--;
        await sleep(1000);
      } else {
        throw error;
      }
    }
  }
  res.status(503).json({ error: 'Service temporarily unavailable' });
});
```

**User Experience:**
- Brief downtime (usually <5 minutes for Railway, <30 seconds for RDS Multi-AZ)
- Automatic recovery when database comes back
- Sentry alert sent to engineers

### Scenario 6: Third-Party Outage (Stripe, Twilio, etc.)

**Problem:** Stripe API down (rare but happens).

**System Behavior:**
1. Operations requiring Stripe fail gracefully
2. Queue operations for retry after outage
3. Admin dashboard shows "Payment provider unavailable"
4. Non-payment operations continue normally

**Implementation:**
```typescript
// Stripe service with circuit breaker
let stripeAvailable = true;
let lastStripeFailure = Date.now();

async function callStripe(fn: () => Promise<any>) {
  // Circuit breaker: Don't hammer Stripe if it's down
  if (!stripeAvailable && Date.now() - lastStripeFailure < 60000) {
    throw new AppError('Payment provider temporarily unavailable', 503);
  }

  try {
    const result = await fn();
    stripeAvailable = true;
    return result;
  } catch (error) {
    if (error.statusCode >= 500) {
      // Stripe server error
      stripeAvailable = false;
      lastStripeFailure = Date.now();
    }
    throw error;
  }
}

// Usage
await callStripe(() => stripe.paymentIntents.create({ ... }));
```

**User Experience:**
- Payment operations show: "Payment processing is temporarily unavailable. Please try again shortly."
- Other features (browsing vendors, viewing appointments) work normally
- Automatic recovery when Stripe comes back

---

## Backup & Disaster Recovery

### Database Backups

**MVP (Railway):**
- Automatic daily backups (7-day retention)
- Manual snapshot before major changes
- Point-in-time recovery (restore to any time in last 7 days)

**Scale (AWS RDS):**
- Automatic daily backups (30-day retention)
- Point-in-time recovery (any second in last 30 days)
- Cross-region backups (disaster recovery)

**Testing Backups:**
```bash
# Quarterly drill: Restore staging from production backup
railway database:restore --project staging --snapshot prod-2026-01-26

# Verify data integrity
psql $DATABASE_URL -c "SELECT COUNT(*) FROM appointments;"
```

### Media Backups (S3)

**Versioning Enabled:**
- Every file upload creates new version
- Old versions retained for 90 days
- Can restore deleted files

**Cross-Region Replication (Scale Phase):**
```yaml
resource "aws_s3_bucket_replication_configuration" "media" {
  bucket = aws_s3_bucket.media.id

  rule {
    id     = "replicate-all"
    status = "Enabled"

    destination {
      bucket        = "arn:aws:s3:::estate-standard-media-backup"
      storage_class = "GLACIER"
    }
  }
}
```

**Cost:**
- Versioning: ~10% overhead (old versions retained)
- Cross-region replication: $0.02/GB (~$2 for 100 GB)

### Disaster Recovery Plan

**RTO (Recovery Time Objective):** 4 hours
**RPO (Recovery Point Objective):** 1 hour (point-in-time recovery)

**Scenarios:**

**1. Database Corruption**
- Restore from most recent backup
- Replay transaction logs (point-in-time recovery)
- Update DNS if needed

**2. Region Outage (AWS us-east-1 down)**
- Promote read replica in us-west-2
- Update DNS to point to backup region
- Deploy API containers to backup region

**3. Accidental Data Deletion**
- Restore specific tables from backup
- Use S3 versioning to recover files
- Audit logs show who deleted what

**Runbook:**
```bash
# 1. Alert received: "Database unavailable"
# 2. Check AWS Status Dashboard
# 3. If region outage, fail over to backup:

aws rds promote-read-replica \
  --db-instance-identifier estate-standard-db-backup

aws route53 change-resource-record-sets \
  --hosted-zone-id Z123456 \
  --change-batch file://failover-dns.json

# 4. Deploy API to backup region
aws ecs update-service \
  --cluster estate-standard-backup \
  --service api \
  --desired-count 2

# 5. Test health check
curl https://api.estatestandard.com/health

# 6. Notify team in Slack
```

---

## Cost Analysis & Optimization

### MVP Cost Breakdown (0-100 homes)

| Service | Cost/Month | Notes |
|---------|------------|-------|
| **Railway** | $20 | Includes API + database |
| **AWS S3** | $5 | ~20 GB photos |
| **Stripe** | $0 | Pay-per-transaction (2.9% + $0.30) |
| **Twilio** | $40 | ~5,000 SMS/month |
| **SendGrid** | $0 | Free tier (3,000 emails/month) |
| **Expo EAS** | $99 | Production builds |
| **Cloudflare** | $0 | Free tier (DDoS + DNS) |
| **Sentry** | $0 | Free tier (5,000 errors/month) |
| **OpenAI** | $20 | ~500 service requests/month |
| **Domain** | $12/year | estatestandard.com |

**Total Fixed Costs:** ~$185/month
**Variable Costs:** ~$115/month (SMS, AI, Stripe fees)
**Total MVP:** ~$300/month

### Growth Cost Breakdown (100-1,000 homes)

| Service | Cost/Month | Notes |
|---------|------------|-------|
| **Railway** | $50 | Higher resource usage |
| **AWS S3** | $25 | ~100 GB photos |
| **Stripe** | $0 | Pay-per-transaction |
| **Twilio** | $200 | ~25,000 SMS/month |
| **SendGrid** | $19.95 | Essentials plan (50K emails) |
| **Expo EAS** | $99 | Same |
| **Cloudflare** | $0 | Still free |
| **Sentry** | $26 | Team plan (50K errors) |
| **OpenAI** | $100 | ~2,500 service requests/month |

**Total Fixed Costs:** ~$520/month
**Variable Costs:** ~$1,000/month (SMS, AI, Stripe fees at volume)
**Total Growth:** ~$1,500/month

### Scale Cost Breakdown (1,000-10,000 homes)

| Service | Cost/Month | Notes |
|---------|------------|-------|
| **AWS ECS Fargate** | $300 | 5-10 containers |
| **AWS RDS PostgreSQL** | $400 | Multi-AZ, read replicas |
| **AWS S3 + CloudFront** | $200 | ~1 TB photos, CDN delivery |
| **ElastiCache Redis** | $50 | Cache layer |
| **Stripe** | $0 | Pay-per-transaction |
| **Twilio** | $1,000 | ~125,000 SMS/month |
| **SendGrid** | $89.95 | Pro plan (1.5M emails) |
| **Expo EAS** | $99 | Same |
| **Cloudflare** | $20 | Pro plan (better DDoS) |
| **DataDog** | $200 | APM + infrastructure |
| **Sentry** | $99 | Business plan (500K errors) |
| **PagerDuty** | $40 | 2 users on-call |
| **OpenAI** | $500 | ~12,500 service requests/month |

**Total Fixed Costs:** ~$3,000/month
**Variable Costs:** ~$5,000/month (SMS, AI, Stripe fees at scale)
**Total Scale:** ~$8,000/month

**Revenue Required to Break Even:**
- 1,000 homes × $50/month subscription = $50,000/month revenue
- Infrastructure: $8,000 (16% of revenue)
- This is healthy SaaS margin

### Cost Optimization Tips

**1. Use Spot Instances (AWS)**
```yaml
# ECS task can use Fargate Spot (70% cheaper)
capacity_provider_strategy {
  capacity_provider = "FARGATE_SPOT"
  weight            = 100
}
```

**2. S3 Lifecycle Policies**
```yaml
# Move old photos to cheaper storage
lifecycle_rule {
  enabled = true

  transition {
    days          = 90
    storage_class = "GLACIER"  # $0.004/GB vs $0.023/GB
  }
}
```

**3. Reserved Instances (RDS)**
```yaml
# 1-year commitment = 30% discount
# 3-year commitment = 60% discount
# Only lock in after stable growth
```

**4. Batch Notifications**
```typescript
// Send daily digest instead of instant notifications (reduce SMS cost)
const dailyDigest = groupNotificationsByUser(notifications);
await sendEmail(user.email, dailyDigest); // Email is free
```

**5. Compress Images**
```typescript
// Resize uploaded photos (reduce S3 storage + transfer costs)
import sharp from 'sharp';

await sharp(photoBuffer)
  .resize(1920, 1080, { fit: 'inside' })
  .jpeg({ quality: 85 })
  .toFile(outputPath);
```

---

## Day-1 MVP vs Scale-Ready Plan

### MVP (0-100 homes, Months 0-6)

**Goal:** Prove product-market fit with minimal infrastructure.

**Stack:**
- Hosting: Railway (Node.js + PostgreSQL)
- Storage: AWS S3
- Payments: Stripe Connect
- Notifications: Twilio (SMS) + SendGrid (email) + Expo (push)
- Monitoring: Sentry (errors) + Railway logs
- Background jobs: Node-cron (in-process)

**Setup Time:** 1 day (using existing codebase)
**Monthly Cost:** ~$300
**Team Required:** 1 full-stack engineer

**What's Missing:**
- No caching (Redis)
- No auto-scaling (single container)
- No async workers (same process)
- No advanced monitoring (DataDog)

**When to Migrate:**
- 100+ active homes
- Railway performance issues
- Need better reliability (99.9% SLA)

### Growth (100-1,000 homes, Months 6-18)

**Goal:** Scale infrastructure while maintaining velocity.

**Stack:**
- Hosting: Railway → AWS ECS Fargate (containerized, auto-scaling)
- Database: Railway PostgreSQL → AWS RDS (Multi-AZ)
- Cache: Add ElastiCache Redis (sessions, vendor availability)
- Background jobs: Node-cron → SQS + Lambda
- Monitoring: Add DataDog (APM), PagerDuty (on-call)

**Migration Time:** 2-3 weeks (with DevOps help)
**Monthly Cost:** ~$1,500
**Team Required:** 1-2 backend engineers + 0.5 DevOps

**What's Added:**
- High availability (Multi-AZ database)
- Auto-scaling (handle traffic spikes)
- Async workers (parallel job processing)
- Advanced monitoring (APM, distributed tracing)

**When to Migrate:**
- Raising Series A
- Expanding to multiple cities
- Need 99.95% uptime

### Scale (1,000-10,000 homes, Months 18-36)

**Goal:** Enterprise-grade infrastructure for national expansion.

**Stack:**
- Hosting: AWS ECS Fargate (multi-region)
- Database: AWS RDS (Multi-AZ, read replicas per region)
- Cache: ElastiCache Redis (cluster mode)
- Background jobs: SQS + Lambda (per region)
- CDN: CloudFront (global edge locations)
- Monitoring: Full observability (DataDog, PagerDuty, custom dashboards)

**Migration Time:** 1-2 months (gradual rollout)
**Monthly Cost:** ~$8,000
**Team Required:** 2-3 backend engineers + 1 DevOps + 1 SRE

**What's Added:**
- Multi-region (DFW, Austin, Houston separate deployments)
- Disaster recovery (cross-region failover)
- Performance (CDN, read replicas)
- Compliance (SOC 2 audit-ready)

**When to Migrate:**
- 5,000+ active homes
- Raising Series B
- Enterprise customers requiring SOC 2

---

## Security Checklist

Before launching to production, verify:

### Application Security

- [ ] All secrets stored in environment variables (not hardcoded)
- [ ] JWT secrets are strong (32+ random characters)
- [ ] Passwords hashed with bcrypt (12 rounds minimum)
- [ ] Rate limiting enabled on all endpoints
- [ ] CORS configured (only allow known origins)
- [ ] SQL injection protected (Prisma parameterized queries)
- [ ] XSS protected (React Native auto-escapes, API returns JSON only)
- [ ] CSRF not needed (mobile app, no cookies for auth)
- [ ] Helmet.js configured (security headers)
- [ ] Input validation on all endpoints (already implemented)

### Infrastructure Security

- [ ] HTTPS enforced (Railway/AWS handles automatically)
- [ ] Database uses SSL connections
- [ ] S3 bucket is private (no public access)
- [ ] Presigned URLs used for media access
- [ ] Environment variables encrypted at rest
- [ ] Logs don't contain PII (passwords, credit cards)
- [ ] Webhook signatures verified (Stripe)
- [ ] Idempotency keys used for financial operations
- [ ] API keys rotated quarterly
- [ ] 2FA enabled for admin accounts (future)

### Compliance

- [ ] Audit logs for all critical operations
- [ ] Data encryption at rest (database, S3)
- [ ] Data encryption in transit (HTTPS, SSL)
- [ ] User data export endpoint (GDPR-ready)
- [ ] User data deletion endpoint (GDPR-ready)
- [ ] Privacy policy published
- [ ] Terms of service published
- [ ] Stripe Connect terms accepted by vendors
- [ ] SMS opt-out implemented (Twilio)
- [ ] Email unsubscribe implemented (SendGrid)

### Monitoring

- [ ] Error tracking configured (Sentry)
- [ ] Health check endpoint working
- [ ] Structured logging implemented
- [ ] Critical alerts configured (payment failures, database down)
- [ ] On-call rotation established (PagerDuty)
- [ ] Incident response playbook documented
- [ ] Backup restore tested quarterly
- [ ] Disaster recovery plan documented

---

## Deployment Runbook

### Pre-Deployment Checklist

Before deploying to production:

1. [ ] All tests passing (`npm test`)
2. [ ] Linter clean (`npm run lint`)
3. [ ] Database migrations reviewed (`npx prisma migrate diff`)
4. [ ] Breaking changes documented
5. [ ] Rollback plan prepared
6. [ ] Team notified in Slack (#deployments)
7. [ ] Health check endpoint verified

### Deployment Process (Railway MVP)

```bash
# 1. Merge to main branch
git checkout main
git pull origin main
git merge feature-branch
git push origin main

# 2. Railway auto-deploys (watch dashboard)
# Deploy takes ~2 minutes

# 3. Run migrations (if needed)
railway run npx prisma migrate deploy

# 4. Verify health check
curl https://api.estatestandard.com/health

# 5. Test critical paths
curl https://api.estatestandard.com/api/auth/login \
  -d '{"email":"test@example.com","password":"password"}'

# 6. Monitor error rate in Sentry
# 7. Announce in Slack: "Deploy complete ✅"
```

### Rollback Process

If deploy introduces critical bug:

```bash
# 1. Railway dashboard → Deployments → Click previous deploy → "Rollback"
# Takes ~1 minute

# 2. Verify health check
curl https://api.estatestandard.com/health

# 3. If database migration was run, rollback:
railway run npx prisma migrate reset --skip-seed
railway run npx prisma migrate deploy

# 4. Announce in Slack: "Rollback complete ✅"
```

### Deployment Schedule

**Recommended:**
- Deploy Monday-Thursday (never Friday)
- Deploy 10 AM - 2 PM CST (low traffic window)
- No deploys before holidays
- Critical hotfixes anytime (with approval)

### Zero-Downtime Deployments (AWS)

When on ECS Fargate:

```yaml
# Blue-green deployment strategy
deployment_configuration {
  maximum_percent         = 200  # Deploy new version alongside old
  minimum_healthy_percent = 100  # Keep old version until new is healthy
}

# Process:
# 1. Deploy new containers (v2)
# 2. Health checks pass
# 3. Route traffic to new containers
# 4. Drain connections from old containers
# 5. Terminate old containers
# Total time: ~5 minutes, zero downtime
```

---

## Summary

Estate Standard's infrastructure is designed for **progressive enhancement**:

1. **MVP (Railway)**: Simple, fast, cheap. Perfect for proving product-market fit.
2. **Growth (AWS ECS)**: Enterprise-grade reliability when revenue supports complexity.
3. **Scale (Multi-Region)**: National expansion with disaster recovery.

### Key Principles

1. **Start Simple**: Railway gets you to market in days, not weeks.
2. **Migrate Deliberately**: Don't over-engineer. AWS when you need it, not before.
3. **Fail Gracefully**: System degrades calmly, never catastrophically.
4. **Audit Everything**: Every critical operation leaves a trail.
5. **Respect Privacy**: PII encrypted, access controlled, GDPR-ready.

### Cost Summary

- **MVP:** ~$300/month (0-100 homes)
- **Growth:** ~$1,500/month (100-1,000 homes)
- **Scale:** ~$8,000/month (1,000-10,000 homes)

At 1,000 homes × $50/month = $50K revenue, infrastructure is 16% of revenue (healthy).

### Next Steps

1. **Week 1**: Deploy to Railway, connect Stripe, launch TestFlight beta
2. **Week 2-4**: Onboard first 10 homeowners (friends & family)
3. **Month 2-3**: Onboard first vendors, test full job lifecycle
4. **Month 4-6**: Scale to 100 homes (still on Railway)
5. **Month 7-9**: Migrate to AWS (if hitting Railway limits)
6. **Month 10-12**: Expand to Austin (multi-region setup)

Estate Standard's infrastructure is **production-ready**.
