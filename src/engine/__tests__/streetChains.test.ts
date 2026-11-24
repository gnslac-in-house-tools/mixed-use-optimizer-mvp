// The street a person picks (Phase PE.1, task 6): the segments between crossings, walked so that the earliest runs a → b.
import { describe, expect, it } from 'vitest'
import type { Id, StreetSegment, Streets } from '../../model/schema.ts'
import { streetChains, streetRoads } from '../circulation/streets.ts'

const seg = (id: Id, a: Id, b: Id, left = 4, right = 4): StreetSegment => ({ id, a, b, type: 'trucks', left, right })
const net = (nodes: Id[], segments: StreetSegment[]): Streets => ({ nodes: nodes.map((id, i) => ({ id, x: i * 10, y: 0 })), segments })
const TYPES = [{ id: 'trucks', name: 'Trucks', width: 8, radius: 0, vehicles: 'trucks' as const }]

describe('streetChains', () => {
  it('a street through a T is two chains at the T', () => {
    // n1 - n2 - n3 with a branch n2 - n4
    const s = net(['n1', 'n2', 'n3', 'n4'], [seg('s1', 'n1', 'n2'), seg('s2', 'n2', 'n3'), seg('s3', 'n2', 'n4')])
    const chains = streetChains(s)
    expect(chains.map((c) => c.id)).toEqual(['street:s1', 'street:s2', 'street:s3'])
    expect(chains.map((c) => c.nodes)).toEqual([['n1', 'n2'], ['n2', 'n3'], ['n2', 'n4']])
  })

  it('a widened stretch does not cut a chain; the chain runs through every node where only two meet', () => {
    const s = net(['n1', 'n2', 'n3', 'n4'], [seg('s1', 'n1', 'n2'), seg('s2', 'n2', 'n3', 6, 6), seg('s3', 'n3', 'n4')])
    const [c, ...rest] = streetChains(s)
    expect(rest).toEqual([])
    expect(c).toEqual({ id: 'street:s1', nodes: ['n1', 'n2', 'n3', 'n4'], segs: ['s1', 's2', 's3'], forward: [true, true, true] })
  })

  it('is walked so that its earliest segment runs a → b, whatever the order the others are drawn', () => {
    // the earliest (s1) is in the middle: s2 comes before it in the walk, drawn b → a
    const s = net(['n1', 'n2', 'n3'], [seg('s1', 'n2', 'n3'), seg('s2', 'n2', 'n1')])
    const [c] = streetChains(s)
    expect(c.id).toBe('street:s1')
    expect(c.nodes).toEqual(['n1', 'n2', 'n3'])
    expect(c.segs).toEqual(['s2', 's1'])
    expect(c.forward).toEqual([false, true])
  })

  it('a loop is one chain, closed: its first node is its last', () => {
    const s = net(['n1', 'n2', 'n3'], [seg('s1', 'n1', 'n2'), seg('s2', 'n2', 'n3'), seg('s3', 'n3', 'n1')])
    const chains = streetChains(s)
    expect(chains).toHaveLength(1)
    expect(chains[0].nodes).toEqual(['n1', 'n2', 'n3', 'n1'])
    expect(chains[0].segs).toEqual(['s1', 's2', 's3'])
  })

  it('its id is the one of the run that holds its earliest segment', () => {
    const s = net(['n1', 'n2', 'n3', 'n4'], [seg('s1', 'n1', 'n2'), seg('s2', 'n2', 'n3', 6, 6), seg('s3', 'n3', 'n4')])
    const ids = streetRoads(s, TYPES).map((r) => r.id)
    expect(ids).toContain(streetChains(s)[0].id)
    // a chain of one run keeps today's id
    const one = net(['n1', 'n2', 'n3'], [seg('s1', 'n1', 'n2'), seg('s2', 'n2', 'n3')])
    expect(streetRoads(one, TYPES).map((r) => r.id)).toEqual(streetChains(one).map((c) => c.id))
  })

  it('every segment is in one chain', () => {
    const s = net(['n1', 'n2', 'n3', 'n4', 'n5'], [seg('s1', 'n1', 'n2'), seg('s2', 'n2', 'n3'), seg('s3', 'n2', 'n4'), seg('s4', 'n4', 'n5')])
    const all = streetChains(s).flatMap((c) => c.segs).sort()
    expect(all).toEqual(['s1', 's2', 's3', 's4'])
    expect(streetChains({ nodes: [], segments: [] })).toEqual([])
  })
})

describe('DerivedRoad.street', () => {
  it('every run of a street says its street: a wider stretch makes three runs of one street', () => {
    const s = net(['n1', 'n2', 'n3', 'n4'], [seg('s1', 'n1', 'n2'), seg('s2', 'n2', 'n3', 4, 8), seg('s3', 'n3', 'n4')])
    const roads = streetRoads(s, TYPES)
    expect(roads.map((r) => r.id)).toEqual(['street:s1', 'street:s2', 'street:s3'])
    expect(roads.map((r) => r.street)).toEqual(['street:s1', 'street:s1', 'street:s1'])
  })

  it('a T-joined branch is a street of its own', () => {
    const s = net(['n1', 'n2', 'n3', 'n4'], [seg('s1', 'n1', 'n2'), seg('s2', 'n2', 'n3'), seg('s3', 'n2', 'n4')])
    expect(streetRoads(s, TYPES).map((r) => r.street)).toEqual(['street:s1', 'street:s2', 'street:s3'])
  })
})
