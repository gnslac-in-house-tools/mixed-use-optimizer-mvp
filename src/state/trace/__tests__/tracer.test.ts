import { afterEach, describe, expect, it } from 'vitest'
import { actions } from '../../actions/index.ts'
import { demoProject } from '../../demo.ts'
import { createAppStore } from '../../store.ts'
import { subscribe } from '../bus.ts'
import { originOf, snapshot, type TraceEvent } from '../tracer.ts'

let events: TraceEvent[] = []
let off = subscribe((e) => events.push(e))
afterEach(() => {
  off()
  events = []
  off = subscribe((e) => events.push(e))
})

const names = (e: TraceEvent) => e.calls.map((c) => `${c.module}.${c.name}`)

describe('originOf', () => {
  it('skips the store and the tracer; reads browser URLs and file paths', () => {
    const browser = [
      'Error',
      '    at traced (http://localhost:5173/src/state/trace/tracer.ts?t=1:90:20)',
      '    at apply (http://localhost:5173/src/state/store.ts:70:9)',
      '    at http://localhost:5173/node_modules/.vite/deps/react-dom.js:9:9',
      '    at onClick (http://localhost:5173/src/views/panels/ParametersPanel.tsx?t=5:110:40)',
    ].join('\n')
    expect(originOf(browser)).toBe('views/panels/ParametersPanel.tsx')
    expect(originOf('Error\n    at handleKey (C:/repo/src/views/useShortcuts.ts:25:9)')).toBe('views/useShortcuts.ts')
    expect(originOf(undefined)).toBe(null)
  })
})

describe('store tracer (dev)', () => {
  it('apply: the verb, then the engine, what changed and the history', () => {
    const s = createAppStore(demoProject())
    s.getState().apply((p) => actions.moveMass(p, 'm1', { x: 5, y: 0 }))
    expect(events).toHaveLength(1)
    const [e] = events
    expect(e.door).toBe('apply')
    expect(names(e)).toEqual(['state/actions/masses.moveMass', 'engine/derive.derive'])
    // and the decision log's entry
    expect(e.changes).toEqual([{ kind: 'changed', path: 'masses.m1.footprint' }, { kind: 'changed', path: 'log' }])
    expect(e.history).toEqual({ past: 1, future: 0 })
    expect(e.rejected).toBe(false)
    expect(e.ms).toBeGreaterThanOrEqual(e.calls[1].ms)
  })

  it('an action that changes nothing: no engine run, no change', () => {
    const s = createAppStore(demoProject())
    s.getState().apply((p) => actions.moveMass(p, 'm1', { x: 0, y: 0 }))
    expect(names(events[0])).toEqual(['state/actions/masses.moveMass'])
    expect(events[0].changes).toEqual([])
  })

  it('a drag: previews (one rejected), then commit inside the next apply', () => {
    const s = createAppStore(demoProject())
    s.getState().preview((p) => actions.moveMass(p, 'm1', { x: 5, y: 0 }))
    s.getState().preview(() => null)
    s.getState().apply((p) => actions.removeMass(p, 'm2'))
    expect(events.map((e) => e.door)).toEqual(['preview', 'preview', 'commit', 'apply'])
    expect(events[0].dragging).toBe(true)
    expect(events[1].rejected).toBe(true)
    expect(events[1].changes).toEqual([])
    expect(events[2].history.past).toBe(1)
    expect(events[3].changes).toEqual([{ kind: 'removed', path: 'masses.m2' }, { kind: 'changed', path: 'log' }])
    expect(events.every((e, i) => i === 0 || e.seq > events[i - 1].seq)).toBe(true)
  })

  it('undo runs the engine; select runs nothing and only moves the selection', () => {
    const s = createAppStore(demoProject())
    s.getState().apply((p) => actions.removeMass(p, 'm1'))
    s.getState().undo()
    s.getState().select('m2', 1)
    const [, undo, select] = events
    expect(names(undo)).toEqual(['engine/derive.derive'])
    expect(undo.changes).toEqual([{ kind: 'added', path: 'masses.m1' }, { kind: 'changed', path: 'log' }])
    expect(undo.history).toEqual({ past: 0, future: 1 })
    expect(select.calls).toEqual([])
    expect(select.selection).toEqual({ massId: 'm2', vertex: 1, massIds: ['m2'] })
  })

  it('who called (the first module outside the store and the tracer) and which slices are new', () => {
    const s = createAppStore(demoProject())
    s.getState().apply((p) => actions.moveMass(p, 'm1', { x: 5, y: 0 }))
    s.getState().select('m2')
    s.getState().apply((p) => actions.moveMass(p, 'm1', { x: 0, y: 0 }))
    expect(events[0].origin).toBe('state/trace/__tests__/tracer.test.ts')
    expect(events[0].slices).toEqual(['project', 'derived', 'history'])
    expect(events[1].slices).toEqual(['selection'])
    expect(events[2].slices).toEqual([])
  })

  it('snapshot: the live data without polygons', () => {
    const snap = snapshot(createAppStore(demoProject()).getState())
    expect(snap.project.masses).toHaveLength(3)
    expect(snap.masses.m1).toEqual({ area: expect.any(Number), built: true })
    expect(snap.history).toEqual({ past: 0, future: 0 })
    expect(structuredClone(snap)).toEqual(snap) // it can cross a BroadcastChannel
  })

  it('issues that appear and that get resolved', () => {
    const s = createAppStore(demoProject())
    const m2 = s.getState().project.masses.find((m) => m.id === 'm2')!.footprint
    s.getState().apply((p) => actions.updateMass(p, 'm1', { footprint: m2 })) // on top of m2
    expect(events[0].issues.added.map((i) => i.code)).toContain('overlap')
    s.getState().undo()
    expect(events[1].issues.resolved.map((i) => i.code)).toContain('overlap')
  })
})
