// The Street tool's type (Decision "Streets layout"): "Trucks · 12 m ▾", what the next segments take. It stands in the
// Streets group's ▾ of the Tools strip (tools/GroupOptions.tsx, "New street"; the user, 2026-11-03: on the drafting bar it
// left the command line no room on a 14" screen); the types are the project's (Brief › Circulation edits them). `onPick`: told after
// a pick (the ▾ takes the Street tool then).
import { streetTypesOf } from '../../../engine/circulation/streets.ts'
import { useApp } from '../../../state/store.ts'
import { SHOW_SELECT } from '../../show/ShowControls.tsx'
import { useStreetType } from './roadState.ts'

export function StreetTypeChip({ onPick }: { /** Told after a type is picked here. */ onPick?(): void } = {}) {
  // the standards, not the types: a list made anew on each read would never settle
  const standards = useApp((s) => s.project.standards)
  const own = useApp((s) => s.project.options.find((o) => o.id === s.option)?.standards)
  const types = streetTypesOf({ standards }, { standards: own })
  const picked = useStreetType((s) => s.type)
  const setType = useStreetType((s) => s.setType)
  const type = types.find((t) => t.id === picked) ?? types[0]
  return (
    <label className="flex w-56 items-center justify-between gap-2 text-label text-ink-secondary">
      Type
      <select
        aria-label="Street type"
        title="The type the next street takes: its width, its turning radius and who drives it (Brief › Circulation edits the types)"
        value={type.id}
        onChange={(e) => {
          setType(e.target.value)
          onPick?.()
        }}
        className={SHOW_SELECT}
      >
        {types.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name} · {t.width} m
          </option>
        ))}
      </select>
    </label>
  )
}
