// Estate Standard - Appointment Routes

import { Router } from 'express';
import * as appointmentController from '../controllers/appointment.controller';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Create appointment (instant booking or request)
router.post('/', appointmentController.createAppointment);

// Get appointments
router.get('/', appointmentController.getAppointments);
router.get('/:id', appointmentController.getAppointmentById);

// Service fee agreement (after appointment confirmed)
router.patch('/:id/agree-service-fee', appointmentController.agreeOnServiceFee);

// Vendor actions
router.patch('/:id/accept', requireRole('VENDOR'), appointmentController.acceptAppointment);
router.patch('/:id/start', requireRole('VENDOR'), appointmentController.startAppointment);
router.patch('/:id/complete', requireRole('VENDOR'), appointmentController.completeAppointment);
router.patch('/:id/vendor-confirm-completion', requireRole('VENDOR'), appointmentController.vendorConfirmCompletion);

// Homeowner actions
router.patch('/:id/confirm-completion', requireRole('HOMEOWNER'), appointmentController.confirmCompletion);
router.patch('/:id/homeowner-confirm-completion', requireRole('HOMEOWNER'), appointmentController.homeownerConfirmCompletion);
router.post('/:id/dispute', requireRole('HOMEOWNER'), appointmentController.disputeAppointment);

// Both parties
router.patch('/:id/reschedule', appointmentController.rescheduleAppointment);
router.patch('/:id/cancel', appointmentController.cancelAppointment);

export default router;
