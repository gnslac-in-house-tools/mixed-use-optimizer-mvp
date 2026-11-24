// @vitest-environment node
/// <reference types="node" />
// The bridge when the tab drops for a moment (stress test: "a call failed on a momentary disconnection of GFit"): a
// call made with no tab waits for one to come back; a call the tab had when it dropped says at once that it may or
// may not have run.
import { afterEach, describe, expect, it } from 'vitest'
import { DROPPED, NOT_OPEN, startBridge, type Bridge } from '../../../../mcp/bridge.ts'

let bridge: Bridge | null = null
afterEach(async () => {
  await bridge?.close()
  bridge = null
})

/** A tab on the bridge: `answer` says what each call gets (null: no answer); `drop` closes it. */
async function tab(base: string, answer: (call: { id: string; name: string }) => object | null) {
  const stop = new AbortController()
  const origin = 'http://localhost:5173'
  const res = await fetch(`${base}/events`, { headers: { origin }, signal: stop.signal })
  const reader = res.body!.getReader()
  let buffer = ''
  void (async () => {
    for (;;) {
      const { value, done } = await reader.read().catch(() => ({ value: undefined, done: true }))
      if (done) return
      buffer += new TextDecoder().decode(value)
      let at: number
      while ((at = buffer.indexOf('\n\n')) >= 0) {
        const chunk = buffer.slice(0, at)
        buffer = buffer.slice(at + 2)
        if (!chunk.startsWith('event: call')) continue
        const call = JSON.parse(chunk.split('\ndata: ')[1]) as { id: string; name: string }
        const a = answer(call)
        if (a) await fetch(`${base}/reply`, { method: 'POST', headers: { origin, 'content-type': 'text/plain' }, body: JSON.stringify({ id: call.id, ...a }) })
      }
    }
  })()
  return { drop: () => stop.abort() }
}

describe('the bridge, when the tab drops', () => {
  it('a call with no tab waits for one to connect; with none in time, says how to connect it', { timeout: 20_000 }, async () => {
    bridge = await startBridge(0, () => {}, 2000)
    const base = `http://127.0.0.1:${bridge.port}`
    const call = bridge.call('getIssues', {})
    await new Promise((r) => setTimeout(r, 300))
    await tab(base, () => ({ ok: true, output: [] }))
    expect(await call).toEqual({ ok: true, output: [] })
    await bridge.close()
    bridge = await startBridge(0, () => {}, 200)
    expect(await bridge.call('getIssues', {})).toEqual({ ok: false, error: NOT_OPEN })
  })

  it('a call the tab had when it dropped answers at once that it may or may not have run', { timeout: 20_000 }, async () => {
    bridge = await startBridge(0, () => {}, 200)
    const base = `http://127.0.0.1:${bridge.port}`
    const t = await tab(base, () => null)
    await new Promise((r) => setTimeout(r, 100))
    const call = bridge.call('moveMass', { mass: 'm1', dx: 5, dy: 0 })
    await new Promise((r) => setTimeout(r, 200))
    t.drop()
    const started = Date.now()
    expect(await call).toEqual({ ok: false, error: DROPPED })
    expect(Date.now() - started).toBeLessThan(2000)
  })
})
