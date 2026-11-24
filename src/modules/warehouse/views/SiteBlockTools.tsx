// The block tools on the site (Decision "Blocks on the site", GT.8): Dock, Door and Pattern on the placed block picked are the On edge views' (`SiteEdgeTools`: its host is the copy's
// frame, an edit is that copy's own, a variant); Court is a press on a wall (`SiteCourtPress`). The tools are the Tools strip's Elements group (enabled while a block is picked); the layer
// takes the site plan's presses while one is on (ToolLayer.tsx). A press off the picked block does nothing; Escape leaves the tool.
import { useCallback, useEffect, useMemo, type MutableRefObject } from 'react'
import { massIsLocked } from '../../../model/locks.ts'
import { actions } from '../../../state/actions/index.ts'
import { useApp } from '../../../state/store.ts'
import { EdgeHandles, type EdgeControls } from '../../../views/editing/edge/EdgeHandles.tsx'
import { distancePointSegment, pointInPolygon } from '../../../engine/geom/polygon.ts'
import { dockPressUnder, useEdgePick } from '../../../views/editing/edge/edgePick.ts'
import { pathOf } from '../../../views/plan/camera.ts'
import { useToast } from '../../../views/layout/toast.ts'
import { Capture, useDrawingKeys, type ToolCamera } from '../../../views/plan/tools/common.tsx'
import { letGo } from '../../../views/tools/hand.ts'
import { fromPlace } from '../engine/copies.ts'
import { ANGLED_COURT } from '../engine/shape.ts'
import { blockOn, siteEdgeHost } from './blockEdgeHost.ts'
import { setCopyEdgeCourt } from './commands.ts'
import { angledAt, BAY_REACH_PX, edgeAt, edgeName } from './handleMath.ts'
import { useSiteBlock, useSiteBlockOf } from './siteBlockState.ts'

/** The On edge views' host of the placed block picked (its hall's), or null; `pick` is what a press that moved nothing does. */
function useSiteEdgeHost(pick?: (id: string) => void) {
  const id = useSiteBlockOf()
  const project = useApp((s) => s.project)
  const block = useMemo(() => (id ? blockOn(project, id) : null), [project, id])
  const hall = useMemo(() => {
    const b = project.buildings.find((x) => x.id === id)
    const levels = new Set(b?.levels.map((l) => l.id))
    return project.masses.find((m) => m.part === 'hall' && levels.has(m.levelId)) ?? null
  }, [project, id])
  const massId = hall?.id ?? null
  const host = useMemo(() => (block && massId ? siteEdgeHost(massId, block, (f) => useApp.getState().apply(f), pick) : null), [block, massId, pick])
  return { host, massId, locked: hall ? massIsLocked(project, hall) : false }
}

/** Dock, Door or Pattern on the placed block picked. */
export function SiteEdgeTools({ camera }: { camera: ToolCamera }) {
  const tool = useSiteBlock((s) => s.tool)
  const { host } = useSiteEdgeHost()
  const escape = useCallback(() => letGo(), [])
  const enter = useCallback(() => false, [])
  const back = useCallback(() => {}, [])
  useDrawingKeys({ enter, escape, back })
  if (!tool || tool === 'court' || !host) return null
  return <EdgeHandles host={host} camera={camera} tool={tool} picked={[]} capture />
}

/** The slide the pills' `EdgeHandles` begins, asked by the hit bands: the plan draws the two apart (review B3), so the one ref is theirs together. */
const siteEdgeControls: MutableRefObject<EdgeControls | null> = { current: null }

/** The least a dock's hit band is across on screen (px): the band is a few px at the default zoom. */
const HIT_PX = 12

/**
 * Select on the placed block picked (Phase D.3 task 11): its docks, doors and patterns are picked by a click (Shift adds or takes one), the ones picked slide along their wall by a drag on one of
 * them, and the pills at the ends of their run and at their side count and widen them (`EdgeHandles`). A block that is locked, or with a tool in hand, has none of it. `part`: the plan draws the
 * hit bands under the block's own handles and the pills over them (review B3), as `BlockCourtHandles`'.
 */
