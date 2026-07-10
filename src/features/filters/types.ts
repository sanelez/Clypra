/**
 * Filters Types
 * Type definitions for color grading filters
 */

export interface FilterAsset {
  id: string;
  name: string;
  type: "filter";
  category: string;
  description: string;
  thumbnail: string;

  // ── GPU GLSL path — primary renderer (ColorAdjustmentsEffect uniforms) ──
  gradingParams?: {
    // Basic color adjustments
    exposure?: number;
    brightness?: number;
    contrast?: number;
    saturation?: number;
    temperature?: number;
    tint?: number;
    sepia?: number;
    grayscale?: number;
    hueRotate?: number;
    invert?: number;
    vignette?: number;
    blur?: number;
    lift?: number;

    // Channel mix (for custom B&W)
    channelMix?: {
      r: number;
      g: number;
      b: number;
    };

    // Film grain
    grain?: {
      intensity: number;
      size: number;
    };
    grainIntensity?: number; // Flat fallback
    grainSize?: number; // Flat fallback

    // Split-toning
    shadowTint?: {
      r: number;
      g: number;
      b: number;
    };
    shadowTintStrength?: number;
    highlightTint?: {
      r: number;
      g: number;
      b: number;
    };
    highlightTintStrength?: number;
    splitBalance?: number;

    // Duotone
    duotoneDark?: {
      r: number;
      g: number;
      b: number;
    };
    duotoneLight?: {
      r: number;
      g: number;
      b: number;
    };
    useDuotone?: number;

    // Vibrance
    vibranceAmount?: number;
    vibranceProtectedHue?: {
      r: number;
      g: number;
      b: number;
    };

    // Cross-process
    crossProcessAmount?: number;
    crossProcess?: number; // Flat fallback
  };

  // ── V2 MPG path (MPG Playground output) ────────────────────────────────
  pipeline?: "v2";
  effectStack?: Array<{ type: string; params?: Record<string, unknown> }>;

  url?: string;
  lut?: string;
  tags?: string[];
  isPremium?: boolean;
  intensity?: {
    min: number;
    max: number;
    default: number;
    step: number;
  };
}

export interface FilterCategory {
  id: string;
  name: string;
  description: string;
}

export interface AppliedFilter {
  id: string;
  filterId: string;
  intensity: number;
  params?: Record<string, any>;
}
