// A street's lanes in the verbs (Phase PE.2, task 2): `editPath`'s lane ops write `lanes` on a street's segments (turned back for one
// stored b → a) and on an existing road's stretches, in one option; the street verbs that change a width, a hand or a segment keep them whole.
import { describe, expect, it } from 'vitest'
import { ProjectSchema, type Id, type Project, type StreetSegment, type Streets } from '../../../model/schema.ts'
import { demoProject } from '../../demo.ts'
import { addExistingRoad } from '../circulation.ts'
import { NOTHING_PICKED } from '../../../model/picked.ts'
import { editPath } from '../path.ts'
import { copyPicked, mirrorPicked } from '../selection.ts'
import { mirrorStreetNodes, removeStreetNode, setStreetEdges, setStreetSegmentWidth, splitStreetSegment } from '../streets.ts'

const o1 = 'o1'
const seg = (id: Id, a: Id, b: Id, left: number, right: number, more: Partial<StreetSegment> = {}): StreetSegment => ({ id, a, b, type: 'trucks', left, right, ...more })
const nodes = (...ns: [Id, number, number][]) => ns.map(([id, x, y]) => ({ id, x, y }))
const put = (streets: Streets, p: Project = demoProject({ streets: false })): Project => ({ ...p, options: p.options.map((o) => (o.id === o1 ? { ...o, streets } : o)) })
const streetsOf = (p: Project, option = o1): Streets => p.options.find((o) => o.id === option)!.streets ?? { nodes: [], segments: [] }
const segOf = (p: Project, id: Id, option = o1) => streetsOf(p, option).segments.find((g) => g.id === id)!
const ref = (segId: Id) => ({ kind: 'street', id: `street:${segId}` })
const valid = (p: Project) => expect(ProjectSchema.safeParse(p).success).toBe(true)

/** A 100 m street of two stretches: s1 (0 + 7, lanes stored [3.5, 3.5]) and s2 stored n3 → n2 (left 7, right 0: walking, 0 + 7). */
function line(): Project {
  return put({ nodes: nodes(['n1', 0, 0], ['n2', 50, 0], ['n3', 100, 0]), segments: [seg('s1', 'n1', 'n2', 0, 7), seg('s2', 'n3', 'n2', 7, 0)] })
}

