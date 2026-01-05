// Estate Standard - Service Request Routes

import { Router } from 'express';
import * as serviceRequestController from '../controllers/serviceRequest.controller';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Homeowner routes
router.post('/', requireRole('HOMEOWNER'), serviceRequestController.createRequest);
router.get('/', serviceRequestController.getRequests); // Get user's requests
router.get('/:id', serviceRequestController.getRequestById);
router.patch('/:id', serviceRequestController.updateRequest);
router.post('/:id/photos', requireRole('HOMEOWNER'), serviceRequestController.uploadPhotos);

// Get recommended vendors for a request
router.get('/:id/vendors', serviceRequestController.getRecommendedVendors);

export default router;
