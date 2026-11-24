// A building's levels, in the Buildings tab (Decisions "Levels", "Buildings layout"; port of Plaza-Practiko
// `vistas/paneles/pestanas/sitio/Niveles.tsx`, once the Levels tab): a table, highest first: name, elevation, height
// and ×N (a typical floor). Under it, each level with its floor area (× N), to go to it, and the GFA. A level with
// masses goes from the Levels tab (right-click). No + buttons, and no ×: the levels are the ones the masses make
// (Decision "Levels follow the masses"; a mass goes up or down with the gumball or *Copy to level above*); a bin at the end of each
// row deletes that level (Phase AS.3: the Levels tab, its only other place, goes), as the Levels tab's menu did: with its masses, after
// asking, and a building keeps one level at least. Every
// field is one undo step; changing a height or ×N moves the levels above it (state/actions/levels.ts). An elevation
// typed within SAME_FLOOR of another level's floor asks, after, whether it is that floor (offerSameFloor).
import type { Building } from '../../model/schema.ts'
import { actions } from '../../state/actions/index.ts'
import { useApp } from '../../state/store.ts'
import { CellField } from '../controls/fields.tsx'
import { m2 } from '../format.ts'
import { Icon } from '../controls/Icon.tsx'
import { deleteLevels, offerSameFloor } from './buildingCommands.ts'
import { Note } from '../layout/Note.tsx'
import { t as tr } from '../../i18n/idioma.ts' // mixed-use-mvp

export function BuildingLevels({ building }: { building: Building }) {
  const levels = building.levels
  const figures = useApp((s) => s.derived.buildings[building.id])
  const floorArea = figures?.floorAreaByLevel ?? {}
  const gfa = figures?.gfa ?? 0
  const active = useApp((s) => s.level)
  const showAll = useApp((s) => s.showAll)
  const apply = useApp((s) => s.apply)
  const setLevel = useApp((s) => s.setLevel)
  const rows = [...levels].sort((a, b) => b.elevation - a.elevation)

  return (
    <section aria-label="Levels" className="flex flex-col gap-3">
      <table className="w-full table-fixed border-separate border-spacing-y-1 text-body">
        <thead>
          <tr className="text-left text-caption text-ink-secondary">
            <th className="w-[22%] font-medium">{tr("Name")}</th>
            <th className="font-medium" title="Its floor, from the site's ground (m)">
              {tr("Elev.")}
            </th>
            <th className="font-medium" title="Floor to floor (m)">
              {tr("Height")}
            </th>
            <th className="w-[13%] font-medium" title="Repeats: a typical floor, N times">
              ×N
            </th>
            <th className="w-[10%]">
              <span className="sr-only">{tr("Delete")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => (
              <tr key={l.id} data-level-row={l.id}>
                <td className="pr-1">
                  <CellField label={`Name of ${l.name}`} value={l.name} onCommit={(v) => apply((p) => actions.updateLevel(p, l.id, { name: v }))} />
                </td>
                <td className="pr-1">
                  <CellField
                    label={`Elevation of ${l.name}`}
                    value={l.elevation}
                    number={{}}
                    onCommit={(v) => {
                      apply((p) => actions.updateLevel(p, l.id, { elevation: Number(v) }))
                      offerSameFloor(l.id)
                    }}
                  />
                </td>
                <td className="pr-1">
                  <CellField
                    label={`Height of ${l.name}`}
                    value={l.height}
                    number={{ min: 0.5 }}
                    onCommit={(v) => apply((p) => actions.updateLevel(p, l.id, { height: Number(v) }))}
                  />
                </td>
                <td className="pr-1">
                  <CellField
                    label={`Repeats of ${l.name}`}
                    value={l.repeat}
                    number={{ min: 1, integer: true }}
                    onCommit={(v) => apply((p) => actions.updateLevel(p, l.id, { repeat: Number(v) }))}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    aria-label={`Delete ${l.name}`}
                    title={levels.length <= 1 ? `${building.name} keeps one level at least` : 'Delete this level with its masses (asks first when it has any)'}
                    disabled={levels.length <= 1}
                    onClick={() => deleteLevels([l.id])}
                    className="pressable grid h-6 w-6 place-items-center rounded-control text-ink-secondary hover:bg-hover hover:text-ink disabled:text-ink-tertiary disabled:hover:bg-transparent"
                  >
                    <Icon name="trash" className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
          ))}
        </tbody>
      </table>

      {/* each level: go to it, and its floor area (× N) */}
      <div className="flex flex-col">
        {rows.map((l) => {
          const on = !showAll && l.id === active
          return (
            <button
              key={l.id}
              type="button"
              aria-pressed={on}
              title={`Go to ${l.name}`}
              onClick={() => setLevel(l.id)}
              className={`pressable flex h-row items-center justify-between gap-3 rounded-control px-2 text-body ${on ? 'bg-fill font-medium text-ink' : 'text-ink-secondary hover:bg-hover hover:text-ink'}`}
            >
              <span className="truncate">
                {l.name}
                {l.repeat > 1 && <span className="text-ink-secondary"> ×{l.repeat}</span>}
              </span>
              <span className="tabular-nums">{m2((floorArea[l.id] ?? 0) * l.repeat)}</span>
            </button>
          )
        })}
        <div className="mt-1 flex items-center justify-between gap-3 border-t border-separator px-2 pt-2 text-body">
          <span className="text-label text-ink-secondary">{tr("Floor area (GFA)")}</span>
          <span className="font-medium tabular-nums">{m2(gfa)}</span>
        </div>
      </div>
      <Note>{tr("Changing a height or ×N moves the levels above it. A mass without a height of its own takes its level’s.")}</Note>
    </section>
  )
}
