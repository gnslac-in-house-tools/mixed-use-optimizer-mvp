// A building on the grid, in its Properties (Phase G.2b, Decision "Grid layout"), before its Platform: where it runs
// (*E1–AJ1 × 7.1–18.1*), and each way its bays and its two end bays, typed → the masses on that end stretch
// (`stretchBuilding`, one undo step); a way narrower than a bay says so; the masses off the grid are named. Its bays are
// derived from its masses (`buildingBays`), never stored. Only while the option stands on a grid.
import type { Building } from '../../model/schema.ts'
import { bayOf, gridOf, lineName, nameBase, optionBays, type Axis } from '../../engine/grid/index.ts'
import { actions } from '../../state/actions/index.ts'
import { useApp } from '../../state/store.ts'
import { NumberField, Section } from '../controls/fields.tsx'

const AXES: { axis: Axis; title: string }[] = [
  { axis: 'x', title: 'Along x (A, B, C…)' },
  { axis: 'y', title: 'Along y (1, 2, 3…)' },
]

export function BuildingGridSection({ building }: { building: Building }) {
  const project = useApp((s) => s.project)
  const derived = useApp((s) => s.derived)
  const optionId = useApp((s) => s.option)
  const apply = useApp((s) => s.apply)
  const g = gridOf(project, optionId)
  if (!g || building.context) return null
  const on = optionBays(project, optionId, derived.masses, derived.site.polygon).find((x) => x.building.id === building.id)
  if (!on) return null
  const { bays } = on
  const base = nameBase(g, derived.site.polygon)
  const stretch = (axis: Axis, side: 'start' | 'end', to: number) => apply((p) => actions.stretchBuilding(p, optionId, building.id, axis, side, to))
  const off = bays.off.map((id) => derived.masses[id]?.name ?? id)
  return (
    <Section title="Grid">
      <p className="select-text text-body tabular-nums" data-building-grid="">
        {bays.x.from}–{bays.x.to} × {bays.y.from}–{bays.y.to}
        <span className="text-caption text-ink-secondary">
          {' · '}
          {bays.x.bays} × {bays.y.bays} bays
        </span>
      </p>
      {AXES.map(({ axis, title }) => {
        const run = bays[axis]
        const bay = bayOf(g, axis)
        const b = axis === 'x' ? base.x : base.y
        if (run.first === null || run.last === null)
          return (
            <p key={axis} className="text-caption text-ink-secondary">
              {title}: narrower than a bay ({Math.round(run.start * 100) / 100} m).
            </p>
          )
        const first = run.first
        const last = run.last
        return (
          <div key={axis} className="flex flex-col gap-1.5">
            <span className="text-label text-ink-secondary">{title}</span>
            <NumberField
              label={`Bays ${axis}`}
              min={0}
              max={400}
              decimals={0}
              value={run.bays}
              // more or fewer bays at its far end, its end bay kept
              onCommit={(v) => stretch(axis, 'end', (first + Math.round(v)) * bay + run.end)}
            />
            <NumberField label={`End bay before ${lineName(axis, first - b)}`} unit="m" min={0} max={bay * 4} value={run.start} onCommit={(v) => stretch(axis, 'start', first * bay - v)} />
            <NumberField label={`End bay after ${lineName(axis, last - b)}`} unit="m" min={0} max={bay * 4} value={run.end} onCommit={(v) => stretch(axis, 'end', last * bay + v)} />
          </div>
        )
      })}
      {off.length > 0 && (
        <p className="select-text text-caption text-ink-secondary" data-off-grid="">
          Off the grid: {off.join(', ')} (turned off its axes, or a corner off its modules).
        </p>
      )}
    </Section>
  )
}
