// From zero, chapter 6 — Streets and circulation: the Circulation and Parking rows of Layers; a street from the existing road north between the two
// blocks; a gate where it enters the site; Connect, which gives every truck court its way to a truck gate; the
// Circulation and Parking settings with what they hold; a parking lot.
import { gatesOf } from '../../../engine/circulation/gates.ts'
import { centroid } from '../../../engine/geom/polygon.ts'
import type { Point } from '../../../model/schema.ts'
import { actions } from '../../../state/actions/index.ts'
import { useApp } from '../../../state/store.ts'
import { useUi } from '../../layout/ui.ts'
import { useLayerPick } from '../../layers/layerPick.ts'
import { isBranchOpen, openBranch, showLayer } from '../../layers/show.ts'
import { connect } from '../../plan/circulation/connectCommand.ts'
import type { TourStep } from '../tour.ts'
import { tutorialCopies } from './common.ts'

const CHAPTER = 'Streets and circulation'

const option = () => {
  const { project, option: id } = useApp.getState()
  return project.options.find((o) => o.id === id)
}
/** Where the street runs: x halfway between the two blocks (else the site's middle), from the road to the north. */
function streetLine(): Point[] | null {
  const { project: p, derived } = useApp.getState()
  const site = derived.site.polygon
  if (!site) return null
  const halls = tutorialCopies().flatMap((id) => {
    const b = p.buildings.find((x) => x.id === id)
    const levels = new Set(b?.levels.map((l) => l.id) ?? [])
    const m = p.masses.find((x) => x.part === 'hall' && levels.has(x.levelId))
    return m && derived.masses[m.id] ? [centroid(derived.masses[m.id].polygon)] : []
  })
  const x = halls.length >= 2 ? (halls[0].x + halls[1].x) / 2 : centroid(site).x
  const road = p.site.existingRoads?.[0]?.points ?? []
  const y0 = road.length ? Math.min(...road.map((q) => q.y)) : Math.min(...site.map((q) => q.y))
  const y1 = Math.max(...site.map((q) => q.y)) - 80
  return [
    { x, y: y0 },
    { x, y: y1 },
  ]
}
/** The boundary's t (0–1 along its perimeter) nearest a point. */
function tOn(ring: Point[], q: Point): number {
  const lens = ring.map((a, i) => Math.hypot(ring[(i + 1) % ring.length].x - a.x, ring[(i + 1) % ring.length].y - a.y))
  const total = lens.reduce((s, l) => s + l, 0)
  let best = { d: Infinity, t: 0 }
  let run = 0
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const u = Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / (lens[i] ** 2 || 1)))
    const d = Math.hypot(a.x + dx * u - q.x, a.y + dy * u - q.y)
    if (d < best.d) best = { d, t: (run + u * lens[i]) / total }
    run += lens[i]
  })
  return best.t
}
const onFlow = () => {
  const ui = useUi.getState()
  ui.closeDialog()
  ui.setRail('layers')
  ui.setView('plan')
}
const streets = () => option()?.streets?.segments.length ?? 0
const gates = () => {
  const { project, option: id } = useApp.getState()
  return gatesOf(project, id).length
}
/** The truck courts Connect would still reach, once a project (the card reads `done` several times a second). */
const left = new WeakMap<object, Map<string, number>>()
const courtsLeft = () => {
  const { project, option: id } = useApp.getState()
  const byOption = left.get(project) ?? new Map<string, number>()
  if (!byOption.has(id)) byOption.set(id, actions.connectStreets(project, id).left)
  left.set(project, byOption)
  return byOption.get(id)!
}

