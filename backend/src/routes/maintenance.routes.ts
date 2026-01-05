// Estate Standard - Maintenance Routes

import { Router } from 'express';
import * as maintenanceController from '../controllers/maintenance.controller';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);
router.use(requireRole('HOMEOWNER'));

// Get all maintenance categories
router.get('/categories', maintenanceController.getCategories);

// Get home maintenance overview
router.get('/homes/:homeId', maintenanceController.getHomeMaintenance);

// Get upcoming maintenance
router.get('/homes/:homeId/upcoming', maintenanceController.getUpcomingMaintenance);

// Mark maintenance as complete
router.post('/homes/:homeId/categories/:categoryId/complete', maintenanceController.markMaintenanceComplete);

export default router;
