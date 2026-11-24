// The map under the plan (Phase 5.4; port of Practiko's `vistas/mapa/teselas.ts`): the OpenStreetMap or Esri World
// Imagery tiles round a point are fetched, stitched on a canvas at Web Mercator's exact scale and kept as a JPEG data
// URL, so the project shows it offline. One change from Practiko: the image's size in metres is measured on the
// ellipsoid (engine/geo/local.ts), across and along, so the map lies where the georeference puts the parcel; Web
// Mercator's own metres are a few tenths of a percent off north–south.
import type { MapSource, SiteMap } from '../../model/schema.ts'
import { toPlan, type LatLon } from '../../engine/geo/local.ts'

export interface Tile {
  x: number
  y: number
  z: number
}

export const TILE_SIZE = 256
export const DEFAULT_ZOOM = 18
export const DEFAULT_RADIUS = 250 // m
export const TILE_WAIT_MS = 10_000
/** Downloads at a time: never hundreds of connections at once (OSM asks for moderation). */
export const CONCURRENCY = 8
export const JPEG_QUALITY = 0.8
/** The image kept in the project is at most this (bytes of the JPEG). */
export const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024
export const CAPTURE_ERROR = 'The map could not be captured (no connection, or the tile server refused)'

export const ATTRIBUTION: Record<MapSource, string> = {
  street: '© OpenStreetMap contributors',
  satellite: 'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics',
}

/** Metres per pixel of a 256 px Web Mercator tile at that latitude and zoom. */
export function metresPerPixel(lat: number, zoom: number): number {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom
}

/** The global pixel (at that zoom) of a point: the origin is the world's north-west corner. */
export function globalPixel(lat: number, lon: number, zoom: number): { x: number; y: number } {
  const n = TILE_SIZE * 2 ** zoom
  const s = Math.sin((lat * Math.PI) / 180)
  return { x: ((lon + 180) / 360) * n, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n }
}

/** The point of a global pixel: globalPixel's inverse. */
export function pixelLatLon(x: number, y: number, zoom: number): LatLon {
  const n = TILE_SIZE * 2 ** zoom
  const lon = (x / n) * 360 - 180
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI
  return { lat, lon }
}

/** The tiles covering a square of ±radius m round the point, by rows (y) then columns (x). */
export function tilesAround(lat: number, lon: number, zoom: number, radius: number): Tile[] {
  const c = globalPixel(lat, lon, zoom)
  const half = radius / metresPerPixel(lat, zoom)
  const n = 2 ** zoom
  const x0 = Math.floor((c.x - half) / TILE_SIZE)
  const x1 = Math.floor((c.x + half) / TILE_SIZE)
  const y0 = Math.max(0, Math.floor((c.y - half) / TILE_SIZE))
  const y1 = Math.min(n - 1, Math.floor((c.y + half) / TILE_SIZE))
  const r: Tile[] = []
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) r.push({ x: ((x % n) + n) % n, y, z: zoom })
  return r
}

export function tileUrl(source: MapSource, t: Tile): string {
  return source === 'street'
    ? `https://tile.openstreetmap.org/${t.z}/${t.x}/${t.y}.png`
    : `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${t.z}/${t.y}/${t.x}`
}

/** A tile of the capture: x wrapped for its URL, and where (px) it goes in the final image. */
export interface PlacedTile extends Tile {
  dx: number
  dy: number
}
export interface Layout {
  mpp: number
  /** The image's side, in px (square). */
  side: number
  /** The image's side in Web Mercator's metres at its centre: what Practiko kept. */
  sideM: number
  /** The global pixel (at that zoom) of the image's north-west corner. */
  originX: number
  originY: number
  tiles: PlacedTile[]
}

/**
 * The capture's layout, without the network or the canvas: the image is `side` px (±radius exactly) and its centre
 * falls within 0.5 px of the point. The tiles are chosen from the image's own box (origin … origin + side), so no edge
 * is left uncovered; those across the antimeridian wrap in x.
 */
export function captureLayout(lat: number, lon: number, zoom: number, radius: number): Layout {
  const mpp = metresPerPixel(lat, zoom)
  const side = Math.max(1, Math.round((2 * radius) / mpp))
  const c = globalPixel(lat, lon, zoom)
  const originX = Math.round(c.x - side / 2)
  const originY = Math.round(c.y - side / 2)
  const n = 2 ** zoom
  const x0 = Math.floor(originX / TILE_SIZE)
  const x1 = Math.floor((originX + side - 1) / TILE_SIZE)
  const y0 = Math.max(0, Math.floor(originY / TILE_SIZE))
  const y1 = Math.min(n - 1, Math.floor((originY + side - 1) / TILE_SIZE))
  const tiles: PlacedTile[] = []
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++)
      tiles.push({ x: ((x % n) + n) % n, y, z: zoom, dx: x * TILE_SIZE - originX, dy: y * TILE_SIZE - originY })
  return { mpp, side, sideM: side * mpp, originX, originY, tiles }
}

