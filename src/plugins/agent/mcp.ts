// The tab's side of the MCP bridge (Decision "MCP server"): turned on in the Agent tab (per browser, `gfit.mcp`), it
// listens to GFit's MCP server on this computer (mcp/server.ts, the one Claude Desktop starts) and runs each call it
// sends through the host: a reading answers, an edit is one undo step, logged as the agent's. Off, it does not connect.
// Loaded with the frame while the agent plugin is on (its button imports it), so it listens with the tab closed.
import { create } from 'zustand'
import { callTool } from '../host.ts'

export const MCP_KEY = 'gfit.mcp'
export const MCP_PORT = 4590
export const MCP_URL = `http://127.0.0.1:${MCP_PORT}`

/** off · waiting (no server yet: Claude Desktop closed, or GFit not added to it) · connected · elsewhere (another tab took it) */
export type McpStatus = 'off' | 'waiting' | 'connected' | 'elsewhere'

interface Mcp {
  on: boolean
  status: McpStatus
  /** Calls run this session, and the last one. */
  calls: number
  last: { name: string; ok: boolean } | null
  setOn(on: boolean): void
}

const read = () => {
  try {
    return localStorage.getItem(MCP_KEY) === 'on'
  } catch {
    return false
  }
}

let source: EventSource | null = null

function disconnect() {
  source?.close()
  source = null
}

function connect() {
  disconnect()
  if (typeof EventSource === 'undefined') return
  const s = new EventSource(`${MCP_URL}/events`)
  source = s
  useMcp.setState({ status: 'waiting' })
  s.addEventListener('hello', () => useMcp.setState({ status: 'connected' }))
  // the server is gone (Claude closed it): EventSource tries again by itself
  s.addEventListener('error', () => source === s && useMcp.setState({ status: 'waiting' }))
  s.addEventListener('replaced', () => {
    disconnect()
    useMcp.setState({ status: 'elsewhere' })
  })
  s.addEventListener('call', (e) => {
    const { id, name, input } = JSON.parse((e as MessageEvent<string>).data) as { id: string; name: string; input: unknown }
    void callTool(name, input).then((r) => {
      useMcp.setState((m) => ({ calls: m.calls + 1, last: { name, ok: r.ok } }))
      // text/plain: no preflight
      return fetch(`${MCP_URL}/reply`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ id, ...r }) }).catch(() => undefined)
    })
  })
}

export const useMcp = create<Mcp>((set) => ({
  on: false,
  status: 'off',
  calls: 0,
  last: null,
  setOn(on) {
    try {
      localStorage.setItem(MCP_KEY, on ? 'on' : 'off')
    } catch {
      // full or blocked: it lasts as long as the tab
    }
    set({ on })
    if (on) connect()
    else {
      disconnect()
      set({ status: 'off' })
    }
  },
}))

// turned on in an earlier visit: it listens again
if (read()) useMcp.getState().setOn(true)
