import { Filter, BlurFilter } from "pixi.js";
import { AdjustmentFilter } from "pixi-filters";
import { createGPUPixelateFilter, createGPUScanlinesFilter, createGPURGBSplitFilter, createGPUFilmGrainFilter, createGPUVignetteFilter } from "./gpuFilters.js";
import { applyBodyEffectMask, createGPUBodyOutlineFilter, createGPUBodyGlowFilter, createGPUBodyParticlesFilter, ColorAdjustmentsEffect } from "@clypra-studio/engine";
import type { EvaluatedMediaLayer } from "../evaluation/types.js";
import { filterCacheManager } from "../../features/filters/cache/filterCache.js";

interface FilterCacheEntry {
  /** Signature of WHICH effects are structurally active — not their live parameter values */
  structuralKey: string;
  filters: Filter[];
  /** effectId → filter instance, for targeted per-frame uniform updates without rebuilding */
  filterMap: Map<string, Filter>;
}

const filterCache = new Map<string, FilterCacheEntry>(); // keyed by clipId

let rebuildCounter = 0;

export function getRebuildCounter(): number {
  return rebuildCounter;
}

export function resetRebuildCounter(): void {
  rebuildCounter = 0;
}

function hexToRgbNormalized(hex: string): [number, number, number] {
  let clean = hex.replace("#", "");
  if (clean.length === 3) {
    clean = clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2];
  }
  const num = parseInt(clean, 16);
  return [((num >> 16) & 255) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255];
}

function buildStructuralKey(mediaLayer: EvaluatedMediaLayer, bodyMasks: Map<string, any>): string {
  const parts: string[] = [];
  if (mediaLayer.filter && mediaLayer.filter.intensity > 0.001) {
    parts.push(`filter:${mediaLayer.filter.id}`);
  }
  for (const effect of mediaLayer.effects || []) {
    if (effect.intensity <= 0.001) continue;
    const rendererName = effect.renderer || effect.effectId;
    const norm = rendererName.replace(/^fx-/, "").replace(/-/g, "_").toLowerCase();
    if (norm === "body_outline" || norm === "body_glow" || norm === "body_segmentation_glow" || norm === "body_particles") {
      const hasMask = bodyMasks.has(`${mediaLayer.layerId}_${effect.effectId}`);
      parts.push(`effect:${effect.effectId}:masked:${hasMask}`);
    } else {
      parts.push(`effect:${effect.effectId}`);
    }
  }
  return parts.join("|");
}

/**
 * Returns the current frame's filter array for this clip.
 * Only reconstructs filter INSTANCES when the structural set of active effects changes.
 */
