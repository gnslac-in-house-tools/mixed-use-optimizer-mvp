// Copy and paste a street (Phase PE.1 review, batch A): a street whose width changes is several runs on the plan and one street to the
// person, so Ctrl+C takes every run, and Ctrl+V draws each with its own sides (as Alt+drag does).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { derive } from '../../../engine/derive.ts'
import { demoProject } from '../../../state/demo.ts'
import { emptyHistory } from '../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../state/store.ts'
import { copyRefusal, copySelection, paste, useClipboard } from '../clipboard.ts'
import { streetIdOf, useRoads } from '../circulation/roadState.ts'

const s = () => useApp.getState()
const streetsOf = () => new Set(s().derived.circulation.roads.filter((r) => r.kind === 'street').map(streetIdOf))
const sides = () => s().project.options[0].streets!.segments.map((g) => [g.id, g.left, g.right])

beforeEach(() => {
  localStorage.clear()
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
  useClipboard.setState({ masses: [], roads: [] })
  useRoads.setState({ picked: 'street:s1', also: [] })
  vi.spyOn(console, 'info').mockImplementation(() => {})
})

describe('Copy and Paste of a widened street', () => {
  it('Copy takes every run, each with its own sides', () => {
    expect(copyRefusal()).toBeNull()
    expect(copySelection()).toBe(true)
    const { roads } = useClipboard.getState()
    expect(roads.map((r) => r.edges)).toEqual([{ left: 4, right: 4 }, { left: 4, right: 8 }, { left: 4, right: 4 }])
    expect(roads.map((r) => r.points.length)).toEqual([2, 2, 2])
  })

  it('Paste at the pointer draws the whole street, its middle wider, one more street', () => {
    copySelection()
    expect(streetsOf().size).toBe(2)
    expect(paste('pointer', { x: 300, y: 100 })).toBe(true)
    expect(streetsOf().size).toBe(3)
    const made = sides().filter(([id]) => !['s1', 's2', 's3', 's4'].includes(id as string))
    expect(made.map(([, l, r]) => [l, r])).toEqual([[4, 4], [4, 8], [4, 4]])
    // picked: the new street
    expect(useRoads.getState().picked).not.toBe('street:s1')
  })

  it('Paste in place over the street it came from draws nothing', () => {
    copySelection()
    const before = s().project
    paste('place')
    expect(s().project.options[0].streets).toEqual(before.options[0].streets)
  })
})
