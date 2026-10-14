// Color math shared by the UI. Hue 0-360, saturation and value 0-100 in the UI;
// the protocol takes hue 0-360, saturation 0-1000 and brightness 3-1000.

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [f(5), f(3), f(1)].map((x) => Math.round(x * 255)) as [number, number, number];
}

export const rgbHex = (rgb: number[]) =>
  "#" + rgb.map((x) => x.toString(16).padStart(2, "0")).join("").toUpperCase();

export const hsvHex = (h: number, s: number, v = 100) => rgbHex(hsvToRgb(h, s / 100, v / 100));

/** Space-separated "r g b", for the `--c` custom property the stylesheet uses. */
export const rgbStr = (h: number, s: number) => hsvToRgb(h, s / 100, 1).join(" ");

export function hexToHsv(hex: string): { h: number; s: number; v: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h: Math.round(h), s: Math.round(max ? (d / max) * 100 : 0), v: Math.round(max * 100) };
}

/** UI saturation (0-100) to protocol saturation (0-1000). */
export const protoS = (s: number) => Math.round(s * 10);

/** UI brightness (3-100 %) to protocol brightness (3-1000). */
export const protoB = (percent: number) => Math.round(3 + ((percent - 3) * 997) / 97);

/** Protocol brightness (3-1000) to UI brightness (3-100 %). */
export function percentOfProto(protoBrightness: number): number {
  return clamp(Math.round(3 + ((protoBrightness - 3) * 97) / 997), 3, 100);
}
