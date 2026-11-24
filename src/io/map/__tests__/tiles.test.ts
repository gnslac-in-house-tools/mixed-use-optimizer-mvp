// Ported from Plaza-Practiko `vistas/mapa/__tests__/teselas.test.ts`: same inputs, same expected results; plus the
// image's size on the ellipsoid (groundOf), GFit's own.
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CAPTURE_ERROR,
  CONCURRENCY,
  MAX_IMAGE_BYTES,
  TILE_SIZE,
  captureLayout,
  captureMap,
  captureReach,
  globalPixel,
  groundOf,
  metresPerPixel,
  pixelLatLon,
  tileUrl,
  tilesAround,
} from '../tiles.ts'

describe('metresPerPixel', () => {
  it('at the equator and zoom 0 it is 156543.03392', () => {
    expect(metresPerPixel(0, 0)).toBeCloseTo(156543.03392, 5)
  })
  it('shrinks with cos(lat) and halves per zoom', () => {
    expect(metresPerPixel(60, 0)).toBeCloseTo(156543.03392 / 2, 3)
    expect(metresPerPixel(0, 1)).toBeCloseTo(156543.03392 / 2, 5)
  })
})

describe('globalPixel and pixelLatLon', () => {
  it('there and back', () => {
    const p = globalPixel(10.0163, -84.2116, 18)
    const ll = pixelLatLon(p.x, p.y, 18)
    expect(ll.lat).toBeCloseTo(10.0163, 9)
    expect(ll.lon).toBeCloseTo(-84.2116, 9)
  })
})

describe('tilesAround', () => {
  const lat = 10.0163
  const lon = -84.2116
  const z = 18

  function px(lat_: number, lon_: number) {
    const n = 256 * 2 ** z
    const s = Math.sin((lat_ * Math.PI) / 180)
    return { x: ((lon_ + 180) / 360) * n, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n }
  }

  it('covers ±250 m round the point with a grid without gaps', () => {
    const ts = tilesAround(lat, lon, z, 250)
    expect(ts.every((t) => t.z === z)).toBe(true)
    const xs = [...new Set(ts.map((t) => t.x))].sort((a, b) => a - b)
    const ys = [...new Set(ts.map((t) => t.y))].sort((a, b) => a - b)
    expect(ts).toHaveLength(xs.length * ys.length)
    expect(xs.at(-1)! - xs[0]).toBe(xs.length - 1)
    expect(ys.at(-1)! - ys[0]).toBe(ys.length - 1)
    const half = 250 / metresPerPixel(lat, z)
    const c = px(lat, lon)
    expect(xs[0] * 256).toBeLessThanOrEqual(c.x - half)
    expect((xs.at(-1)! + 1) * 256).toBeGreaterThanOrEqual(c.x + half)
    expect(ys[0] * 256).toBeLessThanOrEqual(c.y - half)
    expect((ys.at(-1)! + 1) * 256).toBeGreaterThanOrEqual(c.y + half)
  })
})

describe('tileUrl', () => {
  it('builds the OSM and Esri URLs (Esri goes z/y/x)', () => {
    expect(tileUrl('street', { x: 1, y: 2, z: 3 })).toBe('https://tile.openstreetmap.org/3/1/2.png')
    expect(tileUrl('satellite', { x: 1, y: 2, z: 3 })).toBe('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/3/2/1')
  })
})

describe('captureMap', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('without a network or with CORS blocked it fails with the UI’s message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(captureMap(10.0163, -84.2116, 'street')).rejects.toThrow(CAPTURE_ERROR)
  })
  it('an HTTP error fails with that message too', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }))
    await expect(captureMap(10.0163, -84.2116, 'satellite', 150)).rejects.toThrow(CAPTURE_ERROR)
  })
})

describe('captureLayout', () => {
  const cases = [
    { name: 'Alajuela', lat: 10.0163, lon: -84.2116, radius: 250 },
    { name: 'radius 400', lat: 10.0163, lon: -84.2116, radius: 400 },
    { name: 'high latitude', lat: 60.17, lon: 24.94, radius: 150 },
    { name: 'antimeridian', lat: 0.5, lon: 179.999, radius: 400 },
    { name: 'meridian 0', lat: 51.5, lon: -0.0001, radius: 250 },
  ]
  for (const c of cases) {
    it(`${c.name}: the image’s centre falls within 0.5 px of the point and no edge is left uncovered`, () => {
      const z = 18
      const d = captureLayout(c.lat, c.lon, z, c.radius)
      const p = globalPixel(c.lat, c.lon, z)
      expect(Math.abs(d.originX + d.side / 2 - p.x)).toBeLessThanOrEqual(0.5)
      expect(Math.abs(d.originY + d.side / 2 - p.y)).toBeLessThanOrEqual(0.5)
      expect(d.sideM).toBeCloseTo(d.side * metresPerPixel(c.lat, z), 9)
      expect(Math.abs(d.sideM - 2 * c.radius)).toBeLessThanOrEqual(metresPerPixel(c.lat, z))
      // the placed tiles make a continuous grid that holds the image [0, side)²
      const xs = [...new Set(d.tiles.map((t) => t.dx))].sort((a, b) => a - b)
      const ys = [...new Set(d.tiles.map((t) => t.dy))].sort((a, b) => a - b)
      expect(d.tiles).toHaveLength(xs.length * ys.length)
      xs.forEach((x, i) => i > 0 && expect(x - xs[i - 1]).toBe(TILE_SIZE))
      ys.forEach((y, i) => i > 0 && expect(y - ys[i - 1]).toBe(TILE_SIZE))
      expect(xs[0]).toBeLessThanOrEqual(0)
      expect(ys[0]).toBeLessThanOrEqual(0)
      expect(xs.at(-1)! + TILE_SIZE).toBeGreaterThanOrEqual(d.side)
      expect(ys.at(-1)! + TILE_SIZE).toBeGreaterThanOrEqual(d.side)
      // and no whole column or row is left outside the image
      expect(xs.at(-1)!).toBeLessThan(d.side)
      expect(xs[0] + TILE_SIZE).toBeGreaterThan(0)
      expect(d.tiles.every((t) => t.x >= 0 && t.x < 2 ** z)).toBe(true)
    })
  }
})

