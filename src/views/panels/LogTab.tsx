// The Decision log tab (Decision "Decision log"; the layout agreed with the user): who decided each change.
//   You        the author's name, once per browser (none: "Designer")
//   Summary    how many changes, and how many each one decided: Designer · Solve · Optimizer · Agent; a chip filters
//   The list   newest first, by day: the time, who (the author's name for the designer's own), what, the option's
//              Issues before → after when they moved
//   Export CSV at the panel's foot (also in Export)
// Read-only: the store writes the log (state/store.ts), never this tab.
import { useState } from 'react'
import { LOG_BY, type LogBy, type LogEntry } from '../../model/schema.ts'
import { useAuthor } from '../../state/author.ts'
import { useApp } from '../../state/store.ts'
import { ChipTrack, ToggleChip } from '../controls/ToggleChips.tsx'
import { whole } from '../format.ts'
import { exportLogCsv } from '../layout/exporting.ts'
import { t as tr } from '../../i18n/idioma.ts' // mixed-use-mvp

export const BY_LABEL: Record<LogBy, string> = { designer: 'Designer', solve: 'Solve', optimizer: 'Optimizer', agent: 'Agent' }

/** Entries shown at first, and with each *Show more*: a long log stays quick. */
const PAGE = 100

const time = (at: number) => new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

function dayOf(at: number, now = new Date()): string {
  const d = new Date(at)
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((start(now) - start(d)) / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' })
}

export function LogTab() {
  const log = useApp((s) => s.project.log)
  const [only, setOnly] = useState<LogBy | null>(null)
  const [shown, setShown] = useState(PAGE)
  const entries = log ?? []
  const counts = Object.fromEntries(LOG_BY.map((by) => [by, entries.filter((e) => e.by === by).length])) as Record<LogBy, number>
  const listed = entries.filter((e) => only === null || e.by === only).reverse()
  const days: { day: string; entries: LogEntry[] }[] = []
  for (const e of listed.slice(0, shown)) {
    const day = dayOf(e.at)
    if (days.at(-1)?.day === day) days.at(-1)!.entries.push(e)
    else days.push({ day, entries: [e] })
  }
  return (
    <div className="flex min-h-full flex-col gap-4">
      <Author />
      <section aria-label="Who decided" className="flex flex-col gap-2 rounded-control bg-panel-sunken p-3">
        <p className="text-body text-ink">
          <span className="font-semibold tabular-nums">{whole(entries.length)}</span> {entries.length === 1 ? 'change' : 'changes'}
        </p>
        <div className="flex flex-wrap">
          <ChipTrack>
            {LOG_BY.map((by) => (
              <ToggleChip
                key={by}
                pressed={only === by}
                title={only === by ? 'Show every change' : `Only the changes ${BY_LABEL[by]} decided`}
                onClick={() => setOnly(only === by ? null : by)}
              >
                {BY_LABEL[by]} <span className="tabular-nums">{counts[by]}</span>
              </ToggleChip>
            ))}
          </ChipTrack>
        </div>
      </section>

      {entries.length === 0 ? (
        <p className="text-caption text-ink-secondary">
          No changes yet. Each change is written here, with who decided it: you, ▶ Solve, the optimizer or an agent. Undo
          and redo too. The log travels with the .gft.
        </p>
      ) : (
        <ol aria-label="Changes" className="flex flex-col gap-3">
          {days.map((d) => (
            <li key={d.day} className="flex flex-col gap-1">
              <h3 className="text-label text-ink-secondary">{d.day}</h3>
              <ol className="flex flex-col">
                {d.entries.map((e, i) => (
                  <Entry key={`${e.at}-${i}`} e={e} />
                ))}
              </ol>
            </li>
          ))}
          {listed.length > shown && (
            <li>
              <button type="button" className="text-label text-ink-secondary hover:text-ink" onClick={() => setShown(shown + PAGE)}>
                Show {Math.min(PAGE, listed.length - shown)} more
              </button>
            </li>
          )}
        </ol>
      )}

      <div className="sticky -bottom-panel-pad z-10 -mx-panel-pad mt-auto border-t border-separator bg-panel px-panel-pad pb-panel-pad pt-3">
        <button
          type="button"
          disabled={entries.length === 0}
          title={tr("Every entry as a spreadsheet, oldest first")}
          onClick={exportLogCsv}
          className="pressable h-row rounded-control bg-fill px-3 text-label text-ink hover:bg-hover disabled:text-ink-tertiary disabled:hover:bg-fill"
        >
          {tr("Export CSV")}
        </button>
      </div>
    </div>
  )
}

function Entry({ e }: { e: LogEntry }) {
  const who = e.by === 'designer' ? e.author : BY_LABEL[e.by]
  const [before, after] = e.issues
  return (
    <li
      title={`${new Date(e.at).toLocaleString('en-GB')} · ${e.author} · ${BY_LABEL[e.by]}${e.verb ? ` · ${e.verb}` : ''}`}
      className="grid grid-cols-[2.75rem_4.75rem_minmax(0,1fr)] gap-x-1.5 py-1 text-label"
    >
      <span className="tabular-nums text-ink-secondary">{time(e.at)}</span>
      <span className="truncate text-ink-secondary">{who}</span>
      <span className="select-text text-ink">{e.what}</span>
      {before !== after && (
        <span className={`col-start-3 tabular-nums ${after < before ? 'text-status-within' : 'text-status-over'}`}>
          Issues {before} → {after} {after < before ? '▼' : '▲'}
        </span>
      )}
    </li>
  )
}

/** The author's name, once per browser: committed on Enter or on leaving the field. */
function Author() {
  const name = useAuthor((s) => s.name)
  const setName = useAuthor((s) => s.setName)
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft !== null && draft.trim() !== name) setName(draft)
    setDraft(null)
  }
  return (
    <label className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-2" title={tr("Your name on the changes you make, in this browser")}>
      <span className="text-label text-ink-secondary">{tr("You")}</span>
      <input
        aria-label="Your name"
        value={draft ?? name}
        placeholder="Designer"
        onChange={(ev) => setDraft(ev.target.value)}
        onBlur={commit}
        onKeyDown={(ev) => ev.key === 'Enter' && commit()}
        className="h-row min-w-0 select-text rounded-control border border-separator bg-panel-sunken px-1.5 text-label text-ink outline-none placeholder:text-ink-tertiary focus:border-ink"
      />
    </label>
  )
}
