// Estate Standard - API Server
// White-glove homeowner concierge platform

import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import timeout from 'connect-timeout';
import { PrismaClient } from '@prisma/client';

// Load environment variables first
dotenv.config();

// Security utilities
import { validateEnvironment } from './utils/security';
import { logger, httpLogger } from './utils/logger';
import { setupPIIEncryption } from './middleware/piiEncryption';

// Middleware
import { enhancedErrorHandler } from './middleware/errorHandler.enhanced';
import { notFoundHandler } from './middleware/notFoundHandler';
import {
  apiLimiter,
  authLimiter,
  passwordResetLimiter,
  emailVerifyLimiter,
  uploadLimiter,
  expensiveOpLimiter,
  messagingLimiter,
  paymentLimiter,
  twoFactorLimiter
} from './middleware/rateLimiter.enhanced';
import { auditLogger } from './middleware/auditLogger';

// Routes
import authRoutes from './routes/auth.routes';
import maintenanceRoutes from './routes/maintenance.routes';
import serviceRequestRoutes from './routes/serviceRequest.routes';
import vendorRoutes from './routes/vendor.routes';
import appointmentRoutes from './routes/appointment.routes';
import recurringRoutes from './routes/recurring.routes';
import paymentRoutes from './routes/payment.routes';
import messageRoutes from './routes/message.routes';

// Background Workers
import { startAutoConfirmationWorker } from './workers/autoConfirmation.worker';
import { startReminderWorker } from './workers/reminder.worker';
import { startRecurringAppointmentWorker } from './workers/recurringAppointment.worker';
import { startCleanupWorker } from './workers/cleanup.worker';

// Services
import NotificationService from './services/notification.service';

// Validate environment variables on startup
try {
  validateEnvironment();
  logger.info('✅ Environment validation passed');
} catch (error: any) {
  logger.error('❌ Environment validation failed:', error);
  console.error('❌ Environment validation failed:', error.message);
  process.exit(1);
}

// Initialize Prisma client
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

// Setup PII encryption middleware for Prisma
setupPIIEncryption(prisma);

// Create Express app
const app: Application = express();

// Trust proxy (required for rate limiting and IP detection behind reverse proxy)
app.set('trust proxy', 1);

// ============================================================================
// MIDDLEWARE
// ============================================================================

// Request timeout (30 seconds)
app.use(timeout('30s'));

// Enhanced security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    frameguard: { action: 'deny' },
    noSniff: true,
    xssFilter: true,
  })
);

// CORS with enhanced security
const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    const allowedOrigins = process.env.CORS_ORIGIN?.split(',') || ['http://localhost:8081'];

    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn(`CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  maxAge: 86400, // 24 hours
};
app.use(cors(corsOptions));

// Body parsing with size limits
app.use(express.json({ limit: '1mb' })); // Reduced from 10mb for security
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Cookie parser (required for CSRF protection)
app.use(cookieParser());

// HTTP request logging (Winston)
app.use(httpLogger);

// Audit logging for sensitive operations
app.use(auditLogger);

// Global rate limiting (100 req/15min)
app.use('/api/', apiLimiter);

// ============================================================================
// ROUTES
// ============================================================================

// Health check (no rate limiting)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Estate Standard API',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    version: '1.0.0',
  });
});

// API Routes with specific rate limiters
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/forgot-password', passwordResetLimiter);
app.use('/api/auth/reset-password', passwordResetLimiter);
app.use('/api/auth/verify-email', emailVerifyLimiter);
app.use('/api/auth/resend-verification', emailVerifyLimiter);
app.use('/api/auth/2fa', twoFactorLimiter);
app.use('/api/auth', authRoutes);

app.use('/api/maintenance', maintenanceRoutes);

app.use('/api/service-requests', serviceRequestRoutes);

app.use('/api/vendors', vendorRoutes);

app.use('/api/appointments', appointmentRoutes);

app.use('/api/recurring', recurringRoutes);

app.use('/api/payments', paymentLimiter);
app.use('/api/payments', paymentRoutes);

app.use('/api/messages', messagingLimiter);
app.use('/api/messages', messageRoutes);

// Upload routes (if we add them later)
// app.use('/api/upload', uploadLimiter);
// app.use('/api/upload', uploadRoutes);

// ============================================================================
// ERROR HANDLING
// ============================================================================

// 404 handler
app.use(notFoundHandler);

// Enhanced global error handler
app.use(enhancedErrorHandler);

// ============================================================================
// SERVER STARTUP
// ============================================================================

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    // Test database connection
    await prisma.$connect();
    logger.info('✅ Database connected');
    console.log('✅ Database connected');

    // Initialize notification service
    NotificationService.initialize(
      // SMS config (Twilio) - configure in production
      process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
        ? {
            accountSid: process.env.TWILIO_ACCOUNT_SID,
            authToken: process.env.TWILIO_AUTH_TOKEN,
            fromNumber: process.env.TWILIO_FROM_NUMBER || '',
          }
        : undefined,
      // Email config (SendGrid/Resend) - configure in production
      process.env.EMAIL_API_KEY
        ? {
            apiKey: process.env.EMAIL_API_KEY,
            fromEmail: process.env.EMAIL_FROM_ADDRESS || 'noreply@estatestandard.com',
            fromName: process.env.EMAIL_FROM_NAME || 'Estate Standard',
          }
        : undefined
    );

    // Start background workers
    startAutoConfirmationWorker();
    startReminderWorker();
    startRecurringAppointmentWorker();
    startCleanupWorker();
    logger.info('✅ Background workers started');
    console.log('✅ Background workers started');

    // Start server
    app.listen(PORT, () => {
      const startupMessage = `
═══════════════════════════════════════════════════
  Estate Standard API
  The Standard of Home Maintenance
═══════════════════════════════════════════════════
  Environment: ${process.env.NODE_ENV}
  Server:      http://localhost:${PORT}
  Health:      http://localhost:${PORT}/health
  Version:     1.0.0
═══════════════════════════════════════════════════
Security Features Enabled:
  ✓ Enhanced rate limiting
  ✓ Audit logging
  ✓ PII encryption
  ✓ Input validation
  ✓ Security headers
  ✓ CORS protection
  ✓ Request timeout
  ✓ Idempotency protection
═══════════════════════════════════════════════════
Background Workers Running:
  ✓ Auto-confirmation (hourly)
  ✓ Appointment reminders (hourly)
  ✓ Recurring appointments (daily at 2 AM)
  ✓ Cleanup expired data (daily at 3 AM)
═══════════════════════════════════════════════════
`;
      console.log(startupMessage);
      logger.info('Server started successfully', {
        port: PORT,
        environment: process.env.NODE_ENV,
        version: '1.0.0',
      });
    });
  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('🛑 Received SIGINT, shutting down gracefully...');
  console.log('\n🛑 Shutting down gracefully...');
  await prisma.$disconnect();
  logger.info('Database disconnected');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('🛑 Received SIGTERM, shutting down gracefully...');
  console.log('\n🛑 Shutting down gracefully...');
  await prisma.$disconnect();
  logger.info('Database disconnected');
  process.exit(0);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit in production - let PM2/supervisor handle restart
  if (process.env.NODE_ENV === 'development') {
    process.exit(1);
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception:', error);
  // Exit immediately for uncaught exceptions
  process.exit(1);
});

startServer();

export default app;
