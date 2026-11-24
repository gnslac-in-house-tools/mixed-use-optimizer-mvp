// What the plan shows of the other levels (Decision "Levels"; port of Plaza-Practiko `vistas/planta/CapaMasas.tsx`,
// `CapaTodos` and `CapaReferencia.tsx`). Inside <PlanSvg> (world metres):
//   LowerLevels      the levels below the active one, lowest first, faded towards the paper the farther down they are:
//                    at each point only the nearest one shows. They do not take the pointer
//   ReferenceLayer   the level above or below (Ref.), dashed and on top, to line up with it
//   AllLevels        All: every level's masses of the option's shown buildings (Decision "Buildings layout"), lowest
//                    first (a hidden building's are not drawn, but the building the plan is on stays drawn: the plan's rule,
//                    buildingView.ts), a light fill and the outline in its colour (program, building, or grey for context); a
//                    click (or Enter) selects one and takes the plan to its level; a locked mass is seen and not picked
//                    (the padlock is CAD's: the notice says where it comes off)
// A mass whose own eye is off (Phase AS.4, `mass:<id>`) is drawn in none of them. Colours follow *Color by* and context (buildingView.ts), as on the active level.
import { useMemo } from 'react'
import type { Id, Mass } from '../../model/schema.ts'
import { allLevels, buildingLevels, optionBuildings, optionOf } from '../../engine/buildings.ts'
import { levelTop } from '../../engine/levels.ts'
import { useApp } from '../../state/store.ts'
import { useShown } from '../viewport/look.ts'
import { buildingDrawn, fillOf, isContext, massEyeOff, planBuilding, useBuildingView } from '../buildingView.ts'
import { useLayerView } from '../layers/layerView.ts'
import { isMassLocked, tellLockedPick } from '../layers/locks.ts'
import { seeThrough, useDetail } from '../detail.ts'
import { m2 } from '../format.ts'
import { pathOf } from './camera.ts'
import { referenceMasses, referenceOpacity, useReference } from './reference.ts'

/** How much of a lower level shows, by how far (m) its top is under the active floor (Practiko's `lejania`). */
export const closeness = (d: number) => 0.1 + 0.35 * Math.exp(-Math.max(0, d) / 20)

/** The fill of a mass in All: light, so the levels under it read. */
const ALL_FILL = 0.18

function useColors() {
  const project = useShown((s) => s.project)
  const colorBy = useBuildingView((s) => s.colorBy)
  return useMemo(
    () => (m: Mass) => (isContext(project, m) ? 'var(--context-stroke)' : (fillOf(project, m, colorBy) ?? 'var(--ink-secondary)')),
    [project, colorBy],
  )
}

export function LowerLevels() {
  const project = useShown((s) => s.project)
  const derived = useShown((s) => s.derived)
  const level = useApp((s) => s.level)
  const colorOf = useColors()
  // Ghosted (Decision "Ghosted detail"): no paper, what is under them (the grid: Decision "Grid always") shows
  const see = seeThrough(useDetail((s) => s.detail))
  const hidden = useLayerView((s) => s.hidden)
  const below = useMemo(() => {
    const levels = buildingLevels(project, level)
    const active = levels.find((l) => l.id === level)
    if (!active) return []
    return levels
      .filter((l) => l.elevation < active.elevation)
      .sort((a, b) => a.elevation - b.elevation)
      .map((l) => ({ k: closeness(active.elevation - levelTop(l)), masses: project.masses.filter((m) => m.levelId === l.id && !massEyeOff(hidden, m.id)) }))
  }, [project, level, hidden])
  return (
    <g data-layer="lower-levels" pointerEvents="none">
      {below.map(({ k, masses }) =>
        masses.map((m) => {
          const polygon = derived.masses[m.id]?.polygon
          if (!polygon || polygon.length < 3) return null
          const d = pathOf([polygon])
          return (
            <g key={m.id} data-lower-mass={m.id}>
              {/* paper first: a nearer level hides a farther one */}
              {!see && <path d={d} fill="var(--panel)" />}
              <path d={d} fill={colorOf(m)} fillOpacity={k} stroke="var(--ink)" strokeOpacity={k} strokeWidth={1} vectorEffect="non-scaling-stroke" />
            </g>
          )
        }),
      )}
    </g>
  )
}

export function ReferenceLayer() {
  const project = useShown((s) => s.project)
  const derived = useShown((s) => s.derived)
  const level = useApp((s) => s.level)
  const on = useReference((s) => s.on)
  const reach = useReference((s) => s.reach)
  const hidden = useLayerView((s) => s.hidden)
  const masses = useMemo(() => referenceMasses(project, level, { on, reach }).filter((x) => !massEyeOff(hidden, x.mass.id)), [project, level, on, reach, hidden])
  if (masses.length === 0) return null
  return (
    <g data-layer="reference" pointerEvents="none">
      {/* the farthest first, so the nearest is drawn on top; fainter the farther (Decision "Reference reach") */}
      {[...masses].sort((a, b) => b.k - a.k).map(({ mass: m, k }) => {
        const polygon = derived.masses[m.id]?.polygon
        if (!polygon || polygon.length < 3) return null
        return (
          <path
            key={m.id}
            data-reference={m.id}
            data-reference-k={k}
            d={pathOf([polygon])}
            fill="none"
            stroke="var(--ink)"
            strokeOpacity={referenceOpacity(k)}
            strokeWidth={1.25}
            strokeDasharray="6 4"
            vectorEffect="non-scaling-stroke"
          />
        )
      })}
    </g>
  )
}

export function AllLevels() {
  const project = useShown((s) => s.project)
  const derived = useShown((s) => s.derived)
  const select = useApp((s) => s.select)
  const colorOf = useColors()
  const option = useApp((s) => s.option)
  const hidden = useLayerView((s) => s.hidden)
  const level = useApp((s) => s.level)
  const sorted = useMemo(() => {
    // every level of the option's shown buildings, and of the building the plan is on (it stays drawn when its eye is off)
    const planOn = planBuilding(project, level)
    const shown = new Set(optionBuildings(project, optionOf(project, option)).filter((b) => buildingDrawn(hidden, b.id, planOn)).flatMap((b) => b.levels.map((l) => l.id)))
    const levels = new Map(allLevels(project).map((l) => [l.id, l]))
    const at = (m: Mass) => levels.get(m.levelId)?.elevation ?? 0
    return project.masses
      .filter((m) => shown.has(m.levelId) && !massEyeOff(hidden, m.id))
      .sort((a, b) => at(a) - at(b))
      .map((m) => ({ m, levelName: levels.get(m.levelId)?.name ?? '' }))
  }, [project, option, hidden, level])
  const pick = (id: Id) => (isMassLocked(id) ? tellLockedPick() : select(id))
  return (
    <g data-layer="all-levels">
      {sorted.map(({ m, levelName }) => {
        const dm = derived.masses[m.id]
        if (!dm || dm.polygon.length < 3) return null
        const color = colorOf(m)
        return (
          <path
            key={m.id}
            data-all-mass={m.id}
            role="button"
            tabIndex={0}
            aria-label={`${m.name}, ${levelName}, ${m2(dm.area)}`}
            className="cursor-pointer [&:focus:not(:focus-visible)]:outline-none"
            d={pathOf([dm.polygon, ...dm.holes])}
            fill={color}
            fillOpacity={ALL_FILL}
            stroke={color}
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => pick(m.id)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' && e.key !== ' ') return
              e.preventDefault()
              pick(m.id)
            }}
          />
        )
      })}
    </g>
  )
}
