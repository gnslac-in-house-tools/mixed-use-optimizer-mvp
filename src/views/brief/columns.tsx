// The Brief table's columns as a list (Decision "Brief"; the idea of Plaza-Practiko's `vistas/calculadora/columnas.ts`):
// each has its title, its unit, its help and how it draws a program's cell. The Brief draws whatever is here, so a
// later module (the pro forma's costs and rents) adds its columns to this list, not another screen. The table stays
// short, each row expands to its rule set (Decision "Program rule set layout": Built, grid, range, docks and the area
// per mass, ProgramRules.tsx).
//   asked   → Kind (Warehouse · Office · Free; a warehouse type it loses goes after a confirmation) · Target area ·
//             Masses · Size (a Warehouse program with its type: its hall's length × width, the type's figures; any
//             other: the New mass, Decision "New mass size": in grey the size it starts with, its area per mass at
//             2:1; on hover its width and depth to type, then its own, with 2:1 to go back; Decision "Fixed size": its
//             lock fixes that size, and "up to N:1" is how elongated the optimizer may make the rest)
//   reading → Edit… (the Program window on it)
// How the active option stands against the brief (its area, Δ, its masses) is the Summary's *Against the brief* tab
// (Decision "Summary tabs").
// Every edit is one undo step through store.apply, with a verb of state/actions/programs.ts. The numbers step with the
// arrow keys (area by 100 m², Shift ten times); Masses also has ▲▼ (Decision "Brief steppers").
import type { ReactNode } from 'react'
import { useState } from 'react'
import { PROGRAM_KINDS, type DockPattern, type Docks, type Program, type ProgramKind, type Project } from '../../model/schema.ts'
import type { BriefRow, BriefStatus } from '../../engine/brief.ts'
import { fixedSize, MASS_RATIO, MAX_ASPECT, programSize } from '../../engine/brief.ts'
import { DEFAULT_DOORS, DEFAULT_PATTERN } from '../../modules/docks/engine/docks.ts'
import { gridOf } from '../../engine/grid/index.ts'
import { definitionOf, kindOf } from '../../engine/programs.ts'
import { maskText, patternText } from '../../modules/docks/views/doorPattern.ts'
import { editProgram, KIND_LABELS, setKind } from '../panels/programCommands.ts'
import { actions } from '../../state/actions/index.ts'
import { useApp } from '../../state/store.ts'
import { CellField } from '../controls/fields.tsx'
import { Icon } from '../controls/Icon.tsx'
import { m2, sides } from '../format.ts'
import { useModule } from '../modules.ts'

export interface BriefColumn {
  key: string
  title: string
  unit?: string
  help: string
  /** asked: what the client asks (editable); reading: what the option has. */
  group: 'asked' | 'reading'
  /** Its share of the table's width (a weight: the table shares its width by them). */
  width: number
  cell(program: Program, row: BriefRow): ReactNode
  /** The column's total under the table, if it has one. */
  total?(rows: BriefRow[]): ReactNode
}

const apply = (f: (p: Project) => Project) => useApp.getState().apply(f)

/** A typed number, or null when the field was emptied. */
const typed = (v: string): number | null => (v === '' ? null : Number(v))

/** A status in text colour: met in green, off the target in red. */
export const STATUS_TEXT: Record<BriefStatus, string> = { met: 'text-status-within', under: 'text-status-over', over: 'text-status-over' }
export const STATUS_WORD: Record<BriefStatus, string> = { met: 'meets the target', under: 'under the target', over: 'over the target' }

/** A program's Kind. *Warehouse* is offered where the typology offers the warehouse (Decision "What is not there is not shown"); a program that already is one keeps it. */
function KindSelect({ program: g }: { program: Program }) {
  const { offered } = useModule('warehouse')
  return (
    <select
      aria-label={`Kind of ${g.name}`}
      title={`${g.name} is ${KIND_LABELS[kindOf(g)].toLowerCase()}`}
      value={kindOf(g)}
      onChange={(e) => setKind(g, e.target.value as ProgramKind)}
      className="h-6 w-full rounded-control bg-transparent text-body text-ink outline-none hover:bg-hover focus:bg-hover"
    >
      {PROGRAM_KINDS.filter((k) => k !== 'warehouse' || offered || kindOf(g) === 'warehouse').map((k) => (
        <option key={k} value={k}>
          {KIND_LABELS[k]}
        </option>
      ))}
    </select>
  )
}

