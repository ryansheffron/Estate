// Estate Standard - Appointment Controller (Secure)
// IDOR vulnerabilities fixed with comprehensive authorization checks

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../server';
import {
  AppError,
  AuthorizationError,
  NotFoundError,
  ValidationError
} from '../middleware/errorHandler.enhanced';
import { asyncHandler } from '../middleware/errorHandler.enhanced';
import { validate } from '../utils/validation';
import {
  createAppointmentSchema,
  rescheduleAppointmentSchema,
  completeAppointmentSchema,
  confirmAppointmentSchema,
  disputeAppointmentSchema,
  cancelAppointmentSchema
} from '../utils/validation';

/**
 * Authorization helper: Check if user can access this appointment
 */
async function authorizeAppointmentAccess(
  appointmentId: string,
  userId: string,
  userRole: string
): Promise<void> {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      homeowner: true,
      vendor: true,
    },
  });

  if (!appointment) {
    throw new NotFoundError('Appointment not found');
  }

  if (userRole === 'HOMEOWNER') {
    const homeowner = await prisma.homeowner.findUnique({
      where: { userId },
    });

    if (!homeowner || appointment.homeownerId !== homeowner.id) {
      throw new AuthorizationError('You do not have permission to access this appointment');
    }
  } else if (userRole === 'VENDOR') {
    const vendor = await prisma.vendor.findUnique({
      where: { userId },
    });

    if (!vendor || appointment.vendorId !== vendor.id) {
      throw new AuthorizationError('You do not have permission to access this appointment');
    }
  } else if (userRole !== 'ADMIN') {
    throw new AuthorizationError('Unauthorized access');
  }
}

/**
 * Create a new appointment
 * POST /api/appointments
 * @access Homeowner only
 */
export const createAppointment = asyncHandler(async (req: AuthRequest, res: Response) => {
  // Validate input
  const { value, error } = validate(createAppointmentSchema, req.body);
  if (error) {
    throw new ValidationError(error);
  }

  const {
    homeId,
    vendorId,
    serviceRequestId,
    scheduledStart,
    scheduledEnd,
  } = value;

  // Get homeowner
  const homeowner = await prisma.homeowner.findUnique({
    where: { userId: req.user!.id },
  });

  if (!homeowner) {
    throw new NotFoundError('Homeowner profile not found');
  }

  // Authorization: Verify home ownership
  const home = await prisma.home.findFirst({
    where: { id: homeId, homeownerId: homeowner.id },
  });

  if (!home) {
    throw new AuthorizationError('You do not have permission to book appointments for this home');
  }

  // Authorization: Verify service request ownership (if provided)
  if (serviceRequestId) {
    const serviceRequest = await prisma.serviceRequest.findUnique({
      where: { id: serviceRequestId },
    });

    if (!serviceRequest || serviceRequest.homeownerId !== homeowner.id) {
      throw new AuthorizationError('You do not have permission to access this service request');
    }
  }

  // Verify vendor exists and is verified
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
  });

  if (!vendor || vendor.status !== 'VERIFIED') {
    throw new NotFoundError('Vendor not available');
  }

  // Check vendor availability
  const slot = await prisma.availabilitySlot.findFirst({
    where: {
      vendorId,
      startTime: new Date(scheduledStart),
      isBooked: false,
    },
  });

  const appointment = await prisma.appointment.create({
    data: {
      homeownerId: homeowner.id,
      homeId,
      vendorId,
      serviceRequestId,
      scheduledStart: new Date(scheduledStart),
      scheduledEnd: new Date(scheduledEnd),
      status: vendor.autoAcceptBookings ? 'VENDOR_ACCEPTED' : 'REQUESTED',
      vendorAcceptedAt: vendor.autoAcceptBookings ? new Date() : undefined,
    },
    include: {
      vendor: {
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
            },
          },
        },
      },
      home: true,
    },
  });

  // Mark slot as booked if it exists
  if (slot) {
    await prisma.availabilitySlot.update({
      where: { id: slot.id },
      data: {
        isBooked: true,
        bookedBy: appointment.id,
      },
    });
  }

  // Update job ledger
  if (serviceRequestId) {
    await prisma.jobLedger.updateMany({
      where: { serviceRequestId },
      data: {
        vendorId,
        status: 'SENT_TO_VENDOR',
        sentToVendorAt: new Date(),
        scheduledAt: vendor.autoAcceptBookings ? new Date() : undefined,
      },
    });

    // Update service request status
    await prisma.serviceRequest.update({
      where: { id: serviceRequestId },
      data: { status: 'VENDOR_MATCHED' },
    });
  } else {
    // Create new job ledger for direct booking
    await prisma.jobLedger.create({
      data: {
        appointmentId: appointment.id,
        homeownerId: homeowner.id,
        vendorId,
        categoryName: 'Direct Booking',
        status: vendor.autoAcceptBookings ? 'VENDOR_ACCEPTED' : 'SENT_TO_VENDOR',
        requestCreatedAt: new Date(),
        sentToVendorAt: new Date(),
        vendorAcceptedAt: vendor.autoAcceptBookings ? new Date() : undefined,
      },
    });
  }

  res.status(201).json({
    status: 'success',
    data: { appointment },
  });
});

