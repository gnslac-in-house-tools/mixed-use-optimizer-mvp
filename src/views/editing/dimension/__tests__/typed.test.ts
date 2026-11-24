// The typed dimension's store on its own (D.1 task 4): what a typed text means for each measure, what a refusal does,
// and when a correction ends. The UI through <App /> is typedDimension.test.tsx's.
import { beforeEach, describe, expect, it } from 'vitest'
import type { Point, Project } from '../../../../model/schema.ts'
import { derive } from '../../../../engine/derive.ts'
import { actions } from '../../../../state/actions/index.ts'
import { demoProject } from '../../../../state/demo.ts'
import { emptyHistory } from '../../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../../state/store.ts'
import { useCommand } from '../../../plan/command/commandState.ts'
import { letGo } from '../../../tools/hand.ts'
import { endTyped, enterTyped, escapeTyped, eraseTyped, moveTyped, resetTyped, setTyped, startTyped, typedEnded, typeInto, useTyped, type TypedStart } from '../typed.ts'

const s = () => useApp.getState()
const m1 = (p: Project) => p.masses.find((m) => m.id === 'm1')!.footprint as Extract<Project['masses'][number]['footprint'], { kind: 'rect' }>

beforeEach(() => {
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: NO_SELECTION })
  useCommand.setState({ registration: null, angle: null, cursor: null })
  letGo()
  resetTyped()
})

/** What useDrag does on a release. */
const release = () => {
  s().commit()
  endTyped(false)
}

/** A drag of Warehouse 1 along x by `by`, as a type-aware caller would start it. */
function start(over: Partial<TypedStart> = {}) {
  s().preview((p) => actions.moveMasses(p, ['m1'], { x: 3, y: 0 }))
  startTyped({
    what: 'Move',
    name: 'Warehouse 1',
    measure: 'point',
    shown: '3 m',
    at: { x: 123, y: 110 },
    base: { x: 120, y: 110 },
    way: { x: 3, y: 0 },
    mode: 'live',
    apply: (to) => (p) => actions.moveMasses(p, ['m1'], { x: (to as Point).x - 120, y: (to as Point).y - 110 }),
    ...over,
  })
}

describe('typed during a drag', () => {
  it('a bare number goes along the drag (a point measure); the drag is over, one step', () => {
    start()
    typeInto('10')
    expect(useTyped.getState().cur?.text).toBe('10')
    expect(enterTyped()).toBe(true)
    expect(m1(s().project).center.x).toBe(130)
    expect(typedEnded()).toBe(true)
    expect(moveTyped('9 m')).toBe(false) // the pointer no longer moves it
    expect(s().history.past).toHaveLength(1)
    s().undo()
    expect(m1(s().project).center.x).toBe(120)
  })

  it('@x,y is from the base, #x,y absolute', () => {
    start()
    typeInto('@2,5')
    enterTyped()
    expect(m1(s().project).center).toMatchObject({ x: 122, y: 115 })
    setTyped('#150,140')
    enterTyped()
    expect(m1(s().project).center).toMatchObject({ x: 150, y: 140 })
    expect(s().history.past).toHaveLength(1) // one step still: corrected from before the drag
  })

  it('a text that is not understood says so and the drag goes on', () => {
    start()
    typeInto('ab')
    expect(enterTyped()).toBe(false)
    expect(useTyped.getState().cur?.error).toMatch(/\S/)
    expect(typedEnded()).toBe(false)
    expect(s().dragStart).not.toBeNull()
  })
})

describe('the measures', () => {
  it('a distance takes the sign of the drag; a negative number goes the other way', () => {
    const edit = (d: number) => (p: Project) => actions.moveMasses(p, ['m1'], { x: d, y: 0 })
    start({ measure: 'distance', way: -1, apply: (d) => edit(d as number) })
    setTyped('4')
    enterTyped()
    expect(m1(s().project).center.x).toBe(116)
    setTyped('-4')
    enterTyped()
    expect(m1(s().project).center.x).toBe(124)
  })

  it('a value is itself; an angle too', () => {
    const seen: number[] = []
    start({ measure: 'value', way: undefined, apply: (n) => (p) => (seen.push(n as number), p) })
    setTyped('35')
    enterTyped()
    expect(seen).toEqual([35])
    resetTyped()
    start({ measure: 'angle', way: undefined, apply: (n) => (p) => (seen.push(n as number), p) })
    setTyped('-30')
    enterTyped()
    expect(seen).toEqual([35, -30])
  })

  it('a number only: a pair is not a distance', () => {
    start({ measure: 'distance', way: 1 })
    setTyped('2,3')
    expect(enterTyped()).toBe(false)
    expect(useTyped.getState().cur?.error).toMatch(/\S/)
  })
})

