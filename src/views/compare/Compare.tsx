// Compare options (Decision "Compare options", B.5), in the viewport's place while it is open (the side panels and the
// KPI strip stay, on the active option). On top: which options (chips), Plan · 3D, Frame and Close (Esc). Then one
// pane per option, side by side, with one camera for all (compareView.ts): its name, *Edit* (goes back to editing it)
// and its plan or 3D. Under them, the KPI table by option and building.
import { useEffect } from 'react'
import { useApp } from '../../state/store.ts'
import { Icon } from '../controls/Icon.tsx'
import { Segmented } from '../controls/Segmented.tsx'
import { goToOption } from '../panels/buildingCommands.ts'
import { LazyScene } from '../scene/LazyScene.tsx'
import { ComparePlan } from './ComparePlan.tsx'
import { CompareTable } from './CompareTable.tsx'
import { useCompare, type CompareMode } from './compareView.ts'

const MODES: { key: CompareMode; label: string }[] = [
  { key: 'plan', label: 'Plan' },
  { key: '3d', label: '3D' },
]

const chipClass = 'pressable rounded-pill border px-2.5 py-1 text-label'

export function Compare() {
  const options = useApp((s) => s.project.options)
  const active = useApp((s) => s.option)
  const ids = useCompare((s) => s.optionIds)
  const mode = useCompare((s) => s.mode)
  const { toggle, setMode, close, reframe, setPlan } = useCompare.getState()
  const shown = options.filter((o) => ids.includes(o.id))

  // Escape closes it. Listened to as it bubbles: a menu or a confirmation open on top catches its Escape first (capture)
  // and stops it there
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target
      if (e.key !== 'Escape' || (t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'))) return
      e.preventDefault()
      close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  return (
    <section aria-label="Compare options" className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-separator px-4 py-2.5">
        <h2 className="text-headline">Compare</h2>
        <div role="group" aria-label="Options compared" className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {options.map((o) => {
            const on = ids.includes(o.id)
            return (
              <button
                key={o.id}
                type="button"
                aria-pressed={on}
                disabled={on && ids.length <= 1}
                title={on ? `Leave ${o.name} out` : `Add ${o.name}`}
                onClick={() => toggle(o.id)}
                className={`${chipClass} ${on ? 'border-ink bg-ink text-on-ink' : 'border-separator text-ink-secondary hover:bg-hover hover:text-ink'}`}
              >
                {o.name}
              </button>
            )
          })}
        </div>
        <Segmented kind="tabs" label="Compare view" options={MODES} value={mode} onChange={setMode} />
        <button
          type="button"
          aria-label="Frame all"
          title="Frame every pane again (double-click a plan does it too)"
          onClick={() => (mode === 'plan' ? setPlan(null) : reframe())}
          className="pressable grid h-[2rem] w-[2rem] place-items-center rounded-control text-ink-segment hover:bg-hover hover:text-ink"
        >
          <Icon name="reset" />
        </button>
        <button
          type="button"
          aria-label="Close compare"
          title="Back to editing (Esc)"
          onClick={close}
          className="pressable grid h-[2rem] w-[2rem] place-items-center rounded-control text-ink-segment hover:bg-hover hover:text-ink"
        >
          <Icon name="close" />
        </button>
      </header>

      <div className="grid min-h-0 flex-1 divide-x divide-separator" style={{ gridTemplateColumns: `repeat(${shown.length}, minmax(0, 1fr))` }}>
        {shown.map((o) => (
          <div key={o.id} role="group" aria-label={o.name} className="relative flex min-h-0 min-w-0 flex-col">
            <div className="flex items-center justify-between gap-2 px-3 py-1.5">
              <span className={`truncate text-label ${o.id === active ? 'text-ink' : 'text-ink-secondary'}`}>
                {o.name}
                {o.id === active && <span className="text-ink-tertiary"> · active</span>}
              </span>
              <button
                type="button"
                title={`Close Compare and edit ${o.name}`}
                onClick={() => {
                  goToOption(o.id)
                  close()
                }}
                className="pressable shrink-0 rounded-control bg-fill px-2.5 py-0.5 text-label hover:bg-hover"
              >
                Edit
              </button>
            </div>
            <div className="relative min-h-0 flex-1">{mode === 'plan' ? <ComparePlan option={o.id} /> : <LazyScene className="h-full w-full" option={o.id} />}</div>
          </div>
        ))}
      </div>

      {/* no scrollbar: it would narrow the table and move its columns off the panes' */}
      <div className="no-scrollbar max-h-[45%] shrink-0 overflow-y-auto border-t border-separator">
        <CompareTable options={shown} />
      </div>
    </section>
  )
}
