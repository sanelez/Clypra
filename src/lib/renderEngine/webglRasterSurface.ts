/**
 * WebGL RasterSurface
 *
 * GPU-accelerated filmstrip renderer.
 * Uploads all artifact bitmaps into a single RGBA texture atlas per epoch,
 * then issues ONE drawArrays() call to render the entire strip.
 *
 * Invariants:
 *   - `NEAREST` sampling — zero browser resampling (matches Canvas2D imageSmoothingEnabled=false)
 *   - Straight alpha — no premul (matches Rust output)
 *   - Falls back to Canvas2D RasterSurface if WebGL2 is unavailable
 *
 * Factory:
 *   import { createRasterSurface } from './rasterSurface';
 *   const surface = createRasterSurface(canvasEl);
 */

import { RasterSurface, type FilmstripLayout } from "./rasterSurface";
import type { TransportArtifact } from "./transport";

// ─── Shaders ──────────────────────────────────────────────────────────────────

const VERT_SRC = /* glsl */ `#version 300 es
precision mediump float;

// Per-vertex payload repeats per tile: position rect [x, y, w, h] in clip-space
// and UV rect [u, v, uw, uh] in atlas space.
in vec4 a_posRect;   // x, y, w, h  (clip-space, -1..1)
in vec4 a_uvRect;    // u, v, uw, uh (0..1 in atlas)

out vec2 v_uv;

void main() {
  // Expand rect into 2 triangles via vertex index (0-5 per tile)
  int vi = gl_VertexID % 6;
  // Quad corners: 0=TL, 1=TR, 2=BL, 3=TR, 4=BR, 5=BL
  float dx[6];  float dy[6];
  dx[0]=0.0; dy[0]=0.0;
  dx[1]=1.0; dy[1]=0.0;
  dx[2]=0.0; dy[2]=1.0;
  dx[3]=1.0; dy[3]=0.0;
  dx[4]=1.0; dy[4]=1.0;
  dx[5]=0.0; dy[5]=1.0;

  float cx = a_posRect.x + a_posRect.z * dx[vi];
  float cy = a_posRect.y - a_posRect.w * dy[vi]; // flip Y (clip-space +y = up)
  gl_Position = vec4(cx, cy, 0.0, 1.0);

  v_uv = vec2(
    a_uvRect.x + a_uvRect.z * dx[vi],
    a_uvRect.y + a_uvRect.w * dy[vi]
  );
}
`;

const FRAG_SRC = /* glsl */ `#version 300 es
precision mediump float;
uniform sampler2D u_atlas;
in vec2 v_uv;
out vec4 fragColor;
void main() {
  fragColor = texture(u_atlas, v_uv);
}
`;

// ─── Atlas layout ─────────────────────────────────────────────────────────────

/** Packs bitmaps into a square-ish power-of-two atlas texture. */
function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

interface AtlasCell {
  u: number;
  v: number;
  uw: number;
  vh: number;
}

function packAtlas(artifacts: readonly TransportArtifact[], cols: number): { atlasW: number; atlasH: number; cellW: number; cellH: number; cells: AtlasCell[] } {
  if (artifacts.length === 0) return { atlasW: 1, atlasH: 1, cellW: 1, cellH: 1, cells: [] };

  const cellW = Math.max(...artifacts.map((artifact) => artifact.width));
  const cellH = Math.max(...artifacts.map((artifact) => artifact.height));
  const rows = Math.ceil(artifacts.length / cols);
  const atlasW = nextPow2(cols * cellW);
  const atlasH = nextPow2(rows * cellH);

  const cells: AtlasCell[] = artifacts.map((artifact, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    return {
      u: (col * cellW) / atlasW,
      v: (row * cellH) / atlasH,
      uw: artifact.width / atlasW,
      vh: artifact.height / atlasH,
    };
  });

  return { atlasW, atlasH, cellW, cellH, cells };
}

// ─── WebGLRasterSurface ───────────────────────────────────────────────────────

export class WebGLRasterSurface {
  private _canvas: HTMLCanvasElement;
  private _gl: WebGL2RenderingContext;
  private _program: WebGLProgram;
  private _vao: WebGLVertexArrayObject;
  private _vbo: WebGLBuffer;
  private _atlasTexture: WebGLTexture;
  private _disposed = false;

  // Attribute locations
  private _aPosRect: number;
  private _aUvRect: number;

