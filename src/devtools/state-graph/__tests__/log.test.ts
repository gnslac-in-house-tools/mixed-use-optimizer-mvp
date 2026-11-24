import { describe, expect, it } from 'vitest'
import type { TraceMessage } from '../../../state/trace/channel.ts'
import type { StateSnapshot, TraceEvent } from '../../../state/trace/tracer.ts'
import { emptyView, receive, rows } from '../log.ts'

const ev = (seq: number, door: TraceEvent['door'], origin = 'views/plan/editing.ts'): TraceEvent => ({
  seq,
  at: seq,
  door,
  origin,
  calls: [],
  rejected: false,
  slices: [],
  changes: [],
  issues: { added: [], resolved: [], total: 0 },
  history: { past: 0, future: 0 },
  dragging: door === 'preview',
  selection: { massId: null, vertex: null, massIds: [] },
  ms: 0,
})
const state = { history: { past: 3, future: 0 } } as StateSnapshot

describe('receive', () => {
  it('waits for the app; connects on its hello, its events or its state; closes with its tab', () => {
    let v = emptyView()
    expect(v.app.status).toBe('waiting')
    v = receive(v, [{ type: 'state', tab: 'a', state }])
    expect(v.app).toEqual({ status: 'connected', tab: 'a' })
    expect(v.state).toBe(state)
    v = receive(v, [{ type: 'app', tab: 'b', status: 'closed', at: 1 }]) // another tab: not ours
    expect(v.app.status).toBe('connected')
    v = receive(v, [{ type: 'app', tab: 'a', status: 'closed', at: 2 }])
    expect(v.app.status).toBe('closed')
    v = receive(v, [{ type: 'app', tab: 'c', status: 'connected', at: 3 }, { type: 'event', tab: 'c', event: ev(1, 'apply') }])
    expect(v.app).toEqual({ status: 'connected', tab: 'c' })
    expect(v.entries.map((e) => e.kind)).toEqual(['app', 'app', 'app', 'event'])
  })

  it('ignores what is not for it (its own hello)', () => {
    const v = emptyView()
    expect(receive(v, [{ type: 'hello' } as TraceMessage])).toEqual(v)
  })
})

describe('rows', () => {
  it('a drag (previews from one place) is one row; anything else breaks it', () => {
    const v = receive(emptyView(), [
      { type: 'event', tab: 'a', event: ev(1, 'select') },
      { type: 'event', tab: 'a', event: ev(2, 'preview') },
      { type: 'event', tab: 'a', event: ev(3, 'preview') },
      { type: 'event', tab: 'a', event: ev(4, 'preview') },
      { type: 'event', tab: 'a', event: ev(5, 'commit') },
      { type: 'event', tab: 'a', event: ev(6, 'preview', 'views/other.ts') },
      { type: 'app', tab: 'a', status: 'closed', at: 7 },
    ])
    expect(rows(v.entries).map((r) => (r.kind === 'app' ? r.status : r.events.map((e) => e.seq).join(',')))).toEqual([
      '1',
      '2,3,4',
      '5',
      '6',
      'closed',
    ])
  })
})
