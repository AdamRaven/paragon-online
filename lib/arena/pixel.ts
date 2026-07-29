import { GLYPH_H, drawTextShadowed } from "./font";

/**
 * Pixel-art rendering support.
 *
 * The canvas backing store IS the low-resolution art buffer: it is sized in
 * art pixels and stretched to fit by CSS with `image-rendering: pixelated`, so
 * the GPU performs exactly one nearest-neighbour upscale. Drawing to a buffer
 * and then blitting into a device-pixel-ratio-scaled canvas would resample
 * twice and leave pixels visibly uneven.
 *
 * Everything is drawn with integer-aligned `fillRect` calls and a bitmap font,
 * so nothing is ever antialiased.
 */

/** Screen pixels per art pixel — how chunky the pixels look. */
export const PIXEL_SCALE = 3;

/**
 * World units per art pixel — how far the camera is zoomed in. Together with
 * PIXEL_SCALE this makes a 62-unit-tall fighter 31 art pixels tall, drawn at
 * 93 screen pixels: chunky enough to read as pixel art, big enough to see.
 */
export const WORLD_PER_PIXEL = 2;

/** The slice of the world visible on a canvas of this CSS size. */
export function worldViewSize(cssW: number, cssH: number) {
  return {
    w: (cssW / PIXEL_SCALE) * WORLD_PER_PIXEL,
    h: (cssH / PIXEL_SCALE) * WORLD_PER_PIXEL,
  };
}

/** Fills an axis-aligned rectangle snapped to the pixel grid. */
export function px(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string
) {
  const x0 = Math.round(x);
  const y0 = Math.round(y);
  const x1 = Math.round(x + w);
  const y1 = Math.round(y + h);
  if (x1 <= x0 || y1 <= y0) return;
  ctx.fillStyle = color;
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
}

/** A 1px outline, drawn as four rects so it stays crisp. */
export function pxOutline(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string
) {
  px(ctx, x, y, w, 1, color);
  px(ctx, x, y + h - 1, w, 1, color);
  px(ctx, x, y, 1, h, color);
  px(ctx, x + w - 1, y, 1, h, color);
}

/** A filled circle rasterised onto the pixel grid, one row at a time. */
export function pxCircle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string
) {
  const cX = Math.round(cx);
  const cY = Math.round(cy);
  const rr = Math.max(1, Math.round(r));
  ctx.fillStyle = color;
  for (let dy = -rr; dy <= rr; dy++) {
    const dx = Math.floor(Math.sqrt(rr * rr - dy * dy));
    if (dx <= 0) continue;
    ctx.fillRect(cX - dx, cY + dy, dx * 2, 1);
  }
}

/** A soft glow approximated with concentric translucent rings. */
export function pxGlow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
  alpha: number
) {
  const prev = ctx.globalAlpha;
  const steps = 3;
  for (let i = steps; i >= 1; i--) {
    ctx.globalAlpha = alpha * (i / steps) * 0.4;
    pxCircle(ctx, cx, cy, (r * i) / steps, color);
  }
  ctx.globalAlpha = prev;
}

/**
 * A 2x2 checkerboard fill, the classic way to fake a shade between two
 * palette entries without adding a colour.
 */
export function pxDither(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string
) {
  const x0 = Math.round(x);
  const y0 = Math.round(y);
  const x1 = Math.round(x + w);
  const y1 = Math.round(y + h);
  ctx.fillStyle = color;
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0 + ((yy & 1) ^ (x0 & 1)); xx < x1; xx += 2) {
      ctx.fillRect(xx, yy, 1, 1);
    }
  }
}

/**
 * Pixel text. Uses the bitmap font rather than `fillText`, which would be
 * antialiased and blur once the canvas is upscaled.
 */
export function pxText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  _size = 6,
  align: "left" | "center" | "right" = "center"
) {
  drawTextShadowed(ctx, text, x, y - GLYPH_H, color, align);
}

/** Art-pixel size of the canvas, derived from its CSS footprint. */
export function artSize(cssW: number, cssH: number) {
  return {
    w: Math.max(1, Math.round(cssW / PIXEL_SCALE)),
    h: Math.max(1, Math.round(cssH / PIXEL_SCALE)),
  };
}
