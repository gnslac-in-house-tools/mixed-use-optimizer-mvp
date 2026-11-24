// The gates' settings (Decision "Exterior circulation", 4.2; port of Plaza-Practiko's *Accesos desde la calle*). The Site tab's Access
// section (the gates and the existing roads as rows) went with that tab (Phase AS.3, Decision "Settings by what is picked"):
// each is a row of Layers now, picked there or on the plan (accessState.ts). What stays is what Properties mounts: `GatesSettings`
// (the Gates row: whose gates they are, the site's, which every option without its own uses, or the active option's own copy, with
// *Own gates for <option>* and *Use the site's*, and + Gate) and `GateProperties` (a gate picked: its fields and Delete); the
// existing road's fields are in ExistingRoadProperties.tsx. Every field sends a verb
// through `actions` (one undo step each).
import { VEHICLES, type Gate, type Id, type Vehicles } from '../../model/schema.ts'
import { gatesOf, ownsGates } from '../../engine/circulation/gates.ts'
import { actions } from '../../state/actions/index.ts'
import { useApp } from '../../state/store.ts'
import { Button, NumberField, SelectField } from '../controls/fields.tsx'
import { Segmented } from '../controls/Segmented.tsx'
import { setGateWidth } from '../editing/edge/gateSlide.ts'
import { addGateOnSide } from '../plan/access/accessCommands.ts'
import { useAccess } from '../plan/access/accessState.ts'
import { gateLocked } from '../../kinds/locked.ts'
import { lockedFirst } from '../layers/locks.ts'
import { Lockable } from './Lockable.tsx'

const VEHICLE_LABELS: Record<Vehicles, string> = { trucks: 'Trucks', cars: 'Cars', all: 'Trucks and cars' }
const FLOWS: { key: Gate['flow']; label: string; title: string }[] = [
  { key: 'in', label: 'In', title: 'Traffic only comes in' },
  { key: 'out', label: 'Out', title: 'Traffic only goes out' },
  { key: 'both', label: 'Both', title: 'In and out' },
]

/** *Own gates for <option>* while the option uses the site's, *Use the site's* while it has its own. */
function OwnGatesButton() {
  const project = useApp((s) => s.project)
  const option = useApp((s) => s.option)
  const apply = useApp((s) => s.apply)
  const optionName = project.options.find((o) => o.id === option)?.name ?? 'this option'
  return ownsGates(project, option) ? (
    <Button title="Drop this option's own gates and use the site's again" onClick={() => apply((p) => actions.dropOwnGates(p, option))}>
      Use the site's
    </Button>
  ) : (
    <Button title={`${optionName} gets a copy of the site's gates to change; the other options keep the site's`} onClick={() => apply((p) => actions.ownGates(p, option))}>
      Own gates for {optionName}
    </Button>
  )
}

/** + Gate: one at the middle of the boundary side nearest an existing street, else of the longest side (greyed while there is no boundary). */
function AddGateButton() {
  const noBoundary = useApp((s) => s.derived.site.polygon === null)
  return (
    <Button title="A gate at the middle of the side nearest a street, else of the longest side" disabled={noBoundary} onClick={() => addGateOnSide()}>
      + Gate
    </Button>
  )
}

/**
 * The Gates row of Layers in Properties: whose gates they are (the site's, or this option's own copy), *Own gates for <option>* /
 * *Use the site's* and + Gate; each gate is a row of its own in the tree.
 */
export function GatesSettings({ muted }: { muted: string }) {
  const project = useApp((s) => s.project)
  const option = useApp((s) => s.option)
  const count = gatesOf(project, option).length
  const optionName = project.options.find((o) => o.id === option)?.name ?? 'this option'
  return (
    <section aria-label="Gates" className="flex flex-col gap-2">
      <h3 className="text-label font-semibold text-ink">{ownsGates(project, option) ? `Gates of ${optionName}` : 'Gates of the site'}</h3>
      <p className={`select-text text-caption ${muted}`}>
        {count === 0 ? 'None yet: click a street’s side or the boundary with Gate, or + Gate.' : `${count} ${count === 1 ? 'gate' : 'gates'}: each is a row under Gates, to pick and change.`}
      </p>
      <div className="flex flex-wrap gap-2">
        <OwnGatesButton />
        <AddGateButton />
      </div>
    </section>
  )
}

/** A gate picked (on the plan or in Layers), in Properties: whose it is, its fields and Delete. */
export function GateProperties({ id, muted }: { id: Id; muted: string }) {
  const project = useApp((s) => s.project)
  const option = useApp((s) => s.option)
  const apply = useApp((s) => s.apply)
  const gates = gatesOf(project, option)
  const i = gates.findIndex((g) => g.id === id)
  if (i < 0) return null
  const own = ownsGates(project, option)
  // a locked gate (the padlock is CAD's): its fields are read-only and say why
  const locked = gateLocked(project, option, id)
  return (
    <section aria-label={`Gate ${i + 1}`} className="flex flex-col gap-3">
      <h2 className="text-headline">Gate {i + 1}</h2>
      <p className={`select-text text-caption ${muted}`}>
        {own ? 'One of this option’s own gates.' : 'One of the site’s gates: every option without its own uses it (own gates are set in Layers, under Gates).'}
      </p>
      <Lockable locked={locked} muted={muted}>
        <GateFields gate={gates[i]} />
        <div>
          <Button
            title={locked ? lockedFirst(1, 'gate') : `Delete Gate ${i + 1}`}
            onClick={() => {
              apply((p) => actions.removeGate(p, option, id))
              useAccess.getState().pick(null)
            }}
          >
            Delete
          </Button>
        </div>
      </Lockable>
    </section>
  )
}

function GateFields({ gate: g }: { gate: Gate }) {
  const option = useApp((s) => s.option)
  const apply = useApp((s) => s.apply)
  const update = (patch: Partial<Omit<Gate, 'id'>>) => apply((p) => actions.updateGate(p, option, g.id, patch))
  return (
    <>
      <NumberField label="Width" unit="m" min={2} value={g.width} onCommit={(v) => setGateWidth(g.id, v)} />
      <NumberField label="Turning radius" unit="m" min={0} value={g.radius} onCommit={(v) => update({ radius: v })} />
      <div className="flex items-center justify-between gap-3">
        <span className="text-label text-ink-secondary">Flow</span>
        <Segmented kind="toggle" label="Flow" options={FLOWS} value={g.flow} onChange={(flow) => update({ flow })} />
      </div>
      <SelectField
        label="Vehicles"
        value={g.vehicles}
        options={VEHICLES.map((v) => ({ value: v, label: VEHICLE_LABELS[v] }))}
        onCommit={(v) => update({ vehicles: v as Vehicles })}
      />
      <label className="flex items-center justify-between gap-3" title="A booth beside the lane, inside the boundary">
        <span className="text-label text-ink-secondary">Guard house</span>
        <input type="checkbox" className="h-4 w-4 accent-ink" checked={g.guardHouse === true} onChange={(e) => update({ guardHouse: e.target.checked || undefined })} />
      </label>
      <NumberField label="Queue" unit="m" min={0} value={g.queue ?? 0} onCommit={(v) => update({ queue: v > 0 ? v : undefined })} />
    </>
  )
}
