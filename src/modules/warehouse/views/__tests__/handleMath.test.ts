// Where a press of the element tools lands (Decision "Elements by module", BE.4), pure: inside the block by a wall, a
// module of that wall; outside, in front of a bay, that bay's modules; what the press does (puts, or takes away when
// they are all there), a drag's modules along the wall, and the courts the plan draws (Decision "Truck court").
import { describe, expect, it } from 'vitest'
import { generate } from '../../engine/generate.ts'
import { newWarehouseType } from '../../engine/defaults.ts'
import { dockMask, dragModules, paintModules } from '../../engine/dockRule.ts'
import { bayOutsideAt, courtsOf, elementPress, moduleAt } from '../handleMath.ts'

// 200 × 96 m, bays of 12 m in 4 modules of 3 m, end bays of 10 m in 3 (66 × 32 modules), walls 0.3 m thick (the front's
// face at y = −0.3); one dock on every module of the front's interior bays (3–62)
const t0 = newWarehouseType('wt1', 'Warehouse A', { program: 'warehouse' })
const g = generate(t0)

describe('moduleAt: a press inside the block by a wall', () => {
  it('within reach of the wall’s face, inside it: the wall and the module along it', () => {
    // x = 101: module 33 (100–103 m); in the wall's thickness, and 1.5 m in
    expect(moduleAt(g, { x: 101, y: -0.1 }, 2)).toMatchObject({ edge: { id: 'e1' }, module: 33 })
    expect(moduleAt(g, { x: 101, y: 1.5 }, 2)).toMatchObject({ edge: { id: 'e1' }, module: 33 })
    // the end bay's modules are 3.33 m: x = 4 is its second
    expect(moduleAt(g, { x: 4, y: 1 }, 2)).toMatchObject({ edge: { id: 'e1' }, module: 1 })
    // the left wall: along y, x = 0.5 in, y = 4 is module 1
    expect(moduleAt(g, { x: 0.5, y: 4 }, 2)).toMatchObject({ edge: { id: 'e4' }, module: 1 })
  })

  it('outside, too far in, past the wall’s ends: none', () => {
    expect(moduleAt(g, { x: 101, y: -1 }, 2)).toBeNull()
    expect(moduleAt(g, { x: 101, y: 10 }, 2)).toBeNull()
    expect(moduleAt(g, { x: 210, y: 1 }, 2)).toBeNull()
    // out of the block, however far the reach: not the back wall's, though it is on its inner side
    expect(moduleAt(g, { x: 101, y: -4 }, 500)).toBeNull()
    expect(bayOutsideAt(g, { x: 101, y: 1 }, 500)).toBeNull()
  })
})

describe('bayOutsideAt: a press outside the block in front of a bay', () => {
  it('that bay’s modules', () => {
    // 94–106 m: the front's bay 8, its modules 31–34
    expect(bayOutsideAt(g, { x: 101, y: -2 }, 5)).toMatchObject({ edge: { id: 'e1' }, modules: [31, 32, 33, 34] })
    // the first end bay: three modules
    expect(bayOutsideAt(g, { x: 4, y: -2 }, 5)).toMatchObject({ edge: { id: 'e1' }, modules: [0, 1, 2] })
    // the right wall, outside it: 96 m is 8 whole bays, no end bays
    expect(bayOutsideAt(g, { x: 203, y: 4 }, 5)).toMatchObject({ edge: { id: 'e2' }, modules: [0, 1, 2, 3] })
  })

  it('inside, too far out, past the wall’s ends: none', () => {
    expect(bayOutsideAt(g, { x: 101, y: 1 }, 5)).toBeNull()
    expect(bayOutsideAt(g, { x: 101, y: -8 }, 5)).toBeNull()
    expect(bayOutsideAt(g, { x: -3, y: -2 }, 5)).toBeNull()
  })
})

