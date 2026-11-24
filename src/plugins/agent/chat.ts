// The agent's conversation (Decision "Agent"): the designer writes; the model answers or asks for tools; each call
// runs through the host (an edit is one undo step, logged as the agent's) and its answer goes back, until the model
// answers in words or the designer presses Stop: no limit of rounds (Decision "Agent rounds"). In memory, for this tab:
// a reload starts a new one.
import { create } from 'zustand'
import { AGENT_GUIDE, callTool, toolSchemas } from '../host.ts'
import { providerOf } from './providers.ts'
import { connectionOf, ready, useAgentSettings } from './settings.ts'
import { useUsage } from './usage.ts'
import { send, type ToolResult, type Turn } from './wire.ts'

/** A tool's answer longer than this is cut: the model needs its ids and figures, not every corner. */
const MAX_OUTPUT = 24_000

export const SYSTEM = `You are the agent inside GFit, in the designer's browser. ${AGENT_GUIDE}`

interface Chat {
  turns: Turn[]
  busy: boolean
  error: string | null
  ask(text: string): Promise<void>
  stop(): void
  clear(): void
}

let controller: AbortController | null = null

const cut = (s: string) => (s.length > MAX_OUTPUT ? `${s.slice(0, MAX_OUTPUT)}… (cut)` : s)

export const useChat = create<Chat>((set, get) => ({
  turns: [],
  busy: false,
  error: null,

  async ask(text) {
    const words = text.trim()
    if (!words || get().busy) return
    const settings = useAgentSettings.getState()
    const c = connectionOf(settings)
    const model = settings.models[settings.provider] ?? ''
    if (!ready(settings))
      return set({ error: providerOf(settings.provider).needs !== 'key' || settings.keys[settings.provider] ? 'Choose a model first.' : 'Paste your API key first.' })
    controller = new AbortController()
    const signal = controller.signal
    set({ turns: [...get().turns, { role: 'user', text: words }], busy: true, error: null })
    const tools = toolSchemas()
    try {
      for (;;) {
        const reply = await send(c, model, SYSTEM, get().turns, tools, signal)
        if (reply.usage) useUsage.getState().add(settings.provider, model, reply.usage)
        set({ turns: [...get().turns, { role: 'assistant', text: reply.text, calls: reply.calls, raw: reply.raw }] })
        if (reply.calls.length === 0) break
        // one after another (a plugin's may take a while: a run); stopped: each call left is answered so, and the
        // conversation can go on
        const results: ToolResult[] = []
        for (const x of reply.calls) {
          if (signal.aborted) {
            results.push({ id: x.id, name: x.name, ok: false, output: 'Stopped by the designer before it ran.' })
            continue
          }
          const r = await callTool(x.name, x.input)
          results.push({ id: x.id, name: x.name, ok: r.ok, output: r.ok ? cut(JSON.stringify(r.output)) : r.error })
        }
        set({ turns: [...get().turns, { role: 'tools', results }] })
        if (signal.aborted) break
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) set({ error: e instanceof Error ? e.message : String(e) })
    } finally {
      controller = null
      set({ busy: false })
    }
  },

  stop() {
    controller?.abort()
  },

  clear() {
    controller?.abort()
    set({ turns: [], error: null })
  },
}))
