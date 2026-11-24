// The Program window's left column for a Warehouse program (Decisions "Warehouse layout", "Program rule set layout"):
// its warehouse type (its name; ⋯ New, Duplicate, Delete: the program itself is the window's picker) and its six steps
// down a list, each a row with its number,
// name, the summary of its figures and its state (open · locked · ! to lock again), the programs between
// them to drag onto the plan (Decision "Warehouse by hand"). One row shows its fields at a time (the first one not
// locked unless another is picked), any of them typed in any order (Decision "Free steps"): Lock at their foot marks
// the step checked, Unlock takes the mark away; editing a locked one opens it, the later locked ones to lock again.
import { WAREHOUSE_STEPS, type WarehouseStep, type WarehouseType } from '../../../model/schema.ts'
import type { Generated } from '../engine/generate.ts'
import { stepNumber, stepStatus, type StepStatus } from '../engine/steps.ts'
import { useApp } from '../../../state/store.ts'
import { Button, TextField } from '../../../views/controls/fields.tsx'
import { Icon } from '../../../views/controls/Icon.tsx'
import { MoreMenu } from '../../../views/controls/MoreMenu.tsx'
import { duplicateType, givePrograms, lockStep, newType, removeType, renameType, reopenStep } from './commands.ts'
import { PROGRAM_MIME } from '../../../views/panels/programCommands.ts'
import { StepFields } from './StepFields.tsx'
import { circled, STEP_NAMES, STEP_TITLES, stepSummary } from './summary.ts'
import { useUnits } from './units.ts'
import { useCurrentType, useGenerated, useShownStep, useWarehouse } from './warehouseState.ts'
import { t as tr } from '../../../i18n/idioma.ts' // mixed-use-mvp

const STATUS_WORDS: Record<StepStatus, string> = { open: 'Open', locked: 'Locked', again: 'To lock again' }

function StatusGlyph({ status }: { status: StepStatus }) {
  const words = STATUS_WORDS[status]
  const icon = status === 'locked' ? 'lock' : status === 'open' ? 'unlock' : 'warning'
  return (
    <span role="img" aria-label={words} title={words} className={status === 'again' ? 'text-status-over' : status === 'locked' ? 'text-ink' : 'text-ink-tertiary'}>
      <Icon name={icon} className="h-4 w-4" />
    </span>
  )
}

function TypeHeader({ t }: { t: WarehouseType }) {
  return (
    <div className="flex items-end gap-1">
      <div className="min-w-0 flex-1">
        <TextField label="Type name" value={t.name} onCommit={(v) => renameType(t.id, v)} />
      </div>
      <MoreMenu
        compact
        align="right"
        items={[
          { key: 'new', icon: 'plus', label: 'New warehouse program', onSelect: newType },
          { key: 'duplicate', icon: 'duplicate', label: `Duplicate ${t.name} (a program of its own)`, onSelect: () => duplicateType(t.id) },
          { key: 'delete', icon: 'trash', label: `Delete ${t.name} (its program keeps its general level; its copies stay, unlinked)`, onSelect: () => removeType(t.id) },
        ]}
      />
    </div>
  )
}

/**
 * The programs (Decision "Warehouse by hand"), as a palette: dragged onto a zone on the plan, it is its;
 * with zones picked, a click gives it to them (touch screens have no HTML5 drag).
 */
function ProgramChips({ t }: { t: WarehouseType }) {
  const programs = useApp((s) => s.project.programs)
  const picked = useWarehouse((s) => s.picked)
  const zones = picked.filter((x) => x.kind === 'zone').map((x) => x.id)
  return (
    <section aria-label="Programs" className="flex flex-col gap-1.5">
      <h2 className="text-label text-ink-secondary">{tr("Programs · drag onto a zone")}</h2>
      <ul aria-label="Programs" className="flex flex-wrap gap-1">
        {programs
          .filter((p) => p.built)
          .map((p) => (
            <li key={p.id} data-program={p.id}>
              <button
                type="button"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(PROGRAM_MIME, p.id)
                  e.dataTransfer.setData('text/plain', p.name)
                  e.dataTransfer.effectAllowed = 'copy'
                }}
                title={zones.length ? `Give “${p.name}” to the ${zones.length === 1 ? 'zone' : 'zones'} picked (or drag it onto another)` : `Drag “${p.name}” onto a zone`}
                onClick={() => zones.length > 0 && givePrograms(t.id, zones, p.id)}
                className="pressable flex h-[1.5rem] max-w-full cursor-grab items-center gap-1.5 rounded-pill bg-fill px-2 text-label text-ink hover:bg-hover active:cursor-grabbing"
              >
                <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-pill" style={{ background: p.color }} />
                <span className="truncate">{p.name}</span>
              </button>
            </li>
          ))}
      </ul>
    </section>
  )
}