export const FLOW_STEPS: TourStep[] = [
  {
    id: 'zero-flow',
    chapter: CHAPTER,
    title: 'Circulation in Layers',
    body: ['Open Layers, the tab on the left: its Circulation and Parking branches hold the streets, the gates and the lots, and Properties their settings. The tools for streets, gates and parking are in the Tools strip.'],
    anchor: 'layer-circulation',
    before: onFlow,
    act: () => {
      onFlow()
      openBranch('circulation')
    },
    // what the step asks: the Circulation row picked, or its branch opened (Layers being the tab shown is not yet doing it)
    done: () => useLayerPick.getState().keys.includes('circulation') || isBranchOpen('circulation'),
  },
  {
    id: 'zero-street',
    chapter: CHAPTER,
    title: 'A street',
    body: ['In the Streets group of the Tools strip, pick Street and click from the existing road, on the south side, north between the two blocks; Enter ends it.'],
    why: 'A street is drawn by its centreline; its type (in the Streets group’s ▾) gives a new street’s width and which vehicles use it, then each side is pulled by its own pill and a lane pill adds or takes lanes. Streets that meet are one paving, and an end on an existing street links to it.',
    anchor: 'tool-street',
    before: onFlow,
    act: () => {
      const line = streetLine()
      const { option: id } = useApp.getState()
      if (line) useApp.getState().apply((p) => actions.drawStreet(p, id, line)?.project ?? p)
    },
    done: () => streets() > 0,
  },
  {
    id: 'zero-gate',
    chapter: CHAPTER,
    title: 'A gate',
    body: ['In the Streets group, pick Gate and click the boundary where the street comes in, or a side of any street.'],
    why: 'Gates are where trucks and cars enter the site: the circulation is measured from them, and a guard house can stand at one. A gate stands on the boundary or on a side of any street, drawn or existing, and slides along that side.',
    anchor: 'tool-gate',
    before: onFlow,
    act: () => {
      const { derived, option: id } = useApp.getState()
      const line = streetLine()
      const ring = derived.site.polygon
      if (line && ring) useApp.getState().apply((p) => actions.addGate(p, id, tOn(ring, line[0])).project)
    },
    done: () => gates() > 0,
  },
  {
    id: 'zero-connect',
    chapter: CHAPTER,
    title: 'Connect the truck courts',
    body: ['In the Streets group, press Connect: every truck court in front of the docks gets its way to a truck gate.'],
    why: 'A truck court is the yard in front of a docked wall, its depth from the standards (or its pill). Connect draws the shortest streets; edit them by hand afterwards.',
    anchor: 'tool-connect',
    before: onFlow,
    act: connect,
    done: () => streets() > 0 && gates() > 0 && courtsLeft() === 0,
  },
  {
    id: 'zero-circulation',
    chapter: CHAPTER,
    title: 'Circulation',
    body: ['Circulation, picked in Layers, shows in Properties the road area, the trucks’ and the cars’.'],
    why: 'These are this option’s figures; the road and gate standards (widths, turning radii, court depths) are in Brief › Circulation.',
    anchor: 'tab-properties',
    before: () => {
      onFlow()
      // its settings, in Properties
      showLayer('circulation')
    },
  },
  {
    id: 'zero-lot',
    chapter: CHAPTER,
    title: 'A parking lot',
    body: ['In the Parking group of the Tools strip, pick Lot and click beside the street, inside the site: a lot of stalls with its aisle.'],
    why: 'Next to a wall a lot lies along it; a lot’s handles change its rows and its length, and Connect gives it its street.',
    anchor: 'tool-lot',
    before: onFlow,
    act: () => {
      const line = streetLine()
      const { option: id } = useApp.getState()
      if (!line) return
      const center = { x: line[0].x - 55, y: line[0].y + 55 }
      useApp.getState().apply((p) => actions.addLot(p, id, { rect: { center, width: 60, depth: 32, rotation: 0 } })?.project ?? p)
    },
    done: () => (option()?.lots?.length ?? 0) > 0,
  },
  {
    id: 'zero-parking',
    chapter: CHAPTER,
    title: 'Parking',
    body: ['Parking, picked in Layers, shows in Properties the stalls the brief asks for and the streets’ sides that carry them; the lots, this one among them, are its rows.'],
    anchor: 'tab-properties',
    before: () => {
      onFlow()
      showLayer('parking')
    },
  },
]
