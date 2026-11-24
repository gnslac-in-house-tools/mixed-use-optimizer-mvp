// The warehouse module's verbs on the parts of a block (Phase AS.4 task 6, Decision "One menu"; Decisions "Warehouse by hand", "Block shape"): a zone, a hole, a
// truck court, an element and an edge of the block plan are kinds of the module (`kinds.ts`) with their own verbs only, and the one builder (`views/editing/menu/
// build.ts`) makes their right-click menu, the entries the plan's old menu had (`planItems`, gone with its file), in the same order:
//   a zone   its program (the block's, none, each built program) │ Split here · Merge with <each neighbour> │ Level +0.5 m · Level −0.5 m
//   an edge  Pull out this bay · Push in this bay │ Remove the corner at its start · at its end
//   a hole   Remove the hole        an element  Remove this <dock, level door, its name> (one on a module: Decision "Elements by module")
//   a court  Remove this truck court (a wall without docks) · The block's depth again (a docked wall's own depth); greyed on a shape · Back to a rectangle (a court with a shape of its own)
// Each row a hand edit (`commands.ts`): a locked step opens, a toast says so (Decision "Free steps"). A runner reads the type the Program window shows (`currentType`)
// and what it makes, as the plan does; `partRef` is the `Ref` of what the plan hit. Registered through `views/editing/menu/modules.ts`.
import type { Ref } from '../../../kinds/types.ts'
import type { HallZone, Id, Point, Program, WarehouseType } from '../../../model/schema.ts'
import { useApp } from '../../../state/store.ts'
import type { MenuEntry } from '../../../views/controls/Menu.tsx'
import { registerKind, type Runner } from '../../../views/editing/menu/verbs.ts'
import { generate, type Generated } from '../engine/generate.ts'
import { mergeZones, neighbours, splitZone, zonesOf } from '../engine/zones.ts'
import { actions } from '../../../state/actions/index.ts'
import { courtToRectangle, giveProgram, removeElements, setEdgeCourt, setZone, setZones, shapeEdit } from './commands.ts'
import { alongOf, elementName, splitAt, stretchAt } from './handleMath.ts'
import { lengthText, useUnits } from './units.ts'
import { currentType, useWarehouse, type Picked } from './warehouseState.ts'

/** A zone's name: its own, or Zone n in the block's order. */
const zoneName = (zones: HallZone[], z: HallZone): string => z.name ?? `Zone ${zones.indexOf(z) + 1}`

/** The `Ref` of what the block plan hit (a stretch of an edge is its edge); null for what has no menu (a column line). */
export function partRef(target: Picked): Ref | null {
  if (target.kind === 'line') return null
  return { kind: target.kind === 'stretch' ? 'edge' : target.kind, id: target.id }
}

interface Editor {
  t: WarehouseType
  g: Generated
  zones: HallZone[]
  programs: Program[]
}

const made = new WeakMap<WarehouseType, { g: Generated; zones: HallZone[] }>()

/** The type the Program window shows and what it makes now; null without one. */
function editor(): Editor | null {
  const { project } = useApp.getState()
  const t = currentType(project, useWarehouse.getState())
  if (!t) return null
  let m = made.get(t)
  if (!m) {
    const g = generate(t)
    m = { g, zones: zonesOf(t, g.runs) }
    made.set(t, m)
  }
  return { t, g: m.g, zones: m.zones, programs: project.programs }
}

/** The editor, when a part of this id is in it. */
const withPart = (find: (e: Editor, id: Id) => unknown) => (refs: Ref[]): Editor | null => {
  const e = editor()
  return e && find(e, refs[0].id) !== undefined ? e : null
}
const withZone = withPart((e, id) => e.zones.find((z) => z.id === id))
const withEdge = withPart((e, id) => e.g.edges.find((x) => x.id === id))
const withElement = withPart((e, id) => e.t.elements.find((x) => x.id === id))

/** A row. */
const leaf = (key: string, label: string, onSelect: () => void, more: { title?: string; disabled?: boolean; checked?: boolean; detail?: string } = {}): MenuEntry => ({ key, label, onSelect, ...more })

