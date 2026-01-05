// Estate Standard - Japandi Design System
// Japanese minimalism + Scandinavian warmth

export const theme = {
  // ============================================================================
  // COLORS - Japandi Palette
  // ============================================================================
  colors: {
    // Primary - Warm neutrals
    sand: '#F5F3F0',        // Soft sand background
    stone: '#E8E6E3',       // Stone gray
    linen: '#FAF9F7',       // Warm white
    warmGray: '#D4D2CF',    // Warm gray

    // Grounding tones
    charcoal: '#3A3A3A',    // Charcoal text
    ink: '#2C2C2C',         // Deep ink
    mutedNavy: '#4A5F7A',   // Muted navy accent
    slate: '#5A5A5A',       // Slate gray

    // Natural accents
    wood: '#A68A6D',        // Warm wood tone
    clay: '#C9A88A',        // Terracotta clay
    mossGreen: '#8B9A7E',   // Moss green
    sage: '#9BAA8E',        // Sage green
    warmTaupe: '#B5A89A',   // Warm taupe

    // Functional colors (subtle, calm)
    success: '#7FA07F',     // Muted green
    warning: '#D4A574',     // Muted amber
    error: '#B87A7A',       // Muted terracotta
    info: '#7A90A4',        // Muted blue

    // System
    background: '#F5F3F0',  // Main background (sand)
    surface: '#FFFFFF',     // Card/surface white
    surfaceElevated: '#FAF9F7', // Elevated surface (linen)
    border: '#E8E6E3',      // Border color (stone)
    divider: '#E8E6E3',     // Divider

    // Text hierarchy
    textPrimary: '#2C2C2C',     // Primary text (ink)
    textSecondary: '#5A5A5A',   // Secondary text (slate)
    textTertiary: '#8A8A8A',    // Tertiary text
    textDisabled: '#B5B5B5',    // Disabled text

    // Overlays
    overlay: 'rgba(44, 44, 44, 0.4)',
    scrim: 'rgba(44, 44, 44, 0.2)',
  },

  // ============================================================================
  // TYPOGRAPHY - Clean, breathable
  // ============================================================================
  typography: {
    fontFamily: {
      regular: 'System',
      medium: 'System',
      semiBold: 'System',
      bold: 'System',
    },

    // Display
    displayLarge: {
      fontSize: 57,
      lineHeight: 64,
      fontWeight: '400' as const,
      letterSpacing: -0.25,
    },
    displayMedium: {
      fontSize: 45,
      lineHeight: 52,
      fontWeight: '400' as const,
      letterSpacing: 0,
    },
    displaySmall: {
      fontSize: 36,
      lineHeight: 44,
      fontWeight: '400' as const,
      letterSpacing: 0,
    },

    // Headlines
    headlineLarge: {
      fontSize: 32,
      lineHeight: 40,
      fontWeight: '400' as const,
      letterSpacing: 0,
    },
    headlineMedium: {
      fontSize: 28,
      lineHeight: 36,
      fontWeight: '400' as const,
      letterSpacing: 0,
    },
    headlineSmall: {
      fontSize: 24,
      lineHeight: 32,
      fontWeight: '400' as const,
      letterSpacing: 0,
    },

    // Titles
    titleLarge: {
      fontSize: 22,
      lineHeight: 28,
      fontWeight: '500' as const,
      letterSpacing: 0,
    },
    titleMedium: {
      fontSize: 16,
      lineHeight: 24,
      fontWeight: '500' as const,
      letterSpacing: 0.15,
    },
    titleSmall: {
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '500' as const,
      letterSpacing: 0.1,
    },

    // Body
    bodyLarge: {
      fontSize: 16,
      lineHeight: 24,
      fontWeight: '400' as const,
      letterSpacing: 0.5,
    },
    bodyMedium: {
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '400' as const,
      letterSpacing: 0.25,
    },
    bodySmall: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '400' as const,
      letterSpacing: 0.4,
    },

    // Labels
    labelLarge: {
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '500' as const,
      letterSpacing: 0.1,
    },
    labelMedium: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '500' as const,
      letterSpacing: 0.5,
    },
    labelSmall: {
      fontSize: 11,
      lineHeight: 16,
      fontWeight: '500' as const,
      letterSpacing: 0.5,
    },
  },

  // ============================================================================
  // SPACING - Generous, breathable
  // ============================================================================
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
    xxxl: 64,
  },

  // ============================================================================
  // BORDER RADIUS - Soft, rounded
  // ============================================================================
  borderRadius: {
    none: 0,
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
    xxl: 24,
    full: 9999,
  },

  // ============================================================================
  // SHADOWS - Subtle, soft
  // ============================================================================
  shadows: {
    none: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    },
    sm: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 1,
    },
    md: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 4,
      elevation: 2,
    },
    lg: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 4,
    },
    xl: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.12,
      shadowRadius: 16,
      elevation: 8,
    },
  },

  // ============================================================================
  // ANIMATION - Subtle, purposeful
  // ============================================================================
  animation: {
    duration: {
      fast: 150,
      normal: 250,
      slow: 350,
    },
    easing: {
      ease: 'cubic-bezier(0.4, 0, 0.2, 1)',
      easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
      easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
      easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    },
  },

  // ============================================================================
  // LAYOUT
  // ============================================================================
  layout: {
    containerPadding: 16,
    maxWidth: 1200,
    tabBarHeight: 64,
    headerHeight: 56,
  },

  // ============================================================================
  // MICROCOPY - Calm, reassuring tone
  // ============================================================================
  copy: {
    empty: {
      maintenance: "Your home is in perfect harmony.",
      requests: "Everything is running smoothly.",
      appointments: "No upcoming visits scheduled.",
    },
    loading: {
      default: "Just a moment...",
      maintenance: "Loading your home details...",
      vendors: "Finding the right match...",
    },
    success: {
      requestSubmitted: "We've received your request.",
      appointmentBooked: "Everything is on schedule.",
      maintenanceLogged: "Noted. We'll remind you when it's time.",
    },
    errors: {
      network: "Having trouble connecting. Please try again.",
      generic: "Something unexpected happened. We're looking into it.",
      unauthorized: "Please sign in to continue.",
    },
  },
};

export type Theme = typeof theme;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

export const hexToRgba = (hex: string, alpha: number): string => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export default theme;