describe('elementPress: what a press does', () => {
  it('on a module: one put, or (it has one) taken away', () => {
    expect(elementPress(g, 'dock', undefined, { x: 101, y: 1 }, 2)).toMatchObject({ edge: { id: 'e1' }, modules: [33], on: false })
    expect(elementPress(g, 'door', undefined, { x: 101, y: 1 }, 2)).toMatchObject({ modules: [33], on: true })
    expect(elementPress(g, 'dock', undefined, { x: 4, y: 1 }, 2)).toMatchObject({ modules: [1], on: true })
  })

  it('outside a bay: filled, or (full) emptied; a bay with some fills', () => {
    expect(elementPress(g, 'dock', undefined, { x: 101, y: -2 }, 5)).toMatchObject({ modules: [31, 32, 33, 34], on: false })
    // the end bay (3 modules): no bay as long holds docks, so the dock rule's middle module
    expect(elementPress(g, 'dock', undefined, { x: 4, y: -2 }, 5)).toMatchObject({ modules: [1], on: true })
    // a door fills every module (the dock rule is the docks')
    expect(elementPress(g, 'door', undefined, { x: 4, y: -2 }, 5)).toMatchObject({ modules: [0, 1, 2], on: true })
    const some = generate({ ...t0, elements: t0.elements.filter((e) => e.module !== 32) })
    expect(elementPress(some, 'dock', undefined, { x: 101, y: -2 }, 5)).toMatchObject({ modules: [31, 32, 33, 34], on: true })
  })

  it('on a dock’s drawn bar (out of the face): that dock alone, not the bay; past the bar, the bay', () => {
    // the bar stands 1.5 m out of the face (y = −0.3 to −1.8) and is 3 m wide: x = 101 is the bar of module 33
    expect(elementPress(g, 'dock', undefined, { x: 101, y: -1 }, 5)).toMatchObject({ edge: { id: 'e1' }, modules: [33], on: false, bay: false })
    expect(elementPress(g, 'dock', undefined, { x: 101, y: -1.7 }, 5)).toMatchObject({ modules: [33], on: false, bay: false })
    // past the bar: the bay's
    expect(elementPress(g, 'dock', undefined, { x: 101, y: -2 }, 5)).toMatchObject({ modules: [31, 32, 33, 34], bay: true })
    // a door's band (0.6 m out) is its module's whether or not a door stands there; a dock's bar is not a door's
    expect(elementPress(g, 'door', undefined, { x: 101, y: -0.5 }, 5)).toMatchObject({ modules: [33], on: true, bay: false })
    expect(elementPress(g, 'door', undefined, { x: 101, y: -1 }, 5)).toMatchObject({ modules: [31, 32, 33, 34], on: true, bay: true })
    const doored = generate({ ...t0, elements: [...t0.elements, { id: 'd1', kind: 'door', edge: 'e1', module: 33, width: 4 }] })
    expect(elementPress(doored, 'door', undefined, { x: 101.5, y: -0.5 }, 5)).toMatchObject({ modules: [33], on: false, bay: false })
  })

  it('a dock taken away from its bar comes back with a press on the same spot, not its whole bay', () => {
    const taken = generate({ ...t0, elements: t0.elements.filter((e) => !(e.kind === 'dock' && e.edge === 'e1' && e.module === 33)) })
    expect(elementPress(taken, 'dock', undefined, { x: 101, y: -1 }, 5)).toMatchObject({ edge: { id: 'e1' }, modules: [33], on: true, bay: false })
    // past the band, the bay as before
    expect(elementPress(taken, 'dock', undefined, { x: 101, y: -2 }, 5)).toMatchObject({ modules: [31, 32, 33, 34], bay: true })
  })

  it('a pattern by its name: one of another name on the module is not it', () => {
    const marked = generate({ ...t0, elements: [...t0.elements, { id: 'p1', kind: 'pattern', name: 'Downpipe', edge: 'e1', module: 33, width: 0.3 }] })
    expect(elementPress(marked, 'pattern', 'Downpipe', { x: 101, y: 1 }, 2)).toMatchObject({ on: false })
    expect(elementPress(marked, 'pattern', 'Skylight', { x: 101, y: 1 }, 2)).toMatchObject({ on: true })
  })

  it('nowhere near a wall: none', () => {
    expect(elementPress(g, 'dock', undefined, { x: 101, y: 40 }, 2)).toBeNull()
  })
})

