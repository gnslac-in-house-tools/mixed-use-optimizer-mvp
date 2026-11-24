// The block plan's multi-selection (Decision "Multi-selection", BE.9), as the main plan's: a box dragged left → right
// is a window (what is fully inside it), right → left a crossing (what it touches); column lines by their bubble,
// docks, doors and patterns by their point on the wall, truck courts, zones and holes. Shift + click adds or removes one.
import { beforeEach, describe, expect, it } from 'vitest'
import { generate, hallRuns } from '../../engine/generate.ts'
import { holeToMetres } from '../../engine/shape.ts'
import { newWarehouseType } from '../../engine/defaults.ts'
import { bubblesOf, courtPolygons, pickedInBox } from '../blockSelect.ts'
import { useWarehouse, type Picked } from '../warehouseState.ts'

/** The new block: 200 × 96 m, column lines A–R at 0, 10, 22, 34… m; a dock on modules 3–62 of the front (e1 on module
 *  3 at x = 11.5 m, e2 at 14.5, e3 at 17.5, e4 at 20.5, e5 at 23.5), on its face at y = −0.3 m; its court 40 m deep. */
const t0 = newWarehouseType('wt1', 'Warehouse A', { program: 'warehouse' })
const g = generate(t0)
/** Bubbles 5 m out of the box. */
const bubbles = bubblesOf(g, 5)
const courts = courtPolygons(t0, g, 40)
const kinds = (ps: Picked[]) => ps.map((p) => `${p.kind}:${p.id}`).sort()

describe('pickedInBox', () => {
  it('a window (left → right): the bubbles and the docks fully inside it, not the zone or the court it crosses', () => {
    // from x 9 to 23 m, y −6 to 1 m: the front bubbles of B (10) and C (22), the docks e1–e4
    const box = { a: { x: 9, y: -6 }, b: { x: 23, y: 1 } }
    expect(kinds(pickedInBox(g, box, bubbles, courts))).toEqual(['element:e1', 'element:e2', 'element:e3', 'element:e4', 'line:x1', 'line:x2'])
  })

  it('a crossing (right → left), the same box: also the zone and the front’s court it touches', () => {
    const box = { a: { x: 23, y: 1 }, b: { x: 9, y: -6 } }
    expect(kinds(pickedInBox(g, box, bubbles, courts))).toEqual(['court:e1', 'element:e1', 'element:e2', 'element:e3', 'element:e4', 'line:x1', 'line:x2', 'zone:1'])
  })

  it('a line by either of its bubbles, once; a window round the whole block picks everything in it', () => {
    // the back bubble of B alone
    expect(kinds(pickedInBox(g, { a: { x: 9, y: 100 }, b: { x: 11, y: 102 } }, bubbles))).toEqual(['line:x1'])
    const all = pickedInBox(g, { a: { x: -300, y: -300 }, b: { x: 300, y: 300 } }, bubbles, courts)
    expect(all.filter((p) => p.kind === 'line')).toHaveLength(g.runs.x.lines.length + g.runs.y.lines.length)
    expect(all.filter((p) => p.kind === 'element')).toHaveLength(60)
    expect(kinds(all.filter((p) => p.kind === 'zone' || p.kind === 'court'))).toEqual(['court:e1', 'zone:1'])
  })

  it('a hole: fully inside a window, touched by a crossing', () => {
    // a hole of modules 10–14 × 4–8 (x 31–43 m, y 12–24 m)
    const holed = generate({ ...t0, morphology: { ...t0.morphology, holes: [holeToMetres({ id: 'h1', x: [10, 14], y: [4, 8] }, hallRuns(t0))] } })
    expect(kinds(pickedInBox(holed, { a: { x: 30, y: 11 }, b: { x: 44, y: 25 } }, [])).filter((k) => k.startsWith('hole'))).toEqual(['hole:h1'])
    expect(kinds(pickedInBox(holed, { a: { x: 35, y: 11 }, b: { x: 44, y: 25 } }, [])).filter((k) => k.startsWith('hole'))).toEqual([])
    expect(kinds(pickedInBox(holed, { a: { x: 44, y: 25 }, b: { x: 35, y: 11 } }, [])).filter((k) => k.startsWith('hole'))).toEqual(['hole:h1'])
  })
})

describe('Shift + click', () => {
  beforeEach(() => useWarehouse.setState({ picked: [] }))

  it('togglePicked adds one, again takes it away; setPicked replaces them all', () => {
    const dock: Picked = { kind: 'element', id: 'e1' }
    const line: Picked = { kind: 'line', id: 'x1', axis: 'x', line: 1 }
    useWarehouse.getState().setPicked([dock])
    useWarehouse.getState().togglePicked(line)
    expect(useWarehouse.getState().picked).toEqual([dock, line])
    useWarehouse.getState().togglePicked({ kind: 'element', id: 'e1' })
    expect(useWarehouse.getState().picked).toEqual([line])
    useWarehouse.getState().setPicked([])
    expect(useWarehouse.getState().picked).toEqual([])
  })
})
