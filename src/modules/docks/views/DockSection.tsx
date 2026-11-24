// A mass's docks in Properties (Decision "Exterior circulation", 4.3): its program's (read only: the Brief's Docks
// column turns them on, on the building's front) or its own walls. *Own docks* starts from what it has, so nothing moves. The marks beside its
// walls on the plan turn each wall's docks on or off, and a filled one dragged onto another wall moves them there
// (either makes them its own; Decision "Docks turn with the building"). *From <program>* drops its own. On the structural
// grid (Phase G.3b, Decision "Grid layout"), its doors by pattern: its program's or its own (*Every*, *From*, *Skip*,
// *Mask*), what they place against what the brief asks, and its exceptions (clicked on the plan) to clear. Each docked
// wall's truck court (Decision "Truck court"): its depth (its own, typed here or set by the pill on the plan, else its
// block's or the standards'), and the warehouse it shares it with.
import type { DockPattern, Id } from '../../../model/schema.ts'
import type { DerivedDock } from '../../../engine/types.ts'
import { DEFAULT_PATTERN, SHAPED_COURT } from '../engine/docks.ts'
import { actions } from '../../../state/actions/index.ts'
import { useApp } from '../../../state/store.ts'
import { Button, NumberField, SelectField, TextField } from '../../../views/controls/fields.tsx'
import { Segmented } from '../../../views/controls/Segmented.tsx'
import { useToast } from '../../../views/layout/toast.ts'
import { useModule } from '../../../views/modules.ts'
import { maskText, parseMask, patternText } from './doorPattern.ts'
import { Note } from '../../../views/layout/Note.tsx'

const doorsText = (doors: number, walls: number) =>
  doors === 0 && walls === 0 ? 'No docks' : `${doors} ${doors === 1 ? 'door' : 'doors'} on ${walls} ${walls === 1 ? 'wall' : 'walls'}`

export function DockSection({ id, muted }: { id: Id; muted: string }) {
  const mass = useApp((s) => s.project.masses.find((m) => m.id === id))
  const program = useApp((s) => s.project.programs.find((g) => g.id === s.project.masses.find((m) => m.id === id)?.programId))
  const docks = useApp((s) => s.derived.circulation.docks)
  const dm = useApp((s) => s.derived.masses[id])
  const apply = useApp((s) => s.apply)
  // docks are the docks module's: a typology that does not offer them shows none, one that does lets a mass start its own
  // (Decision "What is not there is not shown")
  const { offered } = useModule('docks')
  if (!mass || !dm || !dm.built || dm.context || dm.span[0] > 1e-6) return null
  if (!offered) return null
  const mine = docks.filter((d) => d.massId === id)
  const own = mass.docks !== undefined
  const doors = mine.reduce((n, d) => n + d.doors.length, 0)

  return (
    <section aria-label="Docks" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className={`text-label ${muted}`}>Docks</h3>
        <Segmented
          kind="toggle"
          label="Docks"
          options={[
            { key: 'program', label: program ? program.name : 'Program', title: program?.docks ? `${program.name}'s: on the building's front` : 'Its program has no docks' },
            { key: 'own', label: 'Own docks', title: 'Pick its own dock walls on the plan' },
          ]}
          value={own ? 'own' : 'program'}
          onChange={(k) => apply((p) => actions.setMassDocks(p, id, k === 'own' ? mine.map((d) => d.t) : null))}
        />
      </div>
      <p className="select-text text-body tabular-nums" data-dock-summary="">
        {doorsText(doors, mine.length)}
        <span className={`text-caption ${muted}`}>
          {' · '}
          {own ? 'its own walls' : program?.docks ? `${program.name}'s: on its front` : 'its program has none'}
        </span>
      </p>
      {(own || program?.docks) && (
        <Note className={`text-caption ${muted}`}>
          On the plan, click the marks beside its walls to turn each wall's docks on or off, or drag a filled one onto another wall to move them there.
        </Note>
      )}
      {mine.length > 0 && <Courts id={id} mine={mine} muted={muted} />}
      {mine.some((d) => d.slots) && <DoorPattern id={id} muted={muted} />}
    </section>
  )
}

const m1 = (v: number) => (Math.round(v * 10) / 10).toFixed(1)