describe('editPath: lanes on a street', () => {
  it('`lanes` +1 stores the lanes and the new width on the segment, one more lane of the standard’s width', () => {
    const r = editPath(line(), ref('s1'), { op: 'lanes', k: 0, by: 1 }, o1)
    expect(r.reason).toBeUndefined()
    expect(segOf(r.project, 's1')).toMatchObject({ left: 0, right: 10.5, lanes: [3.5, 3.5, 3.5] })
    // the other stretch is left as it was
    expect(segOf(r.project, 's2')).toEqual(segOf(line(), 's2'))
    valid(r.project)
  })

  it('`lanes` takes the standard’s lane width when the op gives none', () => {
    const base = put({ nodes: nodes(['n1', 0, 0], ['n2', 50, 0]), segments: [seg('s1', 'n1', 'n2', 0, 7)] })
    const three = { ...base, standards: { ...base.standards, laneWidth: 3 } }
    expect(segOf(editPath(three, ref('s1'), { op: 'lanes', k: 0, by: 1 }, o1).project, 's1')).toMatchObject({ right: 10, lanes: [3.5, 3.5, 3] })
    // an op that says its own width keeps it
    expect(segOf(editPath(three, ref('s1'), { op: 'lanes', k: 0, by: 1, laneWidth: 4 }, o1).project, 's1')).toMatchObject({ right: 11, lanes: [3.5, 3.5, 4] })
  })

  it('an unstored street shows its lanes from the standard’s width: with 2.4 m a 7 m street has three, and taking one leaves two', () => {
    const base = put({ nodes: nodes(['n1', 0, 0], ['n2', 50, 0]), segments: [seg('s1', 'n1', 'n2', 0, 7)] })
    const narrow = { ...base, standards: { ...base.standards, laneWidth: 2.4 } }
    // 7 m is round(7 / 2.4) = 3 lanes of 2.33: taking one leaves two lanes of 2.33
    const r = editPath(narrow, ref('s1'), { op: 'lanes', k: 0, by: -1 }, o1)
    expect(segOf(r.project, 's1').lanes).toHaveLength(2)
    expect(segOf(r.project, 's1').left + segOf(r.project, 's1').right).toBeCloseTo(7 - 7 / 3, 9)
  })

  it('a segment stored b → a gets its lanes stored reversed: the walked lanes turned back', () => {
    // walking the chain, stretch 1 is s2 turned: {left 0, right 7}, lanes [3.5, 3.5]; `lane-widths` [3, 4] is walked
    const r = editPath(line(), ref('s1'), { op: 'lane-widths', k: 1, widths: [3, 4] }, o1)
    expect(r.reason).toBeUndefined()
    expect(segOf(r.project, 's2')).toMatchObject({ left: 7, right: 0, lanes: [4, 3] })
    expect(segOf(r.project, 's1').lanes).toBeUndefined()
    valid(r.project)
    // a lane more on the far side from the drawn line: walked, the right (7 > 0 on the right), so stored on s2's left
    const more = editPath(line(), ref('s1'), { op: 'lanes', k: 1, by: 1 }, o1)
    expect(segOf(more.project, 's2')).toMatchObject({ left: 10.5, right: 0, lanes: [3.5, 3.5, 3.5] })
    valid(more.project)
  })

  it('`lanes` on every stretch changes each one and stores them all', () => {
    const r = editPath(line(), ref('s1'), { op: 'lanes', k: 'all', by: 1 }, o1)
    expect(segOf(r.project, 's1')).toMatchObject({ right: 10.5, lanes: [3.5, 3.5, 3.5] })
    expect(segOf(r.project, 's2')).toMatchObject({ left: 10.5, lanes: [3.5, 3.5, 3.5] })
  })

  it('the other lane ops write their lanes: a line dragged, a lane typed, equal lanes, every lane given', () => {
    const three = editPath(line(), ref('s1'), { op: 'lanes', k: 0, by: 1 }, o1).project
    expect(segOf(editPath(three, ref('s1'), { op: 'line', k: 0, line: 0, by: 1 }, o1).project, 's1').lanes).toEqual([4.5, 2.5, 3.5])
    expect(segOf(editPath(three, ref('s1'), { op: 'lane', k: 0, line: 0, side: 'right', to: 3 }, o1).project, 's1').lanes).toEqual([4, 3, 3.5])
    expect(segOf(editPath(three, ref('s1'), { op: 'equal-lanes', k: 0, n: 2 }, o1).project, 's1')).toMatchObject({ right: 10.5, lanes: [5.25, 5.25] })
    expect(segOf(editPath(three, ref('s1'), { op: 'lane-widths', k: 0, widths: [3, 7.5] }, o1).project, 's1').lanes).toEqual([3, 7.5])
  })

  it('a side pulled keeps the stored lanes whole (the edge lane takes the change), and leaves unstored ones unstored', () => {
    const three = editPath(line(), ref('s1'), { op: 'lanes', k: 0, by: 1 }, o1).project
    const out = editPath(three, ref('s1'), { op: 'side', k: 0, side: 'right', by: 1 }, o1)
    expect(segOf(out.project, 's1')).toMatchObject({ right: 11.5, lanes: [3.5, 3.5, 4.5] })
    valid(out.project)
    const bare = editPath(line(), ref('s1'), { op: 'side', k: 0, side: 'right', by: 1 }, o1)
    expect('lanes' in segOf(bare.project, 's1')).toBe(false)
    expect('lanes' in segOf(bare.project, 's2')).toBe(false)
  })

  it('a lane op that touches a locked stretch is refused, the same project', () => {
    const p = put({ nodes: nodes(['n1', 0, 0], ['n2', 50, 0]), segments: [seg('s1', 'n1', 'n2', 0, 7, { locked: true })] })
    const r = editPath(p, ref('s1'), { op: 'lanes', k: 0, by: 1 }, o1)
    expect(r.project).toBe(p)
    expect(r.reason).toBe('That stretch is locked')
  })

  it('what the engine refuses is refused with its reason and no change', () => {
    const one = put({ nodes: nodes(['n1', 0, 0], ['n2', 50, 0]), segments: [seg('s1', 'n1', 'n2', 0, 3.5)] })
    const gone = editPath(one, ref('s1'), { op: 'lanes', k: 0, by: -1 }, o1)
    expect(gone.project).toBe(one)
    expect(gone.reason).toBe('A street has one lane at least')
  })

  it('an edit in option 2 leaves option 1’s segment of the same id as it was (Review Focus 4)', () => {
    const base = line()
    const streets = streetsOf(base)
    const p: Project = { ...base, options: [...base.options, { id: 'o2', name: 'Option 2', buildingIds: [], streets }] }
    const r = editPath(p, ref('s1'), { op: 'lanes', k: 'all', by: 1 }, 'o2')
    expect(streetsOf(r.project, o1)).toBe(streets)
    expect(segOf(r.project, 's1', 'o2').lanes).toEqual([3.5, 3.5, 3.5])
  })

  it('`equal` keeps the lanes of each stretch; a node that goes between other lanes stores none (review R4); a split keeps the lanes on both halves, in arrays of their own', () => {
    const three = editPath(line(), ref('s1'), { op: 'lanes', k: 0, by: 1 }, o1).project
    const eq = editPath(three, ref('s1'), { op: 'equal' }, o1)
    expect(segOf(eq.project, 's1')).toMatchObject({ left: 5.25, right: 5.25, lanes: [3.5, 3.5, 3.5] })
    valid(eq.project)
    const rem = editPath(three, ref('s1'), { op: 'remove', i: 1 }, o1)
    expect(streetsOf(rem.project).segments).toHaveLength(1)
    // s2 stores no lanes: the two are not one street's, the merged segment keeps the first's sides and none stored (its lanes are the standard's at 10.5 m: the same three)
    expect(streetsOf(rem.project).segments[0]).toMatchObject({ id: 's1', right: 10.5 })
    expect('lanes' in streetsOf(rem.project).segments[0]).toBe(false)
    valid(rem.project)
    const ins = editPath(three, ref('s1'), { op: 'insert', k: 0, at: { x: 20, y: 0 } }, o1)
    const halves = streetsOf(ins.project).segments.filter((g) => g.id === 's1' || g.a !== 'n3')
    const lanesOfHalves = halves.map((g) => g.lanes)
    expect(lanesOfHalves).toEqual([[3.5, 3.5, 3.5], [3.5, 3.5, 3.5]])
    expect(lanesOfHalves[0]).not.toBe(lanesOfHalves[1])
    valid(ins.project)
  })
})

