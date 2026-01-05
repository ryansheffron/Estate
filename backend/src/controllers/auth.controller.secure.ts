// Estate Standard - Secure Authentication Controller
// Complete implementation with email verification, 2FA, password reset, etc.

import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../server';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import speakeasy from 'speakeasy';
import qrcode from 'qrcode';

import {
  hashPassword,
  comparePassword,
  isPasswordInHistory,
  generateSecureToken,
  hashToken,
  verifyToken,
  normalizeEmail,
  validateEmail
} from '../utils/security';

import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  changePasswordSchema,
  verify2FASchema
} from '../utils/validation';

import {
  AppError,
  ValidationError,
  AuthenticationError,
  ConflictError,
  asyncHandler
} from '../middleware/errorHandler.enhanced';

import { logAuthAttempt, logPasswordChange, log2FAChange } from '../middleware/auditLogger';
import { sendEmail } from '../services/email.service';
import { getClientIp } from '../utils/security';

// ============================================================================
// REGISTRATION
// ============================================================================

export const register = asyncHandler(async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  // Validate input
  const { error, value } = registerSchema.validate(req.body);
  if (error) {
    throw new ValidationError(error.details[0].message);
  }

  const { email, password, firstName, lastName, role, phone, ...roleSpecific } = value;

  // Normalize email
  const normalizedEmail = normalizeEmail(email);

  // Check if user exists
  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail }
  });

  if (existingUser) {
    throw new ConflictError('Email already registered');
  }

  // Hash password (with validation)
  const passwordHash = await hashPassword(password);

  // Generate email verification token
  const verifyToken = generateSecureToken();
  const hashedVerifyToken = await hashToken(verifyToken);

  // Create user
  const user = await prisma.user.create({
    data: {
      email: normalizedEmail,
      passwordHash,
      firstName,
      lastName,
      role: role as any,
      phone,
      emailVerified: false,
      emailVerifyToken: hashedVerifyToken,
      emailVerifyExpires: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      passwordHistory: [passwordHash], // Store first password
      status: 'ACTIVE'
    }
  });

  // Create role-specific profile
  if (role === 'HOMEOWNER') {
    await prisma.homeowner.create({
      data: {
        userId: user.id,
        preferredContactMethod: 'in_app'
      }
    });
  } else if (role === 'VENDOR') {
    await prisma.vendor.create({
      data: {
        userId: user.id,
        businessName: roleSpecific.businessName || `${firstName} ${lastName}`,
        businessPhone: phone || '',
        businessEmail: normalizedEmail,
        status: 'PENDING_VERIFICATION',
        serviceZipCodes: roleSpecific.serviceZipCodes || [],
        serviceCities: roleSpecific.serviceCities || []
      }
    });
  }

  // Send verification email
  await sendVerificationEmail(user.email, verifyToken);

  // Generate tokens (but require email verification to use them)
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  // Store refresh token
  await prisma.refreshToken.create({
    data: {
      token: refreshToken,
      userId: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    }
  });

  // Log registration
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: 'user.registered',
      entity: 'User',
      entityId: user.id,
      ipAddress: getClientIp(req),
      userAgent: req.get('user-agent'),
      metadata: { email: user.email, role: user.role }
    }
  });

  res.status(201).json({
    status: 'success',
    message: 'Registration successful. Please check your email to verify your account.',
    data: {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        emailVerified: user.emailVerified
      },
      accessToken,
      refreshToken
    }
  });
});

// ============================================================================
// EMAIL VERIFICATION
// ============================================================================

