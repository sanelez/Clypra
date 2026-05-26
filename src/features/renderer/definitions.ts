import { TextEffectDefinition } from "./types";

export const glowYellowSparkles: TextEffectDefinition = {
  id: "glow-yellow",
  name: "Yellow Glow",
  category: "neon",
  description: "High-contrast classic yellow glow effect with gold gradient and sparkle particles.",
  tags: ["neon", "yellow", "glow", "clean", "sparkle"],
  font: { family: "Outfit", weight: 900, style: "normal", letterSpacing: 2, lineHeight: 1 },
  fills: [
    {
      type: "linear",
      angle: 90,
      stops: [
        { color: "#8B7500", position: 0 },
        { color: "#FFD700", position: 0.5 },
        { color: "#FFFF99", position: 1 },
      ],
    },
  ],
  strokes: [{ color: "#000000", width: 6, position: "outside", opacity: 1 }],
  shadows: [
    { type: "glow", color: "#FFFF00", blur: 15, offsetX: 0, offsetY: 0, opacity: 1.0, spread: 2 },
    { type: "glow", color: "#FFFF00", blur: 35, offsetX: 0, offsetY: 0, opacity: 0.8, spread: 1 },
    { type: "glow", color: "#FFFF00", blur: 75, offsetX: 0, offsetY: 0, opacity: 0.4 },
  ],
  sparkles: {
    enabled: true,
    count: 25,
    minSize: 2,
    maxSize: 6,
    color: "#FFFFFF",
    opacity: 0.9,
    spread: 1.5,
  },
};

export const newspaperOffset: TextEffectDefinition = {
  id: "newspaper-offset",
  name: "Newspaper Offset",
  category: "retro",
  description: "Authentic retro newspaper halftone dots separation offset printing effect with aged paper and ink bleeds.",
  tags: ["retro", "vintage", "newspaper", "halftone", "ink", "print"],
  font: { family: "Playfair Display", weight: 700, style: "italic", letterSpacing: 0, lineHeight: 1.1 },
  fills: [{ type: "solid", color: "#000000" }],
  strokes: [],
  shadows: [],
  newspaper: {
    enabled: true,
    dotSpacing: 6,
    offsetAmount: 2,
    inkBleed: 1,
    paperColor: "#f4eedb",
    foxingDensity: 4,
    separations: [
      { color: "#00ffff", dx: -1, dy: -1 },
      { color: "#ff00ff", dx: 1, dy: -1 },
      { color: "#ffff00", dx: -1, dy: 1 },
      { color: "#000000", dx: 0, dy: 0 },
    ],
  },
};

export const frostedGlassEtch: TextEffectDefinition = {
  id: "frosted-glass-etch",
  name: "Frosted Glass Etch",
  category: "clean",
  description: "Procedural frosted glass plate overlay with etched semi-transparent text, specular highlights, and backlight glows.",
  tags: ["clean", "glass", "frost", "specular", "etched"],
  font: { family: "Cinzel", weight: 300, style: "normal", letterSpacing: 4, lineHeight: 1.2 },
  fills: [{ type: "solid", color: "rgba(235, 247, 250, 0.35)" }],
  strokes: [],
  shadows: [{ type: "drop", color: "#000000", blur: 2, offsetX: 1.5, offsetY: 1.5, opacity: 0.5 }],
  frostedGlass: {
    enabled: true,
    etchOpacity: 0.35,
    glassBlur: 10,
    backgroundGradient: {
      centerColor: "#1e3a8a",
      edgeColor: "#0f172a",
    },
    highlightColor: "rgba(255, 255, 255, 0.4)",
    depthColor: "rgba(0, 0, 0, 0.4)",
    glowColor: "#38bdf8",
    glowIntensity: 0.3,
    surfaceScale: 2,
    specularConstant: 1.5,
    noiseFrequency: 1.2,
    noiseOpacity: 0.15,
  },
};

export const burnedWoodPyrography: TextEffectDefinition = {
  id: "burned-wood-pyrography",
  name: "Burned Wood Pyrography",
  category: "organic",
  description: "Rustic hot metal pyrography branding burned into highly-detailed oak wood grain with charred borders.",
  tags: ["organic", "wood", "burned", "rustic", "branding", "hot-iron"],
  font: { family: "Cinzel Decorative", weight: 900, style: "normal", letterSpacing: 1, lineHeight: 1.1 },
  fills: [{ type: "solid", color: "#060302" }],
  strokes: [],
  shadows: [{ type: "drop", color: "rgba(6, 3, 2, 0.98)", blur: 3, offsetX: 0, offsetY: 0, opacity: 0.98 }],
  burnedWood: {
    enabled: true,
    woodTone: "Honey Oak",
    scorchIntensity: 1.2,
    charcoalWidth: 4,
    bleedRadius: 6,
    warpStrength: 15,
    grainDetail: 1.5,
    knotCount: 2,
  },
};

