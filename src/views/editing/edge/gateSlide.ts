// A gate on its side, on the plan (Phase PE.2 task 10, Decisions "On edge engine" and "Exterior circulation"): the one place the views say where a gate stands. Every write goes
// through `actions.editEdge` (a gate's host is a street, an existing street or the site's boundary: `state/actions/gateEdges.ts`), and Alt+drag through `actions.copyPicked`.
//   startGateSlide  the gate's square: pressed it slides along its side by what the pointer moved along it, stopping half its width from the ends; the engine does the edit, previewed as a
//                   drag is, one undo step. Typed (a number of m, signed by the side's way a → b), during the drag or right after it: that far from where it started, exactly. Alt+drag
//                   leaves it and slides a copy of it (its width, radius, flow…), picked once dropped. A group or a pick of other kinds moves whole (Phase AS.5); Shift+click joins the
//                   pick; a locked gate starts nothing and says it is locked.
//   putGate         the Gate tool's click: a gate on the slot of the side `gateHostAt` found.
//   setGateWidth    the Width field: the opening as wide as asked (it moves in from an end, or the side refuses it).
import { GATE_SLOT, gateSideOf, gatesOf, type GateHosts } from '../../../engine/circulation/gates.ts'
import { gateRange } from '../../../engine/circulation/gateGeometry.ts'
import { contourToPolygon } from '../../../engine/geom/contour.ts'
import { gateLocked } from '../../../kinds/locked.ts'
import type { Ref } from '../../../kinds/index.ts'
import { NOTHING_PICKED } from '../../../model/picked.ts'
import type { Gate, Id, Point, Project } from '../../../model/schema.ts'
import { actions } from '../../../state/actions/index.ts'
import { useApp } from '../../../state/store.ts'
import { GATES } from '../../layers/keys.ts'
import { showLayers } from '../../layers/layerView.ts'
import { tellLockedPick } from '../../layers/locks.ts'
import { useToast } from '../../layout/toast.ts'
import { useAccess } from '../../plan/access/accessState.ts'
import type { GateHost } from '../../plan/access/gateHosts.ts'
import { metres } from '../../plan/editing.ts'
import { addToMix } from '../../plan/mix.ts'
import { wholeDrag } from '../../plan/pickedDrag.ts'
import type { Mover, Start } from '../../plan/useDrag.ts'
import { moveTyped, startTyped, typedEnded } from '../dimension/typed.ts'
import { sentence } from './labels.ts'

/** What a gate stands on, as the On edge engine names it: a segment of a street, an existing street, the site's boundary. */
export function gateHostRef(g: Pick<Gate, 'on'>): Ref {
  if (g.on?.kind === 'street') return { kind: 'street', id: g.on.id }
  if (g.on?.kind === 'existing-road') return { kind: 'existing-road', id: g.on.id }
  return { kind: 'boundary', id: 'site' }
}

const hostsOf = (p: Project, option: Id): GateHosts => ({ streets: p.options.find((o) => o.id === option)?.streets, existingRoads: p.site.existingRoads })
const boundaryOf = (p: Project) => (p.site.boundary ? contourToPolygon(p.site.boundary) : null)

/** The gate's place on its side now: the side's unit direction, where its middle is along it and how far it may go either way (m). Null when its host is not there. */
function placeOf(p: Project, option: Id, id: Id) {
  const gate = gatesOf(p, option).find((g) => g.id === id)
  const r = gate && gateSideOf(gate, boundaryOf(p), hostsOf(p, option))
  if (!gate || !r) return null
  const [lo, hi] = gateRange(r.side, gate.width)
  return { gate, side: r.side, along: r.along, lo, hi }
}

const tell = (why: string) => useToast.getState().show('info', sentence(why))

/** The gate `id` slid `m` metres along its side (+: towards the side's end b), by the engine. */
const slidBy = (p: Project, option: Id, id: Id, m: number) => {
  const gate = gatesOf(p, option).find((g) => g.id === id)
  return gate ? actions.editEdge(p, gateHostRef(gate), { op: 'slide', ids: [id], by: m / GATE_SLOT }, option) : { project: p, reason: 'That gate is not there' }
}