/** Under a row: its fields, always typed, and at their foot Lock (open, or to lock again) or Unlock (locked). */
function StepBody({ t, g, step, status }: { t: WarehouseType; g: Generated; step: WarehouseStep; status: StepStatus }) {
  const n = circled(stepNumber(step))
  return (
    <div data-step-body={step} className="flex flex-col gap-2 pb-2 pl-7 pr-1 pt-1">
      <StepFields t={t} g={g} step={step} editable />
      {status === 'locked' ? (
        <div className="flex items-center justify-between gap-2">
          <span className="text-caption text-ink-tertiary">{tr("Locked: an edit opens it again.")}</span>
          <Button title="Take its lock away: the later locked steps will need locking again" onClick={() => reopenStep(t.id, step)}>
            {tr("Unlock")}
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <span className="text-caption text-ink-tertiary">{status === 'again' ? 'An earlier step changed: check it and lock it again.' : ''}</span>
          <Button tour="block-lock" title={`Lock ${n} ${STEP_NAMES[step]}: checked; the steps stay editable in any order`} onClick={() => lockStep(t.id, step)}>
            Lock {n} {STEP_NAMES[step]}
          </Button>
        </div>
      )}
    </div>
  )
}

function StepRow({ t, g, step, shown }: { t: WarehouseType; g: Generated; step: WarehouseStep; shown: boolean }) {
  const unit = useUnits((s) => s.unit)
  const show = useWarehouse((s) => s.show)
  const status = stepStatus(t, step)
  return (
    <li className={`rounded-control ${shown ? 'bg-panel-sunken' : ''}`}>
      <button
        type="button"
        aria-expanded={shown}
        data-tour={`block-step-${step}`}
        title={STEP_TITLES[step]}
        onClick={() => show(step)}
        className="pressable flex w-full items-center gap-2 rounded-control px-1.5 py-1.5 text-left hover:bg-hover"
      >
        <span
          aria-hidden
          className={`grid h-5 w-5 shrink-0 place-items-center rounded-pill text-caption font-semibold tabular-nums ${shown ? 'bg-ink text-on-ink' : 'border border-ink-tertiary text-ink-secondary'}`}
        >
          {stepNumber(step)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-label font-semibold text-ink">{STEP_NAMES[step]}</span>
          <span className="truncate text-caption tabular-nums text-ink-tertiary">{stepSummary(t, g, step, unit)}</span>
        </span>
        <StatusGlyph status={status} />
      </button>
      {shown && <StepBody t={t} g={g} step={step} status={status} />}
    </li>
  )
}

export function StepsPanel() {
  const t = useCurrentType()
  const g = useGenerated(t)
  const shown = useShownStep(t)
  if (!t || !g)
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-body text-ink-secondary">
          The project is born from one warehouse, designed here alone before the site: its grid, its size, its columns, its envelope, its morphology and the
          elements on its grid, a step at a time, in any order, each locked once checked.
        </p>
        <Button onClick={newType}>{tr("New warehouse type")}</Button>
      </div>
    )
  return (
    <div className="flex flex-col gap-4">
      <TypeHeader t={t} />
      <ProgramChips t={t} />
      <ol aria-label="Steps" className="flex flex-col gap-0.5">
        {WAREHOUSE_STEPS.map((s) => (
          <StepRow key={s} t={t} g={g} step={s} shown={s === shown} />
        ))}
      </ol>
    </div>
  )
}
