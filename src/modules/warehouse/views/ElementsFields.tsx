// Step 6's fields (Decisions "Warehouse type", "Elements by module", "Truck court"; BE.5): parameters only. The tools
// place the docks, level doors and patterns (Dock, Door and Pattern on the plan, one a module) and the truck courts
// (Court); here they are listed by kind with how many are placed and their parameters: a dock's or a door's width, a
// pattern's name and width, the block's court depth and range and each wall's own depth. Nothing says which bays or
// how many. With nothing picked on the plan, a change applies to every element of its kind; with some picked (BE.9,
// Decision "Multi-selection"), to those only, and the kinds with none picked wait (their fields off).
import type { HallElement, Id, WarehouseType } from '../../../model/schema.ts'
import { standardsOf } from '../../../engine/circulation/standards.ts'
import { actions } from '../../../state/actions/index.ts'
import { useApp } from '../../../state/store.ts'
import { Note } from '../../../views/layout/Note.tsx'
import type { Generated } from '../engine/generate.ts'
import { moduleAt as lineAt } from '../engine/bays.ts'
import { Button, TextField } from '../../../views/controls/fields.tsx'
import { renameElements, setEdgeCourt, setElementsWidth } from './commands.ts'
import { LengthField } from './LengthField.tsx'
import { useLengths } from './units.ts'
import { runAlongEdge as runAlong } from '../engine/dockRule.ts'
import { courtsOf, edgeName } from './handleMath.ts'
import { useWarehouse, type Picked } from './warehouseState.ts'
import { t as tr } from '../../../i18n/idioma.ts' // mixed-use-mvp

interface Props {
  t: WarehouseType
  g: Generated
  editable: boolean
}

/** The elements and the truck courts (by edge) picked on the plan, as one key (a stable selector). */
const pickedKey = (picked: Picked[]): string =>
  picked
    .filter((x) => x.kind === 'element' || x.kind === 'court')
    .map((x) => `${x.kind}:${x.id}`)
    .join('|')

/** m: a width wider than its module along the wall, which the element may overlap its neighbour for. */
const WIDER = 1e-6

export function ElementsFields({ t, g, editable }: Props) {
  const key = useWarehouse((s) => pickedKey(s.picked))
  const standard = useApp((s) => standardsOf(s.project).courtDepth)
  const els = t.elements
  const ids = new Set(els.map((e) => e.id))
  const courts = courtsOf(t, g, standard)
  const keys = key ? key.split('|') : []
  const pickedHere = keys.filter((k) => k.startsWith('element:')).map((k) => k.slice(8)).filter((id) => ids.has(id))
  const courtsPicked = keys.filter((k) => k.startsWith('court:')).map((k) => k.slice(6)).filter((edge) => courts.some((c) => c.edge.id === edge))
  const count = pickedHere.length + courtsPicked.length
  // some picked: the kinds with none of them wait
  const some = count > 0
  const docks = els.filter((e) => e.kind === 'dock')
  const doors = els.filter((e) => e.kind === 'door')
  const names = [...new Set(els.filter((e) => e.kind === 'pattern').map((e) => e.name ?? ''))]

  /** A module's length along its wall (m), to tell an element wider than it. */
  const moduleLength = (e: HallElement): number => {
    const edge = g.edges.find((x) => x.id === e.edge)
    if (!edge) return Infinity
    const r = runAlong(g.runs, edge)
    return lineAt(r, e.module + 1) - lineAt(r, e.module)
  }

  return (
    <div data-step-fields="elements" className="flex flex-col gap-2">
      {some && (
        <p data-picked-count={count} className="text-caption text-ink-secondary">
          {count} picked: changes apply to {count === 1 ? 'it' : 'those'} only
        </p>
      )}
      {docks.length > 0 && <KindRow label="Docks" of={docks} pickedHere={pickedHere} some={some} wider={docks.some((e) => e.width > moduleLength(e) + WIDER)} t={t} editable={editable} />}
      {doors.length > 0 && <KindRow label="Level doors" of={doors} pickedHere={pickedHere} some={some} wider={doors.some((e) => e.width > moduleLength(e) + WIDER)} t={t} editable={editable} />}
      {names.length > 0 && (
        <div role="group" aria-label="Patterns" className="flex flex-col gap-1.5">
          <span className="text-label font-semibold text-ink">{tr("Patterns")}</span>
          <div className="flex flex-col gap-1.5 pl-3">
            {names.map((name) => {
              const of = els.filter((e) => e.kind === 'pattern' && (e.name ?? '') === name)
              return <KindRow key={name} label={name || 'Pattern'} named={name} of={of} pickedHere={pickedHere} some={some} wider={of.some((e) => e.width > moduleLength(e) + WIDER)} t={t} editable={editable} />
            })}
          </div>
        </div>
      )}
      {(docks.length > 0 || courts.length > 0) && <CourtsRow t={t} g={g} courts={courts} standard={standard} editable={editable} some={some} picked={courtsPicked} />}
      {!els.length && !courts.length && <p className="select-text text-caption text-ink-secondary">{tr("Nothing placed yet: Dock, Door and Pattern in the toolbar above the plan place them.")}</p>}
      <Note>
        The tools place them, one a module anchored on the module lines (Dock, Door and Pattern on the plan: a press puts one or takes it away). Here only their
        parameters: a width typed applies to all of its kind, or, with some picked on the plan, to those only.
      </Note>
    </div>
  )
}

