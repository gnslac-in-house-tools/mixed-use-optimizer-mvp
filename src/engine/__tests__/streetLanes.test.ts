// A street's lanes in the runs (Phase PE.2, task 2): a run is a stretch of segments that agree on their lanes too, and a derived
// road carries the lanes along its run, walked the way the run is.
import { describe, expect, it } from 'vitest'
import type { Id, Site, StreetSegment, Streets } from '../../model/schema.ts'
import { existingRoads, streetRoads } from '../circulation/streets.ts'
import { CIRCULATION_DEFAULTS, standardsOf } from '../circulation/standards.ts'

const seg = (id: Id, a: Id, b: Id, left: number, right: number, lanes?: number[]): StreetSegment => ({ id, a, b, type: 'trucks', left, right, ...(lanes ? { lanes } : {}) })
const net = (nodes: Id[], segments: StreetSegment[]): Streets => ({ nodes: nodes.map((id, i) => ({ id, x: i * 50, y: 0 })), segments })
const TYPES = [{ id: 'trucks', name: 'Trucks', width: 7, radius: 0, vehicles: 'trucks' as const }]

describe('Standards.laneWidth', () => {
  it('is 3.5 m unless the project says otherwise, and an option’s own over it', () => {
    expect(CIRCULATION_DEFAULTS.laneWidth).toBe(3.5)
    expect(standardsOf({}).laneWidth).toBe(3.5)
    expect(standardsOf({ standards: { laneWidth: 3 } }).laneWidth).toBe(3)
  })
})

describe('streetRoads: lanes in the runs', () => {
  it('a stored [3.5, 3.5] segment beside an unstored 7 m one is one run', () => {
    const roads = streetRoads(net(['n1', 'n2', 'n3'], [seg('s1', 'n1', 'n2', 0, 7, [3.5, 3.5]), seg('s2', 'n2', 'n3', 0, 7)]), TYPES)
    expect(roads).toHaveLength(1)
    expect(roads[0].segments).toEqual(['s1', 's2'])
    expect(roads[0].lanes).toEqual([3.5, 3.5])
  })

  it('[3, 4] beside [4, 3] are two runs; the same lanes are one', () => {
    const a = streetRoads(net(['n1', 'n2', 'n3'], [seg('s1', 'n1', 'n2', 0, 7, [3, 4]), seg('s2', 'n2', 'n3', 0, 7, [4, 3])]), TYPES)
    expect(a.map((r) => r.lanes)).toEqual([[3, 4], [4, 3]])
    const b = streetRoads(net(['n1', 'n2', 'n3'], [seg('s1', 'n1', 'n2', 0, 7, [3, 4]), seg('s2', 'n2', 'n3', 0, 7, [3, 4])]), TYPES)
    expect(b).toHaveLength(1)
  })

  it('lanes that differ by a hair (under a millimetre) are one run', () => {
    const roads = streetRoads(net(['n1', 'n2', 'n3'], [seg('s1', 'n1', 'n2', 0, 7, [3.5, 3.5]), seg('s2', 'n2', 'n3', 0, 7, [3.5004, 3.4996])]), TYPES)
    expect(roads).toHaveLength(1)
  })

  it('an unstored street shows equal lanes from its width: 7 m is two of 3.5, 3 m is one, 10.5 m three', () => {
    const lanes = (w: number) => streetRoads(net(['n1', 'n2'], [seg('s1', 'n1', 'n2', 0, w)]), TYPES)[0].lanes
    expect(lanes(7)).toEqual([3.5, 3.5])
    expect(lanes(3)).toEqual([3])
    expect(lanes(10.5)).toEqual(Array(3).fill(3.5))
  })

  it('the lanes of a segment stored b → a run reversed along the run (left to right walking it)', () => {
    // s2 is stored n3 → n2: walking n1 → n3 its lanes read the other way round
    const roads = streetRoads(net(['n1', 'n2', 'n3'], [seg('s1', 'n1', 'n2', 0, 7, [3, 4]), seg('s2', 'n3', 'n2', 7, 0, [4, 3])]), TYPES)
    expect(roads).toHaveLength(1)
    expect(roads[0].lanes).toEqual([3, 4])
    expect(roads[0].forward).toEqual([true, false])
  })

  it('a run that begins on a segment stored the other way (its earliest segment is in the middle) reads that one’s sides and lanes turned', () => {
    // s1 (n2 → n3) is the earliest; s2 runs n2 → n1, so the run n1 → n2 → n3 begins on s2 turned
    const roads = streetRoads(net(['n1', 'n2', 'n3'], [seg('s1', 'n2', 'n3', 0, 7, [3, 4]), seg('s2', 'n2', 'n1', 7, 0, [4, 3])]), TYPES)
    expect(roads).toHaveLength(1)
    expect(roads[0].forward).toEqual([false, true])
    expect([roads[0].left, roads[0].right]).toEqual([0, 7])
    expect(roads[0].lanes).toEqual([3, 4])
  })

  it('the standard’s lane width sets the count of an unstored street', () => {
    const net1 = net(['n1', 'n2'], [seg('s1', 'n1', 'n2', 0, 7)])
    expect(streetRoads(net1, TYPES, 3)[0].lanes).toEqual([3.5, 3.5])
    expect(streetRoads(net1, TYPES, 2.4)[0].lanes).toHaveLength(3)
  })

  it('the lanes always add up to the width', () => {
    const roads = streetRoads(net(['n1', 'n2', 'n3'], [seg('s1', 'n1', 'n2', 3, 7.25, [3, 3.5, 3.75]), seg('s2', 'n2', 'n3', 2, 2)]), TYPES)
    for (const r of roads) expect(r.lanes!.reduce((a, b) => a + b, 0)).toBeCloseTo(r.width, 9)
  })
})

describe('existingRoads: lanes in the runs', () => {
  const site = (stretches: { left: number; right: number; lanes?: number[] }[]): Pick<Site, 'existingRoads'> => ({
    existingRoads: [{ id: 'e1', points: stretches.map((_, i) => ({ x: i * 50, y: 0 })).concat([{ x: stretches.length * 50, y: 0 }]), stretches }],
  })

  it('stretches of equal sides and equal lanes are one run; other lanes are another', () => {
    const roads = existingRoads(site([{ left: 0, right: 7, lanes: [3.5, 3.5] }, { left: 0, right: 7 }, { left: 0, right: 7, lanes: [2, 5] }]))
    expect(roads.map((r) => r.lanes)).toEqual([[3.5, 3.5], [2, 5]])
    expect(roads.map((r) => r.id)).toEqual(['existing:e1', 'existing:e1:3'])
  })

  it('an unstored stretch shows equal lanes from its width and the standard', () => {
    expect(existingRoads(site([{ left: 5.25, right: 5.25 }]))[0].lanes).toEqual([3.5, 3.5, 3.5])
    expect(existingRoads(site([{ left: 5.25, right: 5.25 }]), 5.25)[0].lanes).toEqual([5.25, 5.25])
  })
})
