// A warehouse type's step's fields (Decision "Warehouse layout"), under its row in the steps list: typed while the step
// is open, shown (disabled) otherwise. Each commit is one undo step and remakes the type's copies.
import type { WarehouseStep, WarehouseType } from '../../../model/schema.ts'
import type { Generated } from '../engine/generate.ts'
import { NumberField } from '../../../views/controls/fields.tsx'
import { LengthField } from './LengthField.tsx'
import { useLengths } from './units.ts'
import { joinUnderOf } from '../engine/bays.ts'
import { Segmented } from '../../../views/controls/Segmented.tsx'
import { endsAutomatically, regularGridAgain, setGridBy, setJoin, updateStep } from './commands.ts'
import { MorphologyFields } from './MorphologyFields.tsx'
import { ElementsFields } from './ElementsFields.tsx'
import { Note as HelpNote } from '../../../views/layout/Note.tsx'
import { baysInWords } from './summary.ts'
import { t as tr } from '../../../i18n/idioma.ts' // mixed-use-mvp

interface Props {
  t: WarehouseType
  g: Generated
  editable: boolean
}

/** An explanatory line of a step: shown only with Help on (Phase BE.7, Decision "Help"). */
const Note = ({ children }: { children: string }) => <HelpNote className="text-caption text-ink-tertiary">{children}</HelpNote>

/** m, to the µm: a module times its count with no float left over (3.5 × 4 = 14). */
const um = (v: number) => Math.round(v * 1e6) / 1e6

/**
 * Step 1's short end bays (Decision "Grid by line"): an end bay under so many m joins the whole bay next to it; not
 * typed, two thirds of a bay (shown, and *Two thirds of a bay* takes a typed one away).
 */
function JoinField({ t, editable }: Pick<Props, 't' | 'editable'>) {
  const own = t.hall.joinUnder
  const { text } = useLengths()
  const two = joinUnderOf(t.grid.x)
  const width = t.grid.y !== t.grid.x ? ` (${text(joinUnderOf(t.grid.y))} along the width)` : ''
  return (
    <>
      <LengthField label="Join end bays under" min={0} max={Math.max(t.grid.x, t.grid.y)} value={own ?? two} disabled={!editable} onCommit={(v) => setJoin(t.id, v)} />
      {own === undefined ? (
        <Note>{`Two thirds of a bay${width}: a shorter end bay joins the bay next to it.`}</Note>
      ) : (
        <span className="flex items-center justify-between gap-2">
          <Note>{tr("An end bay shorter joins the bay next to it.")}</Note>
          {editable && (
            <button type="button" className="ml-auto shrink-0 whitespace-nowrap text-caption text-ink-secondary underline hover:text-ink" onClick={() => setJoin(t.id, null)}>
              {tr("Two thirds of a bay")}
            </button>
          )}
        </span>
      )}
    </>
  )
}

/**
 * Step 1 (Decision "Grid by line"): set by the bay (each axis's bay and the modules a bay, the module shown) or by the
 * module (each axis's module and the modules a bay, the bay their product: a count changed keeps the module).
 */
function GridFields({ t, g, editable }: Props) {
  const set = (patch: Partial<WarehouseType['grid']>) => updateStep(t.id, 'grid', patch)
  const { x, y, modules } = t.grid
  const byModule = t.grid.by === 'module'
  const count = (v: number) => Math.round(v)
  const { num, unit } = useLengths()
  return (
    <>
      {editable && (
        <span className="flex items-center justify-between gap-3">
          <span className="text-label text-ink-secondary">{tr("Set by")}</span>
          <Segmented
            kind="toggle"
            label="Set the grid by"
            options={[
              { key: 'bay', label: 'Bay' },
              { key: 'module', label: 'Module' },
            ]}
            value={byModule ? 'module' : 'bay'}
            onChange={(by) => setGridBy(t.id, by)}
          />
        </span>
      )}
      {byModule ? (
        <>
          <LengthField label="Module along the length" min={0.1} max={100} value={x / modules} disabled={!editable} onCommit={(v) => set({ x: um(v * modules) })} />
          <LengthField label="Module along the width" min={0.1} max={100} value={y / modules} disabled={!editable} onCommit={(v) => set({ y: um(v * modules) })} />
          <NumberField label="Modules a bay" min={1} max={24} decimals={0} value={modules} disabled={!editable} onCommit={(n) => set({ modules: count(n), x: um((x / modules) * count(n)), y: um((y / modules) * count(n)) })} />
          <Note>{`A bay: ${num(x)} × ${num(y)} ${unit}, the module times the modules a bay.`}</Note>
        </>
      ) : (
        <>
          <LengthField label="Bay along the length" min={1} max={100} value={x} disabled={!editable} onCommit={(v) => set({ x: v })} />
          <LengthField label="Bay along the width" min={1} max={100} value={y} disabled={!editable} onCommit={(v) => set({ y: v })} />
          <NumberField label="Modules a bay" min={1} max={24} decimals={0} value={modules} disabled={!editable} onCommit={(n) => set({ modules: count(n) })} />
          <Note>{`A module: ${num(x / modules)} × ${num(y / modules)} ${unit}, the unit the parts and the elements are placed on.`}</Note>
        </>
      )}
      <JoinField t={t} editable={editable} />
      {editable && (
        <button type="button" className="h-row self-start whitespace-nowrap rounded-control border border-separator px-2 text-body text-ink hover:bg-fill" onClick={() => endsAutomatically(t.id)}>
          {tr("Set end bays automatically")}
        </button>
      )}
      <HelpNote>{`Along the length: ${baysInWords(g.runs.x, unit)}. Along the width: ${baysInWords(g.runs.y, unit)}. The button lays them once; after it, move the column lines by hand on the plan.`}</HelpNote>
      {t.grid.lines && (
        <span className="flex items-center justify-between gap-2">
          <Note>{tr("Lines of its own: moved or deleted on the plan, by their bubbles.")}</Note>
          {editable && (
            <button type="button" className="h-row shrink-0 whitespace-nowrap rounded-control border border-separator px-2 text-body text-ink hover:bg-fill" onClick={() => regularGridAgain(t.id)}>
              {tr("Regular grid again")}
            </button>
          )}
        </span>
      )}
    </>
  )
}