  constructor(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext) {
    this._canvas = canvas;
    this._gl = gl;

    this._program = this._compileProgram();
    this._aPosRect = gl.getAttribLocation(this._program, "a_posRect");
    this._aUvRect = gl.getAttribLocation(this._program, "a_uvRect");

    if (this._aPosRect < 0 || this._aUvRect < 0) {
      throw new Error("[WebGLRasterSurface] Required shader attributes were optimized out");
    }

    this._vao = gl.createVertexArray()!;
    this._vbo = gl.createBuffer()!;
    this._atlasTexture = gl.createTexture()!;

    gl.bindTexture(gl.TEXTURE_2D, this._atlasTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  // ── Shader compilation ──────────────────────────────────────────────────────

  private _compileProgram(): WebGLProgram {
    const gl = this._gl;
    const vert = this._compileShader(gl.VERTEX_SHADER, VERT_SRC);
    const frag = this._compileShader(gl.FRAGMENT_SHADER, FRAG_SRC);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vert);
    gl.attachShader(prog, frag);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(`[WebGLRasterSurface] Link error: ${gl.getProgramInfoLog(prog)}`);
    }
    gl.deleteShader(vert);
    gl.deleteShader(frag);
    return prog;
  }

  private _compileShader(type: number, src: string): WebGLShader {
    const gl = this._gl;
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(`[WebGLRasterSurface] Shader error: ${gl.getShaderInfoLog(shader)}`);
    }
    return shader;
  }

  // ── Filmstrip render ────────────────────────────────────────────────────────

  drawFilmstrip(artifacts: readonly TransportArtifact[], layout: FilmstripLayout): void {
    if (this._disposed || artifacts.length === 0) {
      this._clear(layout);
      return;
    }

    const gl = this._gl;
    const { clipWidthPx, stripHeightPx, dpr, tileWidthPx: targetTileW = 60 } = layout;

    const tileCount = Math.max(1, Math.ceil(clipWidthPx / targetTileW));
    const backingW = Math.round(clipWidthPx * dpr);
    const backingH = Math.round(stripHeightPx * dpr);

    if (this._canvas.width !== backingW || this._canvas.height !== backingH) {
      this._canvas.width = backingW;
      this._canvas.height = backingH;
    }

    gl.viewport(0, 0, backingW, backingH);
    gl.clearColor(0.047, 0.153, 0.188, 1.0); // #0c2730
    gl.clear(gl.COLOR_BUFFER_BIT);

    // ── Upload atlas ────────────────────────────────────────────────────────
    const cols = Math.min(artifacts.length, 16); // max 16 per row
    const { atlasW, atlasH, cellW, cellH, cells } = packAtlas(artifacts, cols);

    gl.bindTexture(gl.TEXTURE_2D, this._atlasTexture);
    // Allocate atlas
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, atlasW, atlasH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    // Upload each bitmap into its atlas cell
    for (let i = 0; i < artifacts.length; i++) {
      const art = artifacts[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, col * cellW, row * cellH, gl.RGBA, gl.UNSIGNED_BYTE, art.bitmap);
    }

    // ── Build per-tile geometry ─────────────────────────────────────────────
    // Destination rects are native bitmap pixel crops clipped into fixed tile
    // slots. This avoids stretching low-resolution artifacts across the slot.
    const FLOATS_PER_VERTEX = 8;
    const VERTS_PER_TILE = 6;
    const tileW = Math.round(targetTileW * dpr);
    const tileH = backingH;
    const rects: Array<{ pos: [number, number, number, number]; uv: [number, number, number, number] }> = [];

    // Map tiles to artifacts based on timestamp, not array index.
    // This prevents blank gaps when artifacts.length < tileCount (heavy zoom).
    const firstTimestamp = artifacts[0]?.timestampMs ?? 0;
    const lastTimestamp = artifacts[artifacts.length - 1]?.timestampMs ?? 0;
    const timeSpan = lastTimestamp - firstTimestamp;

    for (let i = 0; i < tileCount; i++) {
      // Find the artifact closest to this tile's timestamp position
      const tileRatio = tileCount > 1 ? i / (tileCount - 1) : 0;
      const targetTimestamp = firstTimestamp + timeSpan * tileRatio;

      // Binary search for closest artifact by timestamp
      let artIdx = 0;
      let minDiff = Infinity;
      for (let j = 0; j < artifacts.length; j++) {
        const diff = Math.abs(artifacts[j].timestampMs - targetTimestamp);
        if (diff < minDiff) {
          minDiff = diff;
          artIdx = j;
        }
      }

      const cell = cells[artIdx];
      const art = artifacts[artIdx];
      const tileX = i * tileW;

      // Center-crop: scale bitmap to cover tile, then crop to fit
      const bmpAspect = art.width / art.height;
      const tileAspect = tileW / tileH;

      let drawW: number, drawH: number, drawX: number, drawY: number;

      if (bmpAspect > tileAspect) {
        // Bitmap is wider - fit height, crop width
        drawH = tileH;
        drawW = Math.round(drawH * bmpAspect);
        drawX = tileX - Math.round((drawW - tileW) / 2);
        drawY = 0;
      } else {
        // Bitmap is taller - fit width, crop height
        drawW = tileW;
        drawH = Math.round(drawW / bmpAspect);
        drawX = tileX;
        drawY = Math.round((tileH - drawH) / 2);
      }

      // Clip to tile boundaries
      const left = Math.max(tileX, drawX, 0);
      const top = Math.max(0, drawY);
      const right = Math.min(tileX + tileW, drawX + drawW, backingW);
      const bottom = Math.min(tileH, drawY + drawH, backingH);
      const dstW = right - left;
      const dstH = bottom - top;
      if (dstW <= 0 || dstH <= 0) continue;

      // Calculate source UV coordinates for the visible portion
      const srcX = left - drawX;
      const srcY = top - drawY;
      const srcW = dstW;
      const srcH = dstH;

      // Map source pixels to atlas UV space
      const u0 = cell.u + (srcX / drawW) * cell.uw;
      const v0 = cell.v + (srcY / drawH) * cell.vh;
      const uw = (srcW / drawW) * cell.uw;
      const vh = (srcH / drawH) * cell.vh;

      rects.push({
        pos: [(left / backingW) * 2 - 1, 1 - (top / backingH) * 2, (dstW / backingW) * 2, (dstH / backingH) * 2],
        uv: [u0, v0, uw, vh],
      });
    }

    const buf = new Float32Array(rects.length * VERTS_PER_TILE * FLOATS_PER_VERTEX);

    for (let i = 0; i < rects.length; i++) {
      const rect = rects[i];
      for (let v = 0; v < VERTS_PER_TILE; v++) {
        const off = (i * VERTS_PER_TILE + v) * FLOATS_PER_VERTEX;
        buf[off + 0] = rect.pos[0];
        buf[off + 1] = rect.pos[1];
        buf[off + 2] = rect.pos[2];
        buf[off + 3] = rect.pos[3];
        buf[off + 4] = rect.uv[0];
        buf[off + 5] = rect.uv[1];
        buf[off + 6] = rect.uv[2];
        buf[off + 7] = rect.uv[3];
      }
    }

    // ── Upload VBO and draw ─────────────────────────────────────────────────
    gl.useProgram(this._program);
    gl.bindVertexArray(this._vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this._vbo);
    gl.bufferData(gl.ARRAY_BUFFER, buf, gl.DYNAMIC_DRAW);

    const stride = FLOATS_PER_VERTEX * 4;
    gl.enableVertexAttribArray(this._aPosRect);
    gl.vertexAttribPointer(this._aPosRect, 4, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(this._aUvRect);
    gl.vertexAttribPointer(this._aUvRect, 4, gl.FLOAT, false, stride, 4 * 4);

    gl.uniform1i(gl.getUniformLocation(this._program, "u_atlas"), 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._atlasTexture);

    // Single draw call for ALL tiles
    gl.drawArrays(gl.TRIANGLES, 0, rects.length * VERTS_PER_TILE);

    gl.bindVertexArray(null);
  }

  drawPlaceholder(layout: FilmstripLayout): void {
    this._clear(layout);
  }

  private _clear(layout: FilmstripLayout): void {
    const gl = this._gl;
    const { clipWidthPx, stripHeightPx, dpr } = layout;
    const w = Math.round(clipWidthPx * dpr);
    const h = Math.round(stripHeightPx * dpr);
    if (this._canvas.width !== w || this._canvas.height !== h) {
      this._canvas.width = w;
      this._canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    gl.clearColor(0.047, 0.153, 0.188, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    const gl = this._gl;
    gl.deleteTexture(this._atlasTexture);
    gl.deleteBuffer(this._vbo);
    gl.deleteVertexArray(this._vao);
    gl.deleteProgram(this._program);
  }

  get isDisposed(): boolean {
    return this._disposed;
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export type AnyRasterSurface = RasterSurface | WebGLRasterSurface;

/**
 * Create the best available raster surface for a canvas element.
 *
 * - Tries WebGL2 first (single draw call, GPU atlas upload)
 * - Falls back to Canvas2D `RasterSurface` if WebGL2 is unavailable
 *
 * ClipFilmstrip usage:
 *   surfaceRef.current = createRasterSurface(canvasRef.current);
 */
export function createRasterSurface(canvas: HTMLCanvasElement): AnyRasterSurface {
  try {
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      desynchronized: true,
      antialias: false,
      powerPreference: "default",
    });
    if (gl) {
      return new WebGLRasterSurface(canvas, gl);
    }
  } catch {
    // WebGL context creation can throw in some sandboxed environments
  }
  return new RasterSurface(canvas);
}