describe('the street verbs and the lanes', () => {
  const stored = (): Project => put({ nodes: nodes(['n1', 0, 0], ['n2', 50, 0]), segments: [seg('s1', 'n1', 'n2', 0, 10.5, { lanes: [3, 3.5, 4] })] })

  it('setStreetSegmentWidth scales the stored lanes to the new width: 14 m on [3, 3.5, 4]', () => {
    const p = setStreetSegmentWidth(stored(), o1, ['s1'], 14)
    const g = segOf(p, 's1')
    expect(g.left + g.right).toBeCloseTo(14, 9)
    expect(g.lanes!.reduce((a, b) => a + b, 0)).toBeCloseTo(14, 9)
    expect(g.lanes![0] / g.lanes![2]).toBeCloseTo(3 / 4, 9)
    valid(p)
  })

  it('setStreetEdges scales them too; with a segment’s sum unchanged they stay as they are', () => {
    const p = setStreetEdges(stored(), o1, { s1: { left: 3, right: 4.5 } })
    const g = segOf(p, 's1')
    expect(g.lanes!.reduce((a, b) => a + b, 0)).toBeCloseTo(7.5, 9)
    valid(p)
    const same = setStreetEdges(stored(), o1, { s1: { left: 5.25, right: 5.25 } })
    expect(segOf(same, 's1').lanes).toEqual([3, 3.5, 4])
  })

  it('a street without lanes stays without them', () => {
    const p = setStreetSegmentWidth(put({ nodes: nodes(['n1', 0, 0], ['n2', 50, 0]), segments: [seg('s1', 'n1', 'n2', 0, 7)] }), o1, ['s1'], 9)
    expect('lanes' in segOf(p, 's1')).toBe(false)
  })

  it('mirrorStreetNodes reverses the lanes of a segment mirrored whole, and leaves absent ones absent', () => {
    const p = put({
      nodes: nodes(['n1', 0, 0], ['n2', 50, 0], ['n3', 100, 0]),
      segments: [seg('s1', 'n1', 'n2', 0, 10.5, { lanes: [3, 3.5, 4] }), seg('s2', 'n2', 'n3', 0, 7)],
    })
    const m = mirrorStreetNodes(p, o1, ['n1', 'n2', 'n3'], { x: 0, y: 0 }, { x: 1, y: 0 })
    expect(segOf(m, 's1')).toMatchObject({ left: 10.5, right: 0, lanes: [4, 3.5, 3] })
    expect('lanes' in segOf(m, 's2')).toBe(false)
    valid(m)
  })

  it('splitting a segment keeps its lanes on both halves; removing the node between two keeps the first’s lanes', () => {
    const r = splitStreetSegment(stored(), o1, 's1', { x: 20, y: 0 })!
    const halves = streetsOf(r.project).segments
    expect(halves.map((g) => g.lanes)).toEqual([[3, 3.5, 4], [3, 3.5, 4]])
    expect(halves[0].lanes).not.toBe(halves[1].lanes)
    const back = removeStreetNode(r.project, o1, r.id)
    expect(streetsOf(back).segments).toHaveLength(1)
    expect(streetsOf(back).segments[0].lanes).toEqual([3, 3.5, 4])
  })

  it('a node removed along a street whose walk-first segment is stored the other way keeps that segment’s lanes in its own hand', () => {
    // s1 is stored n2 → n1, so the street runs n3 → n2 → n1 and its walk-first is s2 (n2 → n3, lanes [2, 5] in that hand)
    const p = put({
      nodes: nodes(['n1', 0, 0], ['n2', 50, 0], ['n3', 100, 0]),
      segments: [seg('s1', 'n2', 'n1', 5, 2, { lanes: [5, 2] }), seg('s2', 'n2', 'n3', 2, 5, { lanes: [2, 5] })],
    })
    const r = editPath(p, ref('s1'), { op: 'remove', i: 1 }, o1)
    expect(r.reason).toBeUndefined()
    expect(streetsOf(r.project).segments).toHaveLength(1)
    expect(streetsOf(r.project).segments[0]).toMatchObject({ id: 's1', left: 2, right: 5, lanes: [2, 5] })
    valid(r.project)
  })

  it('removing a node between a stored segment and one walked the other way keeps the walk-first’s lanes in its own hand', () => {
    // walking n1 → n2 → n3: s2 is stored n3 → n2 (its lanes [4, 3] read [3, 4] along the walk); s1 comes first
    const p = put({
      nodes: nodes(['n1', 0, 0], ['n2', 50, 0], ['n3', 100, 0]),
      segments: [seg('s1', 'n1', 'n2', 0, 7, { lanes: [3, 4] }), seg('s2', 'n3', 'n2', 7, 0, { lanes: [4, 3] })],
    })
    const r = removeStreetNode(p, o1, 'n2')
    expect(streetsOf(r).segments).toHaveLength(1)
    expect(streetsOf(r).segments[0]).toMatchObject({ id: 's1', a: 'n1', b: 'n3', left: 0, right: 7, lanes: [3, 4] })
    valid(r)
  })
})

