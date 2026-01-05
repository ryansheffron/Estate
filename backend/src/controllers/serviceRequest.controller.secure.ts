// Estate Standard - Service Request Controller (Secure)
// IDOR vulnerabilities fixed with comprehensive authorization checks

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../server';
import {
  AppError,
  AuthorizationError,
  NotFoundError,
  ValidationError
} from '../middleware/errorHandler.enhanced';
import { asyncHandler } from '../middleware/errorHandler.enhanced';
import { triageServiceRequest } from '../ai/triage.service';
import { validate } from '../utils/validation';
import {
  createServiceRequestSchema,
  updateServiceRequestSchema
} from '../utils/validation';

/**
 * Authorization helper: Check if user owns this service request
 */
async function authorizeServiceRequestAccess(
  serviceRequestId: string,
  userId: string,
  userRole: string
): Promise<void> {
  const request = await prisma.serviceRequest.findUnique({
    where: { id: serviceRequestId },
    include: {
      homeowner: true,
      appointments: {
        include: {
          vendor: true,
        },
      },
    },
  });

  if (!request) {
    throw new NotFoundError('Service request not found');
  }

  if (userRole === 'HOMEOWNER') {
    const homeowner = await prisma.homeowner.findUnique({
      where: { userId },
    });

    if (!homeowner || request.homeownerId !== homeowner.id) {
      throw new AuthorizationError('You do not have permission to access this service request');
    }
  } else if (userRole === 'VENDOR') {
    const vendor = await prisma.vendor.findUnique({
      where: { userId },
    });

    // Vendor can only access if they have an appointment for this request
    const hasAppointment = request.appointments.some(
      (apt) => apt.vendorId === vendor?.id
    );

    if (!hasAppointment) {
      throw new AuthorizationError('You do not have permission to access this service request');
    }
  } else if (userRole !== 'ADMIN') {
    throw new AuthorizationError('Unauthorized access');
  }
}

/**
 * Authorization helper: Check if user owns this home
 */
async function authorizeHomeAccess(
  homeId: string,
  userId: string
): Promise<string> {
  const homeowner = await prisma.homeowner.findUnique({
    where: { userId },
  });

  if (!homeowner) {
    throw new NotFoundError('Homeowner profile not found');
  }

  const home = await prisma.home.findFirst({
    where: {
      id: homeId,
      homeownerId: homeowner.id,
    },
  });

  if (!home) {
    throw new AuthorizationError('You do not have permission to access this home');
  }

  return homeowner.id;
}

/**
 * Create a new service request
 * POST /api/service-requests
 * @access Homeowner only
 */
export const createRequest = asyncHandler(async (req: AuthRequest, res: Response) => {
  // Validate input
  const { value, error } = validate(createServiceRequestSchema, req.body);
  if (error) {
    throw new ValidationError(error);
  }

  const {
    homeId,
    categoryId,
    title,
    description,
    photos,
    preferredDate,
    preferredTimeSlot,
  } = value;

  // Authorization: Verify homeowner owns this home
  const homeownerId = await authorizeHomeAccess(homeId, req.user!.id);

  // Get category if provided
  let category = null;
  if (categoryId) {
    category = await prisma.maintenanceCategory.findUnique({
      where: { id: categoryId },
    });

    if (!category) {
      throw new NotFoundError('Category not found');
    }
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
      homeownerId,
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
      homeownerId,
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
});

/**
 * Get all service requests for current user
 * GET /api/service-requests
 * @access Homeowner, Vendor
 */
export const getRequests = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  let requests;

  if (user.role === 'HOMEOWNER') {
    const homeowner = await prisma.homeowner.findUnique({
      where: { userId: user.id },
    });

    if (!homeowner) {
      throw new NotFoundError('Homeowner profile not found');
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
                user: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                    phone: true,
                    // Never expose passwordHash
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  } else if (user.role === 'VENDOR') {
    const vendor = await prisma.vendor.findUnique({
      where: { userId: user.id },
    });

    if (!vendor) {
      throw new NotFoundError('Vendor profile not found');
    }

    // Vendors only see requests they have appointments for
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
        home: {
          select: {
            id: true,
            streetAddress: true,
            city: true,
            state: true,
            zipCode: true,
            // Don't expose homeownerId to vendors
          },
        },
        appointments: {
          where: {
            vendorId: vendor.id,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  } else if (user.role === 'ADMIN') {
    // Admins see all requests
    requests = await prisma.serviceRequest.findMany({
      include: {
        category: true,
        home: true,
        homeowner: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
              },
            },
          },
        },
        appointments: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  } else {
    throw new AuthorizationError('Unauthorized access');
  }

  res.json({
    status: 'success',
    data: { requests },
  });
});

/**
 * Get a specific service request by ID
 * GET /api/service-requests/:id
 * @access Homeowner (owner), Vendor (with appointment), Admin
 */
export const getRequestById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  // Authorization check BEFORE fetching full data
  await authorizeServiceRequestAccess(id, req.user!.id, req.user!.role);

  // Now fetch full data
  const request = await prisma.serviceRequest.findUnique({
    where: { id },
    include: {
      category: true,
      home: true,
      homeowner: {
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              // Never expose sensitive fields
            },
          },
        },
      },
      appointments: {
        include: {
          vendor: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                  phone: true,
                },
              },
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
    throw new NotFoundError('Service request not found');
  }

  res.json({
    status: 'success',
    data: { request },
  });
});

