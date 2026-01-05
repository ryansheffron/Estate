// Estate Standard - Input Validation Schemas
// Joi validation schemas for all API endpoints

import Joi from 'joi';

// ============================================================================
// CUSTOM VALIDATORS
// ============================================================================

const uuidSchema = Joi.string().uuid();
const emailSchema = Joi.string().email().lowercase().trim();
const phoneSchema = Joi.string().pattern(/^\+[1-9]\d{1,14}$/);
const urlSchema = Joi.string().uri();

const passwordSchema = Joi.string()
  .min(12)
  .max(128)
  .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
  .required()
  .messages({
    'string.pattern.base': 'Password must contain uppercase, lowercase, number, and special character (@$!%*?&)',
    'string.min': 'Password must be at least 12 characters',
    'string.max': 'Password must be less than 128 characters'
  });

// ============================================================================
// AUTHENTICATION
// ============================================================================

export const registerSchema = Joi.object({
  email: emailSchema.required(),
  password: passwordSchema,
  firstName: Joi.string().min(1).max(50).trim().required(),
  lastName: Joi.string().min(1).max(50).trim().required(),
  role: Joi.string().valid('HOMEOWNER', 'VENDOR').required(),
  phone: phoneSchema.optional(),

  // Vendor-specific fields
  businessName: Joi.when('role', {
    is: 'VENDOR',
    then: Joi.string().min(2).max(200).trim().required(),
    otherwise: Joi.forbidden()
  }),
  serviceZipCodes: Joi.when('role', {
    is: 'VENDOR',
    then: Joi.array().items(Joi.string().pattern(/^\d{5}$/)).min(1).max(20),
    otherwise: Joi.forbidden()
  }),
  serviceCities: Joi.when('role', {
    is: 'VENDOR',
    then: Joi.array().items(Joi.string().min(2).max(100)).min(1).max(20),
    otherwise: Joi.forbidden()
  })
});

export const loginSchema = Joi.object({
  email: emailSchema.required(),
  password: Joi.string().required(),
  twoFactorCode: Joi.string().length(6).pattern(/^\d{6}$/).optional()
});

export const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string().required()
});

export const logoutSchema = Joi.object({
  refreshToken: Joi.string().optional()
});

export const forgotPasswordSchema = Joi.object({
  email: emailSchema.required()
});

export const resetPasswordSchema = Joi.object({
  token: Joi.string().required(),
  email: emailSchema.required(),
  password: passwordSchema
});

export const verifyEmailSchema = Joi.object({
  token: Joi.string().required(),
  email: emailSchema.required()
});

export const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: passwordSchema
});

// ============================================================================
// TWO-FACTOR AUTHENTICATION
// ============================================================================

export const enable2FASchema = Joi.object({});

export const verify2FASchema = Joi.object({
  token: Joi.string().length(6).pattern(/^\d{6}$/).required()
});

export const disable2FASchema = Joi.object({
  token: Joi.string().length(6).pattern(/^\d{6}$/).required()
});

// ============================================================================
// SERVICE REQUESTS
// ============================================================================

export const createServiceRequestSchema = Joi.object({
  homeId: uuidSchema.required(),
  categoryId: uuidSchema.optional(),
  title: Joi.string().min(3).max(200).trim().required(),
  description: Joi.string().min(10).max(5000).trim().required(),
  photos: Joi.array().items(urlSchema).max(10).default([]),
  videos: Joi.array().items(urlSchema).max(3).default([]),
  preferredDate: Joi.date().min('now').optional(),
  preferredTimeSlot: Joi.string().valid('morning', 'afternoon', 'evening').optional()
});

export const updateServiceRequestSchema = Joi.object({
  title: Joi.string().min(3).max(200).trim().optional(),
  description: Joi.string().min(10).max(5000).trim().optional(),
  photos: Joi.array().items(urlSchema).max(10).optional(),
  videos: Joi.array().items(urlSchema).max(3).optional(),
  preferredDate: Joi.date().min('now').optional(),
  preferredTimeSlot: Joi.string().valid('morning', 'afternoon', 'evening').optional(),
  status: Joi.string().valid('DRAFT', 'SUBMITTED', 'CANCELLED').optional()
});

// ============================================================================
// APPOINTMENTS
// ============================================================================

