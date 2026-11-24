// The General group's ▾ (Phase AS.5 task 5, Decision "Mirror, Array, Align"): what Mirror, Array and Align take besides their
// points. *Mirror keeps the original*, Array's *Count* (the original counted) and *Rows*, Align's *Edges / Centres*. They are the
// browser's (`plan/tools/generalSettings.ts`), set before using a tool or while it is on (a preview that stands follows them);
// a pick here takes no tool: the settings are not a command.
import { NumberField } from '../controls/fields.tsx'
import { Segmented } from '../controls/Segmented.tsx'
import { MAX_COPIES, MAX_COUNT, MAX_ROWS, useGeneralTools, type AlignHow } from '../plan/tools/generalSettings.ts'
import { t as tr } from '../../i18n/idioma.ts' // mixed-use-mvp

const HOW: { key: AlignHow; label: string; title: string }[] = [
  { key: 'edges', label: 'Edges', title: 'The side of each thing nearest the line is put on it' },
  { key: 'centres', label: 'Centres', title: 'The centre of each thing is put on the line' },
]

export function GeneralOptions() {
  const keep = useGeneralTools((s) => s.keep)
  const count = useGeneralTools((s) => s.count)
  const rows = useGeneralTools((s) => s.rows)
  const how = useGeneralTools((s) => s.how)
  const set = useGeneralTools.getState
  return (
    <div className="flex w-56 flex-col gap-1.5">
      <label className="flex items-center justify-between gap-2 text-label text-ink-secondary" title={tr("Mirror makes a mirrored copy and leaves the original; off, the thing itself is reflected")}>
        {tr("Mirror keeps the original")}
        <input type="checkbox" className="h-4 w-4 accent-ink" checked={keep} onChange={(e) => set().setKeep(e.target.checked)} />
      </label>
      <NumberField
        label="Count"
        value={count}
        decimals={0}
        min={1}
        title={`Array's copies in a row, the original counted: a whole number from 1 to ${MAX_COUNT}, and at most ${MAX_COPIES} copies with the rows (x5 sets it while Array is on)`}
        onCommit={(v) => set().setCount(v)}
      />
      <NumberField
        label="Rows"
        value={rows}
        decimals={0}
        min={1}
        title={`Array's rows: a whole number from 1 to ${MAX_ROWS}, and at most ${MAX_COPIES} copies with the count; with more than one, a third click gives the second row`}
        onCommit={(v) => set().setRows(v)}
      />
      <div className="flex items-center justify-between gap-2 text-label text-ink-secondary">
        {tr("Align on")}
        <Segmented kind="toggle" label="Align on" options={HOW} value={how} onChange={(h) => set().setHow(h)} />
      </div>
    </div>
  )
}