export const victorianOrnate: TextEffectDefinition = {
  id: "victorian-ornate",
  name: "Victorian Ornate",
  category: "retro",
  description: "Exquisite 19th-century royal velvet texture background with gilded damask wallpaper, gold highlights, and corner filigrees.",
  tags: ["retro", "victorian", "royal", "velvet", "gold", "ornate", "filigree"],
  font: { family: "Cinzel Decorative", weight: 700, style: "normal", letterSpacing: 2, lineHeight: 1.2 },
  fills: [
    {
      type: "linear",
      angle: 90,
      stops: [
        { position: 0, color: "#2d1802" },
        { position: 0.2, color: "#d4af37" },
        { position: 0.5, color: "#aa7c11" },
        { position: 0.8, color: "#f9e8a2" },
        { position: 1, color: "#422a08" },
      ],
    },
  ],
  strokes: [{ color: "#ffffff", width: 0.5, position: "outside", opacity: 0.7 }],
  shadows: [{ type: "drop", color: "#150e04", blur: 0, offsetX: 7.5, offsetY: 7.5, opacity: 0.9 }],
  victorianOrnate: {
    enabled: true,
    bgType: "Oxblood",
    goldTone: "Antique Gold",
    borderStyle: "Intricate Filigree",
    embossDepth: 6,
    patternOpacity: 0.1,
    subtitle: "PREMIUM STUDIO",
    showOrnaments: true,
    showDivider: true,
  },
};

export const calligraphyInk: TextEffectDefinition = {
  id: "calligraphy-ink",
  name: "Calligraphy Ink",
  category: "clean",
  description: "Elegant hand-written calligraphy with realistic ink bleed, paper fiber texture, and dry brush trailing strokes on warm paper.",
  tags: ["calligraphy", "ink", "handwritten", "elegant", "script", "paper", "brush"],
  font: { family: "Pinyon Script", weight: 400, style: "italic", letterSpacing: 0, lineHeight: 1.0 },
  fills: [
    {
      type: "linear",
      angle: 0,
      stops: [
        { position: 0, color: "#010309" },
        { position: 0.2, color: "#02050f" },
        { position: 0.65, color: "#131922" },
        { position: 0.85, color: "#252d3a" },
        { position: 1, color: "#424d5e" },
      ],
    },
  ],
  strokes: [],
  shadows: [
    { type: "glow", color: "#02050f", blur: 5.5, offsetX: 0, offsetY: 0, opacity: 0.15 },
    { type: "glow", color: "#02050f", blur: 1.8, offsetX: 0, offsetY: 0, opacity: 0.4 },
  ],
  calligraphyInk: {
    enabled: true,
    inkColor: "#02050f",
    bleedAmount: 2.2,
    paperWarmth: "#fbf9f3",
    fiberDensity: 450,
    dryBrushIntensity: 0.7,
    inkGradient: {
      start: "#010309",
      mid1: "#02050f",
      mid2: "#131922",
      mid3: "#252d3a",
      end: "#424d5e",
    },
  },
};

export const goldFoilStamp: TextEffectDefinition = {
  id: "gold-foil-stamp",
  name: "Gold Foil Stamp",
  category: "metallic",
  description: "Opulent gold foil hot stamp debossed deep into premium dark, heavy-textured cardstock paper.",
  tags: ["classic", "gold", "foil", "emboss", "stamp", "premium"],
  font: { family: "Cinzel", weight: 900, style: "normal", letterSpacing: 14, lineHeight: 1.1 },
  fills: [],
  strokes: [],
  shadows: [],
  goldFoilStamp: {
    enabled: true,
    goldTone: "#e5c158",
    foilContrast: 0.85,
    debossDepth: 3.5,
    bevelHighlight: 0.7,
    bgColor: "transparent",
    paperTexture: 0,
  },
};

export const classicInk: TextEffectDefinition = {
  id: "classic-ink",
  name: "Classic Ink",
  category: "classic",
  description: "Sophisticated 1940s Hollywood title card style with ivory gradients, sharp graphite outlines, and soft charcoal drop shadows.",
  tags: ["classic", "serif", "retro", "ink", "editorial", "clean"],
  font: { family: "Georgia", weight: 700, style: "normal", letterSpacing: 7, lineHeight: 1.15 },
  fills: [],
  strokes: [],
  shadows: [],
  classicInk: {
    enabled: true,
    ivoryTone: "#fdfbf7",
    midTone: "#dcd9ce",
    darkTone: "#b0ada0",
    strokeColor: "#53514a",
    shadowColor: "rgba(28, 26, 23, 0.82)",
    highlightIntensity: 0.15,
  },
};