function programRows(e: Editor, zone: HallZone): MenuEntry[] {
  const { t } = e
  return [
    leaf('program-hall', 'The block’s program', () => giveProgram(t.id, zone.id, undefined), { checked: zone.program === undefined }),
    leaf('program-none', 'No program', () => giveProgram(t.id, zone.id, null), { checked: zone.program === null }),
    ...e.programs.filter((g) => g.built).map((g) => leaf(`program-${g.id}`, g.name, () => giveProgram(t.id, zone.id, g.id), { checked: zone.program === g.id })),
  ]
}

const zoneRunners: Record<string, Runner> = {
  program: {
    group: 'program',
    rows: (refs) => {
      const e = withZone(refs)
      const z = e?.zones.find((x) => x.id === refs[0].id)
      return e && z ? programRows(e, z) : []
    },
  },
  split: {
    group: 'edit',
    rows: (refs, at) => {
      const e = withZone(refs)
      if (!e) return []
      const split = at ? splitAt(e.zones, e.g.runs, at) : null
      return [
        leaf('split', 'Split here', () => split && setZones(e.t.id, splitZone(e.zones, split.zone, split.axis, split.k)), {
          disabled: !split || split.zone !== refs[0].id,
          title: split ? `On the module line nearest the pointer, ${split.axis === 'x' ? 'across the length' : 'across the width'}` : 'A zone a module wide splits no more',
        }),
      ]
    },
  },
  merge: {
    group: 'edit',
    rows: (refs) => {
      const e = withZone(refs)
      return e ? neighbours(e.zones, refs[0].id).map((n) => leaf(`merge-${n.id}`, `Merge with ${zoneName(e.zones, n)}`, () => setZones(e.t.id, mergeZones(e.zones, refs[0].id, n.id)))) : []
    },
  },
  'level-up': {
    group: 'level',
    rows: (refs) => {
      const e = withZone(refs)
      const z = e?.zones.find((x) => x.id === refs[0].id)
      if (!e || !z) return []
      const level = z.level ?? 0
      const u = useUnits.getState().unit
      return [leaf('level-up', `Level +${lengthText(0.5, u)}`, () => setZone(e.t.id, z.id, { level: level + 0.5 || undefined }), { detail: `now ${level > 0 ? '+' : level < 0 ? '−' : '±'}${lengthText(Math.abs(level), u)}` })]
    },
  },
  'level-down': {
    group: 'level',
    rows: (refs) => {
      const e = withZone(refs)
      const z = e?.zones.find((x) => x.id === refs[0].id)
      if (!e || !z) return []
      const level = z.level ?? 0
      return [leaf('level-down', `Level −${lengthText(0.5, useUnits.getState().unit)}`, () => setZone(e.t.id, z.id, { level: level - 0.5 || undefined }))]
    },
  },
}

/** Whether a wall has docks: its truck court is then always there. */
const docked = (e: Editor, edge: Id): boolean => e.g.doors.some((d) => d.kind === 'dock' && d.edge === edge)

/** The bay under the pointer on an edge, for Pull out and Push in. */
function bayAt(e: Editor, edgeId: Id, at: Point | null) {
  const edge = e.g.edges.find((x) => x.id === edgeId)
  return edge && at ? stretchAt(e.g.runs, edge, alongOf(edge, at)) : null
}

const BAY_TITLE = (out: boolean) => `A ${out ? 'bump' : 'notch'} a module deep, on the bay under the pointer`

const edgeRunners: Record<string, Runner> = {
  'pull-out': {
    group: 'bay',
    rows: (refs, at) => {
      const e = withEdge(refs)
      if (!e) return []
      const s = bayAt(e, refs[0].id, at)
      return [leaf('pull-out', 'Pull out this bay', () => s && shapeEdit(e.t.id, { kind: 'pull', edge: refs[0].id, ...s, by: 1 }), { disabled: !s, title: BAY_TITLE(true) })]
    },
  },
  'push-in': {
    group: 'bay',
    rows: (refs, at) => {
      const e = withEdge(refs)
      if (!e) return []
      const s = bayAt(e, refs[0].id, at)
      return [leaf('push-in', 'Push in this bay', () => s && shapeEdit(e.t.id, { kind: 'pull', edge: refs[0].id, ...s, by: -1 }), { disabled: !s, title: BAY_TITLE(false) })]
    },
  },
  'corner-start': {
    group: 'corner',
    present: (refs) => withEdge(refs) !== null,
    run: (refs) => {
      const e = withEdge(refs)
      if (e) shapeEdit(e.t.id, { kind: 'corner', edge: refs[0].id })
    },
  },
  'corner-end': {
    group: 'corner',
    present: (refs) => withEdge(refs) !== null,
    run: (refs) => {
      const e = withEdge(refs)
      const edge = e?.g.edges.find((x) => x.id === refs[0].id)
      if (e && edge) shapeEdit(e.t.id, { kind: 'corner', edge: e.g.edges[(edge.index + 1) % e.g.edges.length].id })
    },
  },
}