export const BRIEF_COLUMNS: BriefColumn[] = [
  {
    key: 'kind',
    title: 'Kind',
    help: 'What it is: a warehouse (its rule set deep in the Program editor: grid, hall, columns, envelope, morphology, elements), an office, or free (a rectangle)',
    group: 'asked',
    width: 5.5,
    cell: (g) => <KindSelect program={g} />,
  },
  {
    key: 'target-area',
    title: 'Target area',
    unit: 'm²',
    help: 'The floor area the client asks for (GFA; ground area for open programs). Empty: none',
    group: 'asked',
    width: 5.5,
    cell: (g) => (
      <CellField
        label={`Target area of ${g.name}`}
        value={g.target?.area ?? null}
        number={{ min: 0 }}
        step={100}
        optional
        placeholder="—"
        onCommit={(v) => apply((p) => actions.setProgramTarget(p, g.id, { area: typed(v) }))}
      />
    ),
    total: (rows) => {
      const asked = rows.filter((r) => r.targetArea !== null)
      return asked.length ? m2(asked.reduce((s, r) => s + r.targetArea!, 0)) : '—'
    },
  },
  {
    key: 'target-count',
    title: 'Masses',
    unit: '#',
    help: 'How many masses (buildings, blocks) the area comes in. Empty: any. ▲▼ or the arrow keys step it',
    group: 'asked',
    width: 3.75,
    cell: (g) => (
      <CellField
        label={`Target masses of ${g.name}`}
        value={g.target?.count ?? null}
        number={{ min: 0, integer: true }}
        step={1}
        arrows
        optional
        placeholder="—"
        onCommit={(v) => apply((p) => actions.setProgramTarget(p, g.id, { count: typed(v) }))}
      />
    ),
  },
  {
    key: 'size',
    title: 'Size',
    unit: 'W × D m',
    help: 'A Warehouse program with its type: its hall, length × width (the type’s Hall step, the same figures). Any other: the rectangle a new block of it starts with (▶ Solve, Draw), its area per mass at 2:1 in grey; hover to type its own, to fix it (the optimizer then keeps it) or to say how elongated the optimizer may make its masses',
    group: 'asked',
    width: 10.5,
    cell: (g) => <ProgramSize program={g} />,
  },
  {
    key: 'edit',
    title: '',
    help: 'The Program editor on it',
    group: 'reading',
    width: 3.5,
    cell: (g) => (
      <button
        type="button"
        aria-label={`Edit ${g.name}`}
        title={`${g.name}'s rule set in the Program window${kindOf(g) === 'warehouse' ? ': its warehouse type, step by step' : ''}`}
        onClick={() => editProgram(g)}
        className="pressable rounded-control px-1.5 text-label text-ink-secondary hover:bg-hover hover:text-ink"
      >
        Edit…
      </button>
    ),
  },
]

/** Its size: a Warehouse program's hall (its type's), any other's new mass. */
function ProgramSize({ program: g }: { program: Program }) {
  const hall = useApp((s) => definitionOf(s.project, g.id)?.hall)
  if (!hall) return <NewMass program={g} />
  const set = (k: 'length' | 'width', v: string) => apply((p) => actions.setProgramHall(p, g.id, { [k]: Number(v) }))
  return (
    <span className="flex h-7 items-center justify-end gap-1" data-hall={`${hall.length}x${hall.width}`} title="Its warehouse type’s hall, column line to column line">
      <span className="w-12 shrink-0">
        <CellField label={`${g.name} hall length`} value={hall.length} number={{ min: 1 }} step={1} onCommit={(v) => set('length', v)} />
      </span>
      <span aria-hidden className="text-ink-tertiary">
        ×
      </span>
      <span className="w-12 shrink-0">
        <CellField label={`${g.name} hall width`} value={hall.width} number={{ min: 1 }} step={1} onCommit={(v) => set('width', v)} />
      </span>
    </span>
  )
}

/** A program's docks: on or off and, on, its doors (one per m² of floor or every m of wall). Open ground has none.
 *  Turned off and on again in one sitting, it keeps its doors (Decision "Docks on or off"). On a structural grid
 *  (Phase G.3b), its doors' pattern under them. */
