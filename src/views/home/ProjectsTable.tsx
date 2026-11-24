// Home's table of projects (Decision "Home"): the sample pinned on top, then what this browser keeps, newest first.
// A row picks the project (its summary opens on the right); Open opens it, the sample's Tour starts the tour. It takes
// the height Home leaves it and scrolls inside only when the rows outgrow it, so the page itself never does.
import { TYPOLOGIES } from '../../typologies/index.ts'
import { Icon } from '../controls/Icon.tsx'
import { openKept, openSample } from '../layout/files.ts'
import { useToast } from '../layout/toast.ts'
import { HOME_ICONS } from './icons.ts'
import type { Row } from './rows.ts'
import { optionShown } from './summary.ts'
import { t as tr } from '../../i18n/idioma.ts' // mixed-use-mvp

const typologyName = (id: string) => TYPOLOGIES.find((t) => t.id === id)?.name ?? id

/** When it was kept: the time today, Yesterday, else the date. */
export function when(ms: number | null, now = Date.now()): string {
  if (ms === null) return '—'
  const d = new Date(ms)
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((day(new Date(now)) - day(d)) / 86_400_000)
  if (days === 0) return `Today, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
  if (days === 1) return 'Yesterday'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(d.getFullYear() !== new Date(now).getFullYear() ? { year: 'numeric' } : {}) })
}

/** The chip of the option a project was left in: its issues, or that it has no site. */
function Status({ row }: { row: Row }) {
  const chip = 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill px-2 py-0.5 text-caption font-medium before:h-1.5 before:w-1.5 before:rounded-pill before:bg-current'
  if (!row.thumb) return <span className={`${chip} bg-grid-soft text-grid-line`}>{tr("No site yet")}</span>
  const o = row.summary && optionShown(row.summary, row.option)
  if (!o) return <span className="text-caption text-ink-secondary">—</span>
  if (o.errors) return <span className={`${chip} bg-hover text-status-over`}>{o.errors} {o.errors === 1 ? 'error' : 'errors'}</span>
  if (o.warnings) return <span className={`${chip} bg-earth-soft text-earth`}>{o.warnings} {o.warnings === 1 ? 'warning' : 'warnings'}</span>
  return <span className={`${chip} bg-status-within-soft text-status-within`}>{tr("No issues")}</span>
}

export function Badge() {
  return <span className="ml-2 rounded-[0.375rem] bg-earth-soft px-1.5 py-px align-[1px] text-caption font-semibold uppercase tracking-wide text-earth">{tr("Sample")}</span>
}

/** A plan in a small tile (thumb.ts draws it with tokens only). */
export function Thumb({ svg, className }: { svg?: string; className: string }) {
  return (
    <span
      aria-hidden
      className={`block shrink-0 rounded-control bg-panel-sunken shadow-[inset_0_0_0_1px_var(--separator)] [&>svg]:h-full [&>svg]:w-full ${className}`}
      dangerouslySetInnerHTML={{ __html: svg ?? '' }}
    />
  )
}

export function ProjectsTable({
  rows,
  picked,
  narrow,
  pick,
  query,
  setQuery,
  onNew,
  onOpen,
}: {
  rows: Row[]
  picked: string | null
  /** The summary is open: the table keeps its key columns. */
  narrow: boolean
  pick: (id: string) => void
  query: string
  setQuery: (q: string) => void
  /** New project: Create new, on a project. */
  onNew: () => void
  /** Load project: a project's file. */
  onOpen: () => void
}) {
  const q = query.trim().toLowerCase()
  const shown = q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows
  const wide = narrow ? 'hidden' : ''
  const cell = 'px-4 py-2'
  const open = (r: Row) => {
    if (r.sample) return openSample()
    if (!openKept(r.id)) useToast.getState().show('error', `Could not open “${r.name}”: this browser’s copy does not read.`)
  }
  return (
    <section aria-label="Your projects" className="panel flex min-h-[7.5rem] flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between gap-3 py-3 pl-4 pr-3">
        <h2 className="text-headline text-ink">{tr("Your projects")}</h2>
        <div className="flex items-center gap-1.5">
          <label className="flex h-[2.125rem] w-[13.75rem] items-center gap-2 rounded-[0.625rem] bg-fill px-3 text-ink-tertiary phone:w-[9rem]">
            <Icon path={HOME_ICONS.search} className="h-[0.9375rem] w-[0.9375rem] shrink-0" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tr('Search')}
              aria-label="Search projects"
              className="min-w-0 flex-1 select-text bg-transparent text-label text-ink outline-none placeholder:text-ink-tertiary"
            />
          </label>
          <button
            type="button"
            title={tr("A project's file (.gft): opened, and kept in this browser")}
            onClick={onOpen}
            className="pressable flex h-[2.125rem] items-center gap-2 whitespace-nowrap rounded-[0.625rem] px-3 text-label text-ink-segment hover:bg-hover hover:text-ink"
          >
            <Icon path={HOME_ICONS.open} className="h-4 w-4" />
            {tr("Load project")}
          </button>
          <button
            type="button"
            title={tr("A new project: its type, then its site")}
            onClick={onNew}
            className="pressable flex h-[2.125rem] items-center gap-2 whitespace-nowrap rounded-[0.625rem] bg-fill px-3 text-label text-ink hover:bg-hover"
          >
            <Icon name="plus" className="h-4 w-4" />
            {tr("New project")}
          </button>
        </div>
      </header>
      <div className="min-h-0 overflow-y-auto">
        <table className="w-full border-collapse text-body">
          <thead className="sticky top-0 z-[1] bg-panel">
            <tr className="text-left text-caption text-ink-tertiary">
              <th className={`${cell} border-y border-separator font-medium`}>{tr("Project")}</th>
              <th className={`${cell} border-y border-separator font-medium ${wide}`}>{tr("Typology")}</th>
              <th className={`${cell} border-y border-separator font-medium ${wide}`}>{tr("Options")}</th>
              <th className={`${cell} border-y border-separator font-medium`}>{tr("Issues")}</th>
              <th className={`${cell} border-y border-separator font-medium ${wide}`}>{tr("Updated")}</th>
              <th className={`${cell} border-y border-separator`}>
                <span className="sr-only">{tr("Actions")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const on = r.id === picked
              return (
                <tr
                  key={r.id}
                  data-project={r.id}
                  aria-selected={on}
                  onClick={() => pick(r.id)}
                  className={`cursor-pointer border-b border-separator transition-colors last:border-b-0 ${on ? 'bg-grid-soft' : 'hover:bg-hover'}`}
                >
                  <td className={`${cell} ${on ? 'shadow-[inset_3px_0_0_var(--grid-line)]' : ''}`}>
                    <div className="flex items-center gap-3">
                      <Thumb svg={r.thumb} className="h-[2.375rem] w-[2.375rem] p-0.5" />
                      <div className="min-w-0">
                        <button
                          type="button"
                          aria-label={`Show ${r.name}`}
                          aria-pressed={on}
                          onClick={(e) => {
                            e.stopPropagation()
                            pick(r.id)
                          }}
                          className="truncate text-left text-label font-semibold text-ink"
                        >
                          {r.name}
                        </button>
                        {r.sample && <Badge />}
                        <span className="block text-caption text-ink-secondary">{r.sample ? 'Start here · the tour runs on it' : typologyName(r.typology)}</span>
                      </div>
                    </div>
                  </td>
                  <td className={`${cell} whitespace-nowrap ${wide}`}>{typologyName(r.typology)}</td>
                  <td className={`${cell} tabular-nums ${wide}`}>{r.options}</td>
                  <td className={cell}>
                    <Status row={r} />
                  </td>
                  <td className={`${cell} whitespace-nowrap text-label text-ink-secondary ${wide}`}>{when(r.savedAt)}</td>
                  <td className={`${cell} text-right`}>
                    {r.sample ? (
                      <button
                        type="button"
                        aria-label="Take the tour"
                        onClick={(e) => {
                          e.stopPropagation()
                          openSample({ fresh: true, tour: true })
                        }}
                        className="pressable inline-flex items-center gap-1.5 rounded-control px-2.5 py-1.5 text-label text-earth hover:bg-earth-soft"
                      >
                        <Icon path={HOME_ICONS.tour} className="h-4 w-4" />
                        {tr("Tour")}
                      </button>
                    ) : (
                      <button
                        type="button"
                        aria-label={`Open ${r.name}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          open(r)
                        }}
                        className="pressable inline-flex items-center gap-1.5 rounded-control px-2.5 py-1.5 text-label text-ink-segment hover:bg-hover hover:text-ink"
                      >
                        <Icon path={HOME_ICONS.open} className="h-4 w-4" />
                        {tr("Open")}
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
            {!shown.length && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-body text-ink-secondary">
                  No project matches “{query.trim()}”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
