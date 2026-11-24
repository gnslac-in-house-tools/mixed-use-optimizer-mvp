// Gates on the On edge engine (Phase PE.2, Decisions "On edge engine" and "Exterior circulation"; plan Decisions 15 and 19): the three adapters that read and
// write a gate on the side of a street (`street`: the sides of every segment of the street a person picked), of an existing street (`existing-road`:
// the sides of each stretch) or on the site's boundary (`boundary`: its sides). An edge is one straight side, its slots 0.5 m (`GATE_SLOT`); a gate
// keeps its exact place (`t` or `on.at`) and its slot is the one under its middle. `put` takes one slot (*One gate at a time*), `count` is refused
// (*Gates are put one at a time*), a side shorter than the gate refuses; `slide.by` may be fractional (a typed distance in m ÷ 0.5). A refusal is the
// SAME project and why. Where a new gate goes (plan Decision 19): on an option's street, into the option's own gates (copied from the site's, the note
// *Own gates for <option>*); on the boundary or an existing street, into the gates the option uses.
import type { EdgeAdapter, EdgeElement, EdgeInfo, EdgeOp, EdgeRead, EdgeWrite } from '../../engine/edge/onEdge.ts'
import { GATE_SLOT, gatesOf, ownsGates, type GateHosts } from '../../engine/circulation/gates.ts'
import { gateRange, onOf, sideOfGate, tOf, type GateSide } from '../../engine/circulation/gateGeometry.ts'
import { gateSides } from '../../engine/circulation/gateSides.ts'
import { newGateDefaults } from '../../engine/circulation/standards.ts'
import { contourToPolygon } from '../../engine/geom/contour.ts'
import type { Ref } from '../../kinds/types.ts'
import type { Gate, Id, Polygon, Project } from '../../model/schema.ts'
import { addGate, addGateOn, removeGate, updateGate } from './circulation.ts'

/** What a host is called in a refusal. */
const LABEL: Record<string, string> = { street: 'street', 'existing-road': 'existing street', boundary: 'site boundary' }

interface Ctx {
  optionId: Id
  hosts: GateHosts
  boundary: Polygon | null
}

const ctxOf = (p: Project, optionId?: Id): Ctx => {
  const id = optionId ?? p.options[0]?.id ?? ''
  return { optionId: id, hosts: { streets: p.options.find((o) => o.id === id)?.streets, existingRoads: p.site.existingRoads }, boundary: p.site.boundary ? contourToPolygon(p.site.boundary) : null }
}

/** How many slots a side has (the part of a slot left over has none). */
const slotsOf = (side: GateSide): number => Math.floor(side.length / GATE_SLOT + 1e-9)

/** The slot under a place along a side. */
const slotAt = (side: GateSide, along: number): number => Math.max(0, Math.min(slotsOf(side) - 1, Math.floor(along / GATE_SLOT + 1e-6)))

const nameOf = (side: GateSide): string =>
  side.kind === 'boundary' ? `Side ${side.index + 1}` : side.kind === 'existing-road' ? `Stretch ${side.index + 1}, ${side.side}` : `${side.side === 'left' ? 'Left' : 'Right'} side`

function edgeInfo(side: GateSide): EdgeInfo {
  const n = slotsOf(side)
  return {
    id: side.id,
    name: nameOf(side),
    a: side.a,
    b: side.b,
    out: side.out,
    origin: side.a,
    dir: side.dir,
    slots: Array.from({ length: n }, (_, k) => ({ k, from: k * GATE_SLOT, to: (k + 1) * GATE_SLOT, group: -1 })),
  }
}

/** The gates the option uses that stand on one of these sides, each with its side and its place along it. */
function standing(p: Project, c: Ctx, sides: GateSide[]): { gate: Gate; side: GateSide; along: number }[] {
  return gatesOf(p, c.optionId).flatMap((gate) => {
    const r = sideOfGate(gate, sides)
    return r && sides.includes(r.side) ? [{ gate, ...r }] : []
  })
}

/** The sides of the host a gate stands on, with their slots and the gates on them (the three adapters' reading: `edgeOf` is the verb). */
export function gateEdgeOf(p: Project, host: Ref, optionId?: Id): EdgeRead | null {
  const c = ctxOf(p, optionId)
  const sides = gateSides(host, c.hosts, c.boundary)
  if (!sides.length) return null
  const elements: EdgeElement[] = standing(p, c, sides).map(({ gate, side, along }) => ({ id: gate.id, kind: 'gate', edge: side.id, slot: slotAt(side, along), width: gate.width }))
  return { edges: sides.map(edgeInfo), elements }
}