registerKind('zone', { own: zoneRunners })
registerKind('edge', { own: edgeRunners })
registerKind('hole', {
  own: {
    remove: {
      present: () => editor() !== null,
      run: (refs) => {
        const e = editor()
        if (e) shapeEdit(e.t.id, { kind: 'unhole', id: refs[0].id })
      },
    },
  },
})
registerKind('element', {
  own: {
    remove: {
      present: (refs) => withElement(refs) !== null,
      label: (refs) => {
        const el = withElement(refs)?.t.elements.find((x) => x.id === refs[0].id)
        return `Remove this ${!el ? 'element' : el.kind === 'dock' ? 'dock' : el.kind === 'door' ? 'level door' : elementName(el)}`
      },
      run: (refs) => {
        const e = withElement(refs)
        if (e) removeElements(e.t.id, [refs[0].id])
      },
    },
  },
})
/** The wall a court's ref names: the plan's pick is the wall's edge id, the shape engine's ref is `<typeId>/<edgeId>[/<courtId>]` (Phase D.3). */
const wallOf = (id: Id): Id => (id.includes('/') ? id.split('/')[1] : id)

/** Does the wall's court have a shape of its own (a depth is its deepest point's, no number of its own)? */
const shaped = (e: Editor, edge: Id): boolean => e.t.courts?.some((c) => c.edge === edge && c.shape !== undefined) === true

registerKind('court', {
  own: {
    // a wall without docks: its court goes; a docked wall always has one, so only a depth of its own is undone
    remove: {
      group: 'depth',
      present: (refs) => {
        const e = editor()
        return e !== null && !docked(e, wallOf(refs[0].id))
      },
      run: (refs) => {
        const e = editor()
        if (e) setEdgeCourt(e.t.id, wallOf(refs[0].id), null)
      },
    },
    'block-depth': {
      group: 'depth',
      present: (refs) => {
        const e = editor()
        return e !== null && docked(e, wallOf(refs[0].id))
      },
      // a court with a shape of its own has no depth to give up: it says so and what to do
      enabled: (refs) => {
        const e = editor()
        const edge = wallOf(refs[0].id)
        if (e && shaped(e, edge)) return 'A court with a shape of its own has no depth of its own: bring it back to a rectangle first'
        return e?.t.courts?.some((c) => c.edge === edge && c.depth !== undefined) ? true : 'A docked wall always has its truck court'
      },
      title: () => 'A docked wall always has its truck court',
      run: (refs) => {
        const e = editor()
        if (e) setEdgeCourt(e.t.id, wallOf(refs[0].id), null)
      },
    },
    // a court with a shape of its own: its shape gone, a rectangle as deep as its deepest point
    'to-rectangle': {
      group: 'depth',
      present: (refs) => {
        const e = editor()
        return e !== null && shaped(e, wallOf(refs[0].id))
      },
      title: () => 'The shape goes: a rectangle across the wall, as deep as the court is at its deepest',
      run: (refs) => {
        const e = editor()
        if (e) courtToRectangle(e.t.id, { kind: 'court', id: `${e.t.id}/${wallOf(refs[0].id)}` })
      },
    },
  },
})

/** A placed block's court that has a shape of its own: the engine reads it with no depth for a number (a rectangle's far edge has one). */
const shapedOnSite = (ref: Ref): boolean => {
  const read = actions.shapeOf(useApp.getState().project, ref)
  return read !== null && !read.walls?.some((w) => w.value !== undefined)
}

// a placed block's court on the site: its shape back to a rectangle, as the block editor's (the copy's own courts; its type unchanged)
registerKind('block-court', {
  own: {
    'to-rectangle': {
      present: (refs) => shapedOnSite(refs[0]),
      title: () => 'The shape goes: a rectangle across the wall, as deep as the court is at its deepest',
      run: (refs) => courtToRectangle(null, refs[0]),
    },
  },
})
