// A placed warehouse block's grid on the site plan (Decision "Blocks on the site", GT.6): its module lines, faint, and its
// columns: what the block editor draws, put where the copy stands. The lines are the grid clipped (Phase D.2: `generate`'s
// `lines`, cut by the outline and its holes, so they stop at an angled wall) and a bay the outline cut is drawn as it is left.
// Its level doors (an opening out of the wall) and its patterns' marks (a dot just inside), as the block editor draws
// them: what the site's Door and Pattern put (GT.8); its docks are the docks layer's (DocksLayer.tsx), drawn there.
// At every zoom all of it is there (the user, 2026-11-10): far out the columns are points and a door's opening and a
// mark keep a few pixels, so a block's grid and elements never vanish, only simplify.
// Drawn over the masses and under the labels, deaf to the pointer; the copy is read as it stands on the plan
// (`copyOnPlan`: a hall moved or turned since it was made), its type with its own overrides generated.
import { useMemo } from 'react'
import type { Point } from '../../../model/schema.ts'
import { buildingOf, optionBuildings, optionOf } from '../../../engine/buildings.ts'
import { useApp } from '../../../state/store.ts'
import { useShown } from '../../../views/viewport/look.ts'
import { copyGenerated, copyOnPlan, onPlace, type Place } from '../engine/copies.ts'
import { columnOutline } from '../engine/generate.ts'
import { outwardOf } from '../engine/shape.ts'

/** Columns are squares from this many px per metre (Decision "Blocks on the site"); farther out, points. */
export const COLUMNS_FROM_SCALE = 4

const OPACITY = 0.5

/** px: a column's point far out. */
const COLUMN_POINT_PX = 3

/** m: how far out of its face a level door's opening stands, and how far in a pattern's mark (the block editor's). */
const DOOR_OUT = 0.6
const MARK_IN = 1

/** px: the least a door's opening is, deep and wide, and a mark's radius, however far out. */
const DOOR_MIN_PX = 3
const MARK_MIN_PX = 2

/** A type's-frame polygon on the plan, as an SVG ring (`y = -world.y`). */
const ring = (place: Place, q: Point[]) => `M${q.map((v) => onPlace(place, v)).map((v) => `${v.x} ${-v.y}`).join('L')}Z`

export function BlockSiteLayer({ px, scale }: { px: number; scale: number }) {
  const project = useShown((s) => s.project)
  const derived = useShown((s) => s.derived)
  const option = useApp((s) => s.option)
  const level = useApp((s) => s.level)
  // what each block makes, generated once a project (not on every zoom)
  const made = useMemo(() => {
    const inOption = new Set(optionBuildings(project, optionOf(project, option)).map((b) => b.id))
    return project.masses.flatMap((m) => {
      if (m.part !== 'hall' || m.levelId !== level) return []
      const building = buildingOf(project, m)
      const copy = building.warehouse
      const t = copy && project.warehouseTypes?.find((x) => x.id === copy.type)
      const outline = derived.masses[m.id]?.polygon
      if (!copy || !t || !inOption.has(building.id) || !outline || outline.length < 3) return []
      const w = copyOnPlan(t, copy, m.footprint)
      const g = copyGenerated(t, w)
      // each module line and column line from its two ends on the plan, the stretches the outline leaves (in the type's frame, then placed)
      const lines = [...g.lines.modules, ...g.lines.columns.map((c): [Point, Point] => [c.a, c.b])].map(([a, b]) => segment(w.place, a, b))
      // the bays it cut, as they are left
      const partial = g.cells.filter((c) => !c.whole).map((c) => ({ key: `${c.x[0]}-${c.y[0]}`, d: c.regions.map((r) => r.map((poly) => ring(w.place, poly)).join('')).join('') }))
      return [
        {
          id: building.id,
          count: lines.length,
          modules: lines.join(''),
          partial,
          place: w.place,
          g,
        },
      ]
    })
  }, [project, derived, option, level])
  // drawn at this zoom: never under a few pixels, so far out each keeps its place, only bigger than it is
  const blocks = useMemo(
    () =>
      made.map(({ place, g, ...b }) => {
        // its level doors and patterns' marks, in the type's frame, then placed
        const doors: string[] = []
        const marks: Point[] = []
        const deep = Math.max(DOOR_OUT, DOOR_MIN_PX * px)
        for (const d of g.doors) {
          const n = outwardOf(d.side)
          if (d.kind === 'pattern') marks.push(onPlace(place, { x: d.at.x - n.x * MARK_IN, y: d.at.y - n.y * MARK_IN }))
          if (d.kind !== 'door') continue
          const u = { x: Math.abs(n.y), y: Math.abs(n.x) }
          const half = Math.max(d.width, DOOR_MIN_PX * px) / 2
          doors.push(
            ring(place, [
              { x: d.at.x - u.x * half, y: d.at.y - u.y * half },
              { x: d.at.x + u.x * half, y: d.at.y + u.y * half },
              { x: d.at.x + u.x * half + n.x * deep, y: d.at.y + u.y * half + n.y * deep },
              { x: d.at.x - u.x * half + n.x * deep, y: d.at.y - u.y * half + n.y * deep },
            ]),
          )
        }
        // its columns: squares zoomed in, else each a point at its middle
        const squares = scale >= COLUMNS_FROM_SCALE
        const columns = squares
          ? g.columns.map((c) => ring(place, columnOutline(c, g.columnSize))).join('')
          : g.columns
              .map((c) => onPlace(place, c))
              .map((q) => `M${q.x} ${-q.y}h0.001`)
              .join('')
        return { ...b, columnCount: g.columns.length, squares, columns, doors, marks }
      }),
    [made, px, scale],
  )
  if (blocks.length === 0) return null
  return (
    <g pointerEvents="none">
      {blocks.map((b) => (
        <g key={b.id} data-block-site={b.id}>
          <g opacity={OPACITY}>
            {b.partial.map((c) => (
              <path key={c.key} data-partial-bay={c.key} d={c.d} fill="var(--fill)" fillOpacity={0.5} fillRule="evenodd" stroke="none" />
            ))}
            <path data-modules={b.count} d={b.modules} fill="none" stroke="var(--grid-module)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            {/* a column on a wall stands centred on the outline: whole */}
            <g data-columns={b.columnCount} data-columns-as={b.squares ? 'squares' : 'points'}>
              {b.squares ? (
                <path d={b.columns} fill="var(--ink)" />
              ) : (
                <path d={b.columns} stroke="var(--ink)" strokeWidth={COLUMN_POINT_PX} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              )}
            </g>
          </g>
          {/* its level doors and patterns, as strong as its docks (not faint like its grid) */}
          <g data-elements={b.doors.length + b.marks.length}>
            {b.doors.map((d, i) => (
              <path key={`d${i}`} data-kind="door" d={d} fill="var(--panel)" stroke="var(--ink)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            ))}
            {b.marks.map((q, i) => (
              <circle key={`p${i}`} data-kind="pattern" cx={q.x} cy={-q.y} r={Math.max(0.4, MARK_MIN_PX * px)} fill="var(--grid-line)" />
            ))}
          </g>
        </g>
      ))}
    </g>
  )
}

const segment = (place: Place, a: Point, b: Point) => {
  const p = onPlace(place, a)
  const q = onPlace(place, b)
  return `M${p.x} ${-p.y}L${q.x} ${-q.y}`
}