/**
 * Accept an appointment
 * POST /api/appointments/:id/accept
 * @access Vendor only
 */
export const acceptAppointment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  // Get vendor
  const vendor = await prisma.vendor.findUnique({
    where: { userId: req.user!.id },
  });

  if (!vendor) {
    throw new NotFoundError('Vendor profile not found');
  }

  // Get appointment and verify ownership
  const appointment = await prisma.appointment.findUnique({
    where: { id },
  });

  if (!appointment) {
    throw new NotFoundError('Appointment not found');
  }

  if (appointment.vendorId !== vendor.id) {
    throw new AuthorizationError('You do not have permission to accept this appointment');
  }

  if (appointment.status !== 'REQUESTED') {
    throw new ValidationError('Appointment cannot be accepted in current status');
  }

  // Accept appointment
  const updated = await prisma.appointment.update({
    where: { id },
    data: {
      status: 'VENDOR_ACCEPTED',
      vendorAcceptedAt: new Date(),
    },
  });

  // Update job ledger
  await prisma.jobLedger.updateMany({
    where: {
      OR: [
        { appointmentId: id },
        { serviceRequestId: appointment.serviceRequestId || undefined },
      ],
    },
    data: {
      status: 'VENDOR_ACCEPTED',
      vendorAcceptedAt: new Date(),
      scheduledAt: new Date(),
    },
  });

  // Update service request
  if (appointment.serviceRequestId) {
    await prisma.serviceRequest.update({
      where: { id: appointment.serviceRequestId },
      data: { status: 'SCHEDULED' },
    });
  }

  res.json({
    status: 'success',
    data: { appointment: updated },
  });
});

/**
 * Start an appointment
 * POST /api/appointments/:id/start
 * @access Vendor only
 */
export const startAppointment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const vendor = await prisma.vendor.findUnique({
    where: { userId: req.user!.id },
  });

  if (!vendor) {
    throw new NotFoundError('Vendor profile not found');
  }

  const appointment = await prisma.appointment.findUnique({
    where: { id },
  });

  if (!appointment) {
    throw new NotFoundError('Appointment not found');
  }

  if (appointment.vendorId !== vendor.id) {
    throw new AuthorizationError('You do not have permission to start this appointment');
  }

  const updated = await prisma.appointment.update({
    where: { id },
    data: {
      status: 'IN_PROGRESS',
      actualStart: new Date(),
      checkInTimestamp: new Date(),
    },
  });

  // Update job ledger
  await prisma.jobLedger.updateMany({
    where: {
      OR: [
        { appointmentId: id },
        { serviceRequestId: appointment.serviceRequestId || undefined },
      ],
    },
    data: {
      status: 'IN_PROGRESS',
      startedAt: new Date(),
      hasTimestamps: true,
    },
  });

  res.json({
    status: 'success',
    data: { appointment: updated },
  });
});