describe('after the release', () => {
  it('kept when the project changed, forgotten when it did not or was cancelled', () => {
    start()
    release()
    expect(useTyped.getState().cur?.phase).toBe('kept')
    resetTyped()
    startTyped({ what: 'Move', name: 'x', measure: 'value', shown: '', at: { x: 0, y: 0 }, mode: 'live', apply: () => (p) => p })
    release() // nothing changed
    expect(useTyped.getState().cur).toBeNull()
    start()
    s().cancel()
    endTyped(true)
    expect(useTyped.getState().cur).toBeNull()
  })

  it('a correction is undo then the exact edit: one step; a refusal puts the drag back and says why', () => {
    start()
    release()
    setTyped('5')
    enterTyped()
    expect(m1(s().project).center.x).toBe(125)
    expect(s().history.past).toHaveLength(1)
    // a value that leaves it where it was... refused: the corrected one stays
    start({ apply: () => () => null })
    release()
    setTyped('7')
    const before = s().project
    expect(enterTyped()).toBe(false)
    expect(s().project).toBe(before)
    expect(useTyped.getState().cur?.phase).toBe('kept')
    expect(useTyped.getState().cur?.error).toMatch(/\S/)
  })

  it('Escape: the text first, then it lets go; typing and erasing', () => {
    start()
    release()
    typeInto('1')
    typeInto('2')
    eraseTyped()
    expect(useTyped.getState().cur?.text).toBe('1')
    expect(escapeTyped()).toBe(true)
    expect(useTyped.getState().cur?.text).toBe('')
    expect(escapeTyped()).toBe(true)
    expect(useTyped.getState().cur).toBeNull()
    expect(escapeTyped()).toBe(false)
  })

  it('an edit told by the edit itself: a note is kept and shown', () => {
    start({ measure: 'value', way: undefined, apply: () => (p, told) => { told.note = 'Held to 200 m'; return actions.moveMasses(p, ['m1'], { x: 1, y: 0 }) } })
    setTyped('300')
    enterTyped()
    expect(useTyped.getState().cur?.note).toBe('Held to 200 m')
  })
})

describe('review fixes (batch 2)', () => {
  const press = (k: string) => {
    const e = new KeyboardEvent('keydown', { key: k, cancelable: true, bubbles: true })
    window.dispatchEvent(e)
    return e.defaultPrevented
  }

  it('Backspace with an empty field is the correction’s, never the app’s Delete of the picked object', () => {
    start()
    release()
    expect(useTyped.getState().cur?.text).toBe('')
    expect(press('Backspace')).toBe(true)
    expect(useTyped.getState().cur).not.toBeNull()
    // with nothing standing it is the app’s
    resetTyped()
    expect(press('Backspace')).toBe(false)
  })

  it('a value typed during the drag that the project refuses says so and leaves the drag going', () => {
    const states: Array<'live' | 'ghost'> = ['live', 'ghost']
    for (const mode of states) {
      resetTyped()
      s().cancel()
      if (mode === 'live') s().preview((p) => actions.moveMasses(p, ['m1'], { x: 3, y: 0 }))
      startTyped({
        what: 'Move',
        name: 'Warehouse 1',
        measure: 'value',
        shown: '3 m',
        at: { x: 0, y: 0 },
        mode,
        apply: () => (p) => actions.moveMasses(p, ['m1'], { x: 9, y: 0 }),
        // the store's door shut: a lock, or the shape's rules, hold it
        commit: () => {},
      })
      setTyped('9')
      expect(enterTyped(), mode).toBe(false)
      expect(typedEnded(), mode).toBe(false)
      expect(useTyped.getState().cur?.phase, mode).toBe('dragging')
      expect(useTyped.getState().cur?.error, mode).toMatch(/\S/)
    }
  })

  it('a correction tells the camera it is back where it was when the new edit moves no frame', () => {
    const shifts: Array<{ x: number; y: number }> = []
    start({ shifted: (d) => shifts.push(d), apply: () => (p) => actions.moveMasses(p, ['m1'], { x: 4, y: 0 }) })
    release()
    setTyped('4')
    expect(enterTyped()).toBe(true)
    expect(shifts).toEqual([{ x: 0, y: 0 }])
  })

  it('Escape in a ghost drag that has its own pointer (useDrag) is not taken: its own Escape cancels the drag; a caller with a cancel gets it', () => {
    start({ mode: 'ghost' })
    expect(escapeTyped()).toBe(false)
    expect(useTyped.getState().cur).not.toBeNull()
    resetTyped()
    let dropped = 0
    start({ mode: 'ghost', cancel: () => dropped++ })
    expect(escapeTyped()).toBe(true)
    expect(dropped).toBe(1)
    expect(useTyped.getState().cur).toBeNull()
  })
})
