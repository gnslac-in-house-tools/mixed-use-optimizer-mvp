// The parking's settings, in two pieces (Phase AS.3, Decision "Settings by what is picked"): `CarParking` and `ParkingTotals` are
// what Properties shows for the Parking branch and its Street parking and Lots rows of Layers (the lots are rows of the tree:
// each is picked there; with none, Properties says how to make one: `LotsHelp`). They were the Parking group of the Flow tab
// (Decisions "Exterior circulation", 4.6, "Parameter tabs", "Flow step", "Circulation layout" and "Street parking by side"): the
// option's car stalls along the streets cars use that have no side of their own (as the site's, both sides, one or none), how
// many streets have theirs, and how many stalls the option has (a KPI the strip can show too: stalls); its parking lots (Decision
// "Lot tool"), their stalls and the streets' apart in the totals. The site's own side and the stall's size are the Brief's
// circulation standards. Every field sends a verb through `actions` (one undo step).
import { titleWith } from '../../../views/commands/shortcuts.ts'
import { standardsOf } from '../../../engine/circulation/standards.ts'
import type { ParkingSide } from '../../../model/schema.ts'
import { actions } from '../../../state/actions/index.ts'
import { useApp } from '../../../state/store.ts'
import { Section, SelectField, Total } from '../../../views/controls/fields.tsx'
import { Note } from '../../../views/layout/Note.tsx'
import { t as tr } from '../../../i18n/idioma.ts' // mixed-use-mvp

export const PARKING_LABELS: Record<ParkingSide, string> = { double: 'Both sides', single: 'One side', none: 'None' }
const SIDES = (['double', 'single', 'none'] as const).map((v) => ({ value: v, label: PARKING_LABELS[v] }))
/** What the site's standard says, short enough for the select. */
const SITE_SHORT: Record<ParkingSide, string> = { double: 'both', single: 'one side', none: 'none' }

/** The side the streets take that have none of their own (*Other streets*), and how many have theirs. */
export function CarParking() {
  const project = useApp((s) => s.project)
  const optionId = useApp((s) => s.option)
  const apply = useApp((s) => s.apply)
  const st = standardsOf(project)
  const option = project.options.find((o) => o.id === optionId)
  const set = (side: string) => apply((p) => actions.setParking(p, optionId, side ? (side as ParkingSide) : null))
  // streets (runs between crossings) with a segment of its own side
  const roads = useApp((s) => s.derived.circulation.roads)
  const own = roads.filter((r) => r.kind === 'street' && r.parking?.some((x) => x !== null)).length
  if (!option) return null
  return (
    <Section title={tr("Car parking")}>
      <Note>
        Stalls along the streets cars use, at right angles to them, in {option.name}. A street picked takes its own side (its P on the
        plan, Shift+click for more); the other streets take this.
      </Note>
      <SelectField label="Other streets" value={option.parking ?? ''} options={[{ value: '', label: `Site's: ${SITE_SHORT[st.parking]}` }, ...SIDES]} onCommit={(v) => set(v)} />
      {own > 0 && <Total label="Streets with their own side" value={own.toLocaleString('en-US')} />}
    </Section>
  )
}

/** What Properties of Parking and of Lots says while the option has no lot (the help the Flow tab's empty list gave). */
export function LotsHelp({ muted }: { muted: string }) {
  const lots = useApp((s) => s.derived.circulation.lots.length)
  if (lots > 0) return null
  return (
    <p className={`text-caption ${muted}`}>
      No parking lots yet. With {titleWith('Lot', 'tool.lot')}, next to a wall a click lays one along it up to the first street in its way; on open ground, drag a free one.
    </p>
  )
}

/** The option's stalls, in the lots and along the streets. */
export function ParkingTotals() {
  const stalls = useApp((s) => s.derived.circulation.totals.stalls)
  const inLots = useApp((s) => s.derived.circulation.totals.lotStalls)
  return (
    <Section title={tr("Totals")}>
      <dl aria-label="Parking totals" className="flex flex-col gap-1.5">
        <Total label="Car stalls" value={stalls.toLocaleString('en-US')} />
        {inLots > 0 && <Total label="In the lots" value={inLots.toLocaleString('en-US')} />}
        {inLots > 0 && <Total label="Along the streets" value={(stalls - inLots).toLocaleString('en-US')} />}
      </dl>
    </Section>
  )
}
