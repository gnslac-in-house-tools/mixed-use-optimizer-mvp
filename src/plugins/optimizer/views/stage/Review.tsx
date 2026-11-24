// A stage's review, in the picked stage (Decision "Stage review"): what it made against its input (engine/review.ts).
//   Objectives   ↓ / ↑ each, before → after, ▲▼ green better, red worse
//   Must hold    ≤ its value: ✓, or the figure in red
//   Changed      every other KPI and measure that changed, ▲▼ (no sense: grey); the rest folded (n unchanged)
//   Earlier      what earlier stages approved that it moved within their margins (a specimen of its input only)
//   Masses       a stage of the circulation's (7.5): what only the masses can fix, and Reopen on the stage that moved them
import { useEffect, useMemo, useState } from 'react'
import type { Project } from '../../../host.ts'
import { reviewOf, type Figure, type Side } from '../../engine/review.ts'
import type { Template } from '../../engine/template.ts'
import type { Run } from '../../run/store.ts'
import { projectOf } from '../specimens/decode.ts'
import { fmt, Heading } from './sections.tsx'
import { t as tr } from '../../../../i18n/idioma.ts' // mixed-use-mvp

const ARROW = { up: '▲', down: '▼' } as const
const tone = (better: boolean | null) => (better === true ? 'text-status-within' : better === false ? 'text-status-over' : 'text-ink-secondary')
/** A parameter's value: to the hundredth. */
const value = (v: number, unit: string) => `${Math.round(v * 100) / 100}${unit === '°' ? '°' : unit === 'm' ? ' m' : ''}`

/** The stage to go back to for what only the masses can fix: its name in the plan, and its Reopen. */
export interface Back {
  label: string
  reopen: () => void
}

export function Review({ before, after, template, title, back }: { before: Side; after: Side; template: Template; title: string; back?: Back | null }) {
  const r = useMemo(
    () => reviewOf(before, after, template),
    // the sides are made on each render: what they hold is what counts
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [before.project, before.option, after.project, after.option, template],
  )
  const [open, setOpen] = useState(false)
  const margins = template.variables.some((v) => v.margin !== undefined)

  return (
    <section aria-label="Review" className="flex flex-col gap-1.5 rounded-control bg-panel-sunken p-2">
      <Heading title={title} right="before → after" />
      {r.objectives.map((f) => (
        <Row key={f.id} f={f} lead={f.sense === 'min' ? '↓' : '↑'} />
      ))}
      {r.constraints.map((c) => (
        <div key={c.id} className="flex items-center gap-1.5" aria-label={`${c.label}: ${c.held ? 'holds' : `${fmt(c.after, c.unit)}, over ${fmt(c.max, c.unit)}`}`}>
          <span aria-hidden className="w-3 shrink-0 text-center text-label text-ink-secondary">
            ≤
          </span>
          <span className="min-w-0 flex-1 truncate text-label text-ink">{c.label}</span>
          <span className={`shrink-0 text-caption tabular-nums ${c.held ? 'text-status-within' : 'text-status-over'}`}>{c.held ? '✓' : fmt(c.after, c.unit)}</span>
        </div>
      ))}
      {r.changed.length > 0 && <Heading title="Changed" />}
      {r.changed.map((f) => (
        <Row key={f.id} f={f} />
      ))}
      {r.same.length > 0 && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="pressable self-start rounded-control px-1 text-caption text-ink-tertiary hover:bg-hover"
        >
          {open ? '▾' : '▸'} {r.same.length} unchanged
        </button>
      )}
      {open && r.same.map((f) => <Row key={f.id} f={f} />)}
      {margins && r.moved && (
        <section aria-label="What moved of earlier stages" className="flex flex-col gap-1.5">
          <Heading title="Earlier stages" right="within their margins" />
          {r.moved.length === 0 && <p className="text-caption text-ink-secondary">{tr("Nothing they approved moved.")}</p>}
          {r.moved.map((m) => (
            <div key={m.key} className="flex items-center gap-1.5">
              <span className="min-w-0 flex-1 truncate text-label text-ink" title={m.label}>
                {m.label}
              </span>
              <span className="shrink-0 text-caption tabular-nums text-ink-secondary">
                {m.choices ? `${m.choices[m.before]} → ${m.choices[m.after]}` : `${value(m.before, m.unit)} → ${value(m.after, m.unit)}`}
              </span>
              <span className="w-6 shrink-0 text-right text-caption tabular-nums text-ink-tertiary" title={`It may move ${m.margin} step${m.margin === 1 ? '' : 's'} of ${value(m.step, m.unit)} either way`}>
                ±{m.margin}
              </span>
            </div>
          ))}
        </section>
      )}
      {r.massesOnly.length > 0 && (
        <section aria-label="Only the masses can fix" className="flex flex-col gap-1.5">
          <Heading title="Only the masses can fix" right={`${r.massesOnly.length}`} />
          <p className="text-caption text-ink-secondary">This stage moves the roads and the parking, not the masses: {back ? `reopen ${back.label} to move them.` : 'move them in Massing.'}</p>
          <ul className="flex flex-col gap-1">
            {r.massesOnly.map((i, k) => (
              <li key={k} className="text-caption text-status-over">
                {i.message}
              </li>
            ))}
          </ul>
          {back && (
            <button
              type="button"
              title={`Take ${back.label}’s approval back: the approved stages after it go to review again`}
              onClick={back.reopen}
              className="pressable h-row self-start rounded-control bg-fill px-2 text-label text-ink hover:bg-hover"
            >
              ← Reopen {back.label}
            </button>
          )}
        </section>
      )}
    </section>
  )
}

function Row({ f, lead }: { f: Figure; lead?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      {lead !== undefined && (
        <span aria-hidden className="w-3 shrink-0 text-center text-label text-ink-secondary">
          {lead}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-label text-ink" title={f.label}>
        {f.label}
      </span>
      {f.change && <span className="shrink-0 text-caption tabular-nums text-ink-tertiary">{fmt(f.before, f.unit)} →</span>}
      <span
        className={`shrink-0 text-caption tabular-nums ${tone(f.better)}`}
        title={f.better === null ? undefined : f.better ? 'Better' : 'Worse'}
      >
        {fmt(f.after, f.unit)}
        {f.change && ` ${ARROW[f.change]}`}
      </span>
    </div>
  )
}

/** A specimen of a run, as a project (null until it is made, or for one the run does not have). */
export function useSpecimenProject(run: Run | null, id: number | null): Project | null {
  const [made, setMade] = useState<{ key: string; project: Project | null } | null>(null)
  const key = run && id !== null ? `${run.id}/${id}` : null
  const genome = id === null ? undefined : run?.specimens.find((s) => s.id === id)?.genome
  useEffect(() => {
    if (!run || id === null || !genome) return
    let live = true
    void projectOf(run, id, genome).then((project) => live && setMade({ key: `${run.id}/${id}`, project }))
    return () => {
      live = false
    }
  }, [run, id, genome])
  return made && made.key === key ? made.project : null
}