export function getOrUpdateFilters(mediaLayer: EvaluatedMediaLayer, width: number, height: number, bodyMasks: Map<string, any>): Filter[] {
  const clipId = mediaLayer.clipId;

  console.log("[FilterCache] getOrUpdateFilters called:", {
    clipId,
    layerId: mediaLayer.layerId,
    hasFilter: !!mediaLayer.filter,
    filter: mediaLayer.filter,
    effectsCount: mediaLayer.effects?.length || 0,
    effects: mediaLayer.effects,
  });

  const structuralKey = buildStructuralKey(mediaLayer, bodyMasks);
  console.log("[FilterCache] structuralKey:", structuralKey);

  let entry = filterCache.get(clipId);

  if (!entry || entry.structuralKey !== structuralKey) {
    rebuildCounter++;
    console.log("[Filters] rebuild count this session:", rebuildCounter);
    console.log("[Filters] REBUILDING filter for clip:", clipId, {
      oldKey: entry?.structuralKey,
      newKey: structuralKey,
      mediaLayerFilter: mediaLayer.filter,
      mediaLayerEffects: mediaLayer.effects,
    });

    // Structural change — full rebuild, but ONLY when the effect set actually changed
    if (entry) {
      entry.filters.forEach((f) => {
        try {
          f.destroy();
        } catch (err) {
          console.error("[Filters] error destroying filter:", err);
        }
      });
    }

    const filters: Filter[] = [];
    const filterMap = new Map<string, Filter>();

    if (mediaLayer.filter && mediaLayer.filter.intensity > 0.001) {
      console.log("[Filters] Creating ColorAdjustmentsEffect filter for:", {
        filterId: mediaLayer.filter.id,
        intensity: mediaLayer.filter.intensity,
      });

      const filter = ColorAdjustmentsEffect.filterSpec!.create({}) as Filter;
      filters.push(filter);
      filterMap.set("__color_filter", filter);

      console.log("[Filters] ColorAdjustmentsEffect filter created and added to filterMap");

      // Create blur filter if needed (since Blur is multi-pass in WebGL)
      const cached = filterCacheManager.getCached(mediaLayer.filter.id);
      console.log("[Filters] Checking if blur filter needed, cached:", {
        cached: cached ? "EXISTS" : "NULL",
        filter: cached?.filter,
        gradingParams: cached?.filter?.gradingParams,
        blur: cached?.filter?.gradingParams?.blur,
      });

      const asset = cached?.filter;
      let hasBlur = false;
      if (asset?.gradingParams?.blur && asset.gradingParams.blur > 0.001) {
        hasBlur = true;
      }

      if (hasBlur) {
        const blurFilter = new BlurFilter({ strength: 0 });
        filters.push(blurFilter);
        filterMap.set("__color_filter_blur", blurFilter);
        console.log("[Filters] Blur filter added");
      }
    } else {
      console.log("[Filters] NO filter on mediaLayer OR intensity too low:", {
        hasFilter: !!mediaLayer.filter,
        intensity: mediaLayer.filter?.intensity,
      });
    }

    for (const effect of mediaLayer.effects || []) {
      if (effect.intensity <= 0.001) continue;
      const rendererName = effect.renderer || effect.effectId;
      const norm = rendererName.replace(/^fx-/, "").replace(/-/g, "_").toLowerCase();
      let filter: Filter | null = null;

      if (norm === "brightness" || norm === "contrast" || norm === "saturation") {
        filter = new AdjustmentFilter();
      } else if (norm === "blur") {
        filter = new BlurFilter({ strength: 0 });
      } else if (norm === "pixelate") {
        filter = createGPUPixelateFilter(2);
      } else if (norm === "scanlines") {
        filter = createGPUScanlinesFilter(120, 0);
      } else if (norm === "rgb_split" || norm === "chromatic_aberration" || norm === "chromatic") {
        filter = createGPURGBSplitFilter(0, 0, width, height);
      } else if (norm === "film_grain" || norm === "grain") {
        filter = createGPUFilmGrainFilter(0, 0);
      } else if (norm === "vignette") {
        filter = createGPUVignetteFilter(0.7, 0);
      } else if (norm === "body_outline" || norm === "body_glow" || norm === "body_segmentation_glow" || norm === "body_particles") {
        const maskData = bodyMasks.get(`${mediaLayer.layerId}_${effect.effectId}`);
        if (maskData) {
          const maskTexture = applyBodyEffectMask(`${mediaLayer.clipId}_${effect.effectId}`, maskData);
          if (norm === "body_outline") {
            filter = createGPUBodyOutlineFilter(maskTexture, "#ffffff", 1);
          } else if (norm === "body_glow" || norm === "body_segmentation_glow") {
            filter = createGPUBodyGlowFilter(maskTexture, "#00ffff", 2, 0.8);
          } else if (norm === "body_particles") {
            filter = createGPUBodyParticlesFilter(maskTexture, "#00ffff", 40, 1.0, 0);
          }
        }
      }

      if (filter) {
        filters.push(filter);
        filterMap.set(effect.effectId, filter);
      }
    }

    entry = { structuralKey, filters, filterMap };
    filterCache.set(clipId, entry);
  }

  // Update parameters on the (possibly just-created, possibly reused) instances
  applyLiveParams(entry, mediaLayer, width, height, bodyMasks);

  return entry.filters;
}

