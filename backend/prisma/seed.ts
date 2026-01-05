// Estate Standard - Database Seed
// Populates database with maintenance categories and sample DFW data

import { PrismaClient, MaintenanceCadence } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const MAINTENANCE_CATEGORIES = [
  {
    name: 'HVAC',
    slug: 'hvac',
    description: 'Heating, ventilation, and air conditioning systems',
    icon: 'wind',
    defaultCadence: MaintenanceCadence.QUARTERLY,
    recommendedTasks: [
      'Replace air filters',
      'Check refrigerant levels',
      'Clean condenser coils',
      'Inspect ductwork',
      'Test thermostat accuracy',
    ],
    seasonalNotes: 'Schedule before summer and winter seasons',
  },
  {
    name: 'Plumbing',
    slug: 'plumbing',
    description: 'Water systems, pipes, fixtures, and drains',
    icon: 'droplet',
    defaultCadence: MaintenanceCadence.SEMI_ANNUAL,
    recommendedTasks: [
      'Check for leaks',
      'Inspect water pressure',
      'Test shut-off valves',
      'Drain sediment from water heater',
      'Clean aerators and showerheads',
    ],
    seasonalNotes: 'Inspect before freezing temperatures',
  },
  {
    name: 'Electrical',
    slug: 'electrical',
    description: 'Electrical panels, outlets, wiring, and fixtures',
    icon: 'zap',
    defaultCadence: MaintenanceCadence.YEARLY,
    recommendedTasks: [
      'Test GFCI outlets',
      'Inspect circuit breaker panel',
      'Check for loose outlets',
      'Test surge protectors',
      'Verify proper grounding',
    ],
    seasonalNotes: null,
  },
  {
    name: 'Landscaping',
    slug: 'landscaping',
    description: 'Lawn care, plants, trees, and outdoor aesthetics',
    icon: 'leaf',
    defaultCadence: MaintenanceCadence.MONTHLY,
    recommendedTasks: [
      'Mow and edge lawn',
      'Trim shrubs and hedges',
      'Weed garden beds',
      'Apply fertilizer',
      'Inspect tree health',
    ],
    seasonalNotes: 'Frequency varies by season',
  },
  {
    name: 'Roof',
    slug: 'roof',
    description: 'Roof structure, shingles, flashing, and drainage',
    icon: 'home',
    defaultCadence: MaintenanceCadence.YEARLY,
    recommendedTasks: [
      'Inspect for damaged shingles',
      'Check flashing around chimneys',
      'Clear debris from roof',
      'Inspect attic for leaks',
      'Check roof ventilation',
    ],
    seasonalNotes: 'Inspect after major storms',
  },
  {
    name: 'Gutters & Downspouts',
    slug: 'gutters-downspouts',
    description: 'Gutter systems and water drainage',
    icon: 'filter',
    defaultCadence: MaintenanceCadence.SEMI_ANNUAL,
    recommendedTasks: [
      'Clean out debris',
      'Check for leaks',
      'Ensure proper slope',
      'Inspect downspout extensions',
      'Tighten loose hangers',
    ],
    seasonalNotes: 'Clean in spring and fall',
  },
  {
    name: 'Water Heater',
    slug: 'water-heater',
    description: 'Water heating systems (tank and tankless)',
    icon: 'thermometer',
    defaultCadence: MaintenanceCadence.YEARLY,
    recommendedTasks: [
      'Drain sediment from tank',
      'Test pressure relief valve',
      'Check temperature setting',
      'Inspect for leaks',
      'Check anode rod (tank heaters)',
    ],
    seasonalNotes: null,
  },
  {
    name: 'Appliances',
    slug: 'appliances',
    description: 'Kitchen and laundry appliances',
    icon: 'package',
    defaultCadence: MaintenanceCadence.QUARTERLY,
    recommendedTasks: [
      'Clean refrigerator coils',
      'Clean dishwasher filter',
      'Check washing machine hoses',
      'Clean dryer vent',
      'Inspect range hood filter',
    ],
    seasonalNotes: null,
  },
  {
    name: 'Sprinkler / Irrigation',
    slug: 'sprinkler-irrigation',
    description: 'Automatic sprinkler and irrigation systems',
    icon: 'droplets',
    defaultCadence: MaintenanceCadence.SEMI_ANNUAL,
    recommendedTasks: [
      'Test all zones',
      'Check for leaks',
      'Adjust spray patterns',
      'Clean or replace heads',
      'Winterize system (seasonal)',
    ],
    seasonalNotes: 'Activate in spring, winterize in fall',
  },
  {
    name: 'Foundation Maintenance',
    slug: 'foundation-maintenance',
    description: 'Foundation, basement, and structural integrity',
    icon: 'layers',
    defaultCadence: MaintenanceCadence.YEARLY,
    recommendedTasks: [
      'Inspect for cracks',
      'Check for water intrusion',
      'Ensure proper grading',
      'Inspect basement walls',
      'Monitor foundation movement',
    ],
    seasonalNotes: 'Inspect after seasonal weather changes',
  },
  {
    name: 'Windows, Screens & Patio Doors',
    slug: 'windows-screens-patio-doors',
    description: 'Windows, screens, and sliding doors',
    icon: 'square',
    defaultCadence: MaintenanceCadence.SEMI_ANNUAL,
    recommendedTasks: [
      'Clean windows and tracks',
      'Inspect weatherstripping',
      'Lubricate sliding mechanisms',
      'Check for broken seals',
      'Repair or replace screens',
    ],
    seasonalNotes: 'Clean before and after winter',
  },
  {
    name: 'Doors / Locks',
    slug: 'doors-locks',
    description: 'Entry doors, locks, and security hardware',
    icon: 'lock',
    defaultCadence: MaintenanceCadence.SEMI_ANNUAL,
    recommendedTasks: [
      'Lubricate hinges',
      'Tighten loose hardware',
      'Check weatherstripping',
      'Test deadbolts',
      'Adjust door alignment',
    ],
    seasonalNotes: null,
  },
  {
    name: 'Fireplace',
    slug: 'fireplace',
    description: 'Fireplaces, chimneys, and venting',
    icon: 'flame',
    defaultCadence: MaintenanceCadence.YEARLY,
    recommendedTasks: [
      'Inspect chimney for creosote buildup',
      'Check flue operation',
      'Inspect chimney cap',
      'Clean fireplace',
      'Test carbon monoxide detectors',
    ],
    seasonalNotes: 'Service before winter use',
  },
  {
    name: 'Smoke Detectors',
    slug: 'smoke-detectors',
    description: 'Smoke and carbon monoxide detectors',
    icon: 'alert-circle',
    defaultCadence: MaintenanceCadence.SEMI_ANNUAL,
    recommendedTasks: [
      'Test all detectors',
      'Replace batteries',
      'Clean detector sensors',
      'Check expiration dates',
      'Replace units as needed',
    ],
    seasonalNotes: 'Test when clocks change',
  },
  {
    name: 'Garage Overhead Door',
    slug: 'garage-overhead-door',
    description: 'Garage doors and opener systems',
    icon: 'maximize',
    defaultCadence: MaintenanceCadence.SEMI_ANNUAL,
    recommendedTasks: [
      'Lubricate moving parts',
      'Test auto-reverse safety',
      'Tighten hardware',
      'Check balance',
      'Inspect rollers and cables',
    ],
    seasonalNotes: null,
  },
  {
    name: 'Drainage Systems',
    slug: 'drainage-systems',
    description: 'Surface drainage, French drains, and sump pumps',
    icon: 'trending-down',
    defaultCadence: MaintenanceCadence.SEMI_ANNUAL,
    recommendedTasks: [
      'Clear drain grates',
      'Test sump pump',
      'Check French drain flow',
      'Inspect for standing water',
      'Clean catch basins',
    ],
    seasonalNotes: 'Inspect before rainy season',
  },
  {
    name: 'Grading & Drainage',
    slug: 'grading-drainage',
    description: 'Yard grading and water flow away from home',
    icon: 'activity',
    defaultCadence: MaintenanceCadence.YEARLY,
    recommendedTasks: [
      'Ensure proper slope away from foundation',
      'Fill low spots',
      'Check for erosion',
      'Inspect drainage paths',
      'Adjust soil as needed',
    ],
    seasonalNotes: 'Check after heavy rains',
  },
  {
    name: 'Paint & Stain',
    slug: 'paint-stain',
    description: 'Interior and exterior painted/stained surfaces',
    icon: 'edit-3',
    defaultCadence: MaintenanceCadence.AS_NEEDED,
    recommendedTasks: [
      'Inspect for peeling or cracking',
      'Touch up damaged areas',
      'Clean surfaces',
      'Check caulking around trim',
      'Plan full repaints as needed',
    ],
    seasonalNotes: 'Exterior: every 5-7 years; Interior: every 7-10 years',
  },
  {
    name: 'Drywall',
    slug: 'drywall',
    description: 'Interior wall and ceiling drywall',
    icon: 'layout',
    defaultCadence: MaintenanceCadence.AS_NEEDED,
    recommendedTasks: [
      'Inspect for cracks',
      'Check for water damage',
      'Repair nail pops',
      'Patch holes',
      'Monitor for settling cracks',
    ],
    seasonalNotes: null,
  },
  {
    name: 'Caulking',
    slug: 'caulking',
    description: 'Caulk and sealants around home',
    icon: 'minus',
    defaultCadence: MaintenanceCadence.YEARLY,
    recommendedTasks: [
      'Inspect bathroom caulking',
      'Check kitchen sink seals',
      'Inspect window caulking',
      'Check door frame seals',
      'Re-caulk as needed',
    ],
    seasonalNotes: null,
  },
  {
    name: 'Floor Covering',
    slug: 'floor-covering',
    description: 'Hardwood, tile, carpet, and other flooring',
    icon: 'grid',
    defaultCadence: MaintenanceCadence.QUARTERLY,
    recommendedTasks: [
      'Deep clean carpets',
      'Refinish hardwood as needed',
      'Re-grout tile',
      'Inspect for damage',
      'Professional cleaning as needed',
    ],
    seasonalNotes: null,
  },
  {
    name: 'Cabinets',
    slug: 'cabinets',
    description: 'Kitchen and bathroom cabinets',
    icon: 'inbox',
    defaultCadence: MaintenanceCadence.YEARLY,
    recommendedTasks: [
      'Tighten hinges',
      'Adjust doors',
      'Lubricate slides',
      'Clean and polish',
      'Check for water damage',
    ],
    seasonalNotes: null,
  },
  {
    name: 'Countertops',
    slug: 'countertops',
    description: 'Kitchen and bathroom countertops',
    icon: 'layers',
    defaultCadence: MaintenanceCadence.YEARLY,
    recommendedTasks: [
      'Seal granite/marble',
      'Clean grout',
      'Check for cracks',
      'Re-caulk sink edges',
      'Polish as needed',
    ],
    seasonalNotes: 'Seal natural stone annually',
  },
  {
    name: 'Insulation',
    slug: 'insulation',
    description: 'Attic and wall insulation',
    icon: 'shield',
    defaultCadence: MaintenanceCadence.YEARLY,
    recommendedTasks: [
      'Inspect attic insulation',
      'Check for settling',
      'Look for pest damage',
      'Ensure proper R-value',
      'Check vapor barriers',
    ],
    seasonalNotes: null,
  },
  {
    name: 'Attic Access',
    slug: 'attic-access',
    description: 'Attic access, ventilation, and condition',
    icon: 'arrow-up',
    defaultCadence: MaintenanceCadence.SEMI_ANNUAL,
    recommendedTasks: [
      'Inspect for leaks',
      'Check ventilation',
      'Look for pests',
      'Inspect insulation',
      'Check for mold',
    ],
    seasonalNotes: 'Inspect after extreme weather',
  },
  {
    name: 'Vents',
    slug: 'vents',
    description: 'Dryer vents, bathroom vents, and exhaust systems',
    icon: 'wind',
    defaultCadence: MaintenanceCadence.SEMI_ANNUAL,
    recommendedTasks: [
      'Clean dryer vent',
      'Test bathroom fan',
      'Clean range hood',
      'Inspect vent covers',
      'Check for blockages',
    ],
    seasonalNotes: null,
  },
  {
    name: 'Stairs',
    slug: 'stairs',
    description: 'Interior and exterior stairs',
    icon: 'trending-up',
    defaultCadence: MaintenanceCadence.YEARLY,
    recommendedTasks: [
      'Tighten handrails',
      'Check balusters',
      'Inspect treads for damage',
      'Lubricate squeaks',
      'Ensure lighting works',
    ],
    seasonalNotes: null,
  },
  {
    name: 'Wood Trim',
    slug: 'wood-trim',
    description: 'Baseboards, crown molding, and trim',
    icon: 'box',
    defaultCadence: MaintenanceCadence.YEARLY,
    recommendedTasks: [
      'Inspect for damage',
      'Touch up paint/stain',
      'Caulk gaps',
      'Check for warping',
      'Clean and polish',
    ],
    seasonalNotes: null,
  },
  {
    name: 'Rough Carpentry',
    slug: 'rough-carpentry',
    description: 'Structural framing and carpentry',
    icon: 'tool',
    defaultCadence: MaintenanceCadence.YEARLY,
    recommendedTasks: [
      'Inspect for wood rot',
      'Check for pest damage',
      'Look for settling issues',
      'Inspect support beams',
      'Check deck framing',
    ],
    seasonalNotes: null,
  },
  {
    name: 'Brick',
    slug: 'brick',
    description: 'Brick exterior and masonry',
    icon: 'grid',
    defaultCadence: MaintenanceCadence.YEARLY,
    recommendedTasks: [
      'Inspect mortar joints',
      'Check for cracking',
      'Clean brick surface',
      'Repoint as needed',
      'Check weep holes',
    ],
    seasonalNotes: null,
  },
  {
    name: 'Concrete',
    slug: 'concrete',
    description: 'Driveways, patios, and concrete surfaces',
    icon: 'square',
    defaultCadence: MaintenanceCadence.YEARLY,
    recommendedTasks: [
      'Seal concrete surfaces',
      'Fill cracks',
      'Clean stains',
      'Check for settling',
      'Inspect for spalling',
    ],
    seasonalNotes: 'Seal before winter',
  },
  {
    name: 'Ceramic Tile',
    slug: 'ceramic-tile',
    description: 'Tile floors, walls, and backsplashes',
    icon: 'grid',
    defaultCadence: MaintenanceCadence.YEARLY,
    recommendedTasks: [
      'Clean grout',
      'Seal grout',
      'Replace cracked tiles',
      'Re-caulk edges',
      'Check for loose tiles',
    ],
    seasonalNotes: null,
  },
  {
    name: 'Mirrors',
    slug: 'mirrors',
    description: 'Bathroom and decorative mirrors',
    icon: 'square',
    defaultCadence: MaintenanceCadence.AS_NEEDED,
    recommendedTasks: [
      'Clean and polish',
      'Check mounting',
      'Inspect for de-silvering',
      'Tighten hardware',
    ],
    seasonalNotes: null,
  },
  {
    name: 'Smart Home Equipment',
    slug: 'smart-home-equipment',
    description: 'Smart thermostats, locks, cameras, and systems',
    icon: 'smartphone',
    defaultCadence: MaintenanceCadence.QUARTERLY,
    recommendedTasks: [
      'Update firmware',
      'Test connectivity',
      'Replace batteries',
      'Check camera views',
      'Review automation rules',
    ],
    seasonalNotes: null,
  },
  {
    name: 'Structured Wiring System',
    slug: 'structured-wiring-system',
    description: 'Network wiring, cable, and data systems',
    icon: 'link',
    defaultCadence: MaintenanceCadence.YEARLY,
    recommendedTasks: [
      'Test network speed',
      'Organize cable management',
      'Update router firmware',
      'Check all ports',
      'Label cables',
    ],
    seasonalNotes: null,
  },
  {
    name: 'Gas Shut Offs',
    slug: 'gas-shut-offs',
    description: 'Gas line shut-off valves',
    icon: 'x-circle',
    defaultCadence: MaintenanceCadence.YEARLY,
    recommendedTasks: [
      'Locate all shut-offs',
      'Test operation',
      'Clear access',
      'Label valves',
      'Educate household members',
    ],
    seasonalNotes: null,
  },
  {
    name: 'Mold Disclosure',
    slug: 'mold-disclosure',
    description: 'Mold inspection and prevention',
    icon: 'alert-triangle',
    defaultCadence: MaintenanceCadence.YEARLY,
    recommendedTasks: [
      'Inspect for visible mold',
      'Check moisture levels',
      'Inspect HVAC for mold',
      'Clean bathroom vents',
      'Address water leaks immediately',
    ],
    seasonalNotes: 'Inspect in humid seasons',
  },
];

