// Typing a measure for what is selected (Decision "Locks, typed measures, levels", 2.8): AutoCAD's grips and
// SketchUp's Measurements box. While something is selected with the Select tool and no drag stands, the command line is
// its edit:
//   a dock, door or pattern picked on a placed block (On edge, the Select tool in hand, the pick still on the block) → Slide: a
//                 whole number of modules along its wall, as the slide drag's typed value (positive: towards the wall's higher
//                 modules, the copy's local axis, not the drag's sign); never the block's Move
//   a mass    → Move: `d` along its main axis, `@x,y`, `d<a`, `#x,y` (where its centre goes)
//   several   → Move, the same for all of them (`#x,y`: where the centre of their bounds goes)
//   a corner  → Move corner: the same, from where the corner was
//   a dimension → its length (the geometry moves; `setDimensionLength`)
// A drag's number, typed during it or just after it, is the typed dimension's (`views/editing/dimension/typed.ts`, D.1
// task 4): the line is then its. What is typed here is a new edit of its own, which the next typed value can correct (it
// starts a typed drag that is already over). A typed value is exact: no snap. It goes through the store, so the locks
// hold and a refusal says why.
import { useEffect } from 'react'
import type { Id, Point, Project } from '../../../model/schema.ts'
import { bounds, centroid } from '../../../engine/geom/polygon.ts'
import { footprintContour, footprintPolygon } from '../../../engine/geom/footprint.ts'
import { actions } from '../../../state/actions/index.ts'
import { useApp } from '../../../state/store.ts'
import { useToast } from '../../layout/toast.ts'
import { endTyped, startTyped } from '../../editing/dimension/typed.ts'
import { useTypedStands } from '../../editing/dimension/useTypedCommand.ts'
import { typeDimensionLength } from '../dimensions/typeLength.ts'
import { useEdgePick } from '../../editing/edge/edgePick.ts'
import { livePicks, slideRegistration } from '../../editing/edge/slideCommand.ts'
import { useHand } from '../../tools/hand.ts'
import { useRuler, useTool } from '../tools/toolState.ts'
import { useSelectedDimension } from '../mix.ts'
import type { Command, CommandContext } from './command.ts'
import { useCommand, type Registration } from './commandState.ts'

const massOf = (p: Project, id: Id) => p.masses.find((m) => m.id === id)

/** Where a mass is measured from (a rect's centre, a contour's centroid); several, the centre of their bounds. */
export function centreOf(p: Project, ids: Id[]): Point | null {
  const ms = p.masses.filter((m) => ids.includes(m.id))
  if (ms.length === 0) return null
  if (ms.length === 1) {
    const f = ms[0].footprint
    return f.kind === 'rect' ? { ...f.center } : centroid(footprintPolygon(f))
  }
  const b = bounds(ms.flatMap((m) => footprintPolygon(m.footprint)))
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }
}

/** The masses `ids` moved so that what was at `base` is at `target`. */
export const moveMassesTo = (p: Project, ids: Id[], base: Point, target: Point): Project => actions.moveMasses(p, ids, { x: target.x - base.x, y: target.y - base.y })

/** Corner `index` of a mass put at `target` (a rect resizes from the opposite corner), by the shape engine: a block's mass refuses it (its outline stays on its module lines). */
const cornerTo = (p: Project, id: Id, index: number, target: Point) => actions.editShape(p, { kind: 'mass', id }, { op: 'vertex', vertex: index, to: target })
export const moveCornerTo = (p: Project, id: Id, index: number, target: Point): Project => cornerTo(p, id, index, target).project

