// Estate Standard - Message Routes

import { Router } from 'express';
import * as messageController from '../controllers/message.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get messages
router.get('/', messageController.getMessages);
router.get('/:id', messageController.getMessageById);

// Send message
router.post('/', messageController.sendMessage);

// Mark as read
router.patch('/:id/read', messageController.markAsRead);

export default router;
