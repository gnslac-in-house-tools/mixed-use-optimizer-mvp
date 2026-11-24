// The list of specimens (Decision "Specimens tab"): the front, the feasible ones or all, inside the ranges dragged on
// the parallel coordinates, sorted by balance (★ the most balanced of the front first), by an objective's best or the
// newest. A row: its number, its objectives (the unit in the column's head) and its genome, a bar per gene (how far
// along its range). The design last, as ◇. A click picks a specimen and says what it is: each objective against the
// design's (▲▼, green better, red worse), whether it holds every must-hold, its genes; *Keep as option*, and *Replace*
// in its ⋯ (Decision "Keep a specimen").
import { memo, useEffect, useRef } from 'react'
import { MoreMenu } from '../../../../views/controls/MoreMenu.tsx'
import { formatFigure, m as metres, whole } from '../../../../views/format.ts'
import type { Gene } from '../../engine/genes.ts'
import type { MeasureUnit } from '../../../../modules/types.ts'
import type { Described } from '../../run/protocol.ts'
import { selectClass } from '../kit.ts'
import { useProject } from '../../../host.ts'
import { useRun } from '../../run/store.ts'
import { keep, keptAs, optionName, replace } from './keep.ts'
import { against, compact, listed, sortOf, UNIT_WORD, type Filters, type Row, type Show, type Sort } from './rows.ts'
import { LIST_ROWS, useSpecimenView } from './viewState.ts'
import { t as tr } from '../../../../i18n/idioma.ts' // mixed-use-mvp

const SHOW: { value: Show; label: string }[] = [
  { value: 'front', label: 'Front' },
  { value: 'feasible', label: 'Feasible' },
  { value: 'all', label: 'All' },
]

const full = (v: number, unit: MeasureUnit) => (unit === 'm' ? metres(Math.round(v * 10) / 10) : formatFigure(v, unit))