/** The edit of the selected masses (one: also its corner) for the command line, when no drag stands. */
function massRegistration(ids: Id[], vertex: number | null, name: string): Registration {
  const massId = ids[0]
  const corner = vertex !== null

  /** Where it is measured from now: where the mass (or its corner) is. */
  const now = (): Point | null => {
    const p = useApp.getState().project
    if (corner) {
      const m = massOf(p, massId)
      const v = m ? footprintContour(m.footprint).vertices[vertex!] : undefined
      return v ? { x: v.x, y: v.y } : null
    }
    return centreOf(p, ids)
  }
  const prompt = corner ? `${name} · corner ${vertex! + 1}` : name
  const edit = (base: Point) => (target: Point) => (p: Project) => (corner ? moveCornerTo(p, massId, vertex!, target) : moveMassesTo(p, ids, base, target))

  const context = (): CommandContext => ({ first: false, base: now(), cursor: null, rectangle: false, angle: useCommand.getState().angle })

  return {
    tool: corner ? 'Move corner' : 'Move',
    prompt,
    help: `d along the drag · @x,y · d<a · #x,y (${corner ? 'the corner' : ids.length > 1 ? 'their centre' : 'its centre'})`,
    context,
    apply(c: Command) {
      if (c.kind === 'empty') return true
      if (c.kind !== 'point') return false
      const base = now()
      if (!base) return false
      // an edit of its own, which the next typed value can correct
      const s = useApp.getState()
      const before = s.project
      s.apply(edit(base)(c.point))
      if (useApp.getState().project === before) {
        // a corner the shape refuses says why
        const why = corner ? cornerTo(before, massId, vertex!, c.point).reason : undefined
        if (why) useToast.getState().show('info', `That corner cannot go there: ${why}.`)
        return false
      }
      startTyped({
        what: corner ? 'Move corner' : 'Move',
        name: prompt,
        measure: 'point',
        shown: '',
        at: c.point,
        base,
        way: { x: c.point.x - base.x, y: c.point.y - base.y },
        apply: (v) => edit(base)(v as Point),
        mode: 'live',
        from: before,
      })
      endTyped(false)
      return true
    },
    cancel() {},
    oneShot: true,
  }
}

/** The selected dimension's length. */
function dimensionRegistration(id: Id): Registration {
  const dim = () => useApp.getState().project.dimensions?.find((d) => d.id === id)
  return {
    tool: 'Dimension',
    prompt: 'Length',
    help: 'type its length (m): the geometry moves',
    context: () => {
      const d = dim()
      return { first: false, base: d?.a ?? null, cursor: d?.b ?? null, rectangle: false, angle: null }
    },
    apply(c: Command) {
      if (c.kind === 'empty') return true
      const d = dim()
      if (c.kind !== 'point' || !d) return false
      return typeDimensionLength(id, Math.hypot(c.point.x - d.a.x, c.point.y - d.a.y))
    },
    cancel() {},
    oneShot: true,
  }
}

/**
 * Keeps the command line on what is selected while the Select tool is on (the plan mounts it). A tool that places
 * points registers its own, and so does a typed drag (`useTypedCommand`); this one gives way and comes back when they end.
 */
export function useEditCommand(): void {
  // the selected masses that exist, as one string so the effect only runs when the selection really changes
  const key = useApp((s) => s.selection.massIds.filter((id) => s.project.masses.some((m) => m.id === id)).join(','))
  const vertex = useApp((s) => s.selection.vertex)
  const name = useApp((s) => (s.selection.massIds.length > 1 ? `${s.selection.massIds.length} masses` : (massOf(s.project, s.selection.massId ?? '')?.name ?? '')))
  const dimension = useSelectedDimension()
  const tool = useTool((s) => s.tool)
  const ruler = useRuler((s) => s.active)
  // a typed drag stands: its registration is the line's
  const typed = useTypedStands()
  // the docks, doors or patterns picked on a placed block: the typed number is theirs, not the block's
  const pickedHost = useEdgePick((s) => s.host)
  const pickedIds = useEdgePick((s) => s.ids.join(','))
  // only those that are still on the block (an undo, or the Dock tool taking one, leaves a pick behind) and only with Select in hand (a block, site or access tool keeps `useTool` on select)
  const hand = useHand((s) => s.tool)
  const pickedEls = useApp((s) => (pickedHost !== null && hand === 'select' ? livePicks(s.project, pickedHost, pickedIds === '' ? [] : pickedIds.split(',')).join(',') : ''))

  useEffect(() => {
    if (tool !== 'select' || ruler || typed) return
    const onEdge = pickedHost !== null && pickedEls !== '' && key.split(',').includes(pickedHost)
    // a corner of a mass that refuses a corner moved (a block's: its outline stays on its module lines) has no typed move; the picks on its edges still slide
    const refused = key !== '' && vertex !== null && (actions.shapeOf(useApp.getState().project, { kind: 'mass', id: key.split(',')[0] })?.without?.includes('vertex') ?? false)
    if (refused && !onEdge) return
    const r = onEdge ? slideRegistration(pickedHost, pickedEls.split(',')) : key !== '' ? massRegistration(key.split(','), vertex, name) : dimension !== null ? dimensionRegistration(dimension) : null
    if (!r) return
    useCommand.getState().register(r)
    return () => {
      if (useCommand.getState().registration === r) useCommand.getState().register(null)
    }
  }, [key, vertex, name, dimension, tool, ruler, typed, pickedHost, pickedEls])
}
