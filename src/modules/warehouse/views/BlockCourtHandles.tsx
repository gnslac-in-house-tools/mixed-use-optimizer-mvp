// A placed block's truck courts on the shape handles (Phase D.3 task 7, Decisions "Shape engine", "Truck court"): the site's side of what the block editor's plan
// does (`WarehousePlan.tsx`, `blockShapeHost.ts`). The block picked, each of its courts shows the pill that says its depth (the far edge of a rectangle: a typed value; a
// court with a shape of its own has none); a court clicked (Select) has all its handles, live: a side pulled in, a corner dragged along its wall or off it, the far edge
// chamfered, a radius, the Corner and Chamfer tools. A court is `block-court`, its ref `<hallMassId>/<edgeId>[/<courtId>]`: its rectangle's depth is the wall's own
// (`Mass.courts`, the pill of before, no variant), any other edit is the copy's own courts (a variant: *Back to type* gives them up). With the Court tool on, only the pills.
// What the courts' eye hides, a lock keeps still and the plan's other tools leave alone shows none.
import { useMemo } from 'react'
import type { Mass, Project } from '../../../model/schema.ts'
import { standardsOf } from '../../../engine/circulation/standards.ts'
import { contourToPolygon } from '../../../engine/geom/contour.ts'
import { massIsLocked } from '../../../model/locks.ts'
import type { Ref } from '../../../kinds/types.ts'
import { actions } from '../../../state/actions/index.ts'
import { useApp } from '../../../state/store.ts'
import { ShapeHandles } from '../../../views/editing/shape/ShapeHandles.tsx'
import { siteHost } from '../../../views/editing/shape/host.ts'
import { useCourtPick } from '../../../views/editing/shape/shapeState.ts'
import { COURTS } from '../../../views/layers/keys.ts'
import { useHidden, useLayerView } from '../../../views/layers/layerView.ts'
import { massHiddenOnPlan } from '../../../views/buildingView.ts'
import { pathOf } from '../../../views/plan/camera.ts'
import type { Drag } from '../../../views/plan/useDrag.ts'
import { copyGenerated, copyOnPlan } from '../engine/copies.ts'
import { typeWith } from '../engine/generate.ts'
import { courtsOf } from './handleMath.ts'
import { useSiteBlockOf } from './siteBlockState.ts'
import { t as tr } from '../../../i18n/idioma.ts' // mixed-use-mvp

/**
 * The id of a court's ref: `<owner>/<edgeId>`, and `/<courtId>` only for a wall with several courts. A wall's only court is named by its wall, so its handles stay the same ones when a rectangle takes
 * a shape (and so an id of its own) in the middle of a drag.
 */
export const courtRefId = (owner: string, edge: string, court?: string): string => `${owner}/${edge}${court !== undefined ? `/${court}` : ''}`

/** A placed block's hall and the refs of its truck courts, one for each court of each wall (`<hallMassId>/<edgeId>[/<courtId>]`); null: no such block. */
export function siteCourtRefs(p: Project, buildingId: string): { hall: Mass; refs: Ref[] } | null {
  const b = p.buildings.find((x) => x.id === buildingId)
  const copy = b?.warehouse
  const t = copy && p.warehouseTypes?.find((x) => x.id === copy.type)
  if (!b || !copy || !t) return null
  const levels = new Set(b.levels.map((l) => l.id))
  const hall = p.masses.find((m) => m.part === 'hall' && levels.has(m.levelId))
  if (!hall) return null
  const w = copyOnPlan(t, copy, hall.footprint)
  const refs = courtsOf(typeWith(t, w.overrides), copyGenerated(t, w), standardsOf(p).courtDepth).flatMap((c) =>
    c.parts.map((part): Ref => ({ kind: 'block-court', id: courtRefId(hall.id, c.edge.id, c.parts.length > 1 ? part.id : undefined) })),
  )
  return { hall, refs }
}

