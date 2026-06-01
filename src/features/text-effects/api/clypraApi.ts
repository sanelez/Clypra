import { TextEffectDefinition } from "../types/types";
import { TemplateDefinition } from "@/features/text-templates/types";

export interface TextEffectSummary {
  id: string;
  name: string;
  category: string;
  tags: string[];
  thumbnail: string;
  description: string;
}

const BASE = "https://clypra-worker-api.abdulkabirmusa.com";
const API_KEY = import.meta.env.VITE_CLYPRA_API_KEY || "";

// Helper function to create headers with API key
const getHeaders = (): HeadersInit => {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    "X-Clypra-Client": "clypra-desktop-v1",
    "User-Agent": "Clypra-Desktop/1.0.0",
  };

  if (API_KEY) {
    headers["X-API-Key"] = API_KEY;
  }

  return headers;
};

export const ClypraApi = {
  // In-memory cache map to avoid duplicate network calls when users toggle effects
  _effectsCache: new Map<string, TextEffectDefinition>(),
  _lottieCache: new Map<string, any>(),

  // 0. Checks if the API is online by hitting the health endpoint
  async checkApiHealth(): Promise<boolean> {
    try {
      const res = await fetch(`${BASE}/health`, {
        headers: getHeaders(),
      });
      if (!res.ok) return false;
      const data = await res.json();
      return data.status === "ok";
    } catch (e) {
      return false;
    }
  },

  // 1. Fetch summaries for category tab picker UI
  async getEffectsIndex(): Promise<TextEffectSummary[]> {
    const res = await fetch(`${BASE}/effects`, {
      cache: "reload",
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error("Failed to load effects index");
    return res.json();
  },

  async getEffectsByCategory(category: string): Promise<TextEffectSummary[]> {
    const res = await fetch(`${BASE}/effects/${category}`, {
      cache: "reload",
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to load category manifest for: ${category}`);
    return res.json();
  },

  // 2. LAZY-LOAD heavy configurations on selection with RAM caching
  async getFullEffect(category: string, id: string): Promise<TextEffectDefinition> {
    const cacheKey = `${category}:${id}`;
    if (this._effectsCache.has(cacheKey)) {
      return this._effectsCache.get(cacheKey)!;
    }

    console.log(`[API] Fetching heavy configuration on-demand for effect: ${id}`);
    const res = await fetch(`${BASE}/effects/${category}/${id}`, {
      cache: "reload",
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to load heavy configuration for effect: ${id}`);

    const data: TextEffectDefinition = await res.json();
    this._effectsCache.set(cacheKey, data); // store in cache
    return data;
  },

  // 3. Fetch summaries for template category tab picker UI
  async getTemplatesIndex(): Promise<TemplateDefinition[]> {
    const res = await fetch(`${BASE}/templates`, {
      cache: "reload",
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error("Failed to load templates index");
    return res.json();
  },

  async getTemplatesByCategory(category: string): Promise<TemplateDefinition[]> {
    const res = await fetch(`${BASE}/templates/${category}`, {
      cache: "reload",
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to load templates for category: ${category}`);
    return res.json();
  },

  // 5. LAZY-LOAD heavy Lottie animations on-timeline placement with RAM caching
  async getLottieTemplate(category: string, id: string): Promise<any> {
    const cacheKey = `${category}:${id}`;
    if (this._lottieCache.has(cacheKey)) {
      return this._lottieCache.get(cacheKey)!;
    }

    console.log(`[API] Fetching heavy Lottie vector data on-demand for template: ${id}`);
    const res = await fetch(`${BASE}/templates/${category}/${id}`, {
      cache: "reload",
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to load Lottie animation payload for: ${id}`);

    const data = await res.json();
    this._lottieCache.set(cacheKey, data); // store in cache
    return data;
  },
};
