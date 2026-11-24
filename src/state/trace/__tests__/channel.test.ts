import { describe, expect, it } from 'vitest'
import { demoProject } from '../../demo.ts'
import { createAppStore } from '../../store.ts'
import { publish } from '../bus.ts'
import { connectTraceChannel, type Port, type TraceMessage } from '../channel.ts'
import { snapshot, type TraceEvent } from '../tracer.ts'

const event = (args: unknown[]): TraceEvent => ({
  seq: 1,
  at: 0,
  door: 'apply',
  origin: 'views/x.ts',
  calls: [{ module: 'state/actions/masses', name: 'moveMass', args, ms: 0 }],
  rejected: false,
  slices: ['project', 'derived', 'history'],
  changes: [],
  issues: { added: [], resolved: [], total: 0 },
  history: { past: 1, future: 0 },
  dragging: false,
  selection: { massId: null, vertex: null, massIds: [] },
  ms: 0,
})

/** Copies like a real BroadcastChannel (a function cannot be copied); `receive` plays the page talking back. */
function fakePort() {
  const sent: TraceMessage[] = []
  let listener: ((e: MessageEvent) => void) | null = null
  const port: Port & { closed: boolean } = {
    closed: false,
    postMessage: (m) => sent.push(structuredClone(m) as TraceMessage),
    addEventListener: (_type, l) => (listener = l),
    close: () => (port.closed = true),
  }
  const receive = (data: unknown) => listener?.({ data } as MessageEvent)
  return { port, sent, receive }
}

const store = createAppStore(demoProject())
const read = () => snapshot(store.getState())
const flush = () => new Promise<void>((r) => queueMicrotask(r))

describe('trace channel', () => {
  it('on connect: says the app is here and sends the state', () => {
    const { port, sent } = fakePort()
    const disconnect = connectTraceChannel(read, port, 't1')
    disconnect()
    expect(sent.map((m) => m.type)).toEqual(['app', 'state', 'app'])
    expect(sent[0]).toMatchObject({ type: 'app', tab: 't1', status: 'connected' })
    expect(sent[1]).toMatchObject({ type: 'state', tab: 't1', state: { history: { past: 0, future: 0 } } })
    expect(sent[2]).toMatchObject({ type: 'app', status: 'closed' })
    expect(port.closed).toBe(true)
  })

  it('forwards each event, then ONE state for a batch, until disconnected', async () => {
    const { port, sent } = fakePort()
    const disconnect = connectTraceChannel(read, port, 't1')
    sent.length = 0
    publish(event(['m1']))
    publish(event(['m2']))
    await flush()
    disconnect()
    publish(event(['m3']))
    expect(sent.map((m) => m.type)).toEqual(['event', 'event', 'state', 'app'])
    expect(sent[0]).toEqual({ type: 'event', tab: 't1', event: event(['m1']) })
  })

  it('answers the page\'s hello with the current state', () => {
    const { port, sent, receive } = fakePort()
    const disconnect = connectTraceChannel(read, port, 't1')
    sent.length = 0
    receive({ type: 'hello' })
    receive({ type: 'other' })
    disconnect()
    expect(sent.map((m) => m.type)).toEqual(['state', 'app'])
  })

  it('an arg the browser cannot copy goes as JSON instead of breaking the app', () => {
    const { port, sent } = fakePort()
    const disconnect = connectTraceChannel(read, port, 't1')
    publish(event(['m1', () => 0]))
    disconnect()
    expect(sent.find((m) => m.type === 'event')).toEqual({ type: 'event', tab: 't1', event: event(['m1', null]) })
  })
})
