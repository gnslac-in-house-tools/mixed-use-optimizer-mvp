// The circulation standards (Phase K.4, the Brief's Circulation tab; were the Site step's, Phase C.5, and before them
// the Circulation, Docks and Parking tabs' fields): the project's defaults for its roads (a car road's: Decision
// "Circulation layout"), a new gate, the truck courts and the car stalls (and the side an option parks on unless it
// says), copied from the typology (engine/circulation/standards.ts). The road widths take a range the optimizer may
// search (`road.width`; an option keeps what it tried as its own). The truck court only where the typology offers docks,
// the stall only where it offers parking (Decision "What is not there is not shown"). Every field sends a verb through `actions` (one undo
// step each).
import { standardsOf, type SearchedStandard } from '../../engine/circulation/standards.ts'
import { actions } from '../../state/actions/index.ts'
import { useApp } from '../../state/store.ts'
import type { ParkingSide } from '../../model/schema.ts'
import { CellField, NumberField, SelectField } from '../controls/fields.tsx'
import { Note } from '../layout/Note.tsx'
import { useModule } from '../modules.ts'
import { PARKING_LABELS } from '../../modules/parking/views/ParkingTab.tsx'

export function StandardsSection() {
  const project = useApp((s) => s.project)
  const apply = useApp((s) => s.apply)
  const st = standardsOf(project)
  // the truck court is the docks', the stall the parking's: each only where the typology offers its module
  const docks = useModule('docks').offered
  const parking = useModule('parking').offered
  const set = (patch: Parameters<typeof actions.updateStandards>[1]) => apply((p) => actions.updateStandards(p, patch))

  return (
    <section aria-label="Circulation standards" className="flex flex-col gap-2">
      <h3 className="text-label font-semibold text-ink">Standards</h3>
      <Note>What the roads, the gates{docks ? ', the truck courts' : ''}{parking ? ' and the car stalls' : ''} are made with; each gate's own are in Properties, picked in Layers under Circulation › Gates; the roads themselves are drawn with the Streets tools.</Note>
      <NumberField label="Road width" unit="m" min={3} value={st.roadWidth} onCommit={(v) => set({ roadWidth: v })} />
      <SearchRange k="roadWidth" label="Road width" />
      <NumberField label="Car road width" unit="m" min={3} value={st.carRoadWidth} onCommit={(v) => set({ carRoadWidth: v })} />
      <SearchRange k="carRoadWidth" label="Car road width" />
      <NumberField label="Lane width" unit="m" min={2} value={st.laneWidth} onCommit={(v) => set({ laneWidth: v })} />
      <NumberField label="Ring road clearance" unit="m" min={0} value={st.ringClear} onCommit={(v) => set({ ringClear: v })} />
      <NumberField label="Gate width" unit="m" min={2} value={st.gateWidth} onCommit={(v) => set({ gateWidth: v })} />
      <NumberField label="Gate turning radius" unit="m" min={0} value={st.gateRadius} onCommit={(v) => set({ gateRadius: v })} />
      {docks && <NumberField label="Truck court depth" unit="m" min={10} value={st.courtDepth} onCommit={(v) => set({ courtDepth: v })} />}
      {parking && (
        <>
          <NumberField label="Stall width" unit="m" min={2} value={st.stallWidth} onCommit={(v) => set({ stallWidth: v })} />
          <NumberField label="Stall depth" unit="m" min={3} value={st.stallDepth} onCommit={(v) => set({ stallDepth: v })} />
          <NumberField label="Lot aisle width" unit="m" min={3} value={st.aisleWidth} onCommit={(v) => set({ aisleWidth: v })} />
          <SelectField
            label="Parking along the roads"
            value={st.parking}
            options={(['double', 'single', 'none'] as const).map((v) => ({ value: v, label: PARKING_LABELS[v] }))}
            onCommit={(v) => set({ parking: v as ParkingSide })}
          />
        </>
      )}
    </section>
  )
}

/** A road width's range the optimizer may search, low to high (Phase K.4); empty: it keeps the standard. */
function SearchRange({ k, label }: { k: SearchedStandard; label: string }) {
  const range = useApp((s) => s.project.standards?.search?.[k])
  const apply = useApp((s) => s.apply)
  const set = (end: 0 | 1, v: string) => {
    const n = Number(v)
    const next: [number, number] | null = v === '' ? null : end === 0 ? [n, Math.max(n, range?.[1] ?? n)] : [Math.min(range?.[0] ?? n, n), n]
    apply((p) => actions.setStandardSearch(p, k, next))
  }
  return (
    <div className="-mt-1 flex items-center justify-end gap-1 text-caption text-ink-secondary" title="The range a road width may be tried in, low to high: what the optimizer searches (its Roads stage: Road widths); each option keeps what it tried. Empty: the standard alone">
      <span>Search range</span>
      <span className="w-11">
        <CellField label={`${label} search from`} value={range?.[0] ?? null} number={{ min: 3 }} step={0.5} optional placeholder="—" onCommit={(v) => set(0, v)} />
      </span>
      <span aria-hidden>–</span>
      <span className="w-11">
        <CellField label={`${label} search to`} value={range?.[1] ?? null} number={{ min: 3 }} step={0.5} optional placeholder="—" onCommit={(v) => set(1, v)} />
      </span>
      <span>m</span>
    </div>
  )
}
