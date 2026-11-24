// Step 5's fields, Shape (Decisions "Warehouse type", "Block shape"): a row per edge of the outline (E1…En, the way it
// faces, its length, its own wall's thickness and its facade's offset; a row picked lights its edge on the plan, an
// edge picked on the plan lights its row), the holes (each its size, removed by its row), and the block's zones
// (Decision "Warehouse by hand": each its program and level, split and merged). The outline itself is edited on the
// plan: a wall dragged, a bay pulled out or pushed in, a corner removed, a hole drawn.
import type { HallZone, WarehouseType } from '../../../model/schema.ts'
import type { Generated } from '../engine/generate.ts'
import { moduleLine, type Run } from '../engine/bays.ts'
import { holeRect } from '../engine/shape.ts'
import { mergeZones, neighbours, splitZone, zonesOf, type ZoneAxis } from '../engine/zones.ts'
import { LengthField } from './LengthField.tsx'
import { useLengths } from './units.ts'
import { useApp } from '../../../state/store.ts'
import { Button } from '../../../views/controls/fields.tsx'
import { Icon } from '../../../views/controls/Icon.tsx'
import { Note } from '../../../views/layout/Note.tsx'
import { shapeEdit, updateStep } from './commands.ts'
import { edgeName } from './handleMath.ts'
import { useWarehouse } from './warehouseState.ts'
import { t as tr } from '../../../i18n/idioma.ts' // mixed-use-mvp

interface Props {
  t: WarehouseType
  g: Generated
  editable: boolean
}

const FACING: Record<string, string> = { front: 'Front', back: 'Back', left: 'Left', right: 'Right' }

