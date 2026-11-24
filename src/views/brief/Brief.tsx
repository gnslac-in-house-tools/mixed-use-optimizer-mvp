// The Brief (Decisions "Workspaces", "Brief" and "Brief and Rules as windows"; Plaza-Practiko's calculator, areas only
// for now): a window over the app (layout/Dialogs.tsx), the design dimmed behind it, never the viewport's place. On top, the site's figures; then one row per program with what the client asks (columns.tsx),
// a total, and + Program. How the active option stands against it is the Summary's *Against the brief* tab, which its
// link opens, the window closed (Decision "Summary tabs"). A step of the pipeline (Decisions "Steps", "Program rule set
// layout"): *Edit programs → Program* opens the Program window, each program's rule set deep; its foot goes on to Rules,
// where the rules between programs are written and ▶ Solve turns the brief into masses. Money (a pro forma) arrives later as more columns.
// A row's grip drags it up or down the brief, or ↑ ↓ on the grip move it (Decision "Program order"); Alt+drag (or
// Ctrl) leaves it and lands a copy of the program there (Decision "Alt+drag copies"). A row's ▸ opens its rule set under
// it (Decision "Program rule set layout": its grid, range, built, docks and area per mass; ProgramRules.tsx).
// Two tabs (Phase K.4): *Programs*, the table; *Circulation*, the standards and the parking's demand (BriefCirculation.tsx).
import { Fragment, useRef, useState } from 'react'
import type { Id } from '../../model/schema.ts'
import { briefRows } from '../../engine/brief.ts'
import { optionOf } from '../../engine/buildings.ts'
import { actions } from '../../state/actions/index.ts'
import { useApp } from '../../state/store.ts'
import { Button, CellField } from '../controls/fields.tsx'
import { copyDrop } from '../controls/dragCopy.ts'
import { Icon } from '../controls/Icon.tsx'
import { formatFigure } from '../format.ts'
import { useWide } from '../layout/media.ts'
import { useUi, type BriefTab } from '../layout/ui.ts'
import { Segmented } from '../controls/Segmented.tsx'
import { BriefCirculation } from './BriefCirculation.tsx'
import { copyProgram, deleteProgram } from '../panels/programCommands.ts'
import { BRIEF_COLUMNS } from './columns.tsx'
import { ProgramRules } from './ProgramRules.tsx'
import { ProgramStyle } from './ProgramStyle.tsx'
import { Note } from '../layout/Note.tsx'

/** Where a dragged row lands: a line on top of a row, or under it. */
const BEFORE = 'shadow-[inset_0_2px_0_0_var(--ink)]'
/** The Brief's tabs (Decision "Program rule set layout"). */
const TABS: { key: BriefTab; label: string; title: string }[] = [
  { key: 'programs', label: 'Programs', title: 'What the client asks, program by program; ▸ opens a program’s rule set' },
  { key: 'circulation', label: 'Circulation', title: 'The circulation’s standards, the ranges the optimizer searches, and what the programs ask of the parking' },
]
const AFTER = 'shadow-[inset_0_-2px_0_0_var(--ink)]'

/** Edit programs: on to the next window, the Program window (Decision "Program rule set layout"). */
function approve() {
  useUi.getState().openDialog('program')
}

/** The Summary on its *Against the brief* tab: the column shown, or its sheet open on a narrow screen. */
export function showAgainst(wide: boolean) {
  const ui = useUi.getState()
  ui.closeDialog()
  ui.setSummaryTab('brief')
  if (wide) ui.setPanel('right', true)
  else ui.setSheet('right')
}

