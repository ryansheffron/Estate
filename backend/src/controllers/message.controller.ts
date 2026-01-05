// Estate Standard - Message Controller (Stubs)

import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';

export const getMessages = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.json({ status: 'success', data: { messages: [] } });
  } catch (error) {
    next(error);
  }
};

export const getMessageById = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.json({ status: 'success', data: { message: null } });
  } catch (error) {
    next(error);
  }
};

export const sendMessage = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.json({ status: 'success', message: 'Send message - implement logic' });
  } catch (error) {
    next(error);
  }
};

export const markAsRead = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.json({ status: 'success', message: 'Mark as read' });
  } catch (error) {
    next(error);
  }
};