export function ProgramDocks({ program: g }: { program: Program }) {
  const [last, setLast] = useState<Docks>(g.docks ?? DEFAULT_DOORS)
  const grid = useApp((s) => gridOf(s.project, s.option) !== null)
  const docks = g.docks
  if (!g.built) return <span className="text-ink-tertiary" title="Open ground has no docks">—</span>
  const set = (next: Docks | null) => {
    if (next) setLast(next)
    apply((p) => actions.setProgramDocks(p, g.id, next))
  }
  return (
    <span className="flex flex-col items-end">
      <span className="flex h-7 items-center justify-end gap-1" data-docks={docks ? `${docks.per}:${docks.every}` : 'none'}>
        <input
          type="checkbox"
          aria-label={`${g.name} has docks`}
          title={docks ? `${g.name}'s masses have loading docks, on the building's front` : `${g.name}'s masses have no docks`}
          className="h-4 w-4 shrink-0 accent-ink"
          checked={docks !== undefined}
          onChange={(e) => set(e.target.checked ? (docks ?? last) : null)}
        />
        {docks && (
          <>
            <span className="w-12 shrink-0">
              <CellField label={`${g.name}: a door per`} value={docks.every} number={{ min: 1 }} step={docks.per === 'm2' ? 100 : 1} onCommit={(v) => set({ ...docks, every: Number(v) })} />
            </span>
            <select
              aria-label={`${g.name}: doors per m² of floor or per m of wall`}
              title={docks.per === 'm2' ? 'A door per so many m² of floor' : 'A door every so many m of wall'}
              value={docks.per}
              onChange={(e) => set({ ...docks, per: e.target.value as Docks['per'] })}
              className="h-6 shrink-0 rounded-control bg-transparent text-label text-ink-secondary outline-none hover:bg-hover focus:bg-hover"
            >
              <option value="m2">m²</option>
              <option value="m">m</option>
            </select>
          </>
        )}
      </span>
      {docks && grid && <ProgramPattern program={g} docks={docks} />}
    </span>
  )
}

/** A program's doors on the grid, in words (Decision "Pattern in words"; the stress test: "every 1 from 1 ends" said
 *  little): *door every [k] mod · first [n] · skip end bays ▾* (its mask, if it has one, read only: a mass's Docks
 *  section sets one). */
function ProgramPattern({ program: g, docks }: { program: Program; docks: Docks }) {
  const pt = docks.pattern ?? DEFAULT_PATTERN
  const set = (patch: Partial<DockPattern>) => apply((p) => actions.setProgramPattern(p, g.id, { ...pt, ...patch }))
  return (
    <span className="flex h-6 items-center justify-end gap-1 text-caption text-ink-secondary" data-pattern={patternText(pt)} title={`On the grid: ${patternText(pt)}`}>
      {pt.mask ? (
        <span className="whitespace-nowrap tabular-nums" title="The doors' pattern, module by module (1 a door, 0 none), repeated">
          pattern {maskText(pt.mask)}
        </span>
      ) : (
        <>
          <span className="whitespace-nowrap">door every</span>
          <span className="w-7 shrink-0">
            <CellField label={`${g.name}: a door every … modules`} value={pt.every} number={{ min: 1, integer: true }} step={1} onCommit={(v) => set({ every: Number(v) })} />
          </span>
          <span title="modules of the structural grid">mod</span>
        </>
      )}
      <span aria-hidden>·</span>
      <span title="The module of each wall where the first door goes">first</span>
      <span className="w-7 shrink-0">
        <CellField label={`${g.name}: from module`} value={pt.offset + 1} number={{ min: 1, integer: true }} step={1} onCommit={(v) => set({ offset: Number(v) - 1 })} />
      </span>
      <span aria-hidden>·</span>
      <select
        aria-label={`${g.name}: modules skipped`}
        title="The modules with no door whatever the pattern says: the building's end bays, the wall's corners, or none"
        value={pt.skip}
        onChange={(e) => set({ skip: e.target.value as DockPattern['skip'] })}
        className="h-6 shrink-0 rounded-control bg-transparent text-caption text-ink-secondary outline-none hover:bg-hover focus:bg-hover"
      >
        <option value="ends">skip end bays</option>
        <option value="corners">skip corners</option>
        <option value="none">skip none</option>
      </select>
    </span>
  )
}

/**
 * A new mass's size: at rest, the size it starts with (in grey while it is its area per mass at 2:1; with a lock when
 * the brief fixes it); on hover, or while one is typed in, its width and depth, laid over it (a tap on it reaches them
 * too). A number typed makes the size its own; *2:1* gives the default back. The lock fixes the size (Decision "Fixed
 * size": each of its masses takes it, the optimizer only moves and turns them); a free size has *up to N:1*, the most
 * elongated the optimizer may make its masses (emptied: MAX_ASPECT).
 */