describe('dragModules: a drag along the wall', () => {
  it('the modules from the press to the module under the pointer, either way, held to the wall’s span', () => {
    const e1 = g.edges.find((e) => e.id === 'e1')!
    expect(dragModules(g.runs, e1, [33], 114)).toEqual([33, 34, 35, 36, 37])
    expect(dragModules(g.runs, e1, [33], 95)).toEqual([31, 32, 33])
    // from a bay: the bay and on to the pointer
    expect(dragModules(g.runs, e1, [31, 32, 33, 34], 108)).toEqual([31, 32, 33, 34, 35])
    expect(dragModules(g.runs, e1, [31, 32, 33, 34], 100)).toEqual([31, 32, 33, 34])
    expect(dragModules(g.runs, e1, [64], 500)).toEqual([64, 65])
  })
})

describe('the dock rule: a bay filled or a drag puts docks as the block’s docked bays hold them', () => {
  // the front's interior bays (3–6, 7–10…) with docks on their two middle modules alone, as the sample's blocks
  const middle = (k: number) => [1, 2].includes((k - 3) % 4)
  const paired = { ...t0, elements: t0.elements.filter((e) => e.kind !== 'dock' || e.edge !== 'e1' || middle(e.module)) }
  const gp = generate(paired)
  const e1 = gp.edges.find((e) => e.id === 'e1')!

  it('the block’s most common bay: its two middle modules', () => {
    expect(dockMask(gp)(4)).toEqual(new Set([1, 2]))
    // no bay that long docked: the middle one (odd) or two (even)
    expect(dockMask(gp)(3)).toEqual(new Set([1]))
    expect(dockMask(gp)(6)).toEqual(new Set([2, 3]))
    // a block without docks: the middle ones too
    expect(dockMask(generate({ ...t0, elements: [] }))(4)).toEqual(new Set([1, 2]))
  })

  it('a bay filled from outside: its middle two; full by the rule, emptied', () => {
    const emptyBay = generate({ ...paired, elements: paired.elements.filter((e) => !(e.kind === 'dock' && e.edge === 'e1' && e.module >= 31 && e.module <= 34)) })
    expect(elementPress(emptyBay, 'dock', undefined, { x: 101, y: -2 }, 5)).toMatchObject({ modules: [32, 33], on: true, bay: true })
    expect(elementPress(gp, 'dock', undefined, { x: 101, y: -2 }, 5)).toMatchObject({ modules: [32, 33], on: false, bay: true })
  })

  it('a drag putting docks: only the rule’s modules of the bays it passes; taking away, every module; doors, every module', () => {
    const bare = generate({ ...paired, elements: paired.elements.filter((e) => e.kind !== 'dock') })
    const e = bare.edges.find((x) => x.id === 'e1')!
    // from module 31 to 42 (bays 31–34, 35–38, 39–42)
    expect(paintModules(gp, 'dock', e1, [31], 128, true)).toEqual([32, 33, 36, 37, 40, 41])
    expect(paintModules(bare, 'dock', e, [31], 128, true)).toEqual([32, 33, 36, 37, 40, 41])
    expect(paintModules(gp, 'dock', e1, [31], 128, false)).toEqual([31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42])
    expect(paintModules(gp, 'door', e1, [31], 128, true)).toEqual([31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42])
    // one module pressed and not dragged: that one, as pressed
    expect(paintModules(gp, 'dock', e1, [31], 95, true)).toEqual([31])
  })
})

describe('courtsOf: the courts the plan draws', () => {
  it('a docked edge always (the block’s depth, else the standard), an entry its own depth, a court-only edge', () => {
    expect(courtsOf(t0, g, 40).map((c) => [c.edge.id, c.depth, c.own])).toEqual([['e1', 40, false]])
    const t = { ...t0, court: { depth: 35 }, courts: [{ edge: 'e1', depth: 30 }, { edge: 'e3' }] }
    expect(courtsOf(t, generate(t), 40).map((c) => [c.edge.id, c.depth, c.own])).toEqual([
      ['e1', 30, true],
      ['e3', 35, false],
    ])
  })
})
