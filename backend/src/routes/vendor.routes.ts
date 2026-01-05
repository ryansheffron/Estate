// Estate Standard - Vendor Routes

import { Router } from 'express';
import * as vendorController from '../controllers/vendor.controller';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

// Public vendor search
router.get('/search', vendorController.searchVendors);
router.get('/:id', vendorController.getVendorById);
router.get('/:id/availability', vendorController.getVendorAvailability);

// Vendor-only routes
router.use(authenticate);
router.use(requireRole('VENDOR'));

router.get('/dashboard', vendorController.getDashboard);
router.patch('/availability', vendorController.updateAvailability);
router.get('/requests', vendorController.getPendingRequests);
router.get('/earnings', vendorController.getEarnings);

export default router;