export function SiteEdgeSelect({ camera, part }: { camera: ToolCamera; part?: 'hits' | 'handles' }) {
  const tool = useSiteBlock((s) => s.tool)
  const controls = siteEdgeControls
  const pick = useCallback((id: string) => {
    const h = useEdgePick.getState().host
    if (h) useEdgePick.getState().set(h, [id])
  }, [])
  const { host, massId, locked } = useSiteEdgeHost(pick)
  const project = useApp((s) => s.project)
  const mine = useEdgePick((s) => s.ids)
  const owner = useEdgePick((s) => s.host)
  const picked = useMemo(() => (owner === massId ? mine : []), [owner, massId, mine])
  const read = useMemo(() => (host ? actions.edgeOf(project, host.ref) : null), [project, host])
  const live = !(tool || !host || !massId || locked || !read)
  /** A press on a dock: Shift adds or takes it; one picked begins a slide (a press that moves nothing picks it alone); another is picked alone. */
  const take = (e: { shiftKey: boolean }, id: string) => {
    if (!massId) return
    if (e.shiftKey) useEdgePick.getState().set(massId, picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id])
    else if (!(picked.includes(id) && controls.current?.grab(e as never))) useEdgePick.getState().set(massId, [id])
  }
  // the block's bay line is over the hit bands: its press asks here first (a dock under the pointer takes it, as a press on the band would)
  useEffect(() => {
    if (part === 'handles' || !live || !host || !read) return
    const handoff = (e: { clientX: number; clientY: number; button: number; shiftKey: boolean }) => {
      const q = camera.toWorld(e)
      const reach = HIT_PX / 2 / camera.scale
      // the band the pointer is in, else the nearest within the catch
      let el: (typeof read.elements)[number] | undefined
      let best = reach
      for (const x of read.elements) {
        const poly = host.band(x.edge, x.slot)
        const d = pointInPolygon(q, poly) ? 0 : Math.min(...poly.map((p, i) => distancePointSegment(q, p, poly[(i + 1) % poly.length])))
        if (d < best || (d === best && !el)) {
          best = d
          el = x
        }
      }
      if (!el) return false
      take(e, el.id)
      return true
    }
    dockPressUnder.current = handoff
    return () => {
      if (dockPressUnder.current === handoff) dockPressUnder.current = null
    }
  })
  if (!live) return null
  const press = (e: React.PointerEvent<SVGPathElement>, id: string) => {
    if (e.button !== 0) return
    e.stopPropagation()
    take(e, id)
  }
  return (
    <g data-layer="site-edge-select" data-tool="block-site">
      {part !== 'handles' &&
        read.elements.map((el) => (
        <g key={el.id}>
          {/* the press: the band plus a clear stroke of HIT_PX screen px, so a dock is never smaller than that to hit (a bay line near it does not take the press) */}
          <path data-edge-element={el.id} d={pathOf([host.band(el.edge, el.slot)])} fill="transparent" stroke="transparent" strokeWidth={HIT_PX} vectorEffect="non-scaling-stroke" pointerEvents="all" onPointerDown={(e) => press(e, el.id)} />
          {picked.includes(el.id) && <path data-edge-picked={el.id} d={pathOf([host.band(el.edge, el.slot)])} fill="none" stroke="var(--ink)" strokeWidth={2} vectorEffect="non-scaling-stroke" pointerEvents="none" />}
        </g>
        ))}
      {part !== 'hits' && <EdgeHandles host={host} camera={camera} tool={null} picked={picked} controls={controls} />}
    </g>
  )
}

/** Court on the placed block picked: a press on a wall without docks puts its court or takes it away (a docked wall always has its own: the block editor's toast). */
export function SiteCourtPress({ camera }: { camera: ToolCamera }) {
  const id = useSiteBlockOf()
  const project = useApp((s) => s.project)
  const block = useMemo(() => (id ? blockOn(project, id) : null), [project, id])
  const escape = useCallback(() => letGo(), [])
  const enter = useCallback(() => false, [])
  const back = useCallback(() => {}, [])
  useDrawingKeys({ enter, escape, back })
  if (!id || !block) return null
  const { place, g, made } = block
  const reach = BAY_REACH_PX / camera.scale
  const onDown = (e: { button: number; stopPropagation(): void; clientX: number; clientY: number }) => {
    if (e.button !== 0) return
    e.stopPropagation()
    const q = fromPlace(place, camera.toWorld(e))
    const w = edgeAt(g, q, reach)
    // a wall that is not along the grid has no court: it says why
    if (!w || w.axis === null) {
      if (angledAt(g, q, reach)) useToast.getState().show('info', `${ANGLED_COURT}.`)
      return
    }
    if (g.doors.some((d) => d.kind === 'dock' && d.edge === w.id)) {
      useToast.getState().show('info', `${edgeName(g.outline, w.id)} has docks: a docked wall always has its truck court. Drag its pill for a depth of its own.`)
      return
    }
    const hasCourt = (made.courts ?? []).some((c) => c.edge === w.id)
    setCopyEdgeCourt(id, w.id, hasCourt ? null : {})
  }
  return (
    <g data-tool="block-site" data-block-tool="court">
      <Capture camera={camera} onPointerDown={onDown} />
    </g>
  )
}