/**
 * Complete an appointment
 * POST /api/appointments/:id/complete
 * @access Vendor only
 */
export const completeAppointment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  // Validate input
  const { value, error } = validate(completeAppointmentSchema, req.body);
  if (error) {
    throw new ValidationError(error);
  }

  const {
    completionNotes,
    completionPhotos,
    invoiceUrl,
    actualPrice,
  } = value;

  const vendor = await prisma.vendor.findUnique({
    where: { userId: req.user!.id },
  });

  if (!vendor) {
    throw new NotFoundError('Vendor profile not found');
  }

  const appointment = await prisma.appointment.findUnique({
    where: { id },
  });

  if (!appointment) {
    throw new NotFoundError('Appointment not found');
  }

  if (appointment.vendorId !== vendor.id) {
    throw new AuthorizationError('You do not have permission to complete this appointment');
  }

  if (appointment.status !== 'IN_PROGRESS') {
    throw new ValidationError('Appointment must be in progress to complete');
  }

  // Completion proof validation (at least 2 required)
  const proofCount = [
    completionPhotos && completionPhotos.length > 0,
    invoiceUrl,
    appointment.checkInTimestamp,
    completionNotes && completionNotes.length > 20,
  ].filter(Boolean).length;

  if (proofCount < 2) {
    throw new ValidationError('At least 2 forms of completion proof required');
  }

  // Mark appointment complete by vendor
  const updated = await prisma.appointment.update({
    where: { id },
    data: {
      status: 'COMPLETED_BY_VENDOR',
      actualEnd: new Date(),
      checkOutTimestamp: new Date(),
      completionNotes,
      completionPhotos: completionPhotos || [],
      invoiceUrl,
    },
  });

  // Update job ledger
  await prisma.jobLedger.updateMany({
    where: {
      OR: [
        { appointmentId: id },
        { serviceRequestId: appointment.serviceRequestId || undefined },
      ],
    },
    data: {
      status: 'COMPLETED_BY_VENDOR',
      completedByVendorAt: new Date(),
      hasBeforeAfterPhotos: completionPhotos && completionPhotos.length > 0,
      hasTimestamps: !!appointment.checkInTimestamp,
      hasInvoice: !!invoiceUrl,
      actualPrice,
    },
  });

  res.json({
    status: 'success',
    data: { appointment: updated },
    message: 'Appointment marked complete. Awaiting homeowner confirmation.',
  });
});

/**
 * Confirm appointment completion
 * POST /api/appointments/:id/confirm
 * @access Homeowner only
 */
