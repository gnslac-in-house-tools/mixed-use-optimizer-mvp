// A block's walls as the On edge views' host (Phase D.3 task 10, Decision "On edge engine"): where a press of Dock, Door or Pattern lands (a module of a wall, a bay in front of it, the
// bar of a dock), what a drag along the wall passes, which element is under the pointer and the band of a module, all in the block's own maths (`handleMath.ts`); the engine's host
// (`block-type` in the block editor, `mass` for a placed block's hall on the site) does the edit. The block editor's host is in the type's frame; the site's takes the copy's place
// (`fromPlace`, `onPlace`) in and out.
import type { HallElement, Id, Point, Polygon, Project, WarehouseType } from '../../../model/schema.ts'
import type { EdgeHost, EdgePress } from '../../../views/editing/edge/host.ts'
import { copyGenerated, copyOnPlan, fromPlace, onPlace, type Place } from '../engine/copies.ts'
import { patternName } from '../engine/elements.ts'
import type { Generated } from '../engine/generate.ts'
import { typeWith } from '../engine/generate.ts'
import { ANGLED_ELEMENTS } from '../engine/shape.ts'
import { alongOf, angledAt, BAY_REACH_PX, EDGE_REACH_PX, elementAt, elementPress, moduleBand } from './handleMath.ts'
import { paintModules } from '../engine/dockRule.ts'

/** The frame a host reads the block's maths in: the type's own (the block editor), or the placed copy's, on the plan. */
interface Frame {
  toLocal(q: Point): Point
  toView(q: Point): Point
}
const SAME: Frame = { toLocal: (q) => q, toView: (q) => q }

function hostOn(a: { ref: EdgeHost['ref']; mode: EdgeHost['mode']; g: Generated; made: Pick<WarehouseType, 'elements'>; frame: Frame; commit: EdgeHost['commit']; pick?: EdgeHost['pick'] }): EdgeHost {
  const { g, frame } = a
  const edge = (id: Id) => g.edges.find((x) => x.id === id)
  return {
    ref: a.ref,
    mode: a.mode,
    press(q, kind, name, scale): EdgePress | null {
      const local = frame.toLocal(q)
      const reach = BAY_REACH_PX / scale
      const hit = elementPress(g, kind as HallElement['kind'], name, local, reach)
      // nothing stands on a wall that is not along the grid: the press says why
      const angled = hit?.edge.axis === null ? hit.edge : angledAt(g, local, reach)
      if (angled) return { edge: angled.id, slots: [], on: false, bay: false, refused: ANGLED_ELEMENTS }
      return hit ? { edge: hit.edge.id, slots: hit.modules, on: hit.on, bay: hit.bay, span: hit.span } : null
    },
    paint(id, kind, first, q, on) {
      const e = edge(id)
      return e ? paintModules(g, kind as HallElement['kind'], e, first, alongOf(e, frame.toLocal(q)), on) : first
    },
    elementAt(q, scale) {
      // never more than an eighth of the box's short side: zoomed far out, the elements are still there to pick
      const near = Math.min(EDGE_REACH_PX / scale, Math.min(g.box.x1 - g.box.x0, g.box.y1 - g.box.y0) / 8)
      return elementAt(g, frame.toLocal(q), near / 2)
    },
    band(id, slot): Polygon {
      const e = edge(id)
      if (!e) return []
      const r = moduleBand(g.runs, e, slot)
      return [
        { x: r.x, y: r.y },
        { x: r.x + r.w, y: r.y },
        { x: r.x + r.w, y: r.y + r.h },
        { x: r.x, y: r.y + r.h },
      ].map(frame.toView)
    },
    patternName: () => patternName(a.made.elements),
    commit: a.commit,
    ...(a.pick ? { pick: a.pick } : {}),
  }
}

/** The block editor's host: the type `t`, generated as `g`; an edit goes through `commit` (the editor's door, which tells the copies that keep their own). */
export const blockEdgeHost = (t: WarehouseType, g: Generated, commit: EdgeHost['commit'], pick: EdgeHost['pick']): EdgeHost =>
  hostOn({ ref: { kind: 'block-type', id: t.id }, mode: 'ghost', g, made: t, frame: SAME, commit, pick })

/** The placed block of building `buildingId` as it stands on the plan: its place, what it makes, and its type with its own overrides. */
export function blockOn(p: Project, buildingId: Id): { place: Place; g: Generated; made: WarehouseType } | null {
  const b = p.buildings.find((x) => x.id === buildingId)
  const copy = b?.warehouse
  const t = copy && p.warehouseTypes?.find((x) => x.id === copy.type)
  if (!b || !copy || !t) return null
  const levels = new Set(b.levels.map((l) => l.id))
  const hall = p.masses.find((m) => m.part === 'hall' && levels.has(m.levelId))
  const w = copyOnPlan(t, copy, hall?.footprint)
  return { place: w.place, g: copyGenerated(t, w), made: typeWith(t, w.overrides) }
}

/** The site's host: the hall `massId` of a placed block, its press found in the copy's frame. The copy's own elements are written (a variant), its type never. */
export const siteEdgeHost = (massId: Id, block: NonNullable<ReturnType<typeof blockOn>>, commit: EdgeHost['commit'], pick?: EdgeHost['pick']): EdgeHost =>
  hostOn({
    ref: { kind: 'mass', id: massId },
    mode: 'live',
    g: block.g,
    made: block.made,
    frame: { toLocal: (q) => fromPlace(block.place, q), toView: (q) => onPlace(block.place, q) },
    commit,
    pick,
  })
