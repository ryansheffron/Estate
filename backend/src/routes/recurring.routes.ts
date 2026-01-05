// Estate Standard - Recurring Service Routes

import { Router } from 'express';
import * as recurringController from '../controllers/recurring.controller';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);
router.use(requireRole('HOMEOWNER'));

// Create recurring service
router.post('/', recurringController.createRecurringRule);

// Get recurring services
router.get('/', recurringController.getRecurringRules);
router.get('/:id', recurringController.getRecurringRuleById);

// Update/cancel recurring service
router.patch('/:id', recurringController.updateRecurringRule);
router.delete('/:id', recurringController.cancelRecurringRule);

export default router;