/** The gate's square: it slides along its side, or (Alt) a copy of it does. `scale`: px per metre. */
export function startGateSlide(id: Id, scale: number): Start {
  return (e) => {
    const { project, option } = useApp.getState()
    // Shift+click: it joins what is picked, of any kind, and slides nothing (Decision "Mixed selection")
    if (e.shiftKey) {
      addToMix('gate', id)
      return null
    }
    if (gateLocked(project, option, id)) {
      tellLockedPick()
      return null
    }
    // in a group of other things, or picked beside other kinds: the whole pick moves (Phase AS.5 task 6); a gate alone slides along its side
    const whole = wholeDrag({ kind: 'gate', id }, () => {
      const at = useApp.getState().derived.circulation.gates.find((g) => g.id === id)?.at
      return at ? { points: [{ p: at, kind: 'endpoint' as const, label: 'gate' }], walls: [], anchor: at } : null
    }, scale, e)
    if (whole) return whole
    const here = placeOf(project, option, id)
    if (!here) return null
    const copy = e.altKey
    if (!copy) useAccess.getState().pick({ kind: 'gate', id })
    const { side, along, lo, hi } = here
    const middle = { x: side.a.x + side.dir.x * along, y: side.a.y + side.dir.y * along }
    // how far the pointer moved along the side, held to what the gate can reach
    const reach = (delta: Point) => Math.min(hi - along, Math.max(lo - along, delta.x * side.dir.x + delta.y * side.dir.y))
    if (!copy)
      startTyped({
        what: 'Slide gate',
        name: 'Gate',
        measure: 'distance',
        shown: '',
        at: middle,
        base: middle,
        way: 0,
        unit: ' m',
        help: 'metres along its side, from where it started · + towards the side’s end, − the other way',
        apply: (v) => (p, told) => {
          const d = v as number
          const w = slidBy(p, option, id, d)
          if (w.reason || Math.abs(d) < 1e-9) {
            told.why = w.reason ? sentence(w.reason) : 'The gate stays where it was'
            return null
          }
          return w.project
        },
        mode: 'live',
        from: project,
      })
    let made: Id | null = null
    const mover: Mover = (delta) => {
      if (typedEnded()) return { ok: true, mark: null }
      const d = reach(delta)
      let ok = true
      useApp.getState().preview((p) => {
        if (!copy) {
          const w = slidBy(p, option, id, d)
          ok = !w.reason
          return w.reason ? null : w.project
        }
        // the copy lands where the move along the side puts it (re-homed by the verb), the original stays
        const c = actions.copyPicked(p, option, { ...NOTHING_PICKED, gates: [id] }, { x: side.dir.x * d, y: side.dir.y * d })
        const before = new Set(gatesOf(p, option).map((g) => g.id))
        made = gatesOf(c.project, option).find((g) => !before.has(g.id))?.id ?? null
        return c.project
      })
      if (!copy) moveTyped(metres(d), d, { x: middle.x + side.dir.x * d, y: middle.y + side.dir.y * d })
      return { ok, mark: null }
    }
    if (copy) {
      mover.copy = true
      mover.click = () => useAccess.getState().pick({ kind: 'gate', id })
      mover.done = () => made && useAccess.getState().pick({ kind: 'gate', id: made })
    }
    return mover
  }
}

/** The Gate tool's click: a gate on the slot `hit` names, picked and shown. Its id; null when the engine refused (said). */
export function putGate(hit: GateHost): Id | null {
  const { project, option } = useApp.getState()
  const op = { op: 'put' as const, edge: hit.edge, slots: [hit.slot], kind: 'gate' }
  const w = actions.editEdge(project, hit.host, op, option)
  if (w.reason) {
    tell(w.reason)
    return null
  }
  useApp.getState().apply((p) => actions.editEdge(p, hit.host, op, option).project)
  const before = new Set(gatesOf(project, option).map((g) => g.id))
  const id = gatesOf(useApp.getState().project, option).find((g) => !before.has(g.id))?.id ?? null
  if (w.notes?.length) tell(w.notes[0])
  // a gate placed is a gate seen
  showLayers(GATES)
  if (id) useAccess.getState().pick({ kind: 'gate', id })
  return id
}

/** The Width field: the gate `id` as wide as `width` m, through the engine (it moves in from an end of its side; a side shorter than it refuses, said). True when it was set. */
export function setGateWidth(id: Id, width: number): boolean {
  const { project, option } = useApp.getState()
  const gate = gatesOf(project, option).find((g) => g.id === id)
  if (!gate) return false
  const host = gateHostRef(gate)
  const op = { op: 'width' as const, ids: [id], width }
  const w = actions.editEdge(project, host, op, option)
  if (w.reason) {
    tell(w.reason)
    return false
  }
  useApp.getState().apply((p) => actions.editEdge(p, host, op, option).project)
  return true
}