async function seed() {
  console.log('🌱 Seeding Estate Standard database...\n');

  // 1. Create maintenance categories
  console.log('📋 Creating maintenance categories...');
  for (const category of MAINTENANCE_CATEGORIES) {
    await prisma.maintenanceCategory.upsert({
      where: { slug: category.slug },
      update: category,
      create: category,
    });
  }
  console.log(`✅ Created ${MAINTENANCE_CATEGORIES.length} maintenance categories\n`);

  // 2. Create sample admin user
  console.log('👤 Creating admin user...');
  const adminPassword = await bcrypt.hash('EstateAdmin2026!', 10);
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@estatestandard.com' },
    update: {},
    create: {
      email: 'admin@estatestandard.com',
      phone: '+14695551000',
      passwordHash: adminPassword,
      role: 'ADMIN',
      status: 'ACTIVE',
      firstName: 'Estate',
      lastName: 'Admin',
    },
  });
  console.log('✅ Admin user created (admin@estatestandard.com / EstateAdmin2026!)\n');

  // 3. Create sample homeowner
  console.log('🏡 Creating sample homeowner...');
  const homeownerPassword = await bcrypt.hash('Homeowner123!', 10);
  const homeownerUser = await prisma.user.upsert({
    where: { email: 'sarah.mitchell@example.com' },
    update: {},
    create: {
      email: 'sarah.mitchell@example.com',
      phone: '+14695551001',
      passwordHash: homeownerPassword,
      role: 'HOMEOWNER',
      status: 'ACTIVE',
      firstName: 'Sarah',
      lastName: 'Mitchell',
    },
  });

  const homeowner = await prisma.homeowner.upsert({
    where: { userId: homeownerUser.id },
    update: {},
    create: {
      userId: homeownerUser.id,
      subscriptionTier: 'annual',
      subscriptionStatus: 'active',
      preferredContactMethod: 'in_app',
    },
  });

  // Create sample home in Northlake
  const home = await prisma.home.create({
    data: {
      homeownerId: homeowner.id,
      streetAddress: '1234 Oak Ridge Drive',
      city: 'Northlake',
      state: 'TX',
      zipCode: '76262',
      country: 'USA',
      propertyType: 'single_family',
      squareFeet: 3500,
      bedrooms: 4,
      bathrooms: 3.5,
      yearBuilt: 2018,
      isPrimary: true,
      photos: [],
    },
  });

  console.log('✅ Sample homeowner created (sarah.mitchell@example.com / Homeowner123!)\n');

  // 4. Initialize maintenance records for the home
  console.log('🔧 Initializing maintenance records for sample home...');
  const hvacCategory = await prisma.maintenanceCategory.findUnique({
    where: { slug: 'hvac' },
  });
  const plumbingCategory = await prisma.maintenanceCategory.findUnique({
    where: { slug: 'plumbing' },
  });
  const landscapingCategory = await prisma.maintenanceCategory.findUnique({
    where: { slug: 'landscaping' },
  });

  if (hvacCategory) {
    await prisma.maintenanceRecord.create({
      data: {
        homeId: home.id,
        categoryId: hvacCategory.id,
        cadence: 'QUARTERLY',
        lastCompletedAt: new Date('2025-12-15'),
        nextDueAt: new Date('2026-03-15'),
        completedBy: 'Cool Breeze HVAC',
        notes: 'Changed filters, checked refrigerant levels. System running optimally.',
        photos: [],
      },
    });
  }

  if (plumbingCategory) {
    await prisma.maintenanceRecord.create({
      data: {
        homeId: home.id,
        categoryId: plumbingCategory.id,
        cadence: 'SEMI_ANNUAL',
        lastCompletedAt: new Date('2025-10-01'),
        nextDueAt: new Date('2026-04-01'),
        completedBy: 'DFW Plumbing Pros',
        notes: 'Inspected all fixtures, no leaks found. Drained water heater sediment.',
        photos: [],
      },
    });
  }

  if (landscapingCategory) {
    await prisma.maintenanceRecord.create({
      data: {
        homeId: home.id,
        categoryId: landscapingCategory.id,
        cadence: 'MONTHLY',
        lastCompletedAt: new Date('2025-12-20'),
        nextDueAt: new Date('2026-01-20'),
        completedBy: 'Green Horizon Landscaping',
        notes: 'Mowed, edged, trimmed shrubs. Applied winter fertilizer.',
        photos: [],
      },
    });
  }

  console.log('✅ Maintenance records initialized\n');

  // 5. Create sample vendors (DFW area)
  console.log('🔨 Creating sample vendors for DFW...');

  // Vendor 1: Cool Breeze HVAC
  const vendor1Password = await bcrypt.hash('Vendor123!', 10);
  const vendor1User = await prisma.user.create({
    data: {
      email: 'contact@coolbreezehvac.com',
      phone: '+14695552001',
      passwordHash: vendor1Password,
      role: 'VENDOR',
      status: 'ACTIVE',
      firstName: 'James',
      lastName: 'Cooper',
    },
  });

  const vendor1 = await prisma.vendor.create({
    data: {
      userId: vendor1User.id,
      businessName: 'Cool Breeze HVAC',
      businessPhone: '+14695552001',
      businessEmail: 'contact@coolbreezehvac.com',
      serviceZipCodes: ['76262', '76177', '76092', '76248'],
      serviceCities: ['Northlake', 'Trophy Club', 'Roanoke', 'Keller'],
      serviceRadius: 25,
      status: 'VERIFIED',
      verifiedAt: new Date(),
      averageRating: 4.8,
      totalReviews: 127,
      totalJobs: 342,
      autoAcceptBookings: true,
    },
  });

  if (hvacCategory) {
    await prisma.vendorService.create({
      data: {
        vendorId: vendor1.id,
        categoryId: hvacCategory.id,
        basePrice: 150,
        priceNote: 'Starting at $150 for maintenance, call for repairs',
        supportsEmergency: true,
        supportsRecurring: true,
        estimatedDuration: 90,
      },
    });
  }

  // Vendor 2: DFW Plumbing Pros
  const vendor2User = await prisma.user.create({
    data: {
      email: 'info@dfwplumbingpros.com',
      phone: '+14695552002',
      passwordHash: vendor1Password,
      role: 'VENDOR',
      status: 'ACTIVE',
      firstName: 'Maria',
      lastName: 'Rodriguez',
    },
  });

  const vendor2 = await prisma.vendor.create({
    data: {
      userId: vendor2User.id,
      businessName: 'DFW Plumbing Pros',
      businessPhone: '+14695552002',
      businessEmail: 'info@dfwplumbingpros.com',
      serviceZipCodes: ['76262', '76177', '76092', '76051', '76244'],
      serviceCities: ['Fort Worth', 'Keller', 'Southlake', 'Northlake'],
      serviceRadius: 30,
      status: 'VERIFIED',
      verifiedAt: new Date(),
      averageRating: 4.9,
      totalReviews: 203,
      totalJobs: 521,
      autoAcceptBookings: false,
    },
  });

  if (plumbingCategory) {
    await prisma.vendorService.create({
      data: {
        vendorId: vendor2.id,
        categoryId: plumbingCategory.id,
        basePrice: 120,
        hourlyRate: 95,
        priceNote: 'Starting at $120 service call + $95/hr',
        supportsEmergency: true,
        supportsRecurring: true,
        estimatedDuration: 60,
      },
    });
  }

  // Vendor 3: Green Horizon Landscaping
  const vendor3User = await prisma.user.create({
    data: {
      email: 'service@greenhorizonlandscaping.com',
      phone: '+14695552003',
      passwordHash: vendor1Password,
      role: 'VENDOR',
      status: 'ACTIVE',
      firstName: 'David',
      lastName: 'Chen',
    },
  });

  const vendor3 = await prisma.vendor.create({
    data: {
      userId: vendor3User.id,
      businessName: 'Green Horizon Landscaping',
      businessPhone: '+14695552003',
      businessEmail: 'service@greenhorizonlandscaping.com',
      serviceZipCodes: ['76262', '76266', '76226'],
      serviceCities: ['Northlake', 'Argyle', 'Denton'],
      serviceRadius: 20,
      status: 'VERIFIED',
      verifiedAt: new Date(),
      averageRating: 4.7,
      totalReviews: 89,
      totalJobs: 156,
      autoAcceptBookings: true,
    },
  });

  if (landscapingCategory) {
    await prisma.vendorService.create({
      data: {
        vendorId: vendor3.id,
        categoryId: landscapingCategory.id,
        basePrice: 85,
        priceNote: 'Monthly plans starting at $85',
        supportsEmergency: false,
        supportsRecurring: true,
        estimatedDuration: 120,
      },
    });
  }

  console.log('✅ Created 3 sample vendors (DFW area)\n');

  // 6. Create sample availability slots for vendors
  console.log('📅 Creating sample availability slots...');
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(8, 0, 0, 0);

  for (let i = 0; i < 5; i++) {
    const slotStart = new Date(tomorrow);
    slotStart.setDate(slotStart.getDate() + i);

    // Morning slot
    await prisma.availabilitySlot.create({
      data: {
        vendorId: vendor1.id,
        startTime: new Date(slotStart.setHours(8, 0, 0, 0)),
        endTime: new Date(slotStart.setHours(10, 0, 0, 0)),
        isBooked: false,
      },
    });

    // Afternoon slot
    await prisma.availabilitySlot.create({
      data: {
        vendorId: vendor1.id,
        startTime: new Date(slotStart.setHours(13, 0, 0, 0)),
        endTime: new Date(slotStart.setHours(15, 0, 0, 0)),
        isBooked: false,
      },
    });
  }

  console.log('✅ Availability slots created\n');

  // 7. Create sample sponsorship
  console.log('💎 Creating sample sponsorship...');
  await prisma.sponsorship.create({
    data: {
      vendorId: vendor1.id,
      tier: 'FEATURED',
      zipCodes: ['76262', '76177'],
      categories: ['hvac'],
      monthlyRate: 1000,
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
      isActive: true,
      impressions: 1247,
      clicks: 89,
      bookings: 12,
    },
  });

  console.log('✅ Sponsorship created\n');

  console.log('🎉 Seeding complete!\n');
  console.log('──────────────────────────────────────');
  console.log('Test Credentials:');
  console.log('──────────────────────────────────────');
  console.log('Admin:');
  console.log('  Email: admin@estatestandard.com');
  console.log('  Password: EstateAdmin2026!');
  console.log('');
  console.log('Homeowner:');
  console.log('  Email: sarah.mitchell@example.com');
  console.log('  Password: Homeowner123!');
  console.log('  Home: 1234 Oak Ridge Drive, Northlake, TX');
  console.log('');
  console.log('Vendors:');
  console.log('  1. contact@coolbreezehvac.com (Cool Breeze HVAC)');
  console.log('  2. info@dfwplumbingpros.com (DFW Plumbing Pros)');
  console.log('  3. service@greenhorizonlandscaping.com (Green Horizon)');
  console.log('  All vendor passwords: Vendor123!');
  console.log('──────────────────────────────────────\n');
}

seed()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
