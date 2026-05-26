export interface TextEffectPreset {
  id: string;
  name: string;
  category: "Classic" | "Hits" | "Animation" | "Food" | "Textile Art" | "Manuscript" | "Metal" | "Neon" | "3D" | "Gradient" | "Glitch" | "Retro" | "Clean" | "Organic";
  fontFamily: string;
  color: string; // supports solid hex or comma-separated vertical gradients
  fontWeight: "normal" | "bold" | number;
  fontStyle: "normal" | "italic";
  stroke?: {
    color: string;
    width: number;
  };
  shadow?: {
    color: string;
    blur: number;
    offsetX: number;
    offsetY: number;
  };
  background?: {
    color: string;
    padding: number;
    borderRadius: number;
  };
  premium?: boolean;
}

export const TEXT_EFFECTS: TextEffectPreset[] = [
  // {
  //   id: "gold-foil-stamp",
  //   name: "Gold Foil Stamp",
  //   category: "Classic",
  //   fontFamily: "Cinzel",
  //   color: "#e5c158",
  //   fontWeight: "bold",
  //   fontStyle: "normal",
  //   premium: true,
  // },
  // {
  //   id: "classic-ink",
  //   name: "Classic Ink",
  //   category: "Classic",
  //   fontFamily: "Georgia",
  //   color: "#fdfbf7",
  //   fontWeight: "bold",
  //   fontStyle: "normal",
  //   premium: true,
  // },
  // {
  //   id: "classic-engraved",
  //   name: "Classic Engraved",
  //   category: "Classic",
  //   fontFamily: "Georgia",
  //   color: "#5C3D2E",
  //   fontWeight: "bold",
  //   fontStyle: "normal",
  //   premium: true,
  // },
  // {
  //   id: "classic-serif-gold",
  //   name: "Classic Serif Gold",
  //   category: "Classic",
  //   fontFamily: "Georgia",
  //   color: "#DAA520",
  //   fontWeight: "bold",
  //   fontStyle: "normal",
  //   premium: true,
  // },
  // {
  //   id: "classic-stamp",
  //   name: "Classic Stamp",
  //   category: "Classic",
  //   fontFamily: "Impact",
  //   color: "#8B1A1A",
  //   fontWeight: "bold",
  //   fontStyle: "normal",
  //   premium: true,
  // },
  // {
  //   id: "classic-neon-sign",
  //   name: "Classic Neon Sign",
  //   category: "Classic",
  //   fontFamily: "Impact",
  //   color: "#FFFAF0",
  //   fontWeight: "bold",
  //   fontStyle: "normal",
  //   premium: true,
  // },

  {
    id: "neon-yellow-outline",
    name: "Neon Yellow Outline",
    category: "Neon",
    fontFamily: "Geist Variable",
    color: "#FFFFFF",
    fontWeight: 900,
    fontStyle: "normal",
    stroke: { color: "#000000", width: 5.5 },
    shadow: { color: "#FFFF00", blur: 6, offsetX: 0, offsetY: 0 },
    premium: true,
  },
  {
    id: "glow-yellow",
    name: "Yellow Glow",
    category: "Neon",
    fontFamily: "Outfit Variable",
    color: "#FFD700",
    fontWeight: 900,
    fontStyle: "normal",
    stroke: { color: "#000000", width: 6 },
    shadow: { color: "#FFFF00", blur: 15, offsetX: 0, offsetY: 0 },
    premium: true,
  },
];
