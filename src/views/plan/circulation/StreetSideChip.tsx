// The Street tool's side (Decision "Street side when drawing"): the chips Left · Centre · Right under its type in the
// Streets group's ▾ (tools/GroupOptions.tsx): which edge of the street the line drawn is, walking it, or its
// centre. Space (or Tab, once a point is placed) cycles them with Street in hand (Shift back); before the first point the plan shows the
// side at the pointer. Picking one in the ▾ takes the Street tool (`onPick`, GroupOptions.tsx). A segment that would run over a
// building takes the side that keeps it outside on its own; its preview shows it.
import type { StreetSide } from '../../../model/schema.ts'
import { Segmented } from '../../controls/Segmented.tsx'
import { useStreetSide } from './roadState.ts'
import { t as tr } from '../../../i18n/idioma.ts' // mixed-use-mvp

const KEY = 'Space (or Tab) cycles them with Street in hand, Shift back'
const OPTIONS: { key: StreetSide; label: string; title: string }[] = [
  { key: 'left', label: 'Left', title: `The line you draw is the street's left edge, walking it: the paving to its right. ${KEY}` },
  { key: 'centre', label: 'Centre', title: `The line you draw is the street's centre. ${KEY}` },
  { key: 'right', label: 'Right', title: `The line you draw is the street's right edge, walking it: the paving to its left. ${KEY}` },
]

export function StreetSideChip({ onPick }: { /** Told after a side is picked here. */ onPick?(): void } = {}) {
  const side = useStreetSide((s) => s.side)
  const setSide = useStreetSide((s) => s.setSide)
  return (
    <div
      className="flex w-56 items-center justify-between gap-2 text-label text-ink-secondary"
      title="A segment that would run over a building takes the side that keeps it outside on its own"
    >
      {tr("Side")}
      <Segmented kind="toggle" label="Street side" options={OPTIONS} value={side} onChange={(s) => {
          setSide(s)
          onPick?.()
        }}
      />
    </div>
  )
}
