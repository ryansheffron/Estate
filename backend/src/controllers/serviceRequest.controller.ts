// Estate Standard - Service Request Controller

import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../server';
import { AppError } from '../middleware/errorHandler';
import { triageServiceRequest } from '../ai/triage.service';

export const createRequest = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const {
      homeId,
      categoryId,
      title,
      description,
      photos,
      preferredDate,
      preferredTimeSlot,
    } = req.body;

    if (!homeId || !title || !description) {
      throw new AppError('Home ID, title, and description are required', 400);
    }

    // Verify homeowner owns this home
    const homeowner = await prisma.homeowner.findUnique({
      where: { userId: req.user!.id },
    });

    if (!homeowner) {
      throw new AppError('Homeowner profile not found', 404);
    }

    const home = await prisma.home.findFirst({
      where: {
        id: homeId,
        homeownerId: homeowner.id,
      },
    });

    if (!home) {
      throw new AppError('Home not found or unauthorized', 404);
    }

    // Get category if provided
    let category = null;
    if (categoryId) {
      category = await prisma.maintenanceCategory.findUnique({
        where: { id: categoryId },
      });
    }

    // AI Triage
    const triageResult = await triageServiceRequest({
      title,
      description,
      categoryName: category?.slug,
    });

    // Create service request
    const serviceRequest = await prisma.serviceRequest.create({
      data: {
        homeownerId: homeowner.id,
        homeId,
        categoryId,
        title,
        description,
        photos: photos || [],
        videos: [],
        urgency: triageResult.urgency,
        detectedCategory: triageResult.detectedCategory,
        replacementNeeded: triageResult.replacementNeeded,
        triageNotes: triageResult.triageNotes,
        status: 'SUBMITTED',
        preferredDate,
        preferredTimeSlot,
      },
      include: {
        category: true,
        home: true,
      },
    });

    // Create job ledger entry
    await prisma.jobLedger.create({
      data: {
        serviceRequestId: serviceRequest.id,
        homeownerId: homeowner.id,
        categoryName: category?.name || triageResult.detectedCategory || 'General',
        status: 'REQUEST_CREATED',
        requestCreatedAt: new Date(),
      },
    });

    // Create warranty item if replacement needed
    if (triageResult.replacementNeeded) {
      await prisma.warrantyItem.create({
        data: {
          homeId,
          serviceRequestId: serviceRequest.id,
          itemName: category?.name || triageResult.detectedCategory || 'Item',
          category: category?.slug || triageResult.detectedCategory || 'general',
          isActive: true,
        },
      });
    }

    // TODO: Send notification to homeowner with suggested response
    // TODO: If CRITICAL, notify emergency vendors

    res.status(201).json({
      status: 'success',
      data: {
        serviceRequest,
        triage: {
          urgency: triageResult.urgency,
          suggestedResponse: triageResult.suggestedResponse,
          escalate: triageResult.escalate,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getRequests = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = req.user!;

    let requests;

    if (user.role === 'HOMEOWNER') {
      const homeowner = await prisma.homeowner.findUnique({
        where: { userId: user.id },
      });

      if (!homeowner) {
        throw new AppError('Homeowner profile not found', 404);
      }

      requests = await prisma.serviceRequest.findMany({
        where: { homeownerId: homeowner.id },
        include: {
          category: true,
          home: true,
          appointments: {
            include: {
              vendor: {
                include: {
                  user: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    } else if (user.role === 'VENDOR') {
      // Vendors see requests matched to them
      const vendor = await prisma.vendor.findUnique({
        where: { userId: user.id },
      });

      if (!vendor) {
        throw new AppError('Vendor profile not found', 404);
      }

      requests = await prisma.serviceRequest.findMany({
        where: {
          appointments: {
            some: {
              vendorId: vendor.id,
            },
          },
        },
        include: {
          category: true,
          home: true,
          appointments: {
            where: {
              vendorId: vendor.id,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    } else {
      throw new AppError('Unauthorized', 403);
    }

    res.json({
      status: 'success',
      data: { requests },
    });
  } catch (error) {
    next(error);
  }
};

export const getRequestById = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;

    const request = await prisma.serviceRequest.findUnique({
      where: { id },
      include: {
        category: true,
        home: true,
        homeowner: {
          include: {
            user: true,
          },
        },
        appointments: {
          include: {
            vendor: {
              include: {
                user: true,
              },
            },
          },
        },
        warrantyItem: true,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });

    if (!request) {
      throw new AppError('Service request not found', 404);
    }

    // Authorization check
    const user = req.user!;
    if (user.role === 'HOMEOWNER') {
      const homeowner = await prisma.homeowner.findUnique({
        where: { userId: user.id },
      });

      if (request.homeownerId !== homeowner?.id) {
        throw new AppError('Unauthorized', 403);
      }
    }

    res.json({
      status: 'success',
      data: { request },
    });
  } catch (error) {
    next(error);
  }
};

export const updateRequest = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Get request
    const request = await prisma.serviceRequest.findUnique({
      where: { id },
    });

    if (!request) {
      throw new AppError('Service request not found', 404);
    }

    // Authorization
    const homeowner = await prisma.homeowner.findUnique({
      where: { userId: req.user!.id },
    });

    if (request.homeownerId !== homeowner?.id) {
      throw new AppError('Unauthorized', 403);
    }

    // Update
    const updated = await prisma.serviceRequest.update({
      where: { id },
      data: updates,
      include: {
        category: true,
        home: true,
      },
    });

    res.json({
      status: 'success',
      data: { request: updated },
    });
  } catch (error) {
    next(error);
  }
};

export const uploadPhotos = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    // TODO: Implement file upload to S3
    // For MVP, return placeholder
    res.json({
      status: 'success',
      message: 'Photo upload endpoint - implement S3 integration',
      data: {
        urls: ['https://placeholder.s3.amazonaws.com/photo1.jpg'],
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getRecommendedVendors = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;

    const request = await prisma.serviceRequest.findUnique({
      where: { id },
      include: {
        category: true,
        home: true,
      },
    });

    if (!request) {
      throw new AppError('Service request not found', 404);
    }

    // Find vendors:
    // 1. Verified status
    // 2. Service category matches
    // 3. Service area includes home's zip code
    // 4. Ordered by: sponsored (1 max), then rating

    const categorySlug = request.category?.slug || request.detectedCategory;

    if (!categorySlug) {
      throw new AppError('Cannot recommend vendors without a category', 400);
    }

    const category = await prisma.maintenanceCategory.findUnique({
      where: { slug: categorySlug },
    });

    if (!category) {
      return res.json({
        status: 'success',
        data: { vendors: [] },
      });
    }

    // Get all eligible vendors
    const eligibleVendors = await prisma.vendor.findMany({
      where: {
        status: 'VERIFIED',
        serviceZipCodes: {
          has: request.home.zipCode,
        },
        services: {
          some: {
            categoryId: category.id,
            isActive: true,
          },
        },
      },
      include: {
        user: true,
        services: {
          where: {
            categoryId: category.id,
          },
        },
        sponsorships: {
          where: {
            isActive: true,
            categories: {
              has: categorySlug,
            },
            zipCodes: {
              has: request.home.zipCode,
            },
          },
        },
      },
      take: 10, // Get pool of candidates
    });

    // Separate sponsored and organic
    const sponsored = eligibleVendors.filter((v) => v.sponsorships.length > 0);
    const organic = eligibleVendors.filter((v) => v.sponsorships.length === 0);

    // Sort organic by rating
    organic.sort((a, b) => b.averageRating - a.averageRating);

    // Take 1 sponsored (highest tier) + 2 organic (highest rated)
    const recommendedVendors = [
      ...sponsored.slice(0, 1),
      ...organic.slice(0, 2),
    ].slice(0, 3);

    res.json({
      status: 'success',
      data: {
        vendors: recommendedVendors.map((v) => ({
          id: v.id,
          businessName: v.businessName,
          averageRating: v.averageRating,
          totalReviews: v.totalReviews,
          service: v.services[0],
          isSponsored: v.sponsorships.length > 0,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
};