function NewMass({ program: g }: { program: Program }) {
  const size = programSize(g)
  const custom = g.size !== undefined
  const fixed = fixedSize(g) !== null
  const set = (k: 'width' | 'depth', v: string) => apply((p) => actions.updateProgram(p, g.id, { size: { ...size, [k]: Number(v) } }))
  const lock = () =>
    apply((p) => actions.updateProgram(p, g.id, { size: fixed ? { width: size.width, depth: size.depth } : { width: size.width, depth: size.depth, fixed: true } }))
  const aspect = (v: string) => apply((p) => actions.updateProgram(p, g.id, { maxAspect: v === '' ? undefined : Math.max(1, Number(v)) }))
  const resting = custom ? sides(size.width, size.depth) : `${MASS_RATIO}:1 · ${sides(size.width, size.depth)}`
  return (
    <span className="group relative flex h-7 items-center justify-end" data-new-mass={fixed ? 'fixed' : custom ? 'own' : 'default'}>
      <span
        className={`flex items-center gap-1 whitespace-nowrap tabular-nums group-focus-within:opacity-0 group-hover:opacity-0 ${custom ? 'text-ink' : 'text-ink-tertiary'}`}
        title={
          fixed
            ? 'Fixed: each of its masses is this size, the optimizer only moves and turns them. Hover to change it or unlock it'
            : custom
              ? 'Its own size: hover to change it, or 2:1 to go back'
              : `Its area per mass, ${MASS_RATIO} wide to 1 deep: hover to type its own`
        }
      >
        {resting}
        {!fixed && g.maxAspect !== undefined && <span className="text-ink-tertiary">· up to {g.maxAspect}:1</span>}
        {fixed && <Icon name="lock" className="h-3.5 w-3.5" />}
      </span>
      <span className="absolute inset-0 flex items-center justify-end gap-1 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
        <span className="w-12 shrink-0">
          <CellField label={`New ${g.name} width`} value={size.width} number={{ min: 1 }} step={1} onCommit={(v) => set('width', v)} />
        </span>
        <span aria-hidden className="text-ink-tertiary">
          ×
        </span>
        <span className="w-12 shrink-0">
          <CellField label={`New ${g.name} depth`} value={size.depth} number={{ min: 1 }} step={1} onCommit={(v) => set('depth', v)} />
        </span>
        {custom && !fixed && (
          <button
            type="button"
            aria-label={`${g.name}: back to ${MASS_RATIO}:1`}
            title={`Back to its area per mass at ${MASS_RATIO}:1`}
            onClick={() => apply((p) => actions.updateProgram(p, g.id, { size: undefined }))}
            className="pressable shrink-0 rounded-control px-1 text-caption text-ink-secondary hover:bg-hover hover:text-ink"
          >
            {MASS_RATIO}:1
          </button>
        )}
        {!fixed && (
          <>
            <span aria-hidden className="shrink-0 pl-1 text-ink-tertiary" title="Up to: the most elongated the optimizer may make its masses">
              ≤
            </span>
            <span className="w-9 shrink-0" title={`The most elongated the optimizer may make its masses, long side over short (empty: ${MAX_ASPECT}:1)`}>
              <CellField
                label={`${g.name}: the most elongated a mass may be`}
                value={g.maxAspect ?? null}
                number={{ min: 1 }}
                step={0.5}
                optional
                placeholder={String(MAX_ASPECT)}
                onCommit={aspect}
              />
            </span>
            <span aria-hidden className="shrink-0 text-ink-tertiary">
              :1
            </span>
          </>
        )}
        <button
          type="button"
          aria-label={`${fixed ? 'Unfix' : 'Fix'} the size of ${g.name}`}
          aria-pressed={fixed}
          title={fixed ? 'Fixed: the optimizer keeps this size. Unlock it to let it change the proportion' : 'Fix this size: each of its masses takes it, the optimizer only moves and turns them'}
          onClick={lock}
          className={`pressable grid h-6 w-6 shrink-0 place-items-center rounded-pill ${fixed ? 'bg-fill text-ink' : 'text-ink-secondary hover:bg-hover hover:text-ink'}`}
        >
          <Icon name={fixed ? 'lock' : 'unlock'} className="h-3.5 w-3.5" />
        </button>
      </span>
    </span>
  )
}