describe('groundOf', () => {
  it('the image’s size on the ellipsoid: east–west as Web Mercator’s within 0.4 %, north–south within 0.7 %', () => {
    for (const lat of [0, 20.66, 51.5]) {
      const d = captureLayout(lat, 10, 18, 250)
      const g = groundOf(d, 18)
      expect(Math.abs(g.width / d.sideM - 1)).toBeLessThan(0.004)
      expect(Math.abs(g.height / d.sideM - 1)).toBeLessThan(0.007)
      expect(g.center.lat).toBeCloseTo(lat, 4)
    }
  })
})

describe('captureReach', () => {
  it('at least ±250 m at zoom 18; a bigger site a wider map, a zoom out', () => {
    expect(captureReach(0)).toEqual({ radius: 250, zoom: 18 })
    expect(captureReach(300)).toEqual({ radius: 400, zoom: 18 })
    expect(captureReach(500).zoom).toBe(17)
    expect(captureReach(1200).zoom).toBe(16)
  })
})

describe('captureMap: the way that works', () => {
  const real = document.createElement.bind(document)

  function prepare(options: { bytesPerPx?: number } = {}) {
    const canvases: { width: number; height: number; drawn: unknown[][] }[] = []
    vi.spyOn(document, 'createElement').mockImplementation((tag: string, o?: ElementCreationOptions) => {
      if (tag !== 'canvas') return real(tag, o)
      const l = {
        width: 0,
        height: 0,
        drawn: [] as unknown[][],
        getContext: () => ({ fillRect: vi.fn(), fillStyle: '', drawImage: (...a: unknown[]) => l.drawn.push(a) }),
        toDataURL: () => 'data:image/jpeg;base64,' + 'A'.repeat(l.width * l.width * (options.bytesPerPx ?? 1)),
      }
      canvases.push(l)
      return l as unknown as HTMLCanvasElement
    })
    let flying = 0
    let peak = 0
    const urls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(url)
        flying++
        peak = Math.max(peak, flying)
        await new Promise((r) => setTimeout(r, 1))
        flying--
        return { ok: true, status: 200, blob: async () => new Blob() }
      }),
    )
    const closed = vi.fn()
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ close: closed })))
    return { canvases, urls, closed, peak: () => peak }
  }

  afterEach(() => vi.restoreAllMocks())

  it('stitches the tiles on a canvas of the exact side, covers the whole image and fetches at most 8 at a time', async () => {
    const f = prepare()
    const d = captureLayout(10.0163, -84.2116, 18, 400)
    expect(d.tiles.length).toBeGreaterThan(CONCURRENCY)
    const m = await captureMap(10.0163, -84.2116, 'street', 400)
    expect(f.urls).toHaveLength(d.tiles.length)
    expect(f.peak()).toBeLessThanOrEqual(CONCURRENCY)
    expect(f.peak()).toBeGreaterThan(1)
    const canvas = f.canvases[0]
    expect(canvas.width).toBe(d.side)
    expect(canvas.drawn.map((a) => [a[1], a[2]])).toEqual(d.tiles.map((t) => [t.dx, t.dy]))
    const g = groundOf(d, 18)
    expect(m.width).toBe(g.width)
    expect(m.height).toBe(g.height)
    expect(m.attribution).toBe('© OpenStreetMap contributors')
    expect(f.closed).toHaveBeenCalledTimes(d.tiles.length)
  })

  it('an image over the limit shrinks, and its size in metres does not change', async () => {
    const f = prepare({ bytesPerPx: 4 })
    const d = captureLayout(10.0163, -84.2116, 18, 250)
    const m = await captureMap(10.0163, -84.2116, 'satellite', 250)
    const last = f.canvases.at(-1)!
    expect(last.width).toBeLessThan(d.side)
    expect(m.image.length * 0.75).toBeLessThanOrEqual(MAX_IMAGE_BYTES)
    expect(m.width).toBe(groundOf(d, 18).width)
  })

  it('a tile that fails cancels the others and lets go of what came', async () => {
    const f = prepare()
    let n = 0
    const good = vi.mocked(fetch).getMockImplementation()!
    vi.mocked(fetch).mockImplementation(async (u) => {
      if (++n === 3) throw new TypeError('Failed to fetch')
      return good(u as never, undefined as never)
    })
    await expect(captureMap(10.0163, -84.2116, 'street', 400)).rejects.toThrow(CAPTURE_ERROR)
    await new Promise((r) => setTimeout(r, 20))
    expect(f.canvases).toHaveLength(0)
    // nothing stays open: every image made is closed
    expect(f.closed.mock.calls.length).toBe(vi.mocked(createImageBitmap).mock.calls.length)
  })
})
