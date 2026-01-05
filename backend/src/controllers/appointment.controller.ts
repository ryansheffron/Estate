// Estate Standard - Appointment Controller
// Handles booking, confirmation, completion, and job ledger updates

import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../server';
import { AppError } from '../middleware/errorHandler';
import { JobStatus } from '@prisma/client';

export const createAppointment = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const {
      homeId,
      vendorId,
      serviceRequestId,
      scheduledStart,
      scheduledEnd,
    } = req.body;

    if (!homeId || !vendorId || !scheduledStart || !scheduledEnd) {
      throw new AppError('Required fields missing', 400);
    }

    // Get homeowner
    const homeowner = await prisma.homeowner.findUnique({
      where: { userId: req.user!.id },
    });

    if (!homeowner) {
      throw new AppError('Homeowner profile not found', 404);
    }

    // Verify home ownership
    const home = await prisma.home.findFirst({
      where: { id: homeId, homeownerId: homeowner.id },
    });

    if (!home) {
      throw new AppError('Home not found or unauthorized', 404);
    }

    // Verify vendor exists and is verified
    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
    });

    if (!vendor || vendor.status !== 'VERIFIED') {
      throw new AppError('Vendor not available', 404);
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
            user: true,
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

    // TODO: Send notification to vendor
    // TODO: Send confirmation to homeowner

    res.status(201).json({
      status: 'success',
      data: { appointment },
    });
  } catch (error) {
    next(error);
  }
};

export const acceptAppointment = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;

    // Get vendor
    const vendor = await prisma.vendor.findUnique({
      where: { userId: req.user!.id },
    });

    if (!vendor) {
      throw new AppError('Vendor profile not found', 404);
    }

    // Get appointment
    const appointment = await prisma.appointment.findUnique({
      where: { id },
    });

    if (!appointment) {
      throw new AppError('Appointment not found', 404);
    }

    if (appointment.vendorId !== vendor.id) {
      throw new AppError('Unauthorized', 403);
    }

    if (appointment.status !== 'REQUESTED') {
      throw new AppError('Appointment cannot be accepted in current status', 400);
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

    // TODO: Notify homeowner of confirmation

    res.json({
      status: 'success',
      data: { appointment: updated },
    });
  } catch (error) {
    next(error);
  }
};

export const startAppointment = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;

    const vendor = await prisma.vendor.findUnique({
      where: { userId: req.user!.id },
    });

    if (!vendor) {
      throw new AppError('Vendor profile not found', 404);
    }

    const appointment = await prisma.appointment.findUnique({
      where: { id },
    });

    if (!appointment || appointment.vendorId !== vendor.id) {
      throw new AppError('Appointment not found or unauthorized', 404);
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
  } catch (error) {
    next(error);
  }
};

export const completeAppointment = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const {
      completionNotes,
      completionPhotos,
      invoiceUrl,
      actualPrice,
    } = req.body;

    const vendor = await prisma.vendor.findUnique({
      where: { userId: req.user!.id },
    });

    if (!vendor) {
      throw new AppError('Vendor profile not found', 404);
    }

    const appointment = await prisma.appointment.findUnique({
      where: { id },
    });

    if (!appointment || appointment.vendorId !== vendor.id) {
      throw new AppError('Appointment not found or unauthorized', 404);
    }

    if (appointment.status !== 'IN_PROGRESS') {
      throw new AppError('Appointment must be in progress to complete', 400);
    }

    // Completion proof validation (at least 2 required)
    const proofCount = [
      completionPhotos && completionPhotos.length > 0,
      invoiceUrl,
      appointment.checkInTimestamp,
      completionNotes && completionNotes.length > 20,
    ].filter(Boolean).length;

    if (proofCount < 2) {
      throw new AppError('At least 2 forms of completion proof required', 400);
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

    // TODO: Send notification to homeowner for confirmation
    // TODO: Schedule auto-confirmation in 48 hours

    res.json({
      status: 'success',
      data: { appointment: updated },
      message: 'Appointment marked complete. Awaiting homeowner confirmation.',
    });
  } catch (error) {
    next(error);
  }
};

export const confirmCompletion = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const { confirmed } = req.body;

    const homeowner = await prisma.homeowner.findUnique({
      where: { userId: req.user!.id },
    });

    if (!homeowner) {
      throw new AppError('Homeowner profile not found', 404);
    }

    const appointment = await prisma.appointment.findUnique({
      where: { id },
    });

    if (!appointment || appointment.homeownerId !== homeowner.id) {
      throw new AppError('Appointment not found or unauthorized', 404);
    }

    if (appointment.status !== 'COMPLETED_BY_VENDOR') {
      throw new AppError('Appointment must be completed by vendor first', 400);
    }

    if (!confirmed) {
      // Homeowner disputes - different flow
      throw new AppError('Use dispute endpoint to raise concerns', 400);
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
        platformFee: appointment.actualEnd
          ? undefined
          : (req.body.actualPrice || 0) * (platformFeePercent / 100),
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

    // TODO: Trigger vendor payout
    // TODO: Request review

    res.json({
      status: 'success',
      data: { appointment: updated },
      message: 'Job confirmed. Vendor payout will be processed.',
    });
  } catch (error) {
    next(error);
  }
};