export const confirmCompletion = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  // Validate input
  const { value, error } = validate(confirmAppointmentSchema, req.body);
  if (error) {
    throw new ValidationError(error);
  }

  const { confirmed } = value;

  const homeowner = await prisma.homeowner.findUnique({
    where: { userId: req.user!.id },
  });

  if (!homeowner) {
    throw new NotFoundError('Homeowner profile not found');
  }

  const appointment = await prisma.appointment.findUnique({
    where: { id },
  });

  if (!appointment) {
    throw new NotFoundError('Appointment not found');
  }

  if (appointment.homeownerId !== homeowner.id) {
    throw new AuthorizationError('You do not have permission to confirm this appointment');
  }

  if (appointment.status !== 'COMPLETED_BY_VENDOR') {
    throw new ValidationError('Appointment must be completed by vendor first');
  }

  if (!confirmed) {
    throw new ValidationError('Use dispute endpoint to raise concerns');
  }

  // Confirm completion
  const updated = await prisma.appointment.update({
    where: { id },
    data: {
      status: 'COMPLETED_CONFIRMED',
      homeownerConfirmedCompletionAt: new Date(),
    },
  });

  // Update job ledger - THIS TRIGGERS PAYOUT ELIGIBILITY
  const platformFeePercent = parseFloat(process.env.STRIPE_PLATFORM_FEE_PERCENT || '15');

  await prisma.jobLedger.updateMany({
    where: {
      OR: [
        { appointmentId: id },
        { serviceRequestId: appointment.serviceRequestId || undefined },
      ],
    },
    data: {
      status: 'COMPLETED_CONFIRMED',
      completedConfirmedAt: new Date(),
      hasHomeownerConfirmation: true,
      platformFee: req.body.actualPrice
        ? req.body.actualPrice * (platformFeePercent / 100)
        : undefined,
      vendorPayout: req.body.actualPrice
        ? req.body.actualPrice * (1 - platformFeePercent / 100)
        : undefined,
    },
  });

  // Update service request
  if (appointment.serviceRequestId) {
    await prisma.serviceRequest.update({
      where: { id: appointment.serviceRequestId },
      data: { status: 'COMPLETED' },
    });
  }

  res.json({
    status: 'success',
    data: { appointment: updated },
    message: 'Job confirmed. Vendor payout will be processed.',
  });
});

/**
 * Dispute an appointment
 * POST /api/appointments/:id/dispute
 * @access Homeowner only
 */
export const disputeAppointment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  // Validate input
  const { value, error } = validate(disputeAppointmentSchema, req.body);
  if (error) {
    throw new ValidationError(error);
  }

  const { disputeReason } = value;

  const homeowner = await prisma.homeowner.findUnique({
    where: { userId: req.user!.id },
  });

  if (!homeowner) {
    throw new NotFoundError('Homeowner profile not found');
  }

  const appointment = await prisma.appointment.findUnique({
    where: { id },
  });

  if (!appointment) {
    throw new NotFoundError('Appointment not found');
  }

  if (appointment.homeownerId !== homeowner.id) {
    throw new AuthorizationError('You do not have permission to dispute this appointment');
  }

  const updated = await prisma.appointment.update({
    where: { id },
    data: {
      status: 'DISPUTED',
      disputeReason,
      disputedAt: new Date(),
    },
  });

  // Update job ledger
  await prisma.jobLedger.updateMany({
    where: {
      OR: [
        { appointmentId: id },
        { serviceRequestId: appointment.serviceRequestId || undefined },
      ],
    },
    data: {
      status: 'DISPUTED',
      disputedAt: new Date(),
      disputeReason,
    },
  });

  res.json({
    status: 'success',
    data: { appointment: updated },
    message: 'Dispute raised. Our team will review and contact you shortly.',
  });
});

/**
 * Reschedule an appointment
 * PATCH /api/appointments/:id/reschedule
 * @access Homeowner or Vendor (either party)
 */
export const rescheduleAppointment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  // Validate input
  const { value, error } = validate(rescheduleAppointmentSchema, req.body);
  if (error) {
    throw new ValidationError(error);
  }

  const { newStart, newEnd } = value;

  // Authorization check (either party can reschedule)
  await authorizeAppointmentAccess(id, req.user!.id, req.user!.role);

  const appointment = await prisma.appointment.findUnique({
    where: { id },
  });

  if (!appointment) {
    throw new NotFoundError('Appointment not found');
  }

  // Cannot reschedule if in progress or completed
  if (['IN_PROGRESS', 'COMPLETED_BY_VENDOR', 'COMPLETED_CONFIRMED'].includes(appointment.status)) {
    throw new ValidationError('Cannot reschedule appointment in current status');
  }

  const updated = await prisma.appointment.update({
    where: { id },
    data: {
      scheduledStart: new Date(newStart),
      scheduledEnd: new Date(newEnd),
      status: 'REQUESTED', // Reset to requested for re-confirmation
    },
  });

  res.json({
    status: 'success',
    data: { appointment: updated },
  });
});

