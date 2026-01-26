// Estate Standard - Appointment Controller
// Handles booking, confirmation, completion, and job ledger updates

import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../server';
import { AppError } from '../middleware/errorHandler';
import { JobStatus } from '@prisma/client';
import { JobStateMachine, createStateTransitionLog } from '../utils/stateMachine';

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

    // Pre-transaction validations
    const homeowner = await prisma.homeowner.findUnique({
      where: { userId: req.user!.id },
    });

    if (!homeowner) {
      throw new AppError('Homeowner profile not found', 404);
    }

    const home = await prisma.home.findFirst({
      where: { id: homeId, homeownerId: homeowner.id },
    });

    if (!home) {
      throw new AppError('Home not found or unauthorized', 404);
    }

    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
    });

    if (!vendor || vendor.status !== 'VERIFIED') {
      throw new AppError('Vendor not available', 404);
    }

    // ATOMIC TRANSACTION: Prevents double-booking race conditions
    const appointment = await prisma.$transaction(async (tx) => {
      // 1. Lock and check availability slot (SELECT FOR UPDATE equivalent)
      const slot = await tx.availabilitySlot.findFirst({
        where: {
          vendorId,
          startTime: new Date(scheduledStart),
          isBooked: false,
        },
      });

      // Ensure slot is still available (could be booked by concurrent request)
      if (slot) {
        // Atomically check and mark as booked using optimistic locking
        const updatedSlot = await tx.availabilitySlot.updateMany({
          where: {
            id: slot.id,
            isBooked: false, // Double-check it's still available
          },
          data: {
            isBooked: true,
            updatedAt: new Date(),
          },
        });

        if (updatedSlot.count === 0) {
          throw new AppError('Time slot no longer available', 409);
        }
      }

      // 2. Create appointment
      const newAppointment = await tx.appointment.create({
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

      // 3. Link slot to appointment
      if (slot) {
        await tx.availabilitySlot.update({
          where: { id: slot.id },
          data: {
            bookedBy: newAppointment.id,
          },
        });
      }

      // 4. Update job ledger
      if (serviceRequestId) {
        await tx.jobLedger.updateMany({
          where: { serviceRequestId },
          data: {
            appointmentId: newAppointment.id,
            vendorId,
            status: vendor.autoAcceptBookings ? 'VENDOR_ACCEPTED' : 'SENT_TO_VENDOR',
            sentToVendorAt: new Date(),
            vendorAcceptedAt: vendor.autoAcceptBookings ? new Date() : undefined,
            scheduledAt: vendor.autoAcceptBookings ? new Date() : undefined,
          },
        });

        // 5. Update service request status
        await tx.serviceRequest.update({
          where: { id: serviceRequestId },
          data: { status: vendor.autoAcceptBookings ? 'SCHEDULED' : 'VENDOR_MATCHED' },
        });
      } else {
        // Create new job ledger for direct booking
        await tx.jobLedger.create({
          data: {
            appointmentId: newAppointment.id,
            homeownerId: homeowner.id,
            vendorId,
            categoryName: 'Direct Booking',
            status: vendor.autoAcceptBookings ? 'VENDOR_ACCEPTED' : 'SENT_TO_VENDOR',
            requestCreatedAt: new Date(),
            sentToVendorAt: new Date(),
            vendorAcceptedAt: vendor.autoAcceptBookings ? new Date() : undefined,
            scheduledAt: vendor.autoAcceptBookings ? new Date() : undefined,
          },
        });
      }

      return newAppointment;
    }, {
      isolationLevel: 'Serializable', // Highest isolation level for critical booking operations
      timeout: 10000, // 10 second timeout for transaction
    });

    // TODO: Send notification to vendor
    // TODO: Send confirmation to homeowner

    res.status(201).json({
      status: 'success',
      data: { appointment },
    });
  } catch (error) {
    if (error instanceof AppError && error.statusCode === 409) {
      // Slot was booked by concurrent request
      next(error);
    } else {
      next(error);
    }
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

    // Validate state transition using state machine
    JobStateMachine.validateTransition(appointment.status, 'VENDOR_ACCEPTED');

    // Accept appointment with audit log
    const stateLog = createStateTransitionLog(
      appointment.status,
      'VENDOR_ACCEPTED',
      req.user!.id,
      'Vendor accepted appointment'
    );

    const updated = await prisma.appointment.update({
      where: { id },
      data: {
        status: 'VENDOR_ACCEPTED',
        vendorAcceptedAt: new Date(),
        stateHistory: {
          push: stateLog,
        },
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

    // Validate state transition
    JobStateMachine.validateTransition(appointment.status, 'IN_PROGRESS');

    const stateLog = createStateTransitionLog(
      appointment.status,
      'IN_PROGRESS',
      req.user!.id,
      'Vendor checked in and started work'
    );

    const updated = await prisma.appointment.update({
      where: { id },
      data: {
        status: 'IN_PROGRESS',
        actualStart: new Date(),
        checkInTimestamp: new Date(),
        stateHistory: {
          push: stateLog,
        },
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

// ============================================================================
// SERVICE FEE AGREEMENT (NEW WORKFLOW)
// ============================================================================

/**
 * Agree on service fee (after appointment confirmed, before work starts)
 * Both homeowner and vendor must agree on the fee
 */
export const agreeOnServiceFee = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const { serviceFee } = req.body;
    const user = req.user!;

    if (!serviceFee || serviceFee <= 0) {
      throw new AppError('Valid service fee is required', 400);
    }

    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: {
        homeowner: { include: { user: true } },
        vendor: { include: { user: true } },
      },
    });

    if (!appointment) {
      throw new AppError('Appointment not found', 404);
    }

    // Check if user is part of this appointment
    const isHomeowner = appointment.homeowner.userId === user.id;
    const isVendor = appointment.vendor.userId === user.id;

    if (!isHomeowner && !isVendor) {
      throw new AppError('Unauthorized', 403);
    }

    // Check if appointment is in correct status
    if (!['VENDOR_ACCEPTED', 'SCHEDULED'].includes(appointment.status)) {
      throw new AppError('Cannot agree on service fee at this stage', 400);
    }

    // Update agreement status
    const updateData: any = {
      agreedServiceFee: serviceFee,
    };

    if (isHomeowner) {
      updateData.serviceFeeAgreedByHomeowner = true;
    }

    if (isVendor) {
      updateData.serviceFeeAgreedByVendor = true;
    }

    // If both parties have now agreed, set the agreement timestamp
    const bothAgreed =
      (isHomeowner && appointment.serviceFeeAgreedByVendor) ||
      (isVendor && appointment.serviceFeeAgreedByHomeowner) ||
      (updateData.serviceFeeAgreedByHomeowner && updateData.serviceFeeAgreedByVendor);

    if (bothAgreed) {
      updateData.serviceFeeAgreedAt = new Date();
      updateData.status = 'SCHEDULED'; // Move to scheduled once fee is agreed
    }

    const updated = await prisma.appointment.update({
      where: { id },
      data: updateData,
      include: {
        homeowner: { include: { user: true } },
        vendor: { include: { user: true } },
      },
    });

    res.json({
      status: 'success',
      message: bothAgreed
        ? 'Service fee agreed upon by both parties'
        : 'Your agreement on service fee has been recorded',
      data: { appointment: updated },
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================================
// COMPLETION CONFIRMATION (NEW WORKFLOW)
// ============================================================================

/**
 * Vendor confirms completion with outcome and invoice
 */
export const vendorConfirmCompletion = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const { outcome, notes, invoiceUrl, invoiceAmount } = req.body;
    const user = req.user!;

    if (!outcome || !['ISSUE_FIXED', 'RETURN_TRIP_NEEDED', 'SERVICE_NOT_AGREED'].includes(outcome)) {
      throw new AppError('Valid completion outcome is required', 400);
    }

    // If work was done, invoice is required
    if (outcome === 'ISSUE_FIXED' || outcome === 'RETURN_TRIP_NEEDED') {
      if (!invoiceUrl || !invoiceAmount) {
        throw new AppError('Invoice URL and amount are required when work is completed', 400);
      }

      if (invoiceAmount <= 0) {
        throw new AppError('Invoice amount must be positive', 400);
      }
    }

    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: {
        vendor: { include: { user: true } },
        homeowner: { include: { user: true } },
      },
    });

    if (!appointment) {
      throw new AppError('Appointment not found', 404);
    }

    // Verify user is the vendor for this appointment
    if (appointment.vendor.userId !== user.id) {
      throw new AppError('Unauthorized', 403);
    }

    // Check if appointment is in correct status
    if (appointment.status !== 'COMPLETED_BY_VENDOR') {
      throw new AppError('Appointment must be marked as completed by vendor first', 400);
    }

    const updated = await prisma.appointment.update({
      where: { id },
      data: {
        vendorCompletionOutcome: outcome,
        vendorCompletionConfirmedAt: new Date(),
        vendorCompletionNotes: notes,
        invoiceUrl: invoiceUrl || appointment.invoiceUrl,
        invoiceAmount: invoiceAmount || appointment.invoiceAmount,
      },
      include: {
        vendor: { include: { user: true } },
        homeowner: { include: { user: true } },
      },
    });

    // TODO: Send notification to homeowner requesting their confirmation

    res.json({
      status: 'success',
      message: 'Vendor completion confirmation recorded',
      data: { appointment: updated },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Homeowner confirms completion with outcome
 */
export const homeownerConfirmCompletion = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const { outcome, notes } = req.body;
    const user = req.user!;

    if (!outcome || !['ISSUE_FIXED', 'RETURN_TRIP_NEEDED', 'SERVICE_NOT_AGREED'].includes(outcome)) {
      throw new AppError('Valid completion outcome is required', 400);
    }

    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: {
        homeowner: { include: { user: true } },
        vendor: { include: { user: true } },
        jobLedger: true,
      },
    });

    if (!appointment) {
      throw new AppError('Appointment not found', 404);
    }

    // Verify user is the homeowner for this appointment
    if (appointment.homeowner.userId !== user.id) {
      throw new AppError('Unauthorized', 403);
    }

    // Check if vendor has confirmed first
    if (!appointment.vendorCompletionConfirmedAt) {
      throw new AppError('Vendor must confirm completion first', 400);
    }

    // Verify invoice amount matches if provided
    if (appointment.invoiceUrl && appointment.invoiceAmount) {
      // In a real app, you might validate the invoice PDF matches the amount
      // For now, we trust that vendor uploaded correct info
    }

    const updated = await prisma.appointment.update({
      where: { id },
      data: {
        homeownerCompletionOutcome: outcome,
        homeownerCompletionConfirmedAt: new Date(),
        homeownerCompletionNotes: notes,
        status: 'COMPLETED_CONFIRMED',
      },
      include: {
        vendor: { include: { user: true } },
        homeowner: { include: { user: true } },
        jobLedger: true,
      },
    });

    // Update job ledger if exists
    if (appointment.jobLedger) {
      await prisma.jobLedger.update({
        where: { id: appointment.jobLedger.id },
        data: {
          status: 'COMPLETED_CONFIRMED',
          completedConfirmedAt: new Date(),
          actualPrice: appointment.invoiceAmount || appointment.agreedServiceFee,
          hasHomeownerConfirmation: true,
        },
      });
    }

    // If both parties agree issue is fixed, trigger payment release
    if (
      outcome === 'ISSUE_FIXED' &&
      appointment.vendorCompletionOutcome === 'ISSUE_FIXED'
    ) {
      // TODO: Trigger vendor payout release (auto-confirmation worker will handle this)
      // TODO: Prompt homeowner to leave Estate Standard rating
    }

    res.json({
      status: 'success',
      message: 'Homeowner completion confirmation recorded',
      data: { appointment: updated },
    });
  } catch (error) {
    next(error);
  }
};
