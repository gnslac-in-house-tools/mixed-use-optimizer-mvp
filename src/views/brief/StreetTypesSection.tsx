// The project's street types (Decision "Streets layout", ST.3), in the Brief's Circulation tab: a row per type, its
// name, width, turning radius and who drives it, *+ type* under them. Until one is edited they are the defaults (trucks
// at the standards' road width, cars at the car road width); edited, the project keeps its own and the road widths no
// longer set them. A type a street takes cannot go, nor the last one. Each edit one undo step, through `actions`.
import { VEHICLES, type StreetType, type Vehicles } from '../../model/schema.ts'
import { streetTypesOf } from '../../engine/circulation/streets.ts'
import { standardsOf } from '../../engine/circulation/standards.ts'
import { actions } from '../../state/actions/index.ts'
import { useApp } from '../../state/store.ts'
import { CellField } from '../controls/fields.tsx'
import { Icon } from '../controls/Icon.tsx'
import { Note } from '../layout/Note.tsx'

const WHO: Record<Vehicles, string> = { trucks: 'Trucks', cars: 'Cars', all: 'Trucks and cars' }

export function StreetTypesSection() {
  const project = useApp((s) => s.project)
  const apply = useApp((s) => s.apply)
  const types = streetTypesOf(project)
  const used = new Set(project.options.flatMap((o) => o.streets?.segments.map((g) => g.type) ?? []))
  const set = (id: string, patch: Partial<StreetType>) => apply((p) => actions.setStreetTypes(p, streetTypesOf(p).map((t) => (t.id === id ? { ...t, ...patch } : t))))
  const num = (v: string) => Number(v.replace(',', '.'))
  const add = () =>
    apply((p) => {
      const now = streetTypesOf(p)
      let n = now.length + 1
      while (now.some((t) => t.id === `t${n}`)) n++
      return actions.setStreetTypes(p, [...now, { id: `t${n}`, name: `Type ${n}`, width: standardsOf(p).roadWidth, radius: 15, vehicles: 'all' }])
    })
  const remove = (id: string) => apply((p) => actions.setStreetTypes(p, streetTypesOf(p).filter((t) => t.id !== id)))

  return (
    <section aria-label="Street types" className="flex min-w-0 flex-col gap-2">
      <h3 className="text-label font-semibold text-ink">Street types</h3>
      <Note>What a street is drawn with: the width a new street takes, its corners’ turning radius and who drives it. A drawn street’s width is its own: its sides are pulled by hand. The first type is what a new street takes.</Note>
      <table aria-label="Street types" className="w-full table-fixed text-body">
        <thead>
          <tr className="border-b border-separator text-left align-bottom text-caption text-ink-secondary">
            <th className="w-[34%] pb-1.5 font-medium">Name</th>
            <th className="pb-1.5 pr-2 text-right font-medium" title="What a new street of this type is drawn with: once drawn, its sides are pulled by hand">New street width<span className="block font-normal text-ink-tertiary">m</span></th>
            <th className="pb-1.5 pr-2 text-right font-medium" title="The turning radius its corners are drawn with">
              Radius<span className="block font-normal text-ink-tertiary">m</span>
            </th>
            <th className="w-[28%] pb-1.5 font-medium">Who</th>
            <th className="w-6 pb-1.5" aria-label="Remove" />
          </tr>
        </thead>
        <tbody>
          {types.map((t) => {
            const why = types.length === 1 ? 'The last type: a street needs one' : used.has(t.id) ? 'Streets take it: give them another type first' : null
            return (
              <tr key={t.id} className="border-b border-separator last:border-b-0">
                <td className="py-1.5 pr-2">
                  <CellField label={`${t.name} name`} value={t.name} onCommit={(v) => v.trim() && set(t.id, { name: v.trim() })} />
                </td>
                <td className="py-1.5 pr-2 text-right">
                  <CellField label={`${t.name} width`} value={t.width} number={{ min: 2 }} step={0.5} onCommit={(v) => num(v) > 0 && set(t.id, { width: num(v) })} />
                </td>
                <td className="py-1.5 pr-2 text-right">
                  <CellField label={`${t.name} turning radius`} value={t.radius} number={{ min: 0 }} step={1} onCommit={(v) => num(v) >= 0 && set(t.id, { radius: num(v) })} />
                </td>
                <td className="py-1.5 pr-2">
                  <select
                    aria-label={`${t.name} drives it`}
                    value={t.vehicles}
                    onChange={(e) => set(t.id, { vehicles: e.target.value as Vehicles })}
                    className="w-full rounded-control bg-transparent text-body text-ink outline-none"
                  >
                    {VEHICLES.map((v) => (
                      <option key={v} value={v}>
                        {WHO[v]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-1.5 text-right">
                  <button
                    type="button"
                    aria-label={`Remove ${t.name}`}
                    title={why ?? `Remove ${t.name}`}
                    disabled={why !== null}
                    onClick={() => remove(t.id)}
                    className="pressable grid h-5 w-5 place-items-center rounded-pill text-ink-secondary hover:bg-hover hover:text-ink disabled:opacity-40"
                  >
                    <Icon name="close" className="h-3 w-3" />
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div>
        <button type="button" onClick={add} className="pressable rounded-control px-1.5 py-0.5 text-label text-ink-secondary hover:bg-hover hover:text-ink">
          ＋ Type
        </button>
      </div>
    </section>
  )
}
