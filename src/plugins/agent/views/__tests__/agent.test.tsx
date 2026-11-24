// The agent's tab (Decision "Agent"): Optimize and Agent, each a tab at the end of the left panel's row of tabs since Phase AS.3 (Decision
// "Panel tabs"; a button of the left rail's end since Phase Q.8, Decision "Areas rail"; before, the ribbon's categories); Agent opens its chat on the left and, pressed
// again, gives the tabs back. The tab lists the provider's models, keeps
// the choice and the key in this browser, and runs a conversation: the model calls the app's tools, each edit one undo
// step logged as the agent's (Decision "Agent"; the providers' formats: wire.test.ts).
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../../App.tsx'
import { derive } from '../../../../engine/derive.ts'
import { demoProject } from '../../../../state/demo.ts'
import { emptyHistory } from '../../../../state/history.ts'
import { useApp } from '../../../../state/store.ts'
import { useUi } from '../../../../views/layout/ui.ts'
import { usePluginModes } from '../../../settings.ts'
import { useChat } from '../../chat.ts'
import { AGENT_KEY, useAgentSettings } from '../../settings.ts'
import { useUsage } from '../../usage.ts'
import { useMcp } from '../../mcp.ts'

// WebGL does not run in jsdom
vi.mock('../../../../views/scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

beforeEach(() => {
  localStorage.clear()
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: { massId: null, vertex: null, massIds: [] } })
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', summaryTab: 'overview', panels: { left: true, right: true }, sheet: null })
  usePluginModes.setState({ modes: {} })
  useAgentSettings.setState({ provider: 'lmstudio', server: 'http://127.0.0.1:1234', keys: {}, models: {} })
  useChat.setState({ turns: [], busy: false, error: null })
  useMcp.getState().setOn(false)
  serve({ down: true })
})

let requests: string[] = []
let bodies: string[] = []
/** A provider in place of the network: its models, its replies in turn (chat completions), or out of reach. */
function serve(o: { models?: string[]; replies?: { content?: string; tool_calls?: unknown[] }[]; down?: boolean }) {
  requests = []
  bodies = []
  const replies = [...(o.replies ?? [])]
  globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    requests.push(url)
    if (init?.body) bodies.push(init.body as string)
    if (o.down) throw new TypeError('Failed to fetch')
    const body = url.includes('/models') ? { data: (o.models ?? []).map((id) => ({ id })) } : { choices: [{ message: { content: null, ...replies.shift() } }] }
    return { ok: true, status: 200, json: async () => body } as Response
  }) as unknown as typeof fetch
}

/** The left panel's row of tabs, the plugins' at its end. */
const leftRail = () => screen.getByRole('complementary', { name: 'Layers and properties' }).querySelector<HTMLElement>('[data-panel-tabs]')!
const chip = () => within(leftRail())

describe('the tabs at the row’s end (Decision "Panel tabs")', () => {
  it('Optimize and Agent, each its own tab after the core’s; no documentation’s group (the Revit bridge went; Sheets is not built)', () => {
    render(<App />)
    expect(chip().getAllByRole('tab').map((b) => b.getAttribute('aria-label') ?? b.textContent).slice(-2)).toEqual(['Optimize', 'Agent'])
    expect(screen.queryByRole('group', { name: 'Documentation' })).toBeNull()
    // nor among the view tabs, in the tools bar (Decision "Tools bar")
    expect(within(screen.getByRole('tablist', { name: 'View' })).queryByRole('tab', { name: 'Sheets' })).toBeNull()
  })

  it('Agent opens its chat on the left, selected in the row; pressed again, the tab that was open comes back', () => {
    render(<App />)
    const agent = chip().getByRole('tab', { name: 'Agent' })
    fireEvent.click(agent)
    expect(useUi.getState().rail).toBe('plugin:agent/chat')
    expect(useUi.getState().summaryTab).toBe('overview')
    expect(agent).toHaveAttribute('aria-selected', 'true')
    expect(within(screen.getByRole('complementary', { name: 'Layers and properties' })).getByRole('tabpanel', { name: 'Agent' })).toBeInTheDocument()
    fireEvent.click(agent)
    expect(useUi.getState().rail).toBe('layers')
    expect(agent).toHaveAttribute('aria-selected', 'false')
  })

  it('the agent turned off leaves the others', () => {
    render(<App />)
    act(() => usePluginModes.getState().setMode('agent', 'off'))
    expect(chip().getAllByRole('tab').map((b) => b.getAttribute('aria-label') ?? b.textContent).slice(-1)).toEqual(['Optimize'])
    expect(screen.queryByRole('tab', { name: 'Agent' })).toBeNull()
  })

  it('with Properties open too: a tab of the row changes no plugin’s tab', () => {
    render(<App />)
    act(() => useUi.getState().setRail('properties'))
    expect(chip().getByRole('tab', { name: 'Agent' })).toBeEnabled()
  })
})

