// Perceptual color helpers for theme-aware "biggest delta" pickers.

/** Parse any CSS color (hex, rgb, hsl, named, color-mix…) to sRGB bytes via
 *  canvas. Returns null on failure.
 *
 *  globalCompositeOperation='copy' ensures each fillRect replaces the pixel
 *  rather than alpha-compositing over the previous fill — without it,
 *  translucent colors like `#b3880088` blend with whatever was read last and
 *  lose their saturation. The `#000` pre-fill covers invalid color strings
 *  (where fillStyle is a no-op), preventing the previous fillStyle from
 *  leaking through. */
export function rgbOf(color: string, ctx: CanvasRenderingContext2D): [number, number, number] | null {
  if (!color) return null;
  ctx.globalCompositeOperation = 'copy';
  ctx.fillStyle = '#000';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return [r, g, b];
}

/** sRGB (0-255 bytes) → OKLab (Björn Ottosson's transform). */
export function rgbToOklab([r, g, b]: [number, number, number]): [number, number, number] {
  const toLinear = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const lr = toLinear(r), lg = toLinear(g), lb = toLinear(b);
  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;
  const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
  return [
    0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  ];
}

/** Perceptually-uniform ΔE — Euclidean distance in OKLab. */
export function deltaEOklab(a: [number, number, number], b: [number, number, number]): number {
  const dL = a[0] - b[0], da = a[1] - b[1], db = a[2] - b[2];
  return Math.sqrt(dL * dL + da * da + db * db);
}

/** OKLab chroma √(a²+b²). ≈0 for greys, ~0.10 for visible accents, ~0.20+ for
 *  vivid sRGB colors. Independent of lightness. */
export function chromaOklab([, a, b]: [number, number, number]): number {
  return Math.sqrt(a * a + b * b);
}

/** OKLab → sRGB (0-255 bytes). Per-channel clip: when the requested OkLab
 *  point is outside sRGB's gamut, channels saturate at 0/255 and the resulting
 *  hue drifts toward an sRGB primary. Acceptable for attention-grabbing
 *  alarm colors where vivid-snapped-to-primary is the desired look. */
export function oklabToRgb([L, a, b]: [number, number, number]): [number, number, number] {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  const lr = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  const toSrgb = (v: number) => {
    const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, Math.round(c * 255)));
  };
  return [toSrgb(lr), toSrgb(lg), toSrgb(lb)];
}

/** OkLCH → CSS hex. Hue in degrees. */
export function oklchToCssHex({ L, C, H }: { L: number; C: number; H: number }): string {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const [r, g, bl] = oklabToRgb([L, a, b]);
  const hex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(bl)}`;
}
