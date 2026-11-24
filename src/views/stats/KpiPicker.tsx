// "Customize" for the KPI strip (Decision "KPI strip"): which KPIs it shows and in what order. Shown ones can be
// dragged into order (or moved with ↑ ↓) and hidden; the rest are added with +. "Typology default" goes back to the
// set the project's typology starts with. Every change is a verb through store.apply: saved in the Project (and in the
// .gft), one undo step each.
import { useCallback, useRef, useState } from 'react'
import { chosenKpis, kpisOn } from '../../modules/catalog.ts'
import { actions } from '../../state/actions/index.ts'
import { useApp } from '../../state/store.ts'
import { TYPOLOGIES } from '../../typologies/index.ts'
import { Icon } from '../controls/Icon.tsx'
import { useCloseOutside } from '../controls/useCloseOutside.ts'
import { Note } from '../layout/Note.tsx'

const ROW_BUTTON = 'pressable grid h-6 w-6 shrink-0 place-items-center rounded-control text-ink-segment hover:bg-hover hover:text-ink disabled:opacity-30'

export function KpiPicker() {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const dragged = useRef<number | null>(null)
  const [over, setOver] = useState<number | null>(null)
  const project = useApp((s) => s.project)
  const apply = useApp((s) => s.apply)
  const close = useCallback(() => setOpen(false), [])
  useCloseOutside(open, close, root)

  const catalog = kpisOn(project)
  const shown = chosenKpis(project)
  const byId = new Map(catalog.map((k) => [k.id, k]))
  const hidden = catalog.filter((k) => !shown.includes(k.id))
  const typologyDefault = TYPOLOGIES.find((t) => t.id === project.typology)?.kpis
  const isDefault = typologyDefault !== undefined && typologyDefault.join() === shown.join()

  const move = (from: number, to: number) => apply((p) => actions.moveKpi(p, from, to))

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Customize KPIs"
        title="Customize the KPIs: which ones and in what order"
        className={`pressable grid h-[2rem] w-[2rem] place-items-center rounded-control text-ink-segment hover:bg-hover hover:text-ink ${open ? 'bg-fill text-ink' : ''}`}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="sliders" />
      </button>
      {open && (
        <div role="dialog" aria-label="Customize KPIs" className="panel absolute right-0 top-full z-40 mt-2 select-text max-h-[calc(100dvh-6rem)] w-[20rem] overflow-y-auto overscroll-contain p-3 shadow-sheet">
          <h2 className="text-label text-ink-secondary">Shown, in order</h2>
          <Note>Drag to reorder. Saved with the project, so the client sees the same strip.</Note>
          <ul aria-label="Shown KPIs" className="mt-2 flex flex-col gap-0.5">
            {shown.map((id, i) => (
              <li
                key={id}
                draggable
                onDragStart={(e) => {
                  dragged.current = i
                  e.dataTransfer?.setData('text/plain', id) // Firefox starts a drag only with data
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  setOver(i)
                }}
                onDragLeave={() => setOver((o) => (o === i ? null : o))}
                onDrop={(e) => {
                  e.preventDefault()
                  if (dragged.current !== null) move(dragged.current, i)
                  dragged.current = null
                  setOver(null)
                }}
                onDragEnd={() => {
                  dragged.current = null
                  setOver(null)
                }}
                className={`flex cursor-grab items-center gap-1 rounded-control px-1 py-1 text-body hover:bg-hover ${over === i ? 'bg-fill' : ''}`}
              >
                <Icon name="grip" className="h-4 w-4 shrink-0 text-ink-tertiary" />
                <span className="min-w-0 flex-1 truncate" title={byId.get(id)?.help}>
                  {byId.get(id)?.label ?? id}
                </span>
                <button type="button" aria-label={`Move ${byId.get(id)?.label} up`} className={ROW_BUTTON} disabled={i === 0} onClick={() => move(i, i - 1)}>
                  <Icon name="chevronUp" className="h-3.5 w-3.5" />
                </button>
                <button type="button" aria-label={`Move ${byId.get(id)?.label} down`} className={ROW_BUTTON} disabled={i === shown.length - 1} onClick={() => move(i, i + 1)}>
                  <Icon name="chevronDown" className="h-3.5 w-3.5" />
                </button>
                <button type="button" aria-label={`Hide ${byId.get(id)?.label}`} className={ROW_BUTTON} onClick={() => apply((p) => actions.hideKpi(p, id))}>
                  <Icon name="close" className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
          {hidden.length > 0 && (
            <>
              <h2 className="mt-3 text-label text-ink-secondary">Available</h2>
              <ul aria-label="Available KPIs" className="mt-1 flex flex-col gap-0.5">
                {hidden.map((k) => (
                  <li key={k.id} className="flex items-center gap-1 rounded-control px-1 py-1 text-body hover:bg-hover">
                    <span className="min-w-0 flex-1 truncate text-ink-secondary" title={k.help}>
                      {k.label}
                    </span>
                    <button type="button" aria-label={`Show ${k.label}`} className={ROW_BUTTON} onClick={() => apply((p) => actions.showKpi(p, k.id))}>
                      <Icon name="plus" className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {typologyDefault && (
            <button
              type="button"
              disabled={isDefault}
              className="pressable mt-3 rounded-control px-2 py-1 text-label font-medium text-ink-secondary hover:bg-hover hover:text-ink disabled:opacity-40"
              onClick={() => apply((p) => actions.setKpis(p, typologyDefault))}
            >
              Back to the typology’s default
            </button>
          )}
        </div>
      )}
    </div>
  )
}