export const disputeAppointment = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const { disputeReason } = req.body;

    if (!disputeReason) {
      throw new AppError('Dispute reason required', 400);
    }

    const homeowner = await prisma.homeowner.findUnique({
      where: { userId: req.user!.id },
    });

    if (!homeowner) {
      throw new AppError('Homeowner profile not found', 404);
    }

    const appointment = await prisma.appointment.findUnique({
      where: { id },
    });

    if (!appointment || appointment.homeownerId !== homeowner.id) {
      throw new AppError('Appointment not found or unauthorized', 404);
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

    // TODO: Notify admin/support team
    // TODO: Hold payout

    res.json({
      status: 'success',
      data: { appointment: updated },
      message: 'Dispute raised. Our team will review and contact you shortly.',
    });
  } catch (error) {
    next(error);
  }
};

export const rescheduleAppointment = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const { newStart, newEnd } = req.body;

    if (!newStart || !newEnd) {
      throw new AppError('New start and end times required', 400);
    }

    const appointment = await prisma.appointment.findUnique({
      where: { id },
    });

    if (!appointment) {
      throw new AppError('Appointment not found', 404);
    }

    // Authorization check (either party can reschedule)
    const user = req.user!;
    let authorized = false;

    if (user.role === 'HOMEOWNER') {
      const homeowner = await prisma.homeowner.findUnique({
        where: { userId: user.id },
      });
      authorized = appointment.homeownerId === homeowner?.id;
    } else if (user.role === 'VENDOR') {
      const vendor = await prisma.vendor.findUnique({
        where: { userId: user.id },
      });
      authorized = appointment.vendorId === vendor?.id;
    }

    if (!authorized) {
      throw new AppError('Unauthorized', 403);
    }

    // Cannot reschedule if in progress or completed
    if (['IN_PROGRESS', 'COMPLETED_BY_VENDOR', 'COMPLETED_CONFIRMED'].includes(appointment.status)) {
      throw new AppError('Cannot reschedule appointment in current status', 400);
    }

    const updated = await prisma.appointment.update({
      where: { id },
      data: {
        scheduledStart: new Date(newStart),
        scheduledEnd: new Date(newEnd),
        status: 'REQUESTED', // Reset to requested for re-confirmation
      },
    });

    // TODO: Notify other party
    // TODO: Update availability slots

    res.json({
      status: 'success',
      data: { appointment: updated },
    });
  } catch (error) {
    next(error);
  }
};

export const cancelAppointment = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const { cancellationReason } = req.body;

    const appointment = await prisma.appointment.findUnique({
      where: { id },
    });

    if (!appointment) {
      throw new AppError('Appointment not found', 404);
    }

    // Authorization
    const user = req.user!;
    let authorized = false;
    let cancelledBy = '';

    if (user.role === 'HOMEOWNER') {
      const homeowner = await prisma.homeowner.findUnique({
        where: { userId: user.id },
      });
      authorized = appointment.homeownerId === homeowner?.id;
      cancelledBy = 'homeowner';
    } else if (user.role === 'VENDOR') {
      const vendor = await prisma.vendor.findUnique({
        where: { userId: user.id },
      });
      authorized = appointment.vendorId === vendor?.id;
      cancelledBy = 'vendor';
    }

    if (!authorized) {
      throw new AppError('Unauthorized', 403);
    }

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

    // TODO: Handle cancellation fees if applicable
    // TODO: Notify other party

    res.json({
      status: 'success',
      data: { appointment: updated },
    });
  } catch (error) {
    next(error);
  }
};

export const getAppointments = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = req.user!;
    let appointments;

    if (user.role === 'HOMEOWNER') {
      const homeowner = await prisma.homeowner.findUnique({
        where: { userId: user.id },
      });

      appointments = await prisma.appointment.findMany({
        where: { homeownerId: homeowner?.id },
        include: {
          vendor: {
            include: { user: true },
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

      appointments = await prisma.appointment.findMany({
        where: { vendorId: vendor?.id },
        include: {
          homeowner: {
            include: { user: true },
          },
          home: true,
          serviceRequest: true,
        },
        orderBy: { scheduledStart: 'desc' },
      });
    }

    res.json({
      status: 'success',
      data: { appointments },
    });
  } catch (error) {
    next(error);
  }
};

export const getAppointmentById = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;

    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: {
        vendor: {
          include: { user: true },
        },
        homeowner: {
          include: { user: true },
        },
        home: true,
        serviceRequest: true,
        jobLedger: true,
      },
    });

    if (!appointment) {
      throw new AppError('Appointment not found', 404);
    }

    res.json({
      status: 'success',
      data: { appointment },
    });
  } catch (error) {
    next(error);
  }
};
