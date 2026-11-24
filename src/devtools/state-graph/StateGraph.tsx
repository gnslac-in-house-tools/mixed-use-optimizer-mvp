// The state graph page (dev only): the app's modules as a map, and what each store call does on it, live.
//   code  → map:    sources.ts (import.meta.glob) → buildMap → layout. Saving a file hot-updates this module,
//                    so MAP is rebuilt: new files, verbs, imports and reads appear by themselves.
//   app   → events: useTrace (BroadcastChannel) → log rows → the event on display → activity on the map.
//   app   → data:   the state snapshot after each batch → State tab.
import { useMemo, useState } from 'react'
import { Button } from '../../views/controls/fields.tsx'
import { EventDetail } from './EventDetail.tsx'
import { EventLog } from './EventLog.tsx'
import { activity, heat, ROLES } from './flow.ts'
import { GraphView } from './GraphView.tsx'
import { rows as toRows, type TraceView } from './log.ts'
import { buildMap } from './map.ts'
import { ModuleCard } from './ModuleCard.tsx'
import { ROLE_COLOR, ROLE_LABEL } from './roles.ts'
import { sources } from './sources.ts'
import { StatePanel } from './StatePanel.tsx'
import { useTrace } from './useTrace.ts'
import { SHOW_ALL, type ViewOptions } from './view.ts'

// rebuilt each time this module is hot-updated, which happens whenever a source file changes
const MAP = buildMap(sources)

// the map's filters outlive a reload (Vite reloads the page when a file is deleted)
const VIEW_KEY = 'gfit.state-graph.view'
function savedOptions(): ViewOptions {
  try {
    return { ...SHOW_ALL, ...(JSON.parse(localStorage.getItem(VIEW_KEY) ?? '{}') as Partial<ViewOptions>) }
  } catch {
    return SHOW_ALL
  }
}

export function StateGraph() {
  const { view, clear } = useTrace()
  const [selected, setSelected] = useState<string | null>(null) // a log row; null = follow live
  const [focus, setFocus] = useState<string | null>(null) // a module clicked on the map
  const [showTypes, setShowTypes] = useState(false)
  const [tab, setTab] = useState<'events' | 'state'>('events')
  const [options, setOptions] = useState(savedOptions)
  const changeOptions = (o: ViewOptions) => {
    setOptions(o)
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify(o))
    } catch {
      // private window: the filters just do not outlive the tab
    }
  }

  const allRows = useMemo(() => toRows(view.entries), [view.entries])
  const events = useMemo(() => view.entries.flatMap((e) => (e.kind === 'event' ? [e.event] : [])), [view.entries])
  const heatMap = useMemo(() => heat(events, MAP), [events])

  const eventRows = allRows.filter((r) => r.kind === 'event')
  const latest = eventRows[eventRows.length - 1] ?? null
  const shownRow = (selected && eventRows.find((r) => r.key === selected)) || latest
  const shown = shownRow ? shownRow.events[shownRow.events.length - 1] : null
  const act = shown ? activity(shown, MAP) : null
  const live = shownRow !== null && shownRow === latest
  const lastEvent = events[events.length - 1] ?? null

  const logRows = focus ? allRows.filter((r) => r.kind === 'app' || r.events.some((e) => activity(e, MAP).roles.has(focus))) : allRows

  return (
    <div className="flex h-full flex-col gap-gutter p-gutter">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <h1 className="text-headline">GFit · State graph</h1>
          <span className="text-caption text-ink-secondary">
            {MAP.nodes.length} modules · {MAP.edges.filter((e) => !e.typeOnly).length} imports · {events.length} events
          </span>
        </div>
        <div className="flex items-center gap-2">
          <AppStatus app={view.app} />
          <label className="flex items-center gap-1 text-label text-ink-secondary">
            <input type="checkbox" checked={showTypes} onChange={(e) => setShowTypes(e.target.checked)} />
            Type imports
          </label>
          <Button onClick={() => setSelected(null)} disabled={live} title="Show each new event as it arrives">
            Follow live
          </Button>
          <Button
            onClick={() => {
              clear()
              setSelected(null)
            }}
          >
            Clear
          </Button>
          <a href="/" target="gfit-app" className="flex h-row items-center rounded-control bg-fill px-3 text-label hover:bg-hover">
            Open app
          </a>
        </div>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-[1fr_minmax(24rem,32rem)] gap-gutter">
        <section className="panel flex min-h-0 flex-col overflow-hidden" aria-label="Module map">
          <Legend />
          <div className="relative min-h-0 flex-1">
            <GraphView
              map={MAP}
              event={shown}
              act={act}
              live={live}
              heat={heatMap}
              focus={focus}
              showTypes={showTypes}
              options={options}
              onOptions={changeOptions}
              onFocus={setFocus}
            />
          </div>
        </section>

        <aside className="panel flex min-h-0 flex-col overflow-hidden" aria-label="Trace">
          {focus && <ModuleCard map={MAP} id={focus} heat={heatMap.get(focus) ?? 0} onClose={() => setFocus(null)} />}
          <nav className="flex gap-1 border-b border-separator px-panel-pad pt-2">
            {(['events', 'state'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`rounded-control px-3 py-1 text-label ${tab === t ? 'bg-fill text-ink' : 'text-ink-secondary hover:bg-hover'}`}
              >
                {t === 'events' ? `Events${focus ? ' (this module)' : ''}` : 'State'}
              </button>
            ))}
          </nav>
          {tab === 'events' ? (
            <>
              {shownRow && (
                <div className="max-h-[55%] shrink-0 overflow-auto border-b border-separator">
                  <EventDetail events={shownRow.events} />
                </div>
              )}
              <div className="min-h-0 flex-1 overflow-auto">
                <EventLog rows={logRows} shown={shownRow?.key ?? null} selected={selected} onSelect={setSelected} />
              </div>
            </>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto">
              <StatePanel state={view.state} last={lastEvent} />
            </div>
          )}
        </aside>
      </main>
    </div>
  )
}

function AppStatus({ app }: { app: TraceView['app'] }) {
  const [text, color] =
    app.status === 'connected' ? ['App connected', 'var(--flow-data)'] : app.status === 'closed' ? ['App closed', 'var(--flow-reject)'] : ['Waiting for the app', 'var(--ink-tertiary)']
  return (
    <span className="flex items-center gap-1 text-label text-ink-secondary" role="status">
      <span className="inline-block h-2 w-2 rounded-pill" style={{ background: color }} />
      {text}
    </span>
  )
}

function Legend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-separator px-panel-pad py-2 text-caption text-ink-secondary" aria-label="Legend">
      {ROLES.map((r) => (
        <li key={r} className="flex items-center gap-2">
          <span className="inline-block h-2 w-3 rounded-pill" style={{ background: ROLE_COLOR[r], opacity: r === 'reach' ? 0.5 : 1 }} />
          {ROLE_LABEL[r]}
        </li>
      ))}
      <li className="flex items-center gap-2">
        <span className="inline-block h-2 w-3 rounded-pill bg-flow-reject" />
        rejected edit
      </li>
    </ul>
  )
}
