// A Brief row opened (▸, Decision "Program rule set layout"): the program's rule set under it, its general level. Its
// grid (bay × bay / modules), the sizes its masses may take (a range each way: what the optimizer may search), whether
// it is built (not for a warehouse), its docks (where the typology has them; Phase C.4, was the Docks column) and the
// area per mass the target asks (target ÷ masses). A Warehouse program's grid and range are its type's, the same figures
// the Program editor shows (engine/programs.ts); any other's its own. Every edit is one undo step through store.apply.
import type { Program } from '../../model/schema.ts'
import type { BriefRow } from '../../engine/brief.ts'
import { definitionOf, kindOf, programGrid, programRange } from '../../engine/programs.ts'
import { actions } from '../../state/actions/index.ts'
import { useApp } from '../../state/store.ts'
import { CellField } from '../controls/fields.tsx'
import { m2 } from '../format.ts'
import { useModule } from '../modules.ts'
import { ProgramDocks } from './columns.tsx'
import { t as tr } from '../../i18n/idioma.ts' // mixed-use-mvp

/** A new grid's figures when a program has none: a 12 m bay each way in 4 modules. */
const NEW_GRID = { x: 12, y: 12, modules: 4 }

export function ProgramRules({ program: g, row }: { program: Program; row: BriefRow }) {
  const project = useApp((s) => s.project)
  const apply = useApp((s) => s.apply)
  const typed = definitionOf(project, g.id) !== undefined
  const warehouse = kindOf(g) === 'warehouse'
  const grid = programGrid(project, g)
  const range = programRange(project, g)
  const docks = useModule('docks').offered
  // a Warehouse program's sides are its hall's length and width; any other's a mass's width and depth
  const [long, short] = warehouse ? ['Length', 'Width'] : ['Width', 'Depth']

  const setGrid = (k: keyof typeof NEW_GRID, v: string) => {
    if (v === '' && !typed) return apply((p) => actions.setProgramGrid(p, g.id, null))
    apply((p) => actions.setProgramGrid(p, g.id, { ...(grid ?? NEW_GRID), [k]: Number(v) }))
  }
  const setRange = (side: 'width' | 'depth', end: 0 | 1, v: string) => {
    const was = range?.[side]
    const next: [number, number] | undefined = v === '' ? undefined : end === 0 ? [Number(v), Math.max(Number(v), was?.[1] ?? Number(v))] : [Math.min(was?.[0] ?? Number(v), Number(v)), Number(v)]
    apply((p) => actions.setProgramRange(p, g.id, { ...range, [side]: next }))
  }

  return (
    <div aria-label={`${g.name}'s rule set`} role="group" className="flex flex-wrap items-center gap-x-6 gap-y-1.5 py-1.5 pl-1 text-caption text-ink-secondary">
      <span className="flex items-center gap-1" title={typed ? 'Its warehouse type’s grid (step 1): the bay along the hall’s length and width, and the modules a bay is split in' : 'Its own grid: a bay each way and the modules a bay is split in. Empty: none'}>
        <span className="text-ink">{tr("Grid")}</span>
        <span className="w-10">
          <CellField label={`${g.name} grid bay x`} value={grid?.x ?? null} number={{ min: 1 }} step={1} optional={!typed} placeholder="—" onCommit={(v) => setGrid('x', v)} />
        </span>
        <span aria-hidden>×</span>
        <span className="w-10">
          <CellField label={`${g.name} grid bay y`} value={grid?.y ?? null} number={{ min: 1 }} step={1} optional={!typed} placeholder="—" onCommit={(v) => setGrid('y', v)} />
        </span>
        <span>m /</span>
        <span className="w-8">
          <CellField label={`${g.name} grid modules`} value={grid?.modules ?? null} number={{ min: 1, integer: true }} step={1} optional={!typed} placeholder="—" onCommit={(v) => setGrid('modules', v)} />
        </span>
        <span>mod</span>
      </span>

      <span className="flex items-center gap-1" title="The sizes its masses may take, low to high: what the optimizer may search. Empty: its size as it is">
        <span className="text-ink">{tr("Range")}</span>
        {(['width', 'depth'] as const).map((side) => (
          <span key={side} className="flex items-center gap-1">
            <span>{(side === 'width' ? long : short).toLowerCase()}</span>
            <span className="w-11">
              <CellField label={`${g.name} ${(side === 'width' ? long : short).toLowerCase()} from`} value={range?.[side]?.[0] ?? null} number={{ min: 1 }} step={1} optional placeholder="—" onCommit={(v) => setRange(side, 0, v)} />
            </span>
            <span aria-hidden>–</span>
            <span className="w-11">
              <CellField label={`${g.name} ${(side === 'width' ? long : short).toLowerCase()} to`} value={range?.[side]?.[1] ?? null} number={{ min: 1 }} step={1} optional placeholder="—" onCommit={(v) => setRange(side, 1, v)} />
            </span>
            <span>m</span>
          </span>
        ))}
      </span>

      {!warehouse && (
        <label className="flex items-center gap-1.5" title={g.built ? 'A building: counts its floor area and coverage' : 'Open ground: counts its area on the ground (yards, storage)'}>
          <input
            type="checkbox"
            aria-label={`${g.name} is built`}
            className="h-4 w-4 accent-ink"
            checked={g.built}
            onChange={(e) => apply((p) => actions.updateProgram(p, g.id, { built: e.target.checked }))}
          />
          <span className="text-ink">{tr("Built")}</span>
        </label>
      )}

      {docks && (
        <span className="flex items-center gap-1" title="Whether its masses have loading docks (on the building’s front, turning with it) and how many doors: one per so many m² of floor, or one every so many m of wall. On a structural grid, under it the doors’ pattern">
          <span className="text-ink">{tr("Docks")}</span>
          <ProgramDocks program={g} />
        </span>
      )}

      <span title="The target area shared by the target masses: what each one should be">
        <span className="text-ink">{tr("Per mass")}</span> <span className="tabular-nums">{row.unitArea === null ? '—' : m2(row.unitArea)}</span>
      </span>
    </div>
  )
}