export const verifyEmail = asyncHandler(async (
  req: AuthRequest,
  res: Response
) => {
  const { error, value } = verifyEmailSchema.validate(req.body);
  if (error) {
    throw new ValidationError(error.details[0].message);
  }

  const { token, email } = value;
  const normalizedEmail = normalizeEmail(email);

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail }
  });

  if (!user) {
    throw new AppError('Invalid verification link', 400);
  }

  if (user.emailVerified) {
    return res.json({
      status: 'success',
      message: 'Email already verified'
    });
  }

  if (!user.emailVerifyToken || !user.emailVerifyExpires) {
    throw new AppError('No verification token found', 400);
  }

  if (user.emailVerifyExpires < new Date()) {
    throw new AppError('Verification link expired. Please request a new one.', 400);
  }

  // Verify token
  const isValid = await verifyToken(token, user.emailVerifyToken);
  if (!isValid) {
    throw new AppError('Invalid verification link', 400);
  }

  // Update user
  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerified: true,
      emailVerifyToken: null,
      emailVerifyExpires: null
    }
  });

  // Log verification
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: 'user.email_verified',
      entity: 'User',
      entityId: user.id,
      ipAddress: getClientIp(req),
      userAgent: req.get('user-agent')
    }
  });

  res.json({
    status: 'success',
    message: 'Email verified successfully. You can now access all features.'
  });
});

export const resendVerificationEmail = asyncHandler(async (
  req: AuthRequest,
  res: Response
) => {
  const { email } = req.body;
  const normalizedEmail = normalizeEmail(email);

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail }
  });

  // Always return success (prevent email enumeration)
  res.json({
    status: 'success',
    message: 'If that email exists and is unverified, we sent a verification link.'
  });

  if (!user || user.emailVerified) {
    return;
  }

  // Generate new token
  const verifyToken = generateSecureToken();
  const hashedVerifyToken = await hashToken(verifyToken);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerifyToken: hashedVerifyToken,
      emailVerifyExpires: new Date(Date.now() + 24 * 60 * 60 * 1000)
    }
  });

  await sendVerificationEmail(user.email, verifyToken);
});

// ============================================================================
// LOGIN
// ============================================================================

export const login = asyncHandler(async (
  req: AuthRequest,
  res: Response
) => {
  const { error, value } = loginSchema.validate(req.body);
  if (error) {
    throw new ValidationError(error.details[0].message);
  }

  const { email, password, twoFactorCode } = value;
  const normalizedEmail = normalizeEmail(email);

  // Find user
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail }
  });

  if (!user) {
    await logAuthAttempt(normalizedEmail, false, 'user_not_found', req);
    throw new AuthenticationError('Invalid credentials');
  }

  // Check account lockout
  if (user.accountLockedUntil && user.accountLockedUntil > new Date()) {
    await logAuthAttempt(normalizedEmail, false, 'account_locked', req);
    const minutesLeft = Math.ceil((user.accountLockedUntil.getTime() - Date.now()) / 60000);
    throw new AppError(
      `Account locked. Try again in ${minutesLeft} minutes.`,
      403
    );
  }

  // Check password
  const isPasswordValid = await comparePassword(password, user.passwordHash);

  if (!isPasswordValid) {
    // Increment failed attempts
    const failedAttempts = user.failedLoginAttempts + 1;
    const updates: any = {
      failedLoginAttempts: failedAttempts
    };

    // Lock account after 5 failed attempts
    if (failedAttempts >= 5) {
      updates.accountLockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
      updates.failedLoginAttempts = 0; // Reset counter
    }

    await prisma.user.update({
      where: { id: user.id },
      data: updates
    });

    await logAuthAttempt(normalizedEmail, false, 'invalid_password', req);
    throw new AuthenticationError('Invalid credentials');
  }

  // Check if user is active
  if (user.status !== 'ACTIVE') {
    await logAuthAttempt(normalizedEmail, false, 'account_inactive', req);
    throw new AppError('Account is not active', 403);
  }

  // Check 2FA if enabled
  if (user.twoFactorEnabled) {
    if (!twoFactorCode) {
      return res.status(200).json({
        status: 'success',
        requiresTwoFactor: true,
        message: 'Please enter your 2FA code'
      });
    }

    const isValid = speakeasy.totp.verify({
      secret: user.twoFactorSecret!,
      encoding: 'base32',
      token: twoFactorCode,
      window: 2 // Allow 2 time steps before/after
    });

    if (!isValid) {
      await logAuthAttempt(normalizedEmail, false, 'invalid_2fa', req);
      throw new AuthenticationError('Invalid 2FA code');
    }
  }

  // Check email verification (optional - can be enforced)
  if (!user.emailVerified && process.env.REQUIRE_EMAIL_VERIFICATION === 'true') {
    throw new AppError('Please verify your email before logging in', 403);
  }

  // Reset failed attempts and update last login
  await prisma.user.update({
    where: { id: user.id },
    data: {
      failedLoginAttempts: 0,
      accountLockedUntil: null,
      lastLoginAt: new Date()
    }
  });

  // Generate tokens
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  // Store refresh token
  await prisma.refreshToken.create({
    data: {
      token: refreshToken,
      userId: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    }
  });

  // Log successful login
  await logAuthAttempt(normalizedEmail, true, 'success', req);

  res.json({
    status: 'success',
    data: {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        emailVerified: user.emailVerified,
        twoFactorEnabled: user.twoFactorEnabled
      },
      accessToken,
      refreshToken
    }
  });
});