/** One kind of element (a pattern of one name): its count, and the width (the name of a pattern) of all of them, or of
 *  the ones picked among them; with `some` picked elsewhere and none of these, its fields wait. */
function KindRow({ label, named, of, pickedHere, some, wider, t, editable }: { label: string; named?: string; of: HallElement[]; pickedHere: Id[]; some: boolean; wider: boolean; t: WarehouseType; editable: boolean }) {
  const chosen = of.filter((e) => pickedHere.includes(e.id))
  const waits = some && !chosen.length
  const targets = (chosen.length ? chosen : of).map((e) => e.id)
  const widths = new Set((chosen.length ? chosen : of).map((e) => e.width))
  const width = widths.size === 1 ? [...widths][0] : null
  return (
    <div role="group" aria-label={label} data-kind={named === undefined ? of[0].kind : 'pattern'} className="flex flex-col gap-1.5 rounded-control border border-separator p-2">
      <span className="text-label font-semibold text-ink">
        {label} · {of.length}
      </span>
      {named !== undefined && editable && !waits && <TextField label="Name" value={named} onCommit={(name) => renameElements(t.id, targets, name)} />}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <LengthField narrow label="Width" min={0.05} max={20} value={width} disabled={!editable || waits} onCommit={(w) => setElementsWidth(t.id, targets, w)} />
        {wider && (
          <span data-wider="" className="text-caption text-status-over">
            ⚠ wider than its module
          </span>
        )}
      </div>
    </div>
  )
}

/** The block's truck court (its depth, absent: the standards', and the range the optimizer may search) and each
 *  wall's own depth; a wall without docks that has a court says so. With `some` picked on the plan, only the courts
 *  `picked` take a depth of their own, the rest wait (the block's depth and range with them when none is). */
function CourtsRow({ t, g, courts, standard, editable, some, picked }: { t: WarehouseType; g: Generated; courts: ReturnType<typeof courtsOf>; standard: number; editable: boolean; some: boolean; picked: Id[] }) {
  const { text } = useLengths()
  const court = t.court
  const depth = court?.depth ?? standard
  const set = (next: WarehouseType['court'] | null) => useApp.getState().apply((p) => actions.setTypeCourt(p, t.id, next))
  const setDepth = (v: number) => {
    const range = court?.range && court.range[0] <= v && v <= court.range[1] ? court.range : undefined
    set({ depth: v, ...(range ? { range } : {}) })
  }
  const setRange = (k: 0 | 1, v: number) => {
    const next: [number, number] = court?.range ? [...court.range] : [depth, depth]
    next[k] = v
    if (next[0] > next[1]) next[1 - k] = v
    set({ depth: Math.min(next[1], Math.max(next[0], depth)), range: next })
  }
  const docked = new Set(g.doors.filter((d) => d.kind === 'dock').map((d) => d.edge))
  const waits = some && !picked.length
  const off = !editable || waits
  return (
    <div role="group" aria-label="Truck courts" data-court-depth={depth} className="flex flex-col gap-1.5 rounded-control border border-separator p-2">
      <span className="text-label font-semibold text-ink">Truck courts · {courts.length}</span>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        <LengthField narrow label="Block depth" min={5} max={200} value={depth} disabled={off} onCommit={setDepth} />
        <span />
        <LengthField narrow label="Range from" min={5} max={200} value={court?.range?.[0] ?? null} disabled={off} onCommit={(v) => setRange(0, v)} />
        <LengthField narrow label="to" min={5} max={200} value={court?.range?.[1] ?? null} disabled={off} onCommit={(v) => setRange(1, v)} />
      </div>
      {court && editable && !waits && (
        <div>
          <Button title={tr("The project's standard court depth again")} onClick={() => set(null)}>
            {tr("Standard depth")}
          </Button>
        </div>
      )}
      {courts.map((c) => (
        <div key={c.edge.id} data-court-edge={c.edge.id} className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <span className="text-label text-ink-secondary">
              {edgeName(g.outline, c.edge.id)} {c.edge.side}
            </span>
            <LengthField narrow label="Own depth" min={5} max={200} value={c.own ? c.depth : null} disabled={!editable || (some && !picked.includes(c.edge.id)) || c.parts.some((x) => x.shaped)} onCommit={(v) => setEdgeCourt(t.id, c.edge.id, { depth: v })} />
          </div>
          {c.parts.some((x) => x.shaped) && <span className="text-caption text-ink-secondary">{c.parts.length > 1 ? `${c.parts.length} courts with shapes of their own` : 'A court with a shape of its own'}</span>}
          {!docked.has(c.edge.id) && <span className="text-caption text-ink-secondary">(court without docks)</span>}
        </div>
      ))}
      <Note>{court ? 'In front of each docked wall; a placed copy’s wall may have its own depth (the pill on the plan).' : `The project’s standard (${text(standard)}) until one is typed.`}</Note>
    </div>
  )
}