/** The refs of the truck courts of the one placed block picked, as the project and the pick change (none: a court's eye off, a lock, no block picked); what the Corner and Chamfer tools pick corners of. */
export function useCourtRefs(): Ref[] {
  const building = useSiteBlockOf()
  const project = useApp((s) => s.project)
  const hidden = useHidden(COURTS)
  const found = useMemo(() => (building ? siteCourtRefs(project, building) : null), [project, building])
  return useMemo(() => (!found || hidden || massIsLocked(project, found.hall) ? [] : found.refs), [found, hidden, project])
}

/** The refs of the truck courts of every placed block of the option that a tool may edit (a court's eye off or a lock leaves its block out): what the Split tool looks across. */
export function useAllCourtRefs(): Ref[] {
  const project = useApp((s) => s.project)
  const option = useApp((s) => s.option)
  const level = useApp((s) => s.level)
  const hidden = useHidden(COURTS)
  const off = useLayerView((s) => s.hidden)
  return useMemo(() => {
    if (hidden) return []
    const eyes = new Set(off)
    const ids = project.options.find((o) => o.id === option)?.buildingIds ?? []
    return ids.flatMap((id) => {
      const found = siteCourtRefs(project, id)
      // a building whose eye is off, or whose block's, is not cut (review N2)
      return found && !massIsLocked(project, found.hall) && !massHiddenOnPlan(project, level, found.hall.id, eyes) ? found.refs : []
    })
  }, [project, option, hidden, level, off])
}

/** The courts of the one placed block picked: `pick`, a court is picked by a click on it (Select); not with a tool in hand, whose presses are the tool's. */
/**
 * `part`: the plan draws the hit paths under the block's own handles (a press on the outer half of a docked wall's pill is the pill's, review B3) and the courts' handles over them; each is one
 * `part` of the same component. Both, when none is said.
 */
export function BlockCourtHandles({ drag, scale, toWorld, pick, part }: { drag: Drag; scale: number; toWorld(e: { clientX: number; clientY: number }): { x: number; y: number }; pick: boolean; part?: 'hits' | 'handles' }) {
  const building = useSiteBlockOf()
  const project = useApp((s) => s.project)
  const picked = useCourtPick((s) => s.pick)
  const hidden = useHidden(COURTS)
  const found = useMemo(() => (building ? siteCourtRefs(project, building) : null), [project, building])
  if (!found || hidden || found.refs.length === 0 || massIsLocked(project, found.hall)) return null
  const host = siteHost(drag, scale, toWorld, { vertex: null, hole: null, court: picked })
  // a wall's only court is named by its wall; a picked court named by its wall is every court of it (after a split, the wall's first)
  const same = (r: Ref) => {
    if (!picked || picked.ref.kind !== r.kind) return false
    const [hall, edge, court] = picked.ref.id.split('/')
    const [hall2, edge2] = r.id.split('/')
    return picked.ref.id === r.id || (court === undefined && hall === hall2 && edge === edge2)
  }
  return (
    <g data-layer="block-court-handles">
      {pick &&
        part !== 'handles' &&
        found.refs.map((r) => {
          const read = actions.shapeOf(project, r)
          if (!read) return null
          let ring
          try {
            ring = contourToPolygon(read.contour)
          } catch {
            ring = read.contour.vertices
          }
          return (
            <path
              key={r.id}
              data-block-court={r.id}
              d={pathOf([ring])}
              fill="transparent"
              stroke={same(r) ? 'var(--ink)' : 'none'}
              strokeWidth={2.5}
              strokeDasharray="7 4"
              vectorEffect="non-scaling-stroke"
              pointerEvents="fill"
              // a press on a court picks it (its handles show); the plan's own press does not see it
              onPointerDown={(e) => {
                if (e.button !== 0) return
                e.stopPropagation()
                useCourtPick.getState().setPick({ ref: r, vertex: null })
              }}
            >
              <title>{tr("Truck court: click it to edit its shape")}</title>
            </path>
          )
        })}
      {part !== 'hits' &&
        found.refs.map((r) => (
        <ShapeHandles key={r.id} refs={[r]} host={host} just={!pick || !same(r)} />
        ))}
    </g>
  )
}