export function Brief() {
  const project = useApp((s) => s.project)
  const derived = useApp((s) => s.derived)
  const apply = useApp((s) => s.apply)
  const wide = useWide()
  const tab = useUi((s) => s.briefTab)
  const rows = briefRows(project, derived)
  const option = optionOf(project, derived.option)
  const hasSite = derived.site.polygon !== null
  const max = project.site.rules.maxCoverage
  const columns = BRIEF_COLUMNS
  const totals = columns.some((c) => c.total)
  // the row being dragged by its grip, and the row it would land on
  const dragged = useRef<Id | null>(null)
  const [over, setOver] = useState<number | null>(null)
  const [copying, setCopying] = useState(false)
  // the rows opened to their rule set
  const [open, setOpen] = useState<ReadonlySet<Id>>(new Set())
  const toggle = (id: Id) =>
    setOpen((was) => {
      const next = new Set(was)
      if (!next.delete(id)) next.add(id)
      return next
    })
  const move = (id: Id, to: number) => apply((p) => actions.moveProgram(p, id, to))
  // a copy lands under the row when it was dragged down (or onto itself), above it when dragged up
  const copy = (id: Id, from: number, k: number) => copyProgram(id, from <= k ? k + 1 : k)
  const from = project.programs.findIndex((g) => g.id === dragged.current)
  const drop = () => {
    dragged.current = null
    setOver(null)
    setCopying(false)
  }
  // the columns share the table's width by their weights (the grip, the program's name and the bin have theirs)
  const GRIP = 1.25
  const NAME = 8.5
  const BIN = 2
  const sum = GRIP + NAME + BIN + columns.reduce((s, c) => s + c.width, 0)
  const share = (w: number) => `${(w / sum) * 100}%`

  return (
    <section aria-label="Brief" className="panel flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-panel-pad">
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 pr-10">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-headline">Brief</h2>
          <Note>What the client asks, program by program. Areas are floor areas (GFA; ground area for open programs).</Note>
        </div>
        <dl aria-label="Site" className="flex flex-wrap gap-x-5 gap-y-1 text-caption">
          <Fact label="Site" value={formatFigure(hasSite ? derived.metrics.siteArea : null, 'm2')} />
          <Fact label="Buildable" value={formatFigure(hasSite ? derived.metrics.buildableArea : null, 'm2')} />
          <Fact label="Max coverage" value={max === null ? 'none' : formatFigure(max, 'pct')} />
        </dl>
      </header>

      <Segmented kind="tabs" label="Brief parts" options={TABS} value={tab} onChange={(k) => useUi.getState().setBriefTab(k)} />

      {tab === 'circulation' ? (
        <BriefCirculation />
      ) : (
        <>
          <div className="min-w-0 overflow-x-auto">
            <table aria-label="Programs in the brief" className="w-full min-w-[44rem] table-fixed text-body">
              <colgroup>
                <col style={{ width: share(GRIP) }} />
                <col style={{ width: share(NAME) }} />
                {columns.map((c) => (
                  <col key={c.key} style={{ width: share(c.width) }} />
                ))}
                <col style={{ width: share(BIN) }} />
              </colgroup>
              <thead>
                <tr className="border-b border-separator text-left align-bottom text-caption text-ink-secondary">
                  <th aria-label="Order" />
                  <th className="pb-1.5 font-medium">Program</th>
                  {columns.map((c, i) => (
                    <th
                      key={c.key}
                      title={c.help}
                      className={`pb-1.5 pr-2 font-medium ${c.key === 'built' ? 'text-center' : 'text-right'} ${
                        c.group === 'reading' && columns[i - 1]?.group === 'asked' ? 'border-l border-separator pl-3' : ''
                      }`}
                    >
                      {c.title}
                      {c.unit && <span className="block font-normal text-ink-tertiary">{c.unit}</span>}
                    </th>
                  ))}
                  <th aria-label="Remove" />
                </tr>
              </thead>
              <tbody>
                {project.programs.map((g, k) => {
                  const n = project.masses.filter((m) => m.programId === g.id).length
                  // where a dragged row lands: a line above this one (dragged up) or below it (dragged down; a copy, onto itself)
                  const mark = over === k && from >= 0 && (from !== k || copying) ? (from <= k ? AFTER : BEFORE) : ''
                  const opened = open.has(g.id)
                  return (
                    <Fragment key={g.id}>
                    <tr
                      data-program-row={g.id}
                      className={opened ? '' : 'border-b border-separator last:border-b-0'}
                      onDragOver={(e) => {
                        if (dragged.current === null) return
                        e.preventDefault()
                        if (e.dataTransfer) e.dataTransfer.dropEffect = copyDrop(e) ? 'copy' : 'move'
                        setCopying(copyDrop(e))
                        setOver(k)
                      }}
                      onDrop={(e) => {
                        if (dragged.current === null) return
                        e.preventDefault()
                        if (copyDrop(e)) copy(dragged.current, from, k)
                        else move(dragged.current, k)
                        drop()
                      }}
                    >
                      <td className={`py-1.5 ${mark}`}>
                        <button
                          type="button"
                          draggable
                          aria-label={`Move ${g.name}`}
                          title="Drag up or down to reorder the brief (or ↑ ↓); Alt+drag: a copy of it"
                          onDragStart={(e) => {
                            dragged.current = g.id
                            e.dataTransfer?.setData('text/plain', g.id) // Firefox starts a drag only with data
                            if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copyMove'
                            const row = e.currentTarget.closest('tr')
                            if (row) e.dataTransfer?.setDragImage?.(row, 12, 12)
                          }}
                          onDragEnd={drop}
                          onKeyDown={(e) => {
                            if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
                            e.preventDefault()
                            move(g.id, k + (e.key === 'ArrowUp' ? -1 : 1))
                          }}
                          className="pressable grid h-6 w-5 cursor-grab place-items-center rounded-control text-ink-tertiary hover:bg-hover hover:text-ink active:cursor-grabbing"
                        >
                          <Icon name="grip" className="h-3.5 w-3.5" />
                        </button>
                      </td>
                      <td className={`py-1.5 pr-2 ${mark}`}>
                        <span className="flex min-w-0 items-center gap-1.5">
                          <button
                            type="button"
                            aria-expanded={opened}
                            aria-label={`${g.name}'s rule set`}
                            title={opened ? 'Close its rule set' : 'Its rule set: grid, range, docks'}
                            onClick={() => toggle(g.id)}
                            className="pressable grid h-6 w-4 shrink-0 place-items-center rounded-control text-ink-tertiary hover:bg-hover hover:text-ink"
                          >
                            {opened ? '▾' : '▸'}
                          </button>
                          <ProgramStyle program={g} />
                          <CellField label={`Name of ${g.name}`} value={g.name} onCommit={(v) => apply((p) => actions.updateProgram(p, g.id, { name: v }))} />
                        </span>
                      </td>
                      {columns.map((c, i) => (
                        <td
                          key={c.key}
                          className={`py-1.5 pr-2 ${c.key === 'built' ? 'text-center' : 'text-right'} ${
                            c.group === 'reading' && columns[i - 1]?.group === 'asked' ? 'border-l border-separator pl-3' : ''
                          } ${mark}`}
                        >
                          {c.cell(g, rows[k])}
                        </td>
                      ))}
                      <td className={`py-1.5 text-right ${mark}`}>
                        <button
                          type="button"
                          aria-label={`Delete ${g.name}`}
                          title={n === 0 ? `Delete ${g.name} and its rules` : `Delete ${g.name}, its rules and its ${n === 1 ? 'mass' : `${n} masses`} (asks first)`}
                          onClick={() => deleteProgram(g)}
                          className="pressable grid h-6 w-6 place-items-center rounded-pill text-ink-segment hover:bg-hover hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
                        >
                          <Icon name="trash" className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                    {opened && (
                      <tr data-program-rules={g.id} className="border-b border-separator last:border-b-0">
                        <td />
                        <td colSpan={columns.length + 2}>
                          <ProgramRules program={g} row={rows[k]} />
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  )
                })}
              </tbody>
              {totals && (
                <tfoot>
                  <tr className="border-t-2 border-separator text-label">
                    <td />
                    <th scope="row" className="pt-2 text-left font-semibold">
                      Total
                    </th>
                    {columns.map((c, i) => (
                      <td
                        key={c.key}
                        className={`pt-2 pr-2 text-right tabular-nums ${c.group === 'reading' && columns[i - 1]?.group === 'asked' ? 'border-l border-separator pl-3' : ''}`}
                      >
                        {c.total?.(rows)}
                      </td>
                    ))}
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button title="A new built program, without a target yet" onClick={() => apply((p) => actions.addProgram(p).project)}>
              + Program
            </Button>
            <p className="text-caption text-ink-secondary">
              How {option.name} stands against it:{' '}
              <button
                type="button"
                title="The Summary’s Against the brief tab: each program’s area, Δ and masses in the option"
                onClick={() => showAgainst(wide)}
                className="pressable rounded-control underline underline-offset-2 hover:text-ink"
              >
                Summary › Against the brief
              </button>
              .
            </p>
            <Note className="text-caption text-ink-tertiary">Costs and rents come later, with the pro forma.</Note>
          </div>
        </>
      )}

      <footer className="mt-auto flex flex-wrap items-center justify-end gap-x-4 gap-y-2 border-t border-separator pt-3">
        <Note>Next, Program: each program’s rule set, deep; then Rules, how the programs relate.</Note>
        <button
          type="button"
          title="The brief is ready: on to Program, each program’s rule set designed alone"
          onClick={approve}
          className="pressable flex h-7 shrink-0 items-center gap-1.5 rounded-control bg-ink px-3 text-label font-semibold text-on-ink shadow-control hover:opacity-90"
        >
          <Icon name="check" className="h-3.5 w-3.5" />
          Edit programs → Program
        </button>
      </footer>
    </section>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-ink-secondary">{label}</dt>
      <dd className="tabular-nums text-ink">{value}</dd>
    </div>
  )
}