// ============================================================================
// REFRESH TOKEN (WITH ROTATION)
// ============================================================================

export const refreshAccessToken = asyncHandler(async (
  req: AuthRequest,
  res: Response
) => {
  const { error, value } = refreshTokenSchema.validate(req.body);
  if (error) {
    throw new ValidationError(error.details[0].message);
  }

  const { refreshToken: oldToken } = value;

  // Find token
  const storedToken = await prisma.refreshToken.findUnique({
    where: { token: oldToken },
    include: { user: true }
  });

  if (!storedToken || storedToken.expiresAt < new Date()) {
    throw new AuthenticationError('Invalid or expired refresh token');
  }

  // Generate new tokens
  const accessToken = generateAccessToken(storedToken.user);
  const newRefreshToken = generateRefreshToken(storedToken.user);

  // Rotate refresh token (delete old, create new)
  await prisma.$transaction([
    prisma.refreshToken.delete({ where: { token: oldToken } }),
    prisma.refreshToken.create({
      data: {
        token: newRefreshToken,
        userId: storedToken.user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    })
  ]);

  res.json({
    status: 'success',
    data: {
      accessToken,
      refreshToken: newRefreshToken
    }
  });
});

// ============================================================================
// LOGOUT
// ============================================================================

export const logout = asyncHandler(async (
  req: AuthRequest,
  res: Response
) => {
  const { refreshToken } = req.body;

  if (refreshToken) {
    await prisma.refreshToken.deleteMany({
      where: { token: refreshToken }
    });
  }

  res.json({
    status: 'success',
    message: 'Logged out successfully'
  });
});

// ============================================================================
// PASSWORD RESET
// ============================================================================

export const forgotPassword = asyncHandler(async (
  req: AuthRequest,
  res: Response
) => {
  const { error, value } = forgotPasswordSchema.validate(req.body);
  if (error) {
    throw new ValidationError(error.details[0].message);
  }

  const { email } = value;
  const normalizedEmail = normalizeEmail(email);

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail }
  });

  // Always return success (prevent email enumeration)
  res.json({
    status: 'success',
    message: 'If that email exists, we sent a password reset link.'
  });

  if (!user) {
    return;
  }

  // Check reset attempts (prevent abuse)
  if (user.passwordResetAttempts >= 5) {
    // Silently block (user sees success message)
    return;
  }

  // Generate reset token
  const resetToken = generateSecureToken();
  const hashedResetToken = await hashToken(resetToken);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordResetToken: hashedResetToken,
      passwordResetExpires: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
      passwordResetAttempts: user.passwordResetAttempts + 1
    }
  });

  await sendPasswordResetEmail(user.email, resetToken);

  // Log reset request
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: 'user.password_reset_requested',
      entity: 'User',
      entityId: user.id,
      ipAddress: getClientIp(req),
      userAgent: req.get('user-agent')
    }
  });
});