describe('copying and removing nodes keep or drop the stored lanes (review E6, E7)', () => {
  const stored = () => put({ nodes: nodes(['n1', 0, 0], ['n2', 50, 0]), segments: [seg('s1', 'n1', 'n2', 0, 7, { lanes: [3, 4] })] })

  it('Copy and Mirror keeping the originals draw the street again with its lanes (a mirror image reads them from the other hand)', () => {
    const p = stored()
    const copied = copyPicked(p, o1, { ...NOTHING_PICKED, nodes: ['n1', 'n2'] }, { x: 0, y: 40 })
    const copy = streetsOf(copied.project).segments.find((g) => g.id !== 's1')!
    expect(copy).toMatchObject({ left: 0, right: 7, lanes: [3, 4] })
    const mirrored = mirrorPicked(p, o1, { ...NOTHING_PICKED, nodes: ['n1', 'n2'] }, { x: 0, y: 40 }, { x: 1, y: 40 }, true)
    const image = streetsOf(mirrored.project).segments.find((g) => g.id !== 's1')!
    expect(image).toMatchObject({ left: 7, right: 0, lanes: [4, 3] })
    valid(copied.project)
    valid(mirrored.project)
  })

  it('a street with no stored lanes is copied with none', () => {
    const p = put({ nodes: nodes(['n1', 0, 0], ['n2', 50, 0]), segments: [seg('s1', 'n1', 'n2', 0, 7)] })
    const copy = streetsOf(copyPicked(p, o1, { ...NOTHING_PICKED, nodes: ['n1', 'n2'] }, { x: 0, y: 40 }).project).segments.find((g) => g.id !== 's1')!
    expect('lanes' in copy).toBe(false)
  })

  it('removing the node between two segments of the same sides but other lanes merges them and drops the lanes (they are not one street’s); the same lanes stay', () => {
    const two = (second: number[] | undefined) =>
      put({ nodes: nodes(['n1', 0, 0], ['n2', 50, 0], ['n3', 100, 0]), segments: [seg('s1', 'n1', 'n2', 0, 7, { lanes: [3, 4] }), seg('s2', 'n2', 'n3', 0, 7, second ? { lanes: second } : {})] })
    const other = removeStreetNode(two([3.5, 3.5]), o1, 'n2')
    expect(streetsOf(other).segments).toHaveLength(1)
    expect('lanes' in streetsOf(other).segments[0]).toBe(false)
    expect('lanes' in streetsOf(removeStreetNode(two(undefined), o1, 'n2')).segments[0]).toBe(false)
    expect(streetsOf(removeStreetNode(two([3, 4]), o1, 'n2')).segments[0].lanes).toEqual([3, 4])
    // the second stored the other way round reads the same along the walk
    const turned = put({ nodes: nodes(['n1', 0, 0], ['n2', 50, 0], ['n3', 100, 0]), segments: [seg('s1', 'n1', 'n2', 0, 7, { lanes: [3, 4] }), seg('s2', 'n3', 'n2', 7, 0, { lanes: [4, 3] })] })
    expect(streetsOf(removeStreetNode(turned, o1, 'n2')).segments[0].lanes).toEqual([3, 4])
  })
})

