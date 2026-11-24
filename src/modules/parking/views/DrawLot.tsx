// The Lot tool (P; Decision "Lot tool"): next to a wall of a mass of the option it shows the lot it would make there,
// the whole wall and as many rows as fit before the first street, court or mass in its way (else the setback), and a click makes it; a drag that starts there lays it over
// the stretch dragged along, as many rows deep as dragged out. Next to a truck court's wall it shows none (a lot never
// goes over a court), nor where no row fits before what is in front of it (a street hugging the wall: a drag out sets its
// rows past it). On open ground a drag draws a free lot (its rows along its longer side); dropped against a wall
// it is anchored there. The lot made is picked and the tool gives way to Select; Escape leaves it. One undo step.
import { useCallback, useMemo, useState } from 'react'
import type { Lot, Point } from '../../../model/schema.ts'
import { standardsOf } from '../../../engine/circulation/standards.ts'
import { useApp } from '../../../state/store.ts'
import { pathOf } from '../../../views/plan/camera.ts'
import { Capture, Label, useDrawingKeys, type ToolCamera } from '../../../views/plan/tools/common.tsx'
import { letGo } from '../../../views/tools/hand.ts'
import type { LotFields } from '../actions.ts'
import { anchorFor, courtOn, deriveLots, onWall, rowsIn, sizesOf, wallNear, WALK } from '../engine/lots.ts'
import { LotShape } from './LotsLayer.tsx'
import { addLotNow } from './lotState.ts'
import { beginDrag } from '../../../views/controls/beginDrag.ts'

/** m: a press moved less than this is a click. */
const CLICK = 1

export function DrawLot({ camera }: { camera: ToolCamera }) {
  const project = useApp((s) => s.project)
  const derived = useApp((s) => s.derived)
  const option = useApp((s) => s.option)
  const px = 1 / camera.scale
  const [q, setQ] = useState<Point | null>(null)
  const [down, setDown] = useState<Point | null>(null)
  const shown = useMemo(() => {
    const ids = project.options.find((o) => o.id === option)?.buildingIds ?? []
    return Object.values(derived.masses).filter((m) => ids.includes(m.buildingId))
  }, [project, derived, option])
  const standards = standardsOf(project, project.options.find((o) => o.id === option))
  const z = sizesOf(standards, {})
  const c = derived.circulation

  // the wall where the press started (or the pointer is): a drag stays on it
  const near = q ? wallNear(shown, down ?? q) : null
  const court = near ? courtOn(c.docks, near.massId, near.wall) : false
  const draft: LotFields | null = useMemo(() => {
    if (!q) return null
    const dragged = down && Math.hypot(q.x - down.x, q.y - down.y) >= CLICK
    if (near && !court) {
      if (!dragged) return { anchor: { massId: near.massId, side: near.wall.side } }
      const a = onWall(near.wall, down!)
      const b = onWall(near.wall, q)
      const snap = (x: number) => Math.min(near.wall.length, Math.max(0, Math.round(x / z.stallWidth) * z.stallWidth))
      const a0 = snap(Math.min(a.a, b.a))
      const a1 = snap(Math.max(a.a, b.a))
      const rows = Math.max(1, rowsIn(Math.max(a.v, b.v) - WALK, z))
      if (a1 - a0 < 2 * z.stallWidth) return { anchor: { massId: near.massId, side: near.wall.side }, rows }
      const whole = a0 < 1e-6 && a1 > near.wall.length - 1e-6
      return { anchor: { massId: near.massId, side: near.wall.side, ...(whole ? {} : { from: a0, length: a1 - a0 }) }, rows }
    }
    if (!dragged || near) return null
    const w = Math.abs(q.x - down!.x)
    const h = Math.abs(q.y - down!.y)
    const center = { x: (q.x + down!.x) / 2, y: (q.y + down!.y) / 2 }
    const rect: NonNullable<Lot['rect']> = w >= h ? { center, width: w, depth: h, rotation: 0 } : { center, width: h, depth: w, rotation: 90 }
    if (rect.width < 2 * z.stallWidth || rect.depth < z.stallDepth) return null
    return anchorFor(shown, rect, z) ?? { rect }
  }, [q, down, near, court, shown, z])
  const laid = draft ? deriveLots({ lots: [{ id: 'new', name: 'New lot', ...draft } as Lot], shown, docks: c.docks, gates: c.gates, roads: c.roads, site: derived.site, standards })[0] : undefined
  // to the limit, and no row fits before what stops it: none here
  const full = !!laid?.anchor && draft?.rows === undefined && laid.rows === 0
  const ghost = full ? undefined : laid
  const blocked = court || full

  const leave = useCallback(() => letGo(), [])
  useDrawingKeys({ enter: () => false, escape: () => (down ? setDown(null) : leave()), back: () => {} })

  const name = near && shown.find((m) => m.id === near.massId)?.name
  const hint = court
    ? 'Its truck court: no lot here'
    : full
      ? `No room before ${laid!.stop}: drag out to set its rows`
      : ghost
        ? `${ghost.stalls.length.toLocaleString('en-US')} stalls · ${ghost.rows} ${ghost.rows === 1 ? 'row' : 'rows'}${near && !down ? ` · ${name}’s ${ghost.anchor?.facing} wall: click` : ''}`
        : down
          ? 'Drag a free lot'
          : 'Next to a wall: click · on open ground: drag a free lot'

  return (
    <Capture
      camera={camera}
      onPointerMove={(e) => setQ(camera.toWorld(e))}
      onPointerLeave={() => !down && setQ(null)}
      onPointerDown={(e) => {
        if (e.button !== 0) return // the middle button pans
        e.stopPropagation()
        beginDrag(e)
        const p = camera.toWorld(e)
        setQ(p)
        setDown(p)
      }}
      onPointerUp={(e) => {
        if (!down) return
        e.stopPropagation()
        const made = draft && !blocked ? addLotNow(draft) : false
        setDown(null)
        if (made) leave()
      }}
    >
      {ghost && <LotShape l={ghost} px={px} ghost />}
      {blocked && near && (
        <path
          d={`M${near.wall.start.x} ${-near.wall.start.y}L${near.wall.start.x + near.wall.along.x * near.wall.length} ${-(near.wall.start.y + near.wall.along.y * near.wall.length)}`}
          stroke="var(--status-over)"
          strokeWidth={4}
          strokeDasharray="6 4"
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      )}
      {down && q && !near && !draft && <path d={pathOf([[down, { x: q.x, y: down.y }, q, { x: down.x, y: q.y }]])} fill="none" stroke="var(--ink-secondary)" strokeDasharray="6 4" strokeWidth={1} vectorEffect="non-scaling-stroke" pointerEvents="none" />}
      {q && <Label q={q} text={hint} px={px} dy={-22} />}
    </Capture>
  )
}