export const createAppointmentSchema = Joi.object({
  homeId: uuidSchema.required(),
  vendorId: uuidSchema.required(),
  serviceRequestId: uuidSchema.optional(),
  scheduledStart: Joi.date().min('now').required(),
  scheduledEnd: Joi.date().min(Joi.ref('scheduledStart')).required()
});

export const rescheduleAppointmentSchema = Joi.object({
  newStart: Joi.date().min('now').required(),
  newEnd: Joi.date().min(Joi.ref('newStart')).required(),
  reason: Joi.string().min(10).max(500).trim().optional()
});

export const cancelAppointmentSchema = Joi.object({
  cancellationReason: Joi.string().min(10).max(500).trim().required()
});

export const completeAppointmentSchema = Joi.object({
  completionNotes: Joi.string().min(20).max(2000).trim().required(),
  completionPhotos: Joi.array().items(urlSchema).min(1).max(20).required(),
  invoiceUrl: urlSchema.optional(),
  actualPrice: Joi.number().min(0).max(100000).optional()
});

export const confirmCompletionSchema = Joi.object({
  confirmed: Joi.boolean().required(),
  rating: Joi.number().min(1).max(5).optional(),
  review: Joi.string().min(10).max(1000).trim().optional()
});

export const disputeAppointmentSchema = Joi.object({
  disputeReason: Joi.string().min(20).max(2000).trim().required(),
  evidence: Joi.array().items(urlSchema).max(10).optional()
});

// ============================================================================
// MAINTENANCE
// ============================================================================

export const markMaintenanceCompleteSchema = Joi.object({
  completedBy: Joi.string().min(2).max(200).trim().required(),
  vendorId: uuidSchema.optional(),
  notes: Joi.string().max(2000).trim().optional(),
  photos: Joi.array().items(urlSchema).max(10).default([]),
  cost: Joi.number().min(0).max(100000).optional()
});

// ============================================================================
// RECURRING SERVICES
// ============================================================================

