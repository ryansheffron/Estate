// Estate Standard - Vendor Controller (Stubs)

import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../server';

export const searchVendors = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    res.json({ status: 'success', data: { vendors: [] }, message: 'Vendor search - implement filters' });
  } catch (error) {
    next(error);
  }
};

export const getVendorById = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const vendor = await prisma.vendor.findUnique({
      where: { id },
      include: { user: true, services: { include: { category: true } } },
    });
    res.json({ status: 'success', data: { vendor } });
  } catch (error) {
    next(error);
  }
};

export const getVendorAvailability = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const slots = await prisma.availabilitySlot.findMany({
      where: { vendorId: id, isBooked: false },
      orderBy: { startTime: 'asc' },
    });
    res.json({ status: 'success', data: { slots } });
  } catch (error) {
    next(error);
  }
};

export const getDashboard = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.json({ status: 'success', message: 'Vendor dashboard - implement stats' });
  } catch (error) {
    next(error);
  }
};

export const updateAvailability = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.json({ status: 'success', message: 'Update availability - implement slot management' });
  } catch (error) {
    next(error);
  }
};

export const getPendingRequests = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.json({ status: 'success', data: { requests: [] } });
  } catch (error) {
    next(error);
  }
};

export const getEarnings = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.json({ status: 'success', data: { earnings: 0, payouts: [] } });
  } catch (error) {
    next(error);
  }
};
