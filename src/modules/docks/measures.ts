// The docks' measures (Decisions "Optimizer plugin" and "Catalog"): how far a truck goes, and courts that do not fit.
//   dock-to-gate       Σ, dock wall by dock wall, from its court's mouth to the nearest truck gate,
//                      straight (cheap: no network; the circulation's own optimizer measures the route)  m
//   court-clash        Σ court out of the site or over another built mass, and what a shared court lacks
//                      of the depth it asks (Decision "Truck court"), by its wall's length                m²
import { difference, intersection, regionsArea } from '../../engine/geom/boolean.ts'
import { bounds, boundsTouch } from '../../engine/geom/polygon.ts'
import type { Point } from '../../model/schema.ts'
import { courtShapes } from './engine/docks.ts'
import { AREA_TOL, optionMasses, type Evaluated, type Measure } from '../measure.ts'

const truckGates = (e: Evaluated) =>
  e.derived.circulation.gates.filter((g) => g.vehicles !== 'cars' && g.flow !== 'out').map((g) => g.end)

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

export const DOCKS_MEASURES: Measure[] = [
  {
    id: 'dock-to-gate',
    area: 'flow',
    aim: false,
    rank: 3,
    label: 'Dock → truck gate',
    unit: 'm',
    help: 'From each dock wall’s court to the nearest gate trucks come in by, straight, summed',
    read: (e) => {
      const gates = truckGates(e)
      if (gates.length === 0) return 0
      return e.derived.circulation.docks.reduce((s, d) => {
        // the mouth is the court's frame's far edge (a shaped court's frame: the rectangle that holds its shapes; else the wall's own)
        const depth = Math.min(d.depth, d.shares?.gap ?? Infinity)
        const mouth = { x: (d.court[0].x + d.court[1].x) / 2 + d.out.x * depth, y: (d.court[0].y + d.court[1].y) / 2 + d.out.y * depth }
        return s + Math.min(...gates.map((g) => dist(mouth, g)))
      }, 0)
    },
  },
  {
    id: 'court-clash',
    area: 'flow',
    aim: false,
    rank: 9,
    label: 'Courts blocked',
    unit: 'm2',
    help: 'Truck court out of the site or over another built mass, or a shared court short of its depth, summed',
    read: (e) => {
      const site = e.derived.site.polygon
      const built = optionMasses(e).filter((m) => m.built)
      return e.derived.circulation.docks.reduce((s, d) => {
        // what is paved: a shaped court's shapes (the frame that holds them sifts the masses), else the one rectangle
        const paved = courtShapes(d)
        const out = site ? paved.reduce((n, c) => n + regionsArea(difference([c], [site])), 0) : 0
        const box = bounds(d.court)
        const over = built
          .filter((m) => m.id !== d.massId && m.id !== d.shares?.massId && boundsTouch(box, bounds(m.polygon), 0))
          .reduce((t, m) => t + paved.reduce((n, c) => n + regionsArea(intersection([c], [m.polygon])), 0), 0)
        const short = d.shares ? Math.max(0, d.depth - d.shares.gap) * Math.hypot(d.court[1].x - d.court[0].x, d.court[1].y - d.court[0].y) : 0
        return s + (out > AREA_TOL ? out : 0) + (over > AREA_TOL ? over : 0) + (short > AREA_TOL ? short : 0)
      }, 0)
    },
  },
]
