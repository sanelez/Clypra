export type AudioLibraryCategory = "music" | "lo-fi" | "chill" | "cinematic" | "epic" | "upbeat" | "corporate" | "hip-hop" | "trap" | "electronic" | "synth" | "acoustic" | "indie" | "jazz" | "soul" | "ambient" | "background" | "sfx" | "transition" | "impact" | "ui" | "notifications" | "voice";

export interface AudioLibraryItem {
  id: string;
  name: string;
  category: AudioLibraryCategory | string;
  description?: string;
  tags?: string[];
  author: string;
  duration: number;
  bpm?: number;
  loopable?: boolean;
  license: {
    type: "cc0" | "cc-by" | "royalty-free" | "public-domain";
    url?: string;
    attributionRequired: boolean;
  };
  source: {
    provider: string;
    url: string;
  };
  audioUrl: string;
  waveformUrl?: string;
  coverArtUrl?: string;
  isPremium?: boolean;
}

import { getApiHeaders, getApiBaseUrl } from "@/lib/api";

const BASE = getApiBaseUrl();

export const AUDIO_LIBRARY_CATEGORIES: AudioLibraryCategory[] = ["music", "lo-fi", "chill", "cinematic", "epic", "upbeat", "corporate", "hip-hop", "trap", "electronic", "synth", "acoustic", "indie", "jazz", "soul", "ambient", "background", "sfx", "transition", "impact", "ui", "notifications", "voice"];

export const AudioLibraryApi = {
  async getAudioIndex(): Promise<AudioLibraryItem[]> {
    const res = await fetch(`${BASE}/audio`, {
      cache: "reload",
      headers: getApiHeaders(),
    });
    if (!res.ok) throw new Error("Failed to load audio library");
    return res.json();
  },

  async getAudioByCategory(category: AudioLibraryCategory): Promise<AudioLibraryItem[]> {
    const res = await fetch(`${BASE}/audio/${category}`, {
      cache: "reload",
      headers: getApiHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to load audio category: ${category}`);
    return res.json();
  },

  async getAudioAsset(category: string, id: string): Promise<AudioLibraryItem> {
    const res = await fetch(`${BASE}/audio/${category}/${id}`, {
      cache: "reload",
      headers: getApiHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to load audio asset: ${id}`);
    return res.json();
  },
};