/** Each docked wall's court: its depth, its own or not, and who it shares the court with. */
function Courts({ id, mine, muted }: { id: Id; mine: DerivedDock[]; muted: string }) {
  const names = useApp((s) => s.derived.masses)
  const apply = useApp((s) => s.apply)
  return (
    <div className="flex flex-col gap-1.5" data-courts={mine.length}>
      {mine.map((d) => (
        <div key={d.wall} className="flex flex-col gap-0.5" data-court-wall={d.wall}>
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <NumberField label={`Court, wall ${d.wall + 1}${d.ownDepth ? ' (its own)' : ''}`} unit="m" min={5} max={200} value={d.depth} disabled={!!d.shapes} title={d.shapes ? SHAPED_COURT : undefined} onCommit={(v) => apply((p) => actions.setCourtDepth(p, id, d.t, v))} />
            </div>
            {d.ownDepth && (
              <Button title="Its block's or the standards' depth again" onClick={() => apply((p) => actions.setCourtDepth(p, id, d.t, null))}>
                Reset
              </Button>
            )}
          </div>
          {d.shares && (
            <span className={`select-text text-caption tabular-nums ${muted}`}>
              Shared with {names[d.shares.massId]?.name ?? d.shares.massId}: {m1(d.shares.gap)} m wall to wall
            </span>
          )}
        </div>
      ))}
      <Note className={`text-caption ${muted}`}>On the plan, drag the pill on a court's outer edge to make it deeper or shallower.</Note>
    </div>
  )
}

const SKIP_OPTIONS = [
  { value: 'ends', label: 'The end bays' },
  { value: 'corners', label: 'The corners' },
  { value: 'none', label: 'None' },
]

/** Its doors on the grid: its program's pattern or its own, against the brief's target; its exceptions. */
function DoorPattern({ id, muted }: { id: Id; muted: string }) {
  const mass = useApp((s) => s.project.masses.find((m) => m.id === id))
  const program = useApp((s) => s.project.programs.find((g) => g.id === s.project.masses.find((m) => m.id === id)?.programId))
  const target = useApp((s) => s.derived.docks.targets.find((t) => t.massId === id))
  const apply = useApp((s) => s.apply)
  if (!mass) return null
  const own = mass.doorPattern !== undefined
  const pt = mass.doorPattern ?? program?.docks?.pattern ?? DEFAULT_PATTERN
  const set = (patch: Partial<DockPattern>) => apply((p) => actions.setDoorPattern(p, id, { ...pt, ...patch }))
  const flips = mass.doorFlips?.length ?? 0
  return (
    <div className="flex flex-col gap-2" data-door-pattern={patternText(pt)}>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-label ${muted}`}>On the grid</span>
        <Segmented
          kind="toggle"
          label="Door pattern"
          options={[
            { key: 'program', label: program ? `${program.name}'s` : 'Program', title: 'Its program’s pattern (the Brief’s Docks column)' },
            { key: 'own', label: 'Own pattern', title: 'A pattern of its own, starting from the one it has' },
          ]}
          value={own ? 'own' : 'program'}
          onChange={(k) => apply((p) => actions.setDoorPattern(p, id, k === 'own' ? pt : null))}
        />
      </div>
      <p className={`select-text text-caption ${muted}`}>{patternText(pt)[0].toUpperCase() + patternText(pt).slice(1)}.</p>
      {own && (
        <>
          {!pt.mask && <NumberField label="Every" unit="mod." min={1} max={12} decimals={0} value={pt.every} onCommit={(v) => set({ every: Math.round(v) })} />}
          <NumberField label="From module" min={1} max={24} decimals={0} value={pt.offset + 1} onCommit={(v) => set({ offset: Math.round(v) - 1 })} />
          <SelectField label="Skip" value={pt.skip} options={SKIP_OPTIONS} onCommit={(v) => set({ skip: v as DockPattern['skip'] })} />
          <TextField
            label="Mask"
            value={maskText(pt.mask)}
            onCommit={(v) => {
              const mask = parseMask(v)
              if (mask === null) return useToast.getState().show('info', 'A mask is ones and zeros, at most 12, with a door in it: 1 1 0.')
              const { mask: _, ...rest } = pt
              apply((p) => actions.setDoorPattern(p, id, mask ? { ...rest, mask } : rest))
            }}
          />
          {pt.mask && (
            <div>
              <Button title="A door every so many modules again" onClick={() => apply((p) => actions.setDoorPattern(p, id, { every: pt.every, offset: pt.offset, skip: pt.skip }))}>
                No mask
              </Button>
            </div>
          )}
        </>
      )}
      {target && (
        <p className="select-text text-body tabular-nums" data-door-target="">
          {target.doors} {target.doors === 1 ? 'door' : 'doors'}
          <span className={`text-caption ${target.doors < target.target ? 'text-status-over' : muted}`}>
            {' · '}the brief asks {target.target}
          </span>
        </p>
      )}
      <Note className={`text-caption ${muted}`}>Zoom in on the plan: each module of a docked wall is a square there; a click adds or takes away its door.</Note>
      {flips > 0 && (
        <div>
          <Button title="Its doors as the pattern places them" onClick={() => apply((p) => actions.clearDoorFlips(p, id))}>
            Clear {flips} {flips === 1 ? 'exception' : 'exceptions'}
          </Button>
        </div>
      )}
    </div>
  )
}