export const neonYellowOutline: TextEffectDefinition = {
  id: "neon-yellow-outline",
  name: "Neon Yellow Outline",
  category: "neon",
  description: "High-impact neon outline with a white letter body, crisp black stroke, and radiating yellow bloom glow.",
  tags: ["neon", "yellow", "outline", "glow", "dark", "bold"],
  font: { family: "Geist Variable", weight: 900, style: "normal", letterSpacing: 0, lineHeight: 1 },
  fills: [],
  strokes: [],
  shadows: [],
  neonYellowOutline: {
    enabled: true,
    glowColor: "#FFFF00",
    glowTightBlur: 8,
    glowWideBlur: 22,
    strokeColor: "#000000",
    strokeWidth: 5.5,
    fillColor: "#FFFFFF",
  },
};

export const classicEngraved: TextEffectDefinition = {
  id: "classic-engraved",
  name: "Classic Engraved",
  category: "classic",
  description: "Presidential stationery engraved letters that sink inward with dark bronze gradient, inner shadows, and bright inner highlights. The visual opposite of Classic Ink.",
  tags: ["classic", "engraved", "serif", "bronze", "editorial", "recessed"],
  font: { family: "Georgia", weight: 700, style: "normal", letterSpacing: 6, lineHeight: 1.15 },
  fills: [],
  strokes: [],
  shadows: [],
  classicEngraved: {
    enabled: true,
    bronzeDark: "#5C3D2E",
    bronzeLight: "#8B6914",
    creamEdge: "#FAF0E6",
    innerShadowColor: "rgba(30, 15, 5, 0.85)",
    innerHighlightColor: "rgba(255, 248, 230, 0.6)",
  },
};

export const classicSerifGold: TextEffectDefinition = {
  id: "classic-serif-gold",
  name: "Classic Serif Gold",
  category: "classic",
  description: "Luxury editorial gold with champagne-to-amber gradient, 5-layer bevel extrusion, warm-brown stroke, and diagonal specular highlight.",
  tags: ["classic", "gold", "serif", "luxury", "editorial", "bevel"],
  font: { family: "Georgia", weight: 700, style: "normal", letterSpacing: 7, lineHeight: 1.15 },
  fills: [],
  strokes: [],
  shadows: [],
  classicSerifGold: {
    enabled: true,
    champagneTop: "#F5E6C8",
    richGold: "#DAA520",
    deepAmber: "#B8860B",
    baseBright: "#D4A843",
    strokeColor: "#6B4226",
    bevelDepth: 5,
    bevelDark: "#8B6914",
    bevelLight: "#F5DEB3",
    highlightIntensity: 0.18,
  },
};

export const classicStamp: TextEffectDefinition = {
  id: "classic-stamp",
  name: "Classic Stamp",
  category: "classic",
  description: "Rubber stamp pressed with heavy ink. Flat deep red fill with rough ink-bleed edges, mild inner shadow, and hard offset drop shadow.",
  tags: ["classic", "stamp", "rubber", "ink", "red", "grunge"],
  font: { family: "Impact", weight: 900, style: "normal", letterSpacing: 5, lineHeight: 1.1 },
  fills: [],
  strokes: [],
  shadows: [],
  classicStamp: {
    enabled: true,
    inkColor: "#8B1A1A",
    innerShadowColor: "rgba(60, 10, 10, 0.7)",
    roughness: 0.8,
    hardShadowOffset: 4,
  },
};

export const classicNeonSign: TextEffectDefinition = {
  id: "classic-neon-sign",
  name: "Classic Neon Sign",
  category: "classic",
  description: "1950s diner neon with hollow transparent letters, warm white core, triple amber-orange glow layers, and floor reflection.",
  tags: ["classic", "neon", "sign", "diner", "hollow", "retro", "glow"],
  font: { family: "Impact", weight: 900, style: "normal", letterSpacing: 8, lineHeight: 1.1 },
  fills: [],
  strokes: [],
  shadows: [],
  classicNeonSign: {
    enabled: true,
    coreColor: "#FFFAF0",
    coreWidth: 3,
    glowTight: "#FFFFFF",
    glowTightBlur: 8,
    glowMid: "#FFB347",
    glowMidBlur: 30,
    glowWide: "#CC4400",
    glowWideBlur: 80,
    reflectionOpacity: 0.2,
    reflectionFade: 80,
  },
};

// export const allEffects: TextEffectDefinition[] = [glowYellow, newspaperOffset, frostedGlassEtch, burnedWoodPyrography, victorianOrnate, calligraphyInk, goldFoilStamp, classicInk, neonYellowOutline, classicEngraved, classicSerifGold, classicStamp, classicNeonSign];
export const allEffects: TextEffectDefinition[] = [neonYellowOutline, glowYellowSparkles];
