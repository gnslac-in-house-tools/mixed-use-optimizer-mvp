// The rules, under the graph (Decisions "Rules" and "Rules under the graph"; MELI's list of rules, as an idea): what
// the client asks between programs, one sentence per row, as the diagram above draws them:
//   [Office] [must be adjacent to] [Warehouse] · Required · Why · how its masses stand · ×
// A distance shows between the kind and the second program when the kind asks for one (within 50 m of, at least 30 m
// from). How it stands is the active option's: "2 of 2 meet it", "no Warehouse yet". Rules and graph go together: a
// click on a row picks its rule (its line in the diagram thickens, Properties edits it) and a line picked in the
// diagram marks its row. *+ Rule* adds one between the first two programs. Every edit is one undo step through
// store.apply, and the diagram follows at once.
import { useEffect } from 'react'
import type { Id, Rule, RuleKind } from '../../model/schema.ts'
import { actions } from '../../state/actions/index.ts'
import { useApp } from '../../state/store.ts'
import { Button, CellField } from '../controls/fields.tsx'
import { Icon } from '../controls/Icon.tsx'
import { useGraph } from './graphState.ts'
import { Note } from '../layout/Note.tsx'
import { t as tr } from '../../i18n/idioma.ts' // mixed-use-mvp

/** One empty list for a project without rules: a new [] on every read would make the store re-render without end. */
const NO_RULES: Rule[] = []

const KINDS: { key: RuleKind; label: string }[] = [
  { key: 'adjacent', label: 'must be adjacent to' },
  { key: 'near', label: 'within (m) of' },
  { key: 'apart', label: 'at least (m) from' },
  { key: 'attached', label: 'moves with' },
]

const selectClass = 'h-[1.75rem] min-w-0 rounded-control bg-fill px-1.5 text-body text-ink outline-none focus:bg-hover'

export function Rules() {
  const rules = useApp((s) => s.project.rules ?? NO_RULES)
  const programs = useApp((s) => s.project.programs)
  const relations = useApp((s) => s.derived.relations)
  const masses = useApp((s) => s.derived.metrics.massesByProgram)
  const apply = useApp((s) => s.apply)
  const picked = useGraph((s) => s.rule)
  const name = (id: Id) => programs.find((g) => g.id === id)?.name ?? id
  const update = (id: Id, patch: Parameters<typeof actions.updateRule>[2]) => apply((p) => actions.updateRule(p, id, patch))

  // a rule picked in the diagram (or from a warning in the massing) comes into view
  useEffect(() => {
    if (picked) document.querySelector(`[data-rule="${picked}"]`)?.scrollIntoView?.({ block: 'nearest' })
  }, [picked])

  const standing = (r: Rule): { text: string; tone: string } => {
    if (!masses[r.a]) return { text: `no ${name(r.a)} yet`, tone: 'text-ink-tertiary' }
    if (!masses[r.b] || (r.a === r.b && masses[r.a] < 2)) return { text: `no ${name(r.b)} to apply it to`, tone: 'text-ink-tertiary' }
    const own = relations.filter((x) => x.rule === r.id)
    if (r.kind === 'attached') return { text: `${own.length} follow`, tone: 'text-ink-secondary' }
    const met = own.filter((x) => x.met).length
    return { text: `${met} of ${own.length} meet it`, tone: met === own.length ? 'text-status-within' : 'text-status-over' }
  }

  return (
    <section aria-label="Rules" className="panel flex h-full min-h-0 flex-col gap-2 overflow-y-auto p-panel-pad">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-headline">{tr("Rules")}</h3>
        <Note>How the programs relate. The graph above applies each one to every mass with its nearest partner and checks it; ▶ Solve moves the masses to meet them.</Note>
      </div>
      {rules.length === 0 ? (
        <p className="text-body text-ink-secondary">No rules yet: say how the programs relate, e.g. “Office must be adjacent to Warehouse”.</p>
      ) : (
        <ul aria-label="Rules of the brief" className="flex flex-col divide-y divide-separator">
          {rules.map((r) => {
            const s = standing(r)
            const value = r.kind === 'near' ? r.max : r.kind === 'apart' ? r.min : null
            const on = picked === r.id
            return (
              <li
                key={r.id}
                data-rule={r.id}
                aria-current={on || undefined}
                onClick={() => useGraph.getState().selectRule(r.id)}
                className={`-mx-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-control px-2 py-1.5 ${on ? 'bg-hover shadow-[inset_3px_0_0_var(--ink)]' : ''}`}
              >
                <select aria-label={`First program of rule ${r.id}`} className={selectClass} value={r.a} onChange={(e) => update(r.id, { a: e.target.value })}>
                  {programs.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
                <select aria-label={`Kind of rule ${r.id}`} className={selectClass} value={r.kind} onChange={(e) => update(r.id, { kind: e.target.value as RuleKind })}>
                  {KINDS.map((k) => (
                    <option key={k.key} value={k.key}>
                      {k.label}
                    </option>
                  ))}
                </select>
                {value !== null && (
                  <span className="w-[4.5rem]">
                    <CellField
                      label={`Distance of rule ${r.id}`}
                      value={value}
                      number={{ min: 0 }}
                      onCommit={(v) => update(r.id, r.kind === 'near' ? { max: Number(v) } : { min: Number(v) })}
                    />
                  </span>
                )}
                <select aria-label={`Second program of rule ${r.id}`} className={selectClass} value={r.b} onChange={(e) => update(r.id, { b: e.target.value })}>
                  {programs.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1 text-caption text-ink-secondary" title={tr("Broken, a required rule is an error; otherwise a warning")}>
                  <input type="checkbox" className="h-3.5 w-3.5 accent-ink" checked={r.required === true} onChange={(e) => update(r.id, { required: e.target.checked })} />
                  {tr("Required")}
                </label>
                <span className="min-w-[10rem] flex-1">
                  <CellField label={`Why of rule ${r.id}`} value={r.reason ?? ''} optional placeholder="Why (optional)" onCommit={(v) => update(r.id, { reason: v || undefined })} />
                </span>
                <span className={`text-caption tabular-nums ${s.tone}`}>{s.text}</span>
                <button
                  type="button"
                  aria-label={`Remove rule ${r.id}`}
                  title={tr("Remove the rule")}
                  onClick={(e) => {
                    e.stopPropagation()
                    apply((p) => actions.removeRule(p, r.id))
                  }}
                  className="pressable grid h-6 w-6 place-items-center rounded-pill text-ink-segment hover:bg-hover hover:text-ink"
                >
                  <Icon name="trash" className="h-3.5 w-3.5" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <div>
        <Button
          title={tr("A new rule between the first two programs: change its programs and kind in the row")}
          disabled={programs.length === 0}
          onClick={() => {
            let made: Id | null = null
            apply((p) => {
              const a = p.programs[1]?.id ?? p.programs[0].id
              const b = p.programs[0].id
              // the first kind those two do not have yet
              const kind = (['adjacent', 'near', 'apart', 'attached'] as RuleKind[]).find((k) => !p.rules?.some((x) => x.kind === k && x.a === a && x.b === b)) ?? 'near'
              const r = actions.addRule(p, { kind, a, b })
              made = r?.id ?? null
              return r?.project ?? p
            })
            if (made) useGraph.getState().selectRule(made)
          }}
        >
          + Rule
        </Button>
      </div>
    </section>
  )
}
