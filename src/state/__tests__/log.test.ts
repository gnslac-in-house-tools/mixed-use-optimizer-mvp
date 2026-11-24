// The decision log (Decision "Decision log"): the store writes one entry per committed change (an edit, a drag, an undo,
// a redo), with who decided it, and never undoes it.
import { beforeEach, describe, expect, it } from 'vitest'
import { readGft, writeGft } from '../../io/gft.ts'
import { actions } from '../actions/index.ts'
import { useAuthor } from '../author.ts'
import { demoProject } from '../demo.ts'
import { describe as words, verbWords } from '../log.ts'
import { createAppStore } from '../store.ts'

beforeEach(() => {
  localStorage.clear()
  useAuthor.setState({ name: '' })
})

const last = (s: ReturnType<typeof createAppStore>) => s.getState().project.log!.at(-1)!

describe('an edit', () => {
  it('adds one entry: when, who, the verb, what it touched, the option and its Issues before → after', () => {
    const s = createAppStore(demoProject())
    const issues = s.getState().derived.issues.length
    const t0 = Date.now()
    s.getState().apply((p) => actions.moveMass(p, 'm1', { x: 5, y: 0 }))
    const e = last(s)
    expect(s.getState().project.log).toHaveLength(1)
    expect(e).toMatchObject({ author: 'Designer', by: 'designer', verb: 'moveMass', what: 'Move mass: Warehouse 1', option: s.getState().option })
    expect(e.at).toBeGreaterThanOrEqual(t0)
    expect(e.issues).toEqual([issues, s.getState().derived.issues.length])
  })

  it('names the author set in this browser', () => {
    useAuthor.getState().setName('  Ana ')
    expect(localStorage.getItem('gfit.author')).toBe('Ana')
    const s = createAppStore(demoProject())
    s.getState().apply((p) => actions.removeMass(p, 'm2'))
    expect(last(s).author).toBe('Ana')
  })

  it('▶ Solve decided what its verbs change; a caller may say who did (a plugin, an agent)', () => {
    const s = createAppStore(demoProject())
    const { option, level } = s.getState()
    s.getState().apply((p) => actions.solve(p, option, level).project)
    expect(last(s)).toMatchObject({ by: 'solve', verb: 'solve' })
    s.getState().apply((p) => actions.moveMass(p, 'm1', { x: 1, y: 0 }), 'optimizer')
    expect(last(s)).toMatchObject({ by: 'optimizer', verb: 'moveMass' })
  })

  it('nothing changed, nothing logged; an edit not made of actions still is, as an Edit', () => {
    const s = createAppStore(demoProject())
    s.getState().apply((p) => actions.moveMass(p, 'm1', { x: 0, y: 0 }))
    expect(s.getState().project.log).toBeUndefined()
    s.getState().apply((p) => ({ ...p, name: 'Other' }))
    expect(last(s)).toMatchObject({ verb: '', what: 'Edit: project name' })
  })
})

describe('a drag', () => {
  it('is one entry, at its commit, with the verb of its previews; cancelled, none', () => {
    const s = createAppStore(demoProject())
    s.getState().preview((p) => actions.moveMass(p, 'm1', { x: 2, y: 0 }))
    s.getState().preview((p) => actions.moveMass(p, 'm1', { x: 4, y: 0 }))
    expect(s.getState().project.log).toBeUndefined()
    s.getState().commit()
    expect(s.getState().project.log).toHaveLength(1)
    expect(last(s)).toMatchObject({ verb: 'moveMass', what: 'Move mass: Warehouse 1', by: 'designer' })
    s.getState().preview((p) => actions.moveMass(p, 'm1', { x: 9, y: 0 }))
    s.getState().cancel()
    expect(s.getState().project.log).toHaveLength(1)
  })
})

describe('undo and redo', () => {
  it('are entries of their own, naming the change; the log is never undone', () => {
    const s = createAppStore(demoProject())
    s.getState().apply((p) => actions.removeMass(p, 'm2'))
    const removed = last(s).what
    s.getState().undo()
    expect(s.getState().project.masses.some((m) => m.id === 'm2')).toBe(true)
    expect(s.getState().project.log!.map((e) => e.verb)).toEqual(['removeMass', 'undo'])
    expect(last(s)).toMatchObject({ by: 'designer', what: `Undid: ${removed}` })
    s.getState().redo()
    expect(s.getState().project.masses.some((m) => m.id === 'm2')).toBe(false)
    expect(last(s)).toMatchObject({ verb: 'redo', what: `Redid: ${removed}` })
    // and again: undo knows what the redone project was made by
    s.getState().undo()
    expect(last(s).what).toBe(`Undid: ${removed}`)
    expect(s.getState().project.log).toHaveLength(4)
  })
})

describe('the log', () => {
  it('travels in the .gft', () => {
    const s = createAppStore(demoProject())
    s.getState().apply((p) => actions.moveMass(p, 'm1', { x: 5, y: 0 }))
    const r = readGft(writeGft(s.getState().project))
    expect(r.ok && r.project.log).toEqual(s.getState().project.log)
  })

  it('says a verb in words, and up to three of what it touched', () => {
    expect(verbWords('moveMass')).toBe('Move mass')
    expect(verbWords('setRingRoad')).toBe('Set ring road')
    expect(verbWords('')).toBe('Edit')
    const p = demoProject()
    const q = p.masses.reduce((r, m) => actions.moveMass(r, m.id, { x: 1, y: 0 }), p)
    expect(words('moveMass', p, q)).toMatch(/^Move mass: Warehouse 1(, [^,]+){0,2}( \+\d+)?$/)
    const many = { ...p, masses: [...p.masses, ...[1, 2].flatMap((n) => p.masses.map((m) => ({ ...m, id: `${m.id}x${n}`, name: `${m.name} copy ${n}` })))] }
    expect(words('addMass', p, many)).toMatch(/^Add mass: [^,]+, [^,]+, [^,]+ \+\d+$/)
  })
})