describe('the Agent tab', () => {
  const open = async () => {
    useUi.setState({ rail: 'plugin:agent/chat' })
    render(<App />)
    return screen.findByRole('combobox', { name: 'Runs on' }, { timeout: 5000 })
  }

  it('lists the models LM Studio has and picks the first; the choice is kept in this browser', { timeout: 20_000 }, async () => {
    serve({ models: ['qwen3-8b', 'text-embedding-x', 'qwen3-vl-8b'] })
    await open()
    const model = screen.getByRole('combobox', { name: 'Model' })
    await waitFor(() => expect(within(model).getAllByRole('option').map((o) => o.textContent)).toEqual(['qwen3-8b', 'qwen3-vl-8b']))
    expect(requests[0]).toBe('http://127.0.0.1:1234/v1/models')
    fireEvent.change(model, { target: { value: 'qwen3-vl-8b' } })
    expect(JSON.parse(localStorage.getItem(AGENT_KEY)!).models).toEqual({ lmstudio: 'qwen3-vl-8b' })
  })

  it('a provider with a key: the key field hides it, and nothing is asked until there is one', { timeout: 20_000 }, async () => {
    serve({ models: ['claude-a'] })
    const runsOn = await open()
    fireEvent.change(runsOn, { target: { value: 'anthropic' } })
    const key = screen.getByLabelText('API key')
    expect(key).toHaveAttribute('type', 'password')
    expect(screen.queryByLabelText('Server')).toBeNull()
    expect(requests.some((u) => u.includes('anthropic'))).toBe(false)
    fireEvent.change(key, { target: { value: 'sk-ant-1' } })
    fireEvent.keyDown(key, { key: 'Enter' })
    expect(JSON.parse(localStorage.getItem(AGENT_KEY)!).keys).toEqual({ anthropic: 'sk-ant-1' })
    await waitFor(() => expect(requests).toContain('https://api.anthropic.com/v1/models?limit=100'))
  })

  it('Claude through GFit’s server: no key or server to fill, its models listed at once', { timeout: 20_000 }, async () => {
    serve({ models: ['claude-a'] })
    const runsOn = await open()
    fireEvent.change(runsOn, { target: { value: 'shared' } })
    expect(screen.queryByLabelText('API key')).toBeNull()
    expect(screen.queryByLabelText('Server')).toBeNull()
    await waitFor(() => expect(requests).toContain('/api/anthropic/models?limit=100'))
    await waitFor(() => expect(JSON.parse(localStorage.getItem(AGENT_KEY)!).models.shared).toBe('claude-a'))
  })

  it('Gemini through GFit’s server: its candidates, 3.8 Flash first; what you and everyone used, on two lines; Reset yours (Decisions "Agent usage", "Agent usage for everyone")', { timeout: 20_000 }, async () => {
    useUsage.setState({ used: {} })
    const listed = ['gemini-2.5-pro', 'gemini-4-argon', 'gemini-3.5-flash-lite', 'gemini-3.8-flash']
    // what GFit's server has counted: 1M in and 100k out of 3.8 Flash, others' too
    const everyone = { since: '2026-10-20T00:00:00.000Z', vendors: { google: { 'gemini-3.8-flash': { input: 1_000_000, output: 100_000, answers: 40 } } } }
    globalThis.fetch = vi.fn(async (url: string) => {
      const body =
        url === '/api/usage'
          ? everyone
          : url.endsWith('/models?pageSize=1000')
            ? { models: listed.map((id) => ({ name: `models/${id}`, supportedGenerationMethods: ['generateContent'] })) }
            : { candidates: [{ content: { parts: [{ text: 'Hi there.' }] } }], usageMetadata: { promptTokenCount: 15_000, candidatesTokenCount: 1_000 } }
      return { ok: true, status: 200, json: async () => body } as Response
    }) as unknown as typeof fetch
    const runsOn = await open()
    fireEvent.change(runsOn, { target: { value: 'shared-google' } })
    const model = screen.getByRole('combobox', { name: 'Model' })
    await waitFor(() => expect(model).toHaveValue('gemini-3.8-flash'))
    expect(within(model).getAllByRole('option').map((o) => o.textContent)).toEqual(['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-4-argon'])
    // folded under Details until asked
    expect(screen.queryByLabelText('Used')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Details' }))
    expect(screen.getByRole('button', { name: 'Details' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(/Gemini, through the computer that serves GFit/)).toBeInTheDocument()
    expect(screen.getByLabelText('Used')).toHaveTextContent('Nothing yet')
    // 1M × $0.75 + 100k × $3.75, per 1M
    expect(await screen.findByLabelText('Used by everyone')).toHaveTextContent('1.0M in · 100.0k out · ≈ $1.13')
    const box = screen.getByRole('textbox', { name: 'Message' })
    fireEvent.change(box, { target: { value: 'hi' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(await screen.findByText('Hi there.', undefined, { timeout: 5000 })).toBeInTheDocument()
    // 15k × $0.75 + 1k × $3.75, per 1M
    expect(screen.getByLabelText('Used')).toHaveTextContent('15.0k in · 1.0k out · ≈ $0.01')
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(screen.getByLabelText('Used')).toHaveTextContent('Nothing yet')
  })

  it('Claude Desktop is where it runs: picked, the tab listens to MCP, no chat; another picked, it stops (Decision "Agent tab, folded")', { timeout: 20_000 }, async () => {
    serve({ models: ['qwen3-8b'] })
    const runsOn = await open()
    fireEvent.change(runsOn, { target: { value: 'desktop' } })
    expect(useMcp.getState().on).toBe(true)
    expect(runsOn).toHaveValue('desktop')
    expect(screen.queryByRole('combobox', { name: 'Model' })).toBeNull()
    expect(screen.queryByRole('textbox', { name: 'Message' })).toBeNull()
    expect(screen.getByText('Ask in Claude Desktop')).toBeInTheDocument()
    // no EventSource in jsdom: how it stands, set as the bridge would
    act(() => useMcp.setState({ status: 'waiting' }))
    expect(screen.getByLabelText('Claude Desktop status')).toHaveTextContent('Waiting for Claude Desktop')
    act(() => useMcp.setState({ status: 'connected', calls: 2, last: { name: 'moveMass', ok: true } }))
    expect(screen.getByLabelText('Claude Desktop status')).toHaveTextContent('Connected · 2 calls, the last moveMass ✓')
    fireEvent.change(runsOn, { target: { value: 'lmstudio' } })
    expect(useMcp.getState().on).toBe(false)
    expect(screen.getByRole('textbox', { name: 'Message' })).toBeInTheDocument()
  })

  it('a message: the model calls a tool, the app runs it (one undo step, the agent’s), then it answers', { timeout: 20_000 }, async () => {
    const x = (useApp.getState().project.masses[0].footprint as { center: { x: number } }).center.x
    serve({
      models: ['qwen3-8b'],
      replies: [
        { tool_calls: [{ id: 'c1', function: { name: 'moveMass', arguments: '{"mass":"Warehouse 1","dx":10,"dy":0}' } }] },
        { content: 'Moved Warehouse 1 10 m east.' },
      ],
    })
    await open()
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Model' })).toHaveValue('qwen3-8b'))
    const box = screen.getByRole('textbox', { name: 'Message' })
    fireEvent.change(box, { target: { value: 'Move Warehouse 1 10 m east' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(await screen.findByText('Moved Warehouse 1 10 m east.', undefined, { timeout: 5000 })).toBeInTheDocument()
    const m = useApp.getState().project.masses[0]
    expect((m.footprint as { center: { x: number } }).center.x).toBe(x + 10)
    expect(useApp.getState().history.past).toHaveLength(1)
    expect(useApp.getState().project.log!.at(-1)).toMatchObject({ by: 'agent', verb: 'moveMass' })
    expect(within(screen.getByRole('list', { name: 'Tools it called' })).getByText('moveMass')).toBeInTheDocument()
    // the tool's answer went back to the model
    const second = JSON.parse(bodies.at(-1)!)
    expect(second.messages.at(-1)).toMatchObject({ role: 'tool', tool_call_id: 'c1' })
    expect(second.tools.map((t: { function: { name: string } }) => t.function.name)).toContain('getProject')
    fireEvent.click(screen.getByRole('button', { name: 'New chat' }))
    expect(useChat.getState().turns).toEqual([])
  })

  it('LM Studio out of reach says so, and how to reach it', { timeout: 20_000 }, async () => {
    serve({ down: true })
    await open()
    expect(await screen.findByText(/Could not reach LM Studio at http:\/\/127\.0\.0\.1:1234\. Is its server running, with CORS on\?/, undefined, { timeout: 5000 })).toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: 'hi' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByText('Choose a model first.')).toBeInTheDocument()
  })
})
