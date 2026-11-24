// mixed-use-mvp: Programs · Furniture in the drafting bar (interiors.ts), for every typology: Programs, the spaces a
// module lays out inside its masses (the residential units' rooms; the industrial plant's areas, later); Furniture, the
// furniture or equipment in them (the units' furniture; machinery, later). Each on its own.
import { ChipTrack, ToggleChip } from '../controls/ToggleChips.tsx'
import { useInteriors } from './interiors.ts'

export function InteriorsControls() {
  const s = useInteriors()
  return (
    <div role="toolbar" aria-label="Interiors" className="flex shrink-0 items-center gap-1.5">
      <ChipTrack>
        <ToggleChip pressed={s.interiors} title="Programs: the spaces inside the masses, by use (the rooms of each unit)" onClick={() => s.toggle('interiors')}>
          Programs
        </ToggleChip>
        <ToggleChip pressed={s.furniture} title="Furniture and equipment inside the masses" onClick={() => s.toggle('furniture')}>
          Furniture
        </ToggleChip>
      </ChipTrack>
    </div>
  )
}
