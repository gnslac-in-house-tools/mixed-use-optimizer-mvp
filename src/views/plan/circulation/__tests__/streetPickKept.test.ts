// A street picked stays picked when an edit renames it (Phase PE.1 review, batch A): its id is `street:<earliest segment>`, so an edit that takes
// the earliest segment away (or joins it to another) gives the street another id. The pick follows the street by a segment it still has.
import { beforeEach, describe, expect, it } from 'vitest'
import { derive } from '../../../../engine/derive.ts'
import { actions } from '../../../../state/actions/index.ts'
import { demoProject } from '../../../../state/demo.ts'
import { emptyHistory } from '../../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../../state/store.ts'
import { useRoads } from '../roadState.ts'

const s = () => useApp.getState()

beforeEach(() => {
  const p = demoProject()
  const nodes = [
    { id: 'n1', x: 60, y: 161 },
    { id: 'n2', x: 60, y: 185 },
    { id: 'n3', x: 60, y: 205 },
    { id: 'n4', x: 60, y: 230 },
    { id: 'n5', x: 120, y: 161 },
    { id: 'n6', x: 120, y: 230 },
  ]
  const g = (id: string, a: string, b: string, left = 4, right = 4) => ({ id, a, b, type: 'trucks', left, right })
  const streets = { nodes, segments: [g('s1', 'n1', 'n2'), g('s2', 'n2', 'n3', 4, 8), g('s3', 'n3', 'n4'), g('s4', 'n5', 'n6')] }
  useApp.setState({ project: { ...p, options: [{ ...p.options[0], streets }] }, history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
  useApp.setState({ derived: derive(s().project, 'o1') })
  useRoads.setState({ picked: 'street:s1', also: ['street:s4'], node: null })
})

describe('the pick follows its street', () => {
  it('the earliest segment goes: the street is picked under its new id', () => {
    s().apply((p) => actions.removeStreetSegment(p, 'o1', 's1'))
    expect(s().derived.circulation.roads.some((r) => r.street === 'street:s1')).toBe(false)
    expect(useRoads.getState().picked).toBe('street:s2')
    // the one beside it, untouched
    expect(useRoads.getState().also).toEqual(['street:s4'])
  })

  it('one picked beside it whose id changes stays picked too', () => {
    useRoads.setState({ picked: 'street:s4', also: ['street:s1'] })
    s().apply((p) => actions.removeStreetSegment(p, 'o1', 's1'))
    expect(useRoads.getState().picked).toBe('street:s4')
    expect(useRoads.getState().also).toEqual(['street:s2'])
  })

  it('a street that is gone altogether lets the pick go', () => {
    s().apply((p) => ['s1', 's2', 's3'].reduce((q, id) => actions.removeStreetSegment(q, 'o1', id), p))
    expect(useRoads.getState().picked).toBeNull()
    expect(useRoads.getState().also).toEqual([])
  })

  it('a node picked on the street does not outlive the street’s new id (review E1)', () => {
    s().apply((p) => actions.removeStreetNode(p, 'o1', 'n1'))
    expect(useRoads.getState().picked).toBe('street:s2')
    useRoads.getState().pickNode('n3')
    s().undo()
    expect(useRoads.getState().picked).toBe('street:s1')
    expect(useRoads.getState().node).toBeNull()
  })
})
