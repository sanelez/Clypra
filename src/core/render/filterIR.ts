export interface FilterIR {
  sepia?: number;        // 0.0 to 1.0
  saturate?: number;     // multiplier, e.g. 1.0 is neutral
  contrast?: number;     // multiplier, e.g. 1.0 is neutral
  grayscale?: number;    // 0.0 to 1.0
  hueRotate?: number;    // angle in degrees, e.g. 0 is neutral
}

/**
 * Maps standard preset filter IDs and their intensity (0.0 to 1.0) to a FilterIR object.
 */
export function resolveFilterToIR(filterId: string, intensity: number): FilterIR {
  console.log(`[resolveFilterToIR] Resolving filterId: "${filterId}", intensity: ${intensity}`);
  const result = (() => {
    switch (filterId) {
      case "filter-sepia":
        return { sepia: intensity };
      case "filter-retro":
        return {
          sepia: intensity * 0.5,
          saturate: 1 + intensity * 0.4,
          contrast: 1 - intensity * 0.15,
        };
      case "filter-vivid":
        return {
          saturate: 1 + intensity * 1.2,
          contrast: 1 + intensity * 0.25,
        };
      case "filter-cool":
        return {
          hueRotate: -intensity * 25,
          saturate: 1 - intensity * 0.1,
        };
      case "filter-cinematic-teal":
        return {
          contrast: 1 + intensity * 0.15,
          saturate: 1 - intensity * 0.1,
          hueRotate: 5,
        };
      case "filter-bw-classic":
        return { grayscale: intensity };
      default:
        return {};
    }
  })();
  console.log(`[resolveFilterToIR] Resolved FilterIR:`, result);
  return result;
}

/**
 * Compiles a FilterIR object into a CSS filter string for Canvas2D rendering.
 */
export function compileFilterIRToCSS(ir: FilterIR): string {
  const parts: string[] = [];
  if (ir.sepia !== undefined && ir.sepia > 0) {
    parts.push(`sepia(${ir.sepia * 100}%)`);
  }
  if (ir.saturate !== undefined && ir.saturate !== 1) {
    parts.push(`saturate(${ir.saturate})`);
  }
  if (ir.contrast !== undefined && ir.contrast !== 1) {
    parts.push(`contrast(${ir.contrast})`);
  }
  if (ir.grayscale !== undefined && ir.grayscale > 0) {
    parts.push(`grayscale(${ir.grayscale * 100}%)`);
  }
  if (ir.hueRotate !== undefined && ir.hueRotate !== 0) {
    parts.push(`hue-rotate(${ir.hueRotate}deg)`);
  }
  const css = parts.join(" ");
  console.log(`[compileFilterIRToCSS] Compiled CSS: "${css}" for FilterIR:`, ir);
  return css;
}

/**
 * Compiles a FilterIR object into a FFmpeg video filter chain segment.
 */
export function compileFilterIRToFFmpeg(ir: FilterIR): string {
  const parts: string[] = [];

  // Sepia color channel mixer matrix:
  // R' = R*0.393 + G*0.769 + B*0.189
  // G' = R*0.349 + G*0.686 + B*0.168
  // B' = R*0.272 + G*0.534 + B*0.131
  if (ir.sepia !== undefined && ir.sepia > 0) {
    const s = ir.sepia;
    const rr = 1 - s + s * 0.393;
    const rg = s * 0.769;
    const rb = s * 0.189;
    const gr = s * 0.349;
    const gg = 1 - s + s * 0.686;
    const gb = s * 0.168;
    const br = s * 0.272;
    const bg = s * 0.534;
    const bb = 1 - s + s * 0.131;
    parts.push(`colorchannelmixer=rr=${rr.toFixed(4)}:rg=${rg.toFixed(4)}:rb=${rb.toFixed(4)}:gr=${gr.toFixed(4)}:gg=${gg.toFixed(4)}:gb=${gb.toFixed(4)}:br=${br.toFixed(4)}:bg=${bg.toFixed(4)}:bb=${bb.toFixed(4)}`);
  }

  // Grayscale color channel mixer matrix (Luma formula coefficients):
  if (ir.grayscale !== undefined && ir.grayscale > 0) {
    const g = ir.grayscale;
    const rr = 1 - g + g * 0.299;
    const rg = g * 0.587;
    const rb = g * 0.114;
    const gr = g * 0.299;
    const gg = 1 - g + g * 0.587;
    const gb = g * 0.114;
    const br = g * 0.299;
    const bg = g * 0.587;
    const bb = 1 - g + g * 0.114;
    parts.push(`colorchannelmixer=rr=${rr.toFixed(4)}:rg=${rg.toFixed(4)}:rb=${rb.toFixed(4)}:gr=${gr.toFixed(4)}:gg=${gg.toFixed(4)}:gb=${gb.toFixed(4)}:br=${br.toFixed(4)}:bg=${bg.toFixed(4)}:bb=${bb.toFixed(4)}`);
  }

  if (ir.hueRotate !== undefined && ir.hueRotate !== 0) {
    parts.push(`hue=h=${ir.hueRotate}`);
  }

  if (ir.saturate !== undefined && ir.saturate !== 1) {
    parts.push(`hue=s=${ir.saturate}`);
  }

  if (ir.contrast !== undefined && ir.contrast !== 1) {
    parts.push(`eq=contrast=${ir.contrast}`);
  }

  return parts.join(",");
}
