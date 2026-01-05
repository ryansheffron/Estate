// Estate Standard - Maintenance Controller

import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../server';
import { AppError } from '../middleware/errorHandler';

export const getCategories = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const categories = await prisma.maintenanceCategory.findMany({
      orderBy: { name: 'asc' },
    });

    res.json({
      status: 'success',
      data: { categories },
    });
  } catch (error) {
    next(error);
  }
};

export const getHomeMaintenance = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { homeId } = req.params;

    const records = await prisma.maintenanceRecord.findMany({
      where: { homeId },
      include: {
        category: true,
      },
      orderBy: { nextDueAt: 'asc' },
    });

    res.json({
      status: 'success',
      data: { records },
    });
  } catch (error) {
    next(error);
  }
};

export const getUpcomingMaintenance = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { homeId } = req.params;

    const upcoming = await prisma.maintenanceRecord.findMany({
      where: {
        homeId,
        nextDueAt: {
          lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Next 30 days
        },
      },
      include: {
        category: true,
      },
      orderBy: { nextDueAt: 'asc' },
    });

    res.json({
      status: 'success',
      data: { upcoming },
    });
  } catch (error) {
    next(error);
  }
};

export const markMaintenanceComplete = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { homeId, categoryId } = req.params;
    const { completedBy, notes, photos, cost } = req.body;

    const category = await prisma.maintenanceCategory.findUnique({
      where: { id: categoryId },
    });

    if (!category) {
      throw new AppError('Category not found', 404);
    }

    // Calculate next due date based on cadence
    const now = new Date();
    let nextDue = new Date(now);

    switch (category.defaultCadence) {
      case 'MONTHLY':
        nextDue.setMonth(nextDue.getMonth() + 1);
        break;
      case 'QUARTERLY':
        nextDue.setMonth(nextDue.getMonth() + 3);
        break;
      case 'SEMI_ANNUAL':
        nextDue.setMonth(nextDue.getMonth() + 6);
        break;
      case 'YEARLY':
        nextDue.setFullYear(nextDue.getFullYear() + 1);
        break;
    }

    const record = await prisma.maintenanceRecord.upsert({
      where: {
        homeId_categoryId: {
          homeId,
          categoryId,
        },
      },
      update: {
        lastCompletedAt: now,
        nextDueAt: nextDue,
        completedBy,
        notes,
        photos: photos || [],
        cost,
      },
      create: {
        homeId,
        categoryId,
        cadence: category.defaultCadence,
        lastCompletedAt: now,
        nextDueAt: nextDue,
        completedBy,
        notes,
        photos: photos || [],
        cost,
      },
      include: {
        category: true,
      },
    });

    res.json({
      status: 'success',
      data: { record },
    });
  } catch (error) {
    next(error);
  }
};