export const resetPassword = asyncHandler(async (
  req: AuthRequest,
  res: Response
) => {
  const { error, value } = resetPasswordSchema.validate(req.body);
  if (error) {
    throw new ValidationError(error.details[0].message);
  }

  const { token, email, password } = value;
  const normalizedEmail = normalizeEmail(email);

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail }
  });

  if (!user) {
    throw new AppError('Invalid reset link', 400);
  }

  if (!user.passwordResetToken || !user.passwordResetExpires) {
    throw new AppError('No reset token found', 400);
  }

  if (user.passwordResetExpires < new Date()) {
    throw new AppError('Reset link expired. Please request a new one.', 400);
  }

  // Verify token
  const isValid = await verifyToken(token, user.passwordResetToken);
  if (!isValid) {
    throw new AppError('Invalid reset link', 400);
  }

  // Check password history (prevent reuse of last 5 passwords)
  const isInHistory = await isPasswordInHistory(password, user.passwordHistory);
  if (isInHistory) {
    throw new AppError('Cannot reuse a recent password. Please choose a different one.', 400);
  }

  // Hash new password
  const passwordHash = await hashPassword(password);

  // Update password and history
  const newHistory = [passwordHash, ...user.passwordHistory].slice(0, 5);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      passwordHistory: newHistory,
      passwordResetToken: null,
      passwordResetExpires: null,
      passwordResetAttempts: 0,
      lastPasswordChange: new Date(),
      failedLoginAttempts: 0, // Reset failed attempts
      accountLockedUntil: null // Unlock account
    }
  });

  // Invalidate all refresh tokens (force re-login)
  await prisma.refreshToken.deleteMany({
    where: { userId: user.id }
  });

  // Log password reset
  await logPasswordChange(user.id, req);

  res.json({
    status: 'success',
    message: 'Password reset successfully. Please log in with your new password.'
  });
});

// ============================================================================
// CHANGE PASSWORD (AUTHENTICATED)
// ============================================================================

export const changePassword = asyncHandler(async (
  req: AuthRequest,
  res: Response
) => {
  const { error, value } = changePasswordSchema.validate(req.body);
  if (error) {
    throw new ValidationError(error.details[0].message);
  }

  const { currentPassword, newPassword } = value;
  const userId = req.user!.id;

  const user = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (!user) {
    throw new AppError('User not found', 404);
  }

  // Verify current password
  const isValid = await comparePassword(currentPassword, user.passwordHash);
  if (!isValid) {
    throw new AuthenticationError('Current password is incorrect');
  }

  // Check password history
  const isInHistory = await isPasswordInHistory(newPassword, user.passwordHistory);
  if (isInHistory) {
    throw new AppError('Cannot reuse a recent password', 400);
  }

  // Hash new password
  const passwordHash = await hashPassword(newPassword);

  // Update password and history
  const newHistory = [passwordHash, ...user.passwordHistory].slice(0, 5);

  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash,
      passwordHistory: newHistory,
      lastPasswordChange: new Date()
    }
  });

  // Invalidate all refresh tokens except current (optional)
  // await prisma.refreshToken.deleteMany({
  //   where: { userId: user.id }
  // });

  await logPasswordChange(userId, req);

  res.json({
    status: 'success',
    message: 'Password changed successfully'
  });
});

// ============================================================================
// TWO-FACTOR AUTHENTICATION
// ============================================================================