function applyLiveParams(entry: FilterCacheEntry, mediaLayer: EvaluatedMediaLayer, width: number, height: number, bodyMasks: Map<string, any>): void {
  if (mediaLayer.filter) {
    console.log("[FilterCache] applyLiveParams - mediaLayer.filter:", {
      clipId: mediaLayer.clipId,
      filterId: mediaLayer.filter.id,
      intensity: mediaLayer.filter.intensity,
      mediaLayerFilter: mediaLayer.filter,
    });

    const filter = entry.filterMap.get("__color_filter");
    console.log("[FilterCache] filter instance from filterMap:", filter ? "EXISTS" : "NULL");

    if (filter) {
      const cached = filterCacheManager.getCached(mediaLayer.filter.id);
      console.log("[FilterCache] cached filter from filterCacheManager:", {
        cached: cached ? "EXISTS" : "NULL",
        cachedFilterObject: cached,
        filterProperty: cached?.filter,
        gradingParams: cached?.filter?.gradingParams,
        filterKeys: cached?.filter ? Object.keys(cached.filter) : [],
      });

      const asset = cached?.filter;
      const params: Record<string, number> = {};

      if (asset?.gradingParams) {
        const gp = asset.gradingParams as any; // Type has all advanced grading params
        const intensity = mediaLayer.filter.intensity;

        // Standard color adjustments
        params.exposure = (gp.exposure ?? 0.0) * intensity;
        params.brightness = (gp.brightness ?? 0.0) * intensity;
        params.contrast = (gp.contrast ?? 0.0) * intensity;
        params.saturation = (gp.saturation ?? 0.0) * intensity;
        params.temperature = (gp.temperature ?? 0.0) * intensity;
        params.tint = (gp.tint ?? 0.0) * intensity;
        params.sepia = (gp.sepia ?? 0.0) * intensity;
        params.grayscale = (gp.grayscale ?? 0.0) * intensity;
        params.hueRotate = (gp.hueRotate ?? 0.0) * intensity;
        params.invert = (gp.invert ?? 0.0) * intensity;
        params.vignette = (gp.vignette ?? 0.0) * intensity;
        params.lift = (gp.lift ?? 0.0) * intensity;

        // Channel mix (for B&W with custom channel weights)
        if (gp.channelMix) {
          params.channelMixR = gp.channelMix.r ?? 0.0;
          params.channelMixG = gp.channelMix.g ?? 0.0;
          params.channelMixB = gp.channelMix.b ?? 0.0;
          params.useChannelMix = 1.0; // Enable channel mix
        } else {
          params.useChannelMix = 0.0;
        }

        // Film grain
        if (gp.grain) {
          params.grainIntensity = (gp.grain.intensity ?? 0.0) * intensity;
          params.grainSize = gp.grain.size ?? 1.0;
        } else if (gp.grainIntensity !== undefined) {
          // Fallback for flat grainIntensity/grainSize
          params.grainIntensity = (gp.grainIntensity ?? 0.0) * intensity;
          params.grainSize = gp.grainSize ?? 1.0;
        }

        // Split-toning
        if (gp.shadowTint) {
          params.shadowTintR = gp.shadowTint.r ?? 1.0;
          params.shadowTintG = gp.shadowTint.g ?? 1.0;
          params.shadowTintB = gp.shadowTint.b ?? 1.0;
          params.shadowTintStrength = (gp.shadowTintStrength ?? 0.0) * intensity;
        }
        if (gp.highlightTint) {
          params.highlightTintR = gp.highlightTint.r ?? 1.0;
          params.highlightTintG = gp.highlightTint.g ?? 1.0;
          params.highlightTintB = gp.highlightTint.b ?? 1.0;
          params.highlightTintStrength = (gp.highlightTintStrength ?? 0.0) * intensity;
        }
        if (gp.splitBalance !== undefined) {
          params.splitBalance = gp.splitBalance;
        }

        // Duotone
        if (gp.duotoneDark) {
          params.duotoneDarkR = gp.duotoneDark.r ?? 0.0;
          params.duotoneDarkG = gp.duotoneDark.g ?? 0.0;
          params.duotoneDarkB = gp.duotoneDark.b ?? 0.0;
        }
        if (gp.duotoneLight) {
          params.duotoneLightR = gp.duotoneLight.r ?? 1.0;
          params.duotoneLightG = gp.duotoneLight.g ?? 1.0;
          params.duotoneLightB = gp.duotoneLight.b ?? 1.0;
        }
        if (gp.useDuotone !== undefined) {
          params.useDuotone = gp.useDuotone;
        }

        // Vibrance
        if (gp.vibranceAmount !== undefined) {
          params.vibranceAmount = gp.vibranceAmount * intensity;
        }
        if (gp.vibranceProtectedHue) {
          params.vibranceProtectedHueR = gp.vibranceProtectedHue.r ?? 0.91;
          params.vibranceProtectedHueG = gp.vibranceProtectedHue.g ?? 0.69;
          params.vibranceProtectedHueB = gp.vibranceProtectedHue.b ?? 0.55;
        }

        // Cross-process
        if (gp.crossProcessAmount !== undefined) {
          params.crossProcessAmount = gp.crossProcessAmount * intensity;
        }

        console.log("[FilterCache] computed params to apply:", params);
      } else {
        console.warn("[FilterCache] NO gradingParams found in asset!");
      }

      ColorAdjustmentsEffect.filterSpec!.updateUniforms!(filter, params, 0);
      console.log("[FilterCache] updateUniforms called with params:", params);
    } else {
      console.warn("[FilterCache] filter instance not found in filterMap!");
    }

    const blurFilter = entry.filterMap.get("__color_filter_blur") as BlurFilter | undefined;
    if (blurFilter) {
      const cached = filterCacheManager.getCached(mediaLayer.filter.id);
      const asset = cached?.filter;
      const blurAmount = asset?.gradingParams?.blur ?? 0;
      blurFilter.strength = blurAmount * mediaLayer.filter.intensity;
    }
  }

  for (const effect of mediaLayer.effects || []) {
    const filter = entry.filterMap.get(effect.effectId);
    if (!filter) continue;
    const rendererName = effect.renderer || effect.effectId;
    const norm = rendererName.replace(/^fx-/, "").replace(/-/g, "_").toLowerCase();

    if (norm === "brightness" && filter instanceof AdjustmentFilter) {
      filter.brightness = Number(effect.parameters.brightness ?? 1.0) * effect.intensity;
    } else if (norm === "contrast" && filter instanceof AdjustmentFilter) {
      filter.contrast = Number(effect.parameters.contrast ?? 1.0) * effect.intensity;
    } else if (norm === "saturation" && filter instanceof AdjustmentFilter) {
      filter.saturation = Number(effect.parameters.saturation ?? 1.0) * effect.intensity;
    } else if (norm === "blur" && filter instanceof BlurFilter) {
      filter.strength = Number(effect.parameters.blur ?? effect.parameters.blurAmount ?? 10) * effect.intensity;
    } else if (norm === "pixelate" && filter.resources?.customUniforms?.uniforms) {
      filter.resources.customUniforms.uniforms.uPixelSize = Math.max(2, Math.floor(Number(effect.parameters.pixelSize ?? 18) * effect.intensity));
    } else if (norm === "scanlines" && filter.resources?.customUniforms?.uniforms) {
      filter.resources.customUniforms.uniforms.uCount = Math.max(20, Number(effect.parameters.scanlineCount ?? 120));
      filter.resources.customUniforms.uniforms.uIntensity = effect.intensity;
    } else if ((norm === "rgb_split" || norm === "chromatic_aberration" || norm === "chromatic") && filter.resources?.customUniforms?.uniforms) {
      const shift = Number(effect.parameters.rgbSplit ?? effect.parameters.splitDistance ?? 8) * effect.intensity;
      filter.resources.customUniforms.uniforms.uOffset = [shift / width, shift / height];
    } else if ((norm === "film_grain" || norm === "grain") && filter.resources?.customUniforms?.uniforms) {
      const intensityVal = Number(effect.parameters.grainIntensity ?? 1.0) * effect.intensity;
      filter.resources.customUniforms.uniforms.uIntensity = intensityVal * 0.15;
      filter.resources.customUniforms.uniforms.uTime = effect.localTime || 0;
    } else if (norm === "vignette" && filter.resources?.customUniforms?.uniforms) {
      filter.resources.customUniforms.uniforms.uRadius = Number(effect.parameters.radius ?? 0.7) * 0.5;
      filter.resources.customUniforms.uniforms.uIntensity = effect.intensity;
    } else if (norm === "body_outline" || norm === "body_glow" || norm === "body_segmentation_glow" || norm === "body_particles") {
      const maskData = bodyMasks.get(`${mediaLayer.layerId}_${effect.effectId}`);
      if (maskData) {
        const maskTexture = applyBodyEffectMask(`${mediaLayer.clipId}_${effect.effectId}`, maskData);
        if (filter.resources) {
          (filter as any).resources.uMask = maskTexture.source;
        }

        if (norm === "body_outline" && filter.resources?.customUniforms?.uniforms) {
          const color = String(effect.parameters.outlineColor ?? effect.parameters.glowColor ?? "#ffffff");
          const thickness = Math.max(1, Number(effect.parameters.thickness ?? 5) * effect.intensity);
          const rgb = hexToRgbNormalized(color);
          filter.resources.customUniforms.uniforms.uOutlineColor = [...rgb, 1.0];
          filter.resources.customUniforms.uniforms.uThickness = thickness;
        } else if ((norm === "body_glow" || norm === "body_segmentation_glow") && filter.resources?.customUniforms?.uniforms) {
          const color = String(effect.parameters.glowColor ?? "#00ffff");
          const radius = Math.max(2, Number(effect.parameters.glowRadius ?? 22) * effect.intensity);
          const alpha = Math.min(1, Number(effect.parameters.glowIntensity ?? 0.8) * effect.intensity);
          const rgb = hexToRgbNormalized(color);
          filter.resources.customUniforms.uniforms.uGlowColor = [...rgb, 1.0];
          filter.resources.customUniforms.uniforms.uGlowRadius = radius;
          filter.resources.customUniforms.uniforms.uGlowIntensity = alpha;
        } else if (norm === "body_particles" && filter.resources?.customUniforms?.uniforms) {
          const color = String(effect.parameters.particleColor ?? effect.parameters.glowColor ?? "#00ffff");
          const count = Math.floor(Number(effect.parameters.particleCount ?? 120) * effect.intensity);
          const time = effect.localTime || 0;
          const rgb = hexToRgbNormalized(color);
          filter.resources.customUniforms.uniforms.uParticleColor = [...rgb, 1.0];
          filter.resources.customUniforms.uniforms.uCount = Math.min(40, count);
          filter.resources.customUniforms.uniforms.uIntensity = effect.intensity;
          filter.resources.customUniforms.uniforms.uTime = time;
        }
      }
    }
  }
}

/** Call when a clip is released (see PixiSceneCompositor's reconciliation step) */
export function releaseFilterCache(clipId: string): void {
  const entry = filterCache.get(clipId);
  if (entry) {
    entry.filters.forEach((f) => {
      try {
        f.destroy();
      } catch (err) {
        console.error("[Filters] error destroying filter on release:", err);
      }
    });
    filterCache.delete(clipId);
  }
}

/** Call when PixiSceneCompositor is destroyed */
export function clearFilterCache(): void {
  for (const entry of filterCache.values()) {
    entry.filters.forEach((f) => {
      try {
        f.destroy();
      } catch (err) {
        console.error("[Filters] error destroying filter on clear:", err);
      }
    });
  }
  filterCache.clear();
}