/** The image's centre and its size on the ground (m): east–west at its centre, north–south along its meridian. */
export function groundOf(l: Layout, zoom: number): { center: LatLon; width: number; height: number } {
  const center = pixelLatLon(l.originX + l.side / 2, l.originY + l.side / 2, zoom)
  const west = pixelLatLon(l.originX, l.originY + l.side / 2, zoom)
  const top = pixelLatLon(l.originX + l.side / 2, l.originY, zoom)
  const bottom = pixelLatLon(l.originX + l.side / 2, l.originY + l.side, zoom)
  const geo = { ...center, north: 0 }
  const width = 2 * Math.abs(toPlan(geo, { lat: center.lat, lon: west.lon }).x)
  const height = toPlan(geo, top).y - toPlan(geo, bottom).y
  return { center, width, height }
}

/** A download with its own deadline, which starts when the request starts; `all` cancels it. */
async function fetchTile(url: string, all: AbortSignal): Promise<ImageBitmap> {
  const own = new AbortController()
  const cancel = () => own.abort()
  if (all.aborted) cancel()
  all.addEventListener('abort', cancel)
  const clock = setTimeout(cancel, TILE_WAIT_MS)
  try {
    const r = await fetch(url, { signal: own.signal, mode: 'cors' })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return await createImageBitmap(await r.blob())
  } finally {
    clearTimeout(clock)
    all.removeEventListener('abort', cancel)
  }
}

/** All of them, at most CONCURRENCY at a time; if one fails, the others are cancelled and what came is let go. */
async function fetchAll(urls: string[]): Promise<ImageBitmap[]> {
  const all = new AbortController()
  const got: (ImageBitmap | undefined)[] = Array.from({ length: urls.length })
  let next = 0
  const release = () => {
    for (const b of got) b?.close?.()
  }
  const worker = async () => {
    while (next < urls.length && !all.signal.aborted) {
      const i = next++
      const b = await fetchTile(urls[i], all.signal)
      if (all.signal.aborted) b.close?.()
      else got[i] = b
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, urls.length) }, worker))
  } catch (e) {
    all.abort()
    release()
    throw e
  }
  return got as ImageBitmap[]
}

const dataUrlBytes = (d: string) => Math.ceil(((d.length - d.indexOf(',') - 1) * 3) / 4)

/**
 * Fetches the tiles (10 s each, 8 at a time), stitches them on a canvas cut to ±radius exactly round the point and
 * returns the map. Fails with CAPTURE_ERROR if any tile does not come (no network, CORS, a server error, the time).
 */
export async function captureMap(lat: number, lon: number, source: MapSource, radius: number = DEFAULT_RADIUS, zoom: number = DEFAULT_ZOOM): Promise<SiteMap> {
  const layout = captureLayout(lat, lon, zoom, radius)
  const { side, tiles } = layout

  let images: ImageBitmap[]
  try {
    images = await fetchAll(tiles.map((t) => tileUrl(source, t)))
  } catch {
    throw new Error(CAPTURE_ERROR)
  }

  try {
    const canvas = document.createElement('canvas')
    canvas.width = side
    canvas.height = side
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no canvas')
    // the paper under any gap: the UI's sunken fill (a canvas takes no CSS variable, so it is read)
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--panel-sunken').trim() || 'gray'
    ctx.fillRect(0, 0, side, side)
    tiles.forEach((t, i) => ctx.drawImage(images[i], t.dx, t.dy))

    let image = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
    // too heavy: the side shrinks until it fits; its size in metres does not change
    let scale = 1
    while (dataUrlBytes(image) > MAX_IMAGE_BYTES && scale > 0.2) {
      scale *= 0.8
      const small = document.createElement('canvas')
      small.width = Math.max(1, Math.round(side * scale))
      small.height = small.width
      small.getContext('2d')?.drawImage(canvas, 0, 0, small.width, small.height)
      image = small.toDataURL('image/jpeg', JPEG_QUALITY)
    }

    const { center, width, height } = groundOf(layout, zoom)
    return { source, lat: center.lat, lon: center.lon, zoom, image, width, height, attribution: ATTRIBUTION[source] }
  } catch {
    throw new Error(CAPTURE_ERROR)
  } finally {
    for (const b of images) b.close?.()
  }
}

/** How far and how close to capture for a site that reaches `reach` m from its centre: at least ±250 m at zoom 18. */
export function captureReach(reach: number): { radius: number; zoom: number } {
  const radius = Math.max(DEFAULT_RADIUS, Math.ceil((reach + 60) / 50) * 50)
  // a wider map is taken a zoom out, so the tiles stay a few dozen and the image fits its bytes
  return { radius, zoom: radius > 600 ? 16 : radius > 400 ? 17 : DEFAULT_ZOOM }
}