/**
 * Update a service request
 * PATCH /api/service-requests/:id
 * @access Homeowner (owner only)
 */
export const updateRequest = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  // Validate input
  const { value, error } = validate(updateServiceRequestSchema, req.body);
  if (error) {
    throw new ValidationError(error);
  }

  // Get request and verify ownership
  const request = await prisma.serviceRequest.findUnique({
    where: { id },
  });

  if (!request) {
    throw new NotFoundError('Service request not found');
  }

  // Authorization: Only homeowner who created this request can update it
  const homeowner = await prisma.homeowner.findUnique({
    where: { userId: req.user!.id },
  });

  if (!homeowner || request.homeownerId !== homeowner.id) {
    throw new AuthorizationError('You do not have permission to update this service request');
  }

  // Update
  const updated = await prisma.serviceRequest.update({
    where: { id },
    data: value,
    include: {
      category: true,
      home: true,
    },
  });

  res.json({
    status: 'success',
    data: { request: updated },
  });
});

/**
 * Delete a service request
 * DELETE /api/service-requests/:id
 * @access Homeowner (owner only), Admin
 */
export const deleteRequest = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  // Get request
  const request = await prisma.serviceRequest.findUnique({
    where: { id },
  });

  if (!request) {
    throw new NotFoundError('Service request not found');
  }

  // Authorization
  if (req.user!.role === 'HOMEOWNER') {
    const homeowner = await prisma.homeowner.findUnique({
      where: { userId: req.user!.id },
    });

    if (!homeowner || request.homeownerId !== homeowner.id) {
      throw new AuthorizationError('You do not have permission to delete this service request');
    }
  } else if (req.user!.role !== 'ADMIN') {
    throw new AuthorizationError('Only homeowners and admins can delete service requests');
  }

  // Delete (cascade will handle related records)
  await prisma.serviceRequest.delete({
    where: { id },
  });

  res.status(204).send();
});

/**
 * Get recommended vendors for a service request
 * GET /api/service-requests/:id/vendors
 * @access Homeowner (owner only)
 */
export const getRecommendedVendors = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  // Authorization check: Only homeowner who owns this request can get vendor recommendations
  await authorizeServiceRequestAccess(id, req.user!.id, req.user!.role);

  const request = await prisma.serviceRequest.findUnique({
    where: { id },
    include: {
      category: true,
      home: true,
    },
  });

  if (!request) {
    throw new NotFoundError('Service request not found');
  }

  // Find vendors
  const categorySlug = request.category?.slug || request.detectedCategory;

  if (!categorySlug) {
    throw new ValidationError('Cannot recommend vendors without a category');
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
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          // Never expose sensitive fields
        },
      },
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
        contact: {
          email: v.user.email,
          phone: v.user.phone,
        },
      })),
    },
  });
});
