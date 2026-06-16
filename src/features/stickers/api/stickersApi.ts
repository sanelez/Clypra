export type StickerCategory = "trending" | "football" | "classic" | "new" | "animal-meme" | "hits" | "free-fire" | "icons" | "emoji" | "fun" | "emphasis" | "cover-ups" | "wrong" | "love" | "letters" | "mood" | "sale" | "gaming" | "text-sticker" | "vlog" | "collage" | "y2k" | "countdown" | "music-festival" | "journal" | "campus" | "cartoon" | "animal" | "fashion" | "eco-friendly" | "basketball" | "birthday" | "barbie" | "vibes" | "shimmer" | "glitter" | "frame" | "travel" | "winter" | "fall" | "neon-text" | "details" | "techniques" | "lip-illustration" | "handwriting" | "retro-character" | "illustration" | "alphabet" | "pixelated-style" | "bubble" | "weather" | "label" | "plog" | "cyber" | "stylish" | "food" | "shapes";

export interface StickerItem {
  id: string;
  name: string;
  category: StickerCategory | string;
  thumbnailUrl: string;
  imageUrl: string;
  animatedUrl?: string;
  lottieUrl?: string;
  format: "static" | "gif" | "lottie";
  isAnimated: boolean;
  isPremium?: boolean;
  tags?: string[];
}

import { getApiHeaders, getApiBaseUrl } from "@/lib/api";

const BASE = getApiBaseUrl();

export const STICKER_CATEGORIES: StickerCategory[] = ["trending", "football", "classic", "new", "animal-meme", "hits", "free-fire", "icons", "emoji", "fun", "emphasis", "cover-ups", "wrong", "love", "letters", "mood", "sale", "gaming", "text-sticker", "vlog", "collage", "y2k", "countdown", "music-festival", "journal", "campus", "cartoon", "animal", "fashion", "eco-friendly", "basketball", "birthday", "barbie", "vibes", "shimmer", "glitter", "frame", "travel", "winter", "fall", "neon-text", "details", "techniques", "lip-illustration", "handwriting", "retro-character", "illustration", "alphabet", "pixelated-style", "bubble", "weather", "label", "plog", "cyber", "stylish", "food", "shapes"];

export const StickersApi = {
  async getStickersIndex(): Promise<StickerItem[]> {
    const res = await fetch(`${BASE}/stickers`, {
      cache: "reload",
      headers: getApiHeaders(),
    });
    if (!res.ok) throw new Error("Failed to load stickers library");
    return res.json();
  },

  async getStickersByCategory(category: StickerCategory): Promise<StickerItem[]> {
    const res = await fetch(`${BASE}/stickers/${category}`, {
      cache: "reload",
      headers: getApiHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to load stickers category: ${category}`);
    return res.json();
  },

  async getSticker(category: string, id: string): Promise<StickerItem> {
    const res = await fetch(`${BASE}/stickers/${category}/${id}`, {
      cache: "reload",
      headers: getApiHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to load sticker: ${id}`);
    return res.json();
  },
};
