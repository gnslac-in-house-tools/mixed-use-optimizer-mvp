// A place from what a designer pastes (Phase 5.4; port of Practiko's `latLonDeEnlace` and `esEnlaceCorto`, in
// `vistas/mapa/teselas.ts`): a Google Maps link or a "lat, lon" pair. Pure.
import type { LatLon } from './local.ts'

const N = /-?\d+(?:\.\d+)?/.source
const NC = /-?\d+,\d+/.source
const inRange = (lat: number, lon: number) => Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180

/**
 * The latitude and longitude of a Google Maps link ("…/@10.0163,-84.2116,17z…" or "…!3d10.0163!4d-84.2116") or of a
 * "lat, lon" text. Null when it finds no valid pair.
 */
export function latLonFromLink(text: string): LatLon | null {
  const t = text.trim()
  if (!t) return null
  const patterns = [
    new RegExp('@(' + N + '),\\s*(' + N + ')'),
    new RegExp('!3d(' + N + ')!4d(' + N + ')'),
    new RegExp('^(' + N + ')\\s*[,;\\s]\\s*(' + N + ')$'),
    // with a decimal comma ("10,0163, -84,2116"): the two numbers are apart by a space or a semicolon
    new RegExp('^(' + NC + ')\\s*[;,]?\\s+(' + NC + ')$'),
  ]
  for (const re of patterns) {
    const m = re.exec(t)
    if (!m) continue
    const lat = Number(m[1].replace(',', '.'))
    const lon = Number(m[2].replace(',', '.'))
    if (inRange(lat, lon)) return { lat, lon }
  }
  return null
}

/** A short Google Maps link (maps.app.goo.gl, goo.gl/maps): it carries no coordinates and cannot be resolved here. */
export function isShortLink(text: string): boolean {
  return /(?:maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(text)
}