/**
 * Cancel an appointment
 * POST /api/appointments/:id/cancel
 * @access Homeowner or Vendor (either party)
 */
export const cancelAppointment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  // Validate input
  const { value, error } = validate(cancelAppointmentSchema, req.body);
  if (error) {
    throw new ValidationError(error);
  }

  const { cancellationReason } = value;

  // Authorization check
  await authorizeAppointmentAccess(id, req.user!.id, req.user!.role);

  const appointment = await prisma.appointment.findUnique({
    where: { id },
  });

  if (!appointment) {
    throw new NotFoundError('Appointment not found');
  }

  const cancelledBy = req.user!.role === 'HOMEOWNER' ? 'homeowner' : 'vendor';

  const updated = await prisma.appointment.update({
    where: { id },
    data: {
      status: 'CANCELLED',
      cancelledBy,
      cancelledAt: new Date(),
      cancellationReason,
    },
  });

  // Update job ledger
  await prisma.jobLedger.updateMany({
    where: {
      OR: [
        { appointmentId: id },
        { serviceRequestId: appointment.serviceRequestId || undefined },
      ],
    },
    data: {
      status: 'CANCELLED',
      cancelledAt: new Date(),
    },
  });

  // Free up availability slot
  await prisma.availabilitySlot.updateMany({
    where: { bookedBy: id },
    data: {
      isBooked: false,
      bookedBy: null,
    },
  });

  res.json({
    status: 'success',
    data: { appointment: updated },
  });
});

/**
 * Get all appointments for current user
 * GET /api/appointments
 * @access Homeowner, Vendor
 */
export const getAppointments = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  let appointments;

  if (user.role === 'HOMEOWNER') {
    const homeowner = await prisma.homeowner.findUnique({
      where: { userId: user.id },
    });

    if (!homeowner) {
      throw new NotFoundError('Homeowner profile not found');
    }

    appointments = await prisma.appointment.findMany({
      where: { homeownerId: homeowner.id },
      include: {
        vendor: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
              },
            },
          },
        },
        home: true,
        serviceRequest: true,
      },
      orderBy: { scheduledStart: 'desc' },
    });
  } else if (user.role === 'VENDOR') {
    const vendor = await prisma.vendor.findUnique({
      where: { userId: user.id },
    });

    if (!vendor) {
      throw new NotFoundError('Vendor profile not found');
    }

    appointments = await prisma.appointment.findMany({
      where: { vendorId: vendor.id },
      include: {
        homeowner: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
              },
            },
          },
        },
        home: true,
        serviceRequest: true,
      },
      orderBy: { scheduledStart: 'desc' },
    });
  } else if (user.role === 'ADMIN') {
    appointments = await prisma.appointment.findMany({
      include: {
        vendor: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
              },
            },
          },
        },
        homeowner: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
              },
            },
          },
        },
        home: true,
        serviceRequest: true,
      },
      orderBy: { scheduledStart: 'desc' },
    });
  } else {
    throw new AuthorizationError('Unauthorized access');
  }

  res.json({
    status: 'success',
    data: { appointments },
  });
});

/**
 * Get a specific appointment by ID
 * GET /api/appointments/:id
 * @access Homeowner (owner), Vendor (assigned), Admin
 */
export const getAppointmentById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  // Authorization check BEFORE fetching full data
  await authorizeAppointmentAccess(id, req.user!.id, req.user!.role);

  const appointment = await prisma.appointment.findUnique({
    where: { id },
    include: {
      vendor: {
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
            },
          },
        },
      },
      homeowner: {
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
            },
          },
        },
      },
      home: true,
      serviceRequest: true,
      jobLedger: true,
    },
  });

  if (!appointment) {
    throw new NotFoundError('Appointment not found');
  }

  res.json({
    status: 'success',
    data: { appointment },
  });
});