export const createRecurringRuleSchema = Joi.object({
  homeId: uuidSchema.required(),
  vendorId: uuidSchema.required(),
  categoryId: uuidSchema.required(),
  frequency: Joi.string().valid('MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'YEARLY').required(),
  preferredDayOfWeek: Joi.number().min(0).max(6).optional(),
  preferredTimeSlot: Joi.string().valid('morning', 'afternoon', 'evening').optional(),
  autoBook: Joi.boolean().default(true)
});

export const updateRecurringRuleSchema = Joi.object({
  frequency: Joi.string().valid('MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'YEARLY').optional(),
  preferredDayOfWeek: Joi.number().min(0).max(6).optional(),
  preferredTimeSlot: Joi.string().valid('morning', 'afternoon', 'evening').optional(),
  autoBook: Joi.boolean().optional(),
  isActive: Joi.boolean().optional()
});

// ============================================================================
// VENDOR
// ============================================================================

export const updateVendorProfileSchema = Joi.object({
  businessName: Joi.string().min(2).max(200).trim().optional(),
  businessPhone: phoneSchema.optional(),
  businessEmail: emailSchema.optional(),
  website: urlSchema.optional(),
  serviceZipCodes: Joi.array().items(Joi.string().pattern(/^\d{5}$/)).min(1).max(20).optional(),
  serviceCities: Joi.array().items(Joi.string().min(2).max(100)).min(1).max(20).optional(),
  serviceRadius: Joi.number().min(1).max(100).optional(),
  autoAcceptBookings: Joi.boolean().optional()
});

export const createAvailabilitySlotSchema = Joi.object({
  startTime: Joi.date().min('now').required(),
  endTime: Joi.date().min(Joi.ref('startTime')).required(),
  isRecurring: Joi.boolean().default(false),
  recurringRule: Joi.when('isRecurring', {
    is: true,
    then: Joi.object({
      frequency: Joi.string().valid('daily', 'weekly', 'monthly').required(),
      daysOfWeek: Joi.array().items(Joi.number().min(0).max(6)).optional(),
      endDate: Joi.date().min('now').optional()
    }),
    otherwise: Joi.forbidden()
  }),
  capacity: Joi.number().min(1).max(10).default(1)
});

// ============================================================================
// HOME
// ============================================================================

export const createHomeSchema = Joi.object({
  streetAddress: Joi.string().min(5).max(200).trim().required(),
  unit: Joi.string().max(20).trim().optional(),
  city: Joi.string().min(2).max(100).trim().required(),
  state: Joi.string().length(2).uppercase().required(),
  zipCode: Joi.string().pattern(/^\d{5}(-\d{4})?$/).required(),
  country: Joi.string().default('USA'),
  propertyType: Joi.string().valid('single_family', 'condo', 'townhouse', 'estate').required(),
  squareFeet: Joi.number().min(100).max(50000).optional(),
  bedrooms: Joi.number().min(0).max(20).optional(),
  bathrooms: Joi.number().min(0).max(20).optional(),
  yearBuilt: Joi.number().min(1800).max(new Date().getFullYear() + 2).optional(),
  photos: Joi.array().items(urlSchema).max(50).default([]),
  isPrimary: Joi.boolean().default(false)
});

export const updateHomeSchema = Joi.object({
  streetAddress: Joi.string().min(5).max(200).trim().optional(),
  unit: Joi.string().max(20).trim().optional(),
  city: Joi.string().min(2).max(100).trim().optional(),
  state: Joi.string().length(2).uppercase().optional(),
  zipCode: Joi.string().pattern(/^\d{5}(-\d{4})?$/).optional(),
  propertyType: Joi.string().valid('single_family', 'condo', 'townhouse', 'estate').optional(),
  squareFeet: Joi.number().min(100).max(50000).optional(),
  bedrooms: Joi.number().min(0).max(20).optional(),
  bathrooms: Joi.number().min(0).max(20).optional(),
  yearBuilt: Joi.number().min(1800).max(new Date().getFullYear() + 2).optional(),
  photos: Joi.array().items(urlSchema).max(50).optional(),
  isPrimary: Joi.boolean().optional()
});

// ============================================================================
// MESSAGES
// ============================================================================

export const sendMessageSchema = Joi.object({
  serviceRequestId: uuidSchema.optional(),
  recipientId: uuidSchema.required(),
  subject: Joi.string().min(3).max(200).trim().optional(),
  body: Joi.string().min(1).max(5000).trim().required(),
  attachments: Joi.array().items(urlSchema).max(5).default([])
});

// ============================================================================
// PAYMENTS
// ============================================================================

export const createPaymentIntentSchema = Joi.object({
  appointmentId: uuidSchema.required(),
  amount: Joi.number().min(1).max(100000).required(),
  currency: Joi.string().length(3).uppercase().default('USD')
});

// ============================================================================
// FILE UPLOAD
// ============================================================================

export const fileUploadSchema = Joi.object({
  files: Joi.array().items(
    Joi.object({
      fieldname: Joi.string().required(),
      originalname: Joi.string().required(),
      encoding: Joi.string().required(),
      mimetype: Joi.string().valid(
        'image/jpeg',
        'image/png',
        'image/webp',
        'application/pdf'
      ).required(),
      size: Joi.number().max(10 * 1024 * 1024).required() // 10MB
    })
  ).min(1).max(10).required()
});

// ============================================================================
// SEARCH & FILTERS
// ============================================================================

export const searchVendorsSchema = Joi.object({
  category: Joi.string().min(2).max(100).optional(),
  zipCode: Joi.string().pattern(/^\d{5}$/).optional(),
  city: Joi.string().min(2).max(100).optional(),
  radius: Joi.number().min(1).max(100).optional(),
  minRating: Joi.number().min(1).max(5).optional(),
  page: Joi.number().min(1).default(1),
  limit: Joi.number().min(1).max(100).default(20)
});

export const paginationSchema = Joi.object({
  page: Joi.number().min(1).default(1),
  limit: Joi.number().min(1).max(100).default(20),
  sortBy: Joi.string().optional(),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc')
});

// ============================================================================
// HELPER FUNCTION
// ============================================================================

export function validateRequest<T>(
  schema: Joi.ObjectSchema<T>,
  data: unknown
): { error?: string; value?: T } {
  const { error, value } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const errorMessage = error.details.map(d => d.message).join('; ');
    return { error: errorMessage };
  }

  return { value: value as T };
}