function HallFields({ t, editable }: Props) {
  const set = (patch: Partial<WarehouseType['hall']>) => updateStep(t.id, 'hall', patch)
  return (
    <>
      <LengthField label="Length" min={1} max={2000} value={t.hall.length} disabled={!editable} onCommit={(length) => set({ length })} />
      <LengthField label="Width" min={1} max={2000} value={t.hall.width} disabled={!editable} onCommit={(width) => set({ width })} />
      <span className="text-label text-ink-secondary">{tr("What the optimizer may try (empty: two bays either way)")}</span>
      {(['length', 'width'] as const).map((k) => {
        const range = t.hall.range?.[k]
        const setRange = (i: 0 | 1, v: number) => {
          const next: [number, number] = range ? [...range] : [t.hall[k], t.hall[k]]
          next[i] = v
          if (next[0] > next[1]) next[1 - i] = v
          set({ range: { ...t.hall.range, [k]: next } })
        }
        const name = k === 'length' ? 'Length' : 'Width'
        return (
          <div key={k} className="grid grid-cols-2 gap-x-3">
            <LengthField narrow label={`${name} from`} min={1} max={2000} value={range?.[0] ?? null} disabled={!editable} onCommit={(v) => setRange(0, v)} />
            <LengthField narrow label="to" min={1} max={2000} value={range?.[1] ?? null} disabled={!editable} onCommit={(v) => setRange(1, v)} />
          </div>
        )
      })}
    </>
  )
}

function ColumnsFields({ t, g, editable }: Props) {
  const set = (patch: Partial<WarehouseType['columns']>) => updateStep(t.id, 'columns', patch)
  const every = t.columns.every
  return (
    <>
      <LengthField label="Column size" min={0.1} max={3} value={t.columns.size} disabled={!editable} onCommit={(size) => set({ size })} />
      <NumberField label="On every nth line along the length" min={1} max={12} decimals={0} value={every.x} disabled={!editable} onCommit={(x) => set({ every: { ...every, x: Math.round(x) } })} />
      <NumberField label="On every nth line along the width" min={1} max={12} decimals={0} value={every.y} disabled={!editable} onCommit={(y) => set({ every: { ...every, y: Math.round(y) } })} />
      <Note>{`${g.columns.length} columns at the grid's intersections inside the outline; the box's first and last lines always take theirs.`}</Note>
    </>
  )
}

function EnvelopeFields({ t, editable }: Props) {
  const set = (patch: Partial<WarehouseType['envelope']>) => updateStep(t.id, 'envelope', patch)
  return (
    <>
      <LengthField label="Height" min={1} max={60} value={t.envelope.height} disabled={!editable} onCommit={(height) => set({ height })} />
      <LengthField label="Wall thickness" min={0.05} max={2} value={t.envelope.thickness} disabled={!editable} onCommit={(thickness) => set({ thickness })} />
      <Note>{tr("The wall stands outside the column lines: its inner face on them (or on an edge’s facade offset, step 5). An edge may have its own (step 5).")}</Note>
    </>
  )
}

export function StepFields(props: Props & { step: WarehouseStep }) {
  switch (props.step) {
    case 'grid':
      return <GridFields {...props} />
    case 'hall':
      return <HallFields {...props} />
    case 'columns':
      return <ColumnsFields {...props} />
    case 'envelope':
      return <EnvelopeFields {...props} />
    case 'morphology':
      return <MorphologyFields {...props} />
    case 'elements':
      return <ElementsFields {...props} />
  }
}
