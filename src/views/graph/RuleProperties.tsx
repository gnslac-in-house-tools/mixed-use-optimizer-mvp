// Properties in the Graph workspace (Decision "Graph mode"):
//   a picked rule (Programs)     its sentence, how its masses stand (3 of 3 meet it), and its fields: the two
//                                programs, the kind, its distance, required, weight, why; Delete
//   a picked relation (Masses)   which masses, which rule made it, what was measured, met or broken by how much;
//                                *Edit the rule* goes to the rule
// Each edit is one undo step through store.apply; the Brief's list edits the same rules.
import type { Id } from '../../model/schema.ts'
import { ruleSentence } from '../../engine/graph/relations.ts'
import { actions } from '../../state/actions/index.ts'
import { useApp } from '../../state/store.ts'
import { Button, NumberField, SelectField, TextField } from '../controls/fields.tsx'
import { massHiddenOnPlan } from '../buildingView.ts'
import { useLayerView } from '../layers/layerView.ts'
import { pickUnlocked } from '../layers/locks.ts'
import { useUi } from '../layout/ui.ts'
import { RULE_KINDS, useGraph } from './graphState.ts'
import { t as tr } from '../../i18n/idioma.ts' // mixed-use-mvp

const m = (v: number) => `${Math.round(v * 10) / 10} m`

export function RuleProperties({ id, muted }: { id: Id; muted: string }) {
  const r = useApp((s) => s.project.rules?.find((x) => x.id === id))
  const programs = useApp((s) => s.project.programs)
  const relations = useApp((s) => s.derived.relations)
  const apply = useApp((s) => s.apply)
  if (!r) return null
  const name = (pid: Id) => programs.find((g) => g.id === pid)?.name ?? pid
  const own = relations.filter((x) => x.rule === id)
  const broken = own.filter((x) => !x.met).length
  const update = (patch: Parameters<typeof actions.updateRule>[2]) => apply((p) => actions.updateRule(p, id, patch))
  const options = programs.map((g) => ({ value: g.id, label: g.name }))

  return (
    <section aria-label="Rule" className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-headline">{ruleSentence(r, name)}</span>
        <span className={`text-caption ${own.length === 0 ? muted : broken ? 'text-status-over' : 'text-status-within'}`}>
          {own.length === 0
            ? `No masses to apply it to yet in this option`
            : r.kind === 'attached'
              ? `${own.length} ${own.length === 1 ? 'mass follows' : 'masses follow'} their nearest ${name(r.b)}`
              : `${own.length - broken} of ${own.length} ${own.length === 1 ? 'mass meets' : 'masses meet'} it`}
        </span>
      </div>
      <SelectField label="Each" value={r.a} options={options} onCommit={(v) => update({ a: v })} />
      <SelectField label="Kind" value={r.kind} options={RULE_KINDS.map((k) => ({ value: k.key, label: k.label }))} onCommit={(v) => update({ kind: v as typeof r.kind })} />
      {r.kind === 'adjacent' && <NumberField label="Shared wall, at least" unit="m" min={0} value={r.minShared} onCommit={(v) => update({ minShared: v })} />}
      {r.kind === 'near' && <NumberField label="Within" unit="m" min={0} value={r.max} onCommit={(v) => update({ max: v })} />}
      {r.kind === 'apart' && <NumberField label="At least" unit="m" min={0} value={r.min} onCommit={(v) => update({ min: v })} />}
      <SelectField label={r.kind === 'apart' ? 'From every' : 'Its nearest'} value={r.b} options={options} onCommit={(v) => update({ b: v })} />
      <label className="flex items-start justify-between gap-3" title="Broken, a required rule is an error; otherwise a warning">
        <span className="flex flex-col">
          <span className="text-label text-ink-secondary">{tr("Required")}</span>
          <span className={`text-caption ${muted}`}>{tr("Broken, it is an error, not a warning")}</span>
        </span>
        <input type="checkbox" className="mt-1 h-4 w-4 accent-ink" checked={r.required === true} onChange={(e) => update({ required: e.target.checked })} />
      </label>
      <NumberField label="Weight" min={0.1} value={r.weight} onCommit={(v) => update({ weight: v })} />
      <TextField key={`${id}-why`} label="Why" value={r.reason ?? ''} onCommit={(v) => update({ reason: v.trim() || undefined })} />
      <p className={`select-text text-caption ${muted}`}>{tr("The weight is its pull when Solve moves the masses; why shows with its warnings.")}</p>
      <div className="flex gap-2">
        <Button
          title="Delete the rule (Delete); the masses stay"
          onClick={() => {
            apply((p) => actions.removeRule(p, id))
            useGraph.getState().selectRule(null)
          }}
        >
          {tr("Delete")}
        </Button>
      </div>
    </section>
  )
}

export function RelationProperties({ id, muted }: { id: string; muted: string }) {
  const x = useApp((s) => s.derived.relations.find((r) => r.id === id))
  const rules = useApp((s) => s.project.rules)
  const programs = useApp((s) => s.project.programs)
  const masses = useApp((s) => s.project.masses)
  if (!x) return null
  const rule = rules?.find((r) => r.id === x.rule)
  const name = (mid: Id) => masses.find((mm) => mm.id === mid)?.name ?? mid
  const program = (pid: Id) => programs.find((g) => g.id === pid)?.name ?? pid
  const measured = x.kind === 'adjacent' ? `they share ${m(x.value)} of wall` : x.kind === 'attached' ? `${name(x.a)} follows ${name(x.b)}` : `${m(x.value)} apart`

  return (
    <section aria-label="Relation" className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-headline">
          {name(x.a)} – {name(x.b)}
        </span>
        <span className={`text-caption ${x.kind === 'attached' ? muted : x.met ? 'text-status-within' : 'text-status-over'}`}>
          {x.kind === 'attached' ? measured : x.met ? `Met: ${measured}` : `Broken by ${m(x.gap)}: ${measured}`}
        </span>
      </div>
      {rule && (
        <p className={`select-text text-caption ${muted}`}>
          From the rule “{ruleSentence(rule, program)}”{rule.reason ? `: ${rule.reason}` : ''}. {name(x.b)} is the nearest {program(rule.b)} to {name(x.a)}.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {rule && (
          <Button
            title="Open the rule in the Rules window, to change it"
            onClick={() => {
              useUi.getState().openDialog('rules')
              useGraph.getState().selectRule(rule.id)
            }}
          >
            {tr("Edit the rule")}
          </Button>
        )}
        <Button title="Pick both masses" onClick={() => {
            // a locked mass is not picked from here (the padlock is CAD's: its row in Layers is the way to it), nor a hidden one
            const { project, level } = useApp.getState()
            const free = pickUnlocked([x.a, x.b].filter((id) => !massHiddenOnPlan(project, level, id, useLayerView.getState().hidden)))
            if (free.length > 0) useApp.getState().selectMany(free)
          }}>
          {tr("Select the masses")}
        </Button>
      </div>
    </section>
  )
}