export const SpecimenList = memo(function SpecimenList(props: {
  rows: Row[]
  problem: Described
  genes: Gene[]
  knee: number | null
  show: Show
  sort: Sort
  filters: Filters
  picked: number | null
  hover: number | null
  /** How many rows are drawn. */
  limit: number
  wide: boolean
}) {
  const { rows, problem, genes, knee, show, filters, picked, hover, limit } = props
  const sort = sortOf(props.sort, problem)
  const list = listed(rows, { show, sort, filters })
  const drawn = list.slice(0, limit)
  const pickedRow = picked === null ? null : (rows.find((r) => r.s.id === picked) ?? null)
  const inList = pickedRow !== null && drawn.includes(pickedRow)
  const filtered = Object.keys(filters).length > 0
  const n = problem.objectives.length
  const columns = { gridTemplateColumns: `3.25rem repeat(${n}, minmax(2.25rem, 1fr)) minmax(2rem, 1.25fr)` }
  const set = useSpecimenView.getState().set
  const listRef = useRef<HTMLUListElement>(null)

  // a specimen picked in the scatter or the lines: its row comes into view
  useEffect(() => {
    if (picked === null) return
    listRef.current?.querySelector(`[data-specimen="${picked}"]`)?.scrollIntoView?.({ block: 'nearest' })
  }, [picked])

  return (
    <div className={`flex min-h-0 flex-col gap-2 ${props.wide ? 'h-full' : ''}`}>
      <div className="flex items-center gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-1 text-caption text-ink-secondary">
          {tr("Show")}
          <select aria-label="Show" className={`${selectClass} min-w-0 flex-1`} value={show} onChange={(e) => set({ show: e.target.value as Show, rows: LIST_ROWS })}>
            {SHOW.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-1 items-center gap-1 text-caption text-ink-secondary">
          {tr("Sort")}
          <select
            aria-label="Sort"
            className={`${selectClass} min-w-0 flex-1`}
            value={String(sort)}
            onChange={(e) => {
              const v = e.target.value
              set({ sort: v === 'balanced' || v === 'newest' ? v : Number(v) })
            }}
          >
            <option value="balanced">{tr("Balanced")}</option>
            {problem.objectives.map((o, i) => (
              <option key={o.id} value={i}>
                Best {o.label}
              </option>
            ))}
            <option value="newest">{tr("Newest")}</option>
          </select>
        </label>
      </div>
      <p className="flex items-baseline gap-1 text-caption text-ink-secondary">
        <span>{list.length === 1 ? '1 specimen' : `${whole(list.length)} specimens`}</span>
        {filtered && (
          <>
            ·
            <button type="button" className="pressable rounded-control px-1 text-ink underline-offset-2 hover:underline" onClick={() => set({ filters: {}, rows: LIST_ROWS })}>
              {tr("Clear filters")}
            </button>
          </>
        )}
      </p>
      {pickedRow && !inList && <Picked row={pickedRow} problem={problem} genes={genes} knee={knee} note="not in this list" />}
      <div className={`flex min-h-0 flex-col ${props.wide ? 'flex-1' : ''}`}>
        <div aria-hidden className="grid items-end gap-x-1 border-b border-separator pb-1 text-caption text-ink-secondary" style={columns}>
          <span>#</span>
          {problem.objectives.map((o) => (
            <span key={o.id} title={`${o.label}${UNIT_WORD[o.unit] ? `, ${UNIT_WORD[o.unit]}` : ''}: ${o.sense === 'min' ? 'the least' : 'the most'} is better`} className="truncate text-right">
              {o.label}
            </span>
          ))}
          <span className="text-right">
            genes
          </span>
        </div>
        <ul ref={listRef} aria-label="Specimens" className={`flex flex-col ${props.wide ? 'min-h-0 flex-1 overflow-y-auto' : ''}`}>
          {drawn.map((r) => {
            const on = r.s.id === picked
            return (
              <li key={r.s.id} data-specimen={r.s.id}>
                <button
                  type="button"
                  aria-label={`Specimen #${r.s.id}`}
                  aria-current={on || undefined}
                  onClick={() => set({ picked: on ? null : r.s.id })}
                  onPointerEnter={() => set({ hover: r.s.id })}
                  onPointerLeave={() => set({ hover: null })}
                  className={`grid w-full items-center gap-x-1 rounded-control py-1 text-left text-label tabular-nums ${on ? 'bg-hover shadow-[inset_3px_0_0_var(--ink)]' : r.s.id === hover ? 'bg-hover' : 'hover:bg-hover'}`}
                  style={columns}
                >
                  <span className="flex items-center gap-1 pl-1.5">
                    #{r.s.id}
                    {r.s.id === knee && (
                      <span aria-label="the most balanced" title={tr("The most balanced of the front: nearest the best of every objective at once")}>
                        ★
                      </span>
                    )}
                    {!r.feasible && (
                      <span aria-label="breaks a must-hold" title={tr("It breaks a must-hold")} className="text-status-over">
                        ✕
                      </span>
                    )}
                  </span>
                  {r.read.map((v, i) => (
                    <span key={i} className="text-right">
                      {compact(v, problem.objectives[i].unit)}
                    </span>
                  ))}
                  <span className="pr-1">
                    <Genome genome={r.s.genome} genes={genes} />
                  </span>
                </button>
                {on && <Picked row={r} problem={problem} genes={genes} knee={knee} />}
              </li>
            )
          })}
          {list.length > drawn.length && (
            <li>
              <button type="button" className="pressable mt-1 rounded-control px-1.5 py-1 text-caption text-ink hover:bg-hover" onClick={() => set({ rows: limit + LIST_ROWS })}>
                Show {whole(Math.min(LIST_ROWS, list.length - drawn.length))} more
              </button>
            </li>
          )}
          <li aria-label="Your design" className="grid items-center gap-x-1 border-t border-separator py-1 text-label tabular-nums text-ink-secondary" style={columns}>
            <span className="pl-1.5">
              ◇ yours
            </span>
            {problem.design.objectives.map((v, i) => (
              <span key={i} className="text-right">
                {compact(v, problem.objectives[i].unit)}
              </span>
            ))}
            <span />
          </li>
        </ul>
      </div>
    </div>
  )
})

/** A bar per gene: how far along its range (a choice: which of them). */
function Genome({ genome, genes }: { genome: number[]; genes: Gene[] }) {
  const along = (g: Gene, v: number) => (g.kind === 'choice' ? (g.options > 1 ? v / (g.options - 1) : 0) : g.max > g.min ? (v - g.min) / (g.max - g.min) : 0)
  return (
    <svg aria-hidden viewBox={`0 0 ${Math.max(1, genes.length) * 4} 10`} preserveAspectRatio="none" className="block h-3 w-full">
      {genes.map((g, i) => {
        const t = Math.min(1, Math.max(0, along(g, genome[i])))
        return <rect key={i} x={i * 4 + 0.5} y={10 - (1 + 9 * t)} width={3} height={1 + 9 * t} className="fill-ink-secondary" />
      })}
    </svg>
  )
}

/** What a picked specimen is: its objectives against the design's, whether it holds, its genes; what it may become. */
function Picked({ row, problem, genes, knee, note }: { row: Row; problem: Described; genes: Gene[]; knee: number | null; note?: string }) {
  const { s } = row
  const where = row.s.id === knee ? '★ the most balanced of the front' : row.front ? 'on the front' : null
  return (
    <div data-picked-detail={s.id} className="mb-1 flex flex-col gap-1.5 rounded-control bg-panel-sunken px-2 py-2 text-caption">
      <p className="text-ink-secondary">
        {note && <span className="text-ink">#{s.id}, {note} · </span>}
        Born in generation {whole(s.generation)}
        {where && ` · ${where}`}
      </p>
      <dl className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-2 gap-y-0.5 tabular-nums">
        {problem.objectives.map((o, i) => {
          const { delta, better: way } = against(row.read[i], problem.design.objectives[i], o.sense)
          // a difference that rounds to nothing as shown is none
          const better = full(Math.abs(delta), o.unit) === full(0, o.unit) ? null : way
          return (
            <div key={o.id} className="contents">
              <dt className="truncate text-ink-secondary">{o.label}</dt>
              <dd className="select-text text-right text-ink">{full(row.read[i], o.unit)}</dd>
              <dd className={`text-right ${better === null ? 'text-ink-secondary' : better ? 'text-status-within' : 'text-status-over'}`}>
                {better === null ? '= yours' : `${delta > 0 ? '▲' : '▼'} ${full(Math.abs(delta), o.unit)}`}
              </dd>
            </div>
          )
        })}
      </dl>
      <p className={row.feasible ? 'text-ink-secondary' : 'text-status-over'}>{row.feasible ? 'Holds every must-hold' : 'Breaks a must-hold'}</p>
      <Keep id={s.id} />
      <details>
        <summary className="cursor-default text-ink-secondary">Genes ({genes.length})</summary>
        <dl className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-0.5 tabular-nums">
          {problem.variables.map((v, i) => (
            <div key={v.key} className="contents">
              <dt className="truncate text-ink-secondary">{v.label}</dt>
              <dd className="select-text text-right text-ink">{Math.round(s.genome[i] * 10) / 10}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  )
}

/** Keep as option (once kept, where it went) and, in the ⋯, Replace the option the run optimized. */
function Keep({ id }: { id: number }) {
  const project = useProject()
  const run = useRun((r) => r.run)
  if (!run) return null
  const as = keptAs(project, run, id)
  const name = optionName(project, run)
  return (
    <div className="flex items-center justify-between gap-1">
      <button
        type="button"
        disabled={as !== null}
        title={as ? undefined : 'A new option with this specimen, to edit: your design stays as it is'}
        onClick={() => void keep(id)}
        className="pressable h-row rounded-control bg-fill px-2.5 text-label text-ink hover:bg-hover disabled:opacity-40 disabled:hover:bg-fill"
      >
        {as ? `Kept as ${project.options.find((o) => o.id === as)!.name}` : 'Keep as option'}
      </button>
      <MoreMenu compact align="right" items={[{ key: 'replace', label: name ? `Replace ${name}…` : 'Replace the option…', disabled: !name, onSelect: () => void replace(id, project) }]} />
    </div>
  )
}
