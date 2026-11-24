// A reference layer's colour (Decision "Drawing layers"): its file's AutoCAD Color Index as a CSS colour, the way
// AutoCAD shows it. 7 (white on black, black on white) and no colour are the plan's ink, so they read in both themes.
// 1–9 are the named ones; 10–249 run round the hue wheel 15° apart, each hue in five shades, full and pale; 250–255 are
// greys. The colour comes from the file, not from GFit's palette: computed here, never written as a raw value.

const NAMED: Record<number, [number, number, number]> = {
  1: [255, 0, 0],
  2: [255, 255, 0],
  3: [0, 255, 0],
  4: [0, 255, 255],
  5: [0, 0, 255],
  6: [255, 0, 255],
  8: [128, 128, 128],
  9: [192, 192, 192],
}
const GREYS = [51, 80, 105, 130, 190, 255]
/** Each hue's five shades, brightest first. */
const SHADES = [1, 0.65, 0.5, 0.3, 0.15]

/** HSV (h in degrees, s and v 0–1) as RGB 0–255. */
function hsv(h: number, s: number, v: number): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h / 60) % 6
    return Math.round(255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))))
  }
  return [f(5), f(3), f(1)]
}

/** The RGB of an ACI index; null: 7, none, or out of range (the plan's ink). */
export function aciRgb(index: number | undefined): [number, number, number] | null {
  if (index === undefined || !Number.isInteger(index) || index < 1 || index > 255 || index === 7) return null
  if (NAMED[index]) return NAMED[index]
  if (index >= 250) return [GREYS[index - 250], GREYS[index - 250], GREYS[index - 250]]
  const i = index - 10
  return hsv(Math.floor(i / 10) * 15, i % 2 === 0 ? 1 : 0.5, SHADES[Math.floor((i % 10) / 2)])
}

/** A layer's colour for the plan's stroke and its swatch. */
export function aciColor(index: number | undefined): string {
  const c = aciRgb(index)
  return c ? `rgb(${c[0]} ${c[1]} ${c[2]})` : 'var(--ink-secondary)'
}