/** A small select with its name beside it, half a panel wide. */
function Choice<K extends string>({ label, value, options, disabled, onPick }: { label: string; value: K; options: { value: K; label: string }[]; disabled: boolean; onPick(v: K): void }) {
  return (
    <label className="flex min-w-0 items-center justify-between gap-1.5">
      <span className="text-label text-ink-secondary">{label}</span>
      <select
        aria-label={label}
        disabled={disabled}
        className="h-row w-[5.75rem] min-w-0 rounded-control border border-separator bg-panel-sunken px-1 text-body text-ink outline-none focus:border-ink disabled:border-transparent disabled:bg-transparent disabled:text-ink-secondary"
        value={value}
        onChange={(e) => onPick(e.target.value as K)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function Remove({ what, disabled, onClick }: { what: string; disabled: boolean; onClick(): void }) {
  if (disabled) return null
  return (
    <button type="button" aria-label={`Remove ${what}`} title={`Remove ${what}`} onClick={onClick} className="pressable grid h-6 w-6 place-items-center rounded-control text-ink-secondary hover:bg-hover hover:text-ink">
      <Icon name="trash" className="h-4 w-4" />
    </button>
  )
}

const Card = ({ children }: { children: React.ReactNode }) => <div className="flex flex-col gap-1.5 rounded-control border border-separator p-2">{children}</div>
const Title = ({ children }: { children: React.ReactNode }) => <span className="text-label font-semibold text-ink">{children}</span>

/** A zone's program, as its select says it: '' the block's, 'none' none, else the program's id. */
const programValue = (v: string | null | undefined) => (v === undefined ? '' : (v ?? 'none'))
const programOf = (v: string) => (v === '' ? undefined : v === 'none' ? null : v)

/** The outline's edges, a row each: picked with its edge on the plan, its own wall and offset typed. */
function EdgeRows({ t, g, editable }: Props) {
  const { text } = useLengths()
  const picked = useWarehouse((s) => s.picked)
  const setPicked = useWarehouse((s) => s.setPicked)
  return (
    <>
      <span className="text-label text-ink-secondary">{`Edges · ${g.edges.length}`}</span>
      <ul aria-label="Edges" className="flex flex-col gap-1">
        {g.edges.map((e) => {
          const on = picked.some((x) => (x.kind === 'edge' || x.kind === 'stretch') && x.id === e.id)
          const long = Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y)
          return (
            <li key={e.id} data-edge={e.id} aria-current={on || undefined} className={`flex flex-col gap-1 rounded-control border p-1.5 ${on ? 'border-grid-line bg-grid-soft' : 'border-separator'}`}>
              <button type="button" className="pressable flex items-center justify-between gap-2 text-left" title="Light this edge on the plan" onClick={() => setPicked(on ? [] : [{ kind: 'edge', id: e.id }])}>
                <Title>{edgeName(g.outline, e.id)}</Title>
                <span className="text-caption tabular-nums text-ink-tertiary">{`${FACING[e.side]} · ${text(long)}${e.outer ? ' · box' : ''}`}</span>
              </button>
              {on && (
                <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                  <LengthField
                    narrow
                    label="Wall"
                    min={0.05}
                    max={2}
                    value={e.thickness}
                    disabled={!editable}
                    onCommit={(v) => shapeEdit(t.id, { kind: 'wall', edge: e.id, thickness: Math.abs(v - t.envelope.thickness) < 1e-9 ? null : v })}
                  />
                  <LengthField narrow label="Offset" min={0} max={20} value={e.offset} disabled={!editable} onCommit={(v) => shapeEdit(t.id, { kind: 'wall', edge: e.id, offset: v > 0 ? v : null })} />
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </>
  )
}

/** The holes: each its size, removed by its row; drawn with the Hole tool. */
function HoleRows({ t, g, editable }: Props) {
  const { num, unit } = useLengths()
  return (
    <>
      <span className="text-label text-ink-secondary">{`Holes · ${g.holes.length}`}</span>
      {g.holes.length === 0 && <p className="select-text text-caption text-ink-tertiary">{tr("None: drag one with the Hole tool, inside the outline.")}</p>}
      {g.holes.map((h, i) => (
        <div key={h.id} data-hole={h.id} className="flex items-center justify-between gap-2 rounded-control border border-separator px-2 py-1">
          <span className="text-label text-ink">{`Hole ${i + 1}`}</span>
          <span className="text-caption tabular-nums text-ink-tertiary">{`${num(holeRect(h).x1 - holeRect(h).x0)} × ${num(holeRect(h).y1 - holeRect(h).y0)} ${unit}`}</span>
          <Remove what={`hole ${i + 1}`} disabled={!editable} onClick={() => shapeEdit(t.id, { kind: 'unhole', id: h.id })} />
        </div>
      ))}
    </>
  )
}

/**
 * The block's zones (Decision "Warehouse by hand"): each its name, where it is, its program and its level; Split (in
 * two across its longer side, on the module line nearest its middle), Merge with a neighbour that shares a whole side.
 */
function ZoneFields({ t, g, editable }: Props) {
  const { num, unit, area: areaText } = useLengths()
  const programs = useApp((s) => s.project.programs).filter((p) => p.built)
  const zones = zonesOf(t, g.runs)
  const off = !editable
  const save = (next: HallZone[] | null) => next && updateStep(t.id, 'morphology', { zones: next })
  const setZone = (id: string, patch: Partial<HallZone>) => save(zones.map((z) => (z.id === id ? { ...z, ...patch } : z)))
  const name = (z: HallZone) => z.name ?? `Zone ${zones.indexOf(z) + 1}`
  const span = (r: Run, [a, b]: [number, number]) => `${num(moduleLine(r, a))}–${num(moduleLine(r, b))}`
  /** The zone split on the module line nearest its middle, across its longer side (that side split). */
  const halve = (z: HallZone) => {
    const long: ZoneAxis = moduleLine(g.runs.x, z.x[1]) - moduleLine(g.runs.x, z.x[0]) >= moduleLine(g.runs.y, z.y[1]) - moduleLine(g.runs.y, z.y[0]) ? 'x' : 'y'
    for (const a of [long, long === 'x' ? 'y' : 'x'] as ZoneAxis[]) {
      const next = splitZone(zones, z.id, a, Math.round((z[a][0] + z[a][1]) / 2))
      if (next) return next
    }
    return null
  }
  const area = new Map(g.zones.map((z) => [z.id, z.area]))
  return (
    <>
      <span className="text-label text-ink-secondary">{tr("Zones of the block")}</span>
      {zones.map((z) => (
        <Card key={z.id}>
          <div className="flex items-center justify-between gap-2">
            <Title>{name(z)}</Title>
            <span className="text-caption tabular-nums text-ink-tertiary">{`${span(g.runs.x, z.x)} × ${span(g.runs.y, z.y)} ${unit} · ${areaText(area.get(z.id) ?? 0)}`}</span>
          </div>
          <Choice
            label="Zone program"
            value={programValue(z.program)}
            disabled={off}
            options={[{ value: '', label: 'The block’s' }, { value: 'none', label: 'None' }, ...programs.map((x) => ({ value: x.id, label: x.name }))]}
            onPick={(v) => setZone(z.id, { program: programOf(v) })}
          />
          <LengthField label="Zone level" min={-20} max={20} value={z.level ?? 0} disabled={off} onCommit={(level) => setZone(z.id, { level: level || undefined })} />
          {editable && (
            <div className="flex flex-wrap gap-1.5">
              <Button title="This zone in two, across its longer side" disabled={!halve(z)} onClick={() => save(halve(z))}>
                {tr("Split")}
              </Button>
              {neighbours(zones, z.id).map((n) => (
                <Button key={n.id} title={`${name(z)} and ${name(n)} made one`} onClick={() => save(mergeZones(zones, z.id, n.id))}>
                  {`Merge with ${name(n)}`}
                </Button>
              ))}
            </div>
          )}
        </Card>
      ))}
    </>
  )
}

export function MorphologyFields(props: Props) {
  return (
    <>
      <EdgeRows {...props} />
      <HoleRows {...props} />
      <ZoneFields {...props} />
      <Note className="text-caption text-ink-tertiary">
        {tr("On the plan: drag a wall or a corner anywhere (it lands on a module line when it is near one; Shift: free; the box’s walls in blue stretch the box); double click a wall for its bay, then drag that stretch out or in; Alt + double click a wall to add a corner; double click a corner to remove it.")}
      </Note>
    </>
  )
}