describe('the path engine’s remove takes the same care of lanes as removeStreetNode (review R4)', () => {
  it('Delete on a node between two segments of other lanes merges them with none stored; the same lanes stay', () => {
    const two = (second: number[] | undefined) =>
      put({ nodes: nodes(['n1', 0, 0], ['n2', 50, 0], ['n3', 100, 0]), segments: [seg('s1', 'n1', 'n2', 0, 7, { lanes: [3, 4] }), seg('s2', 'n2', 'n3', 0, 7, second ? { lanes: second } : {})] })
    const gone = (p: Project) => streetsOf(editPath(p, ref('s1'), { op: 'remove', i: 1 }, o1).project).segments
    expect(gone(two([3.5, 3.5]))).toHaveLength(1)
    expect('lanes' in gone(two([3.5, 3.5]))[0]).toBe(false)
    expect('lanes' in gone(two(undefined))[0]).toBe(false)
    expect(gone(two([3, 4]))[0].lanes).toEqual([3, 4])
  })
})

describe('editPath: lanes on an existing street', () => {
  const road = () => {
    const r = addExistingRoad(demoProject({ streets: false }), [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }], 7)!
    return { p: r.project, ref: { kind: 'existing-road', id: r.id } }
  }
  const stretchesOf = (p: Project, id: Id) => p.site.existingRoads!.find((x) => x.id === id)!.stretches

  it('a lane op stores the lanes on the stretch it names, and no other', () => {
    const { p, ref: r } = road()
    const out = editPath(p, r, { op: 'lanes', k: 1, by: 1 }, o1)
    expect(out.reason).toBeUndefined()
    const s = stretchesOf(out.project, r.id)
    expect(s[0]).toEqual({ left: 3.5, right: 3.5 })
    // a centred stretch takes half the lane each side
    expect(s[1]).toMatchObject({ left: 5.25, right: 5.25, lanes: [3.5, 3.5, 3.5] })
    valid(out.project)
  })

  it('every stretch by `all`, a line dragged, the lanes given', () => {
    const { p, ref: r } = road()
    const all = editPath(p, r, { op: 'lanes', k: 'all', by: 1 }, o1).project
    expect(stretchesOf(all, r.id).map((s) => s.lanes)).toEqual([[3.5, 3.5, 3.5], [3.5, 3.5, 3.5]])
    const line = editPath(all, r, { op: 'line', k: 0, line: 1, by: -1 }, o1).project
    expect(stretchesOf(line, r.id)[0].lanes).toEqual([3.5, 2.5, 4.5])
    const given = editPath(p, r, { op: 'lane-widths', k: 0, widths: [2, 5] }, o1).project
    expect(stretchesOf(given, r.id)[0].lanes).toEqual([2, 5])
    valid(given)
  })

  it('a side pulled keeps the lanes whole; a node dropped on its neighbour drops its stretch with its lanes', () => {
    const { p, ref: r } = road()
    const all = editPath(p, r, { op: 'lanes', k: 'all', by: 1 }, o1).project
    const pulled = editPath(all, r, { op: 'side', k: 0, side: 'right', by: 1 }, o1).project
    expect(stretchesOf(pulled, r.id)[0].lanes).toEqual([3.5, 3.5, 4.5])
    valid(pulled)
    const dropped = editPath(all, r, { op: 'node', i: 1, to: { x: 100, y: 0.01 } }, o1).project
    expect(stretchesOf(dropped, r.id)).toHaveLength(1)
    valid(dropped)
  })
})