export const enable2FA = asyncHandler(async (
  req: AuthRequest,
  res: Response
) => {
  const userId = req.user!.id;

  const user = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (!user) {
    throw new AppError('User not found', 404);
  }

  if (user.twoFactorEnabled) {
    throw new AppError('2FA is already enabled', 400);
  }

  // Generate secret
  const secret = speakeasy.generateSecret({
    name: `Estate Standard (${user.email})`,
    length: 32
  });

  // Generate backup codes
  const backupCodes = Array.from({ length: 10 }, () =>
    crypto.randomBytes(4).toString('hex').toUpperCase()
  );

  // Hash backup codes
  const hashedBackupCodes = await Promise.all(
    backupCodes.map(code => hashToken(code))
  );

  // Save secret (not enabled yet - requires verification)
  await prisma.user.update({
    where: { id: userId },
    data: {
      twoFactorSecret: secret.base32,
      twoFactorBackupCodes: hashedBackupCodes
    }
  });

  // Generate QR code
  const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url!);

  res.json({
    status: 'success',
    message: 'Scan this QR code with your authenticator app, then verify with a code.',
    data: {
      qrCode: qrCodeUrl,
      secret: secret.base32,
      backupCodes // Show once
    }
  });
});

export const verify2FA = asyncHandler(async (
  req: AuthRequest,
  res: Response
) => {
  const { error, value } = verify2FASchema.validate(req.body);
  if (error) {
    throw new ValidationError(error.details[0].message);
  }

  const { token } = value;
  const userId = req.user!.id;

  const user = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (!user || !user.twoFactorSecret) {
    throw new AppError('2FA setup not initiated', 400);
  }

  const verified = speakeasy.totp.verify({
    secret: user.twoFactorSecret,
    encoding: 'base32',
    token,
    window: 2
  });

  if (!verified) {
    throw new AppError('Invalid 2FA code', 400);
  }

  // Enable 2FA
  await prisma.user.update({
    where: { id: userId },
    data: {
      twoFactorEnabled: true
    }
  });

  await log2FAChange(userId, 'enabled', req);

  res.json({
    status: 'success',
    message: '2FA enabled successfully'
  });
});

export const disable2FA = asyncHandler(async (
  req: AuthRequest,
  res: Response
) => {
  const { error, value } = verify2FASchema.validate(req.body);
  if (error) {
    throw new ValidationError(error.details[0].message);
  }

  const { token } = value;
  const userId = req.user!.id;

  const user = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (!user || !user.twoFactorEnabled) {
    throw new AppError('2FA is not enabled', 400);
  }

  // Verify code before disabling
  const verified = speakeasy.totp.verify({
    secret: user.twoFactorSecret!,
    encoding: 'base32',
    token,
    window: 2
  });

  if (!verified) {
    throw new AppError('Invalid 2FA code', 400);
  }

  // Disable 2FA
  await prisma.user.update({
    where: { id: userId },
    data: {
      twoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorBackupCodes: []
    }
  });

  await log2FAChange(userId, 'disabled', req);

  res.json({
    status: 'success',
    message: '2FA disabled successfully'
  });
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function generateAccessToken(user: any): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role
    },
    process.env.JWT_SECRET!,
    { expiresIn: process.env.JWT_EXPIRATION || '15m' }
  );
}

function generateRefreshToken(user: any): string {
  return jwt.sign(
    { id: user.id },
    process.env.JWT_REFRESH_SECRET!,
    { expiresIn: process.env.JWT_REFRESH_EXPIRATION || '7d' }
  );
}

async function sendVerificationEmail(email: string, token: string) {
  const verifyUrl = `${process.env.FRONTEND_URL}/verify-email?token=${token}&email=${email}`;

  await sendEmail({
    to: email,
    subject: 'Verify your Estate Standard account',
    html: `
      <p>Thank you for registering with Estate Standard.</p>
      <p>Please click the link below to verify your email address:</p>
      <p><a href="${verifyUrl}">Verify Email</a></p>
      <p>This link will expire in 24 hours.</p>
      <p>If you didn't create an account, please ignore this email.</p>
    `
  });
}

async function sendPasswordResetEmail(email: string, token: string) {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}&email=${email}`;

  await sendEmail({
    to: email,
    subject: 'Reset your Estate Standard password',
    html: `
      <p>You requested to reset your password.</p>
      <p>Please click the link below to reset your password:</p>
      <p><a href="${resetUrl}">Reset Password</a></p>
      <p>This link will expire in 15 minutes.</p>
      <p>If you didn't request this, please ignore this email.</p>
    `
  });
}