/** A gate at `along` on `side` in the option: added where the option takes its gates from. */
function putAt(p: Project, c: Ctx, side: GateSide, along: number): EdgeWrite {
  const made = side.kind === 'boundary' ? addGate(p, c.optionId, tOf(side, along)) : addGateOn(p, c.optionId, onOf(side, along))
  // a street's gate goes into the option's own gates: copied from the site's the first time
  const own = side.kind === 'street' && !ownsGates(p, c.optionId)
  const name = p.options.find((o) => o.id === c.optionId)?.name
  return { project: made.project, ...(own && name ? { notes: [`Own gates for ${name}`] } : {}) }
}

/** One operation on the gates of a host's sides (the three adapters' writing: `editEdge` is the verb). */
export function editGateEdge(p: Project, host: Ref, op: EdgeOp, optionId?: Id): EdgeWrite {
  const c = ctxOf(p, optionId)
  const sides = gateSides(host, c.hosts, c.boundary)
  const refuse = (reason: string): EdgeWrite => ({ project: p, reason })
  if (!sides.length) return refuse(`That ${LABEL[host.kind] ?? host.kind} is not there`)
  switch (op.op) {
    case 'put': {
      if (op.kind !== 'gate') return refuse(`Only a gate stands on a ${LABEL[host.kind]}`)
      if (op.slots.length !== 1) return refuse('One gate at a time')
      const side = sides.find((s) => s.id === op.edge)
      if (!side) return refuse('That edge is not there')
      if (!Number.isInteger(op.slots[0]) || op.slots[0] < 0 || op.slots[0] >= slotsOf(side)) return refuse('That slot is not there')
      const width = newGateDefaults(p).width
      if (side.length < width) return refuse('That side is shorter than the gate')
      const [lo, hi] = gateRange(side, width)
      return putAt(p, c, side, Math.min(hi, Math.max(lo, (op.slots[0] + 0.5) * GATE_SLOT)))
    }
    case 'take': {
      if (op.kind !== 'gate') return refuse(`Only a gate stands on a ${LABEL[host.kind]}`)
      const here = standing(p, c, sides).filter((x) => x.side.id === op.edge && op.slots.includes(slotAt(x.side, x.along)))
      let q = p
      for (const x of here) q = removeGate(q, c.optionId, x.gate.id)
      return { project: q }
    }
    case 'slide': {
      let q = p
      const there = standing(p, c, sides)
      for (const id of op.ids) {
        const x = there.find((y) => y.gate.id === id)
        if (!x) return refuse('That gate is not on this edge')
        if (x.gate.locked === true) return refuse('That gate is locked')
        const to = x.along + op.by * GATE_SLOT
        const [lo, hi] = gateRange(x.side, x.gate.width)
        if (!Number.isFinite(to) || to < lo - 1e-9 || to > hi + 1e-9) return refuse('That gate cannot slide past the end of its side')
        const along = Math.min(hi, Math.max(lo, to))
        q = updateGate(q, c.optionId, id, x.side.kind === 'boundary' ? { t: tOf(x.side, along) } : { on: onOf(x.side, along) })
      }
      return { project: q }
    }
    case 'width': {
      if (!(op.width > 0) || !Number.isFinite(op.width)) return refuse('A gate is wider than 0')
      let q = p
      const there = standing(p, c, sides)
      for (const id of op.ids) {
        const x = there.find((y) => y.gate.id === id)
        if (!x) return refuse('That gate is not on this edge')
        if (x.gate.locked === true) return refuse('That gate is locked')
        if (x.side.length < op.width) return refuse('That side is shorter than the gate')
        // the wider opening may reach past an end: its middle moves in
        const [lo, hi] = gateRange(x.side, op.width)
        const along = Math.min(hi, Math.max(lo, x.along))
        q = updateGate(q, c.optionId, id, { width: op.width, ...(Math.abs(along - x.along) > 1e-9 ? (x.side.kind === 'boundary' ? { t: tOf(x.side, along) } : { on: onOf(x.side, along) }) : {}) })
      }
      return { project: q }
    }
    case 'count':
      return refuse('Gates are put one at a time')
  }
}

/** A gate on a street's sides (`EDGE_ADAPTERS.street`). */
export const STREET_EDGES: EdgeAdapter = { read: gateEdgeOf, write: editGateEdge }
/** A gate on an existing street's sides (`EDGE_ADAPTERS['existing-road']`). */
export const EXISTING_EDGES: EdgeAdapter = { read: gateEdgeOf, write: editGateEdge }
/** A gate on the site's boundary (`EDGE_ADAPTERS.boundary`). */
export const BOUNDARY_EDGES: EdgeAdapter = { read: gateEdgeOf, write: editGateEdge }
