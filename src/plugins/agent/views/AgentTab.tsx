// The Agent tab (Decision "Agent"): a chat on the left that works the app's own buttons, the tools MCP offers too, with
// the model the designer picks:
//   Model    where it runs ▾ (LM Studio on this computer, Claude, GPT or Gemini through GFit's server, Anthropic, OpenAI,
//            Google, or Claude Desktop through MCP) ·
//            model ▾ (listed by the provider, ↻ lists again) · the server's address (local) or the API key (kept in
//            this browser); GFit's server, neither: it has the key; the provider's error, if any
//            ▸ Details (folded, kept per browser): what the provider is, how the agent works, and what was used:
//            You (this browser, for a provider that says its tokens: Gemini; Reset) and Everyone (through GFit's
//            server, all its users together: it counts them)
//   Chat     what it is for and examples (empty), then the conversation: what you wrote, what it answered and each tool
//            it called, ✓ or ✕
//   Message  at the panel's foot: Enter sends (Shift+Enter: a new line), Stop while it works, New chat; what another
//            plugin asks the agent for (the optimizer's *Ask the agent*) comes written in it, to send
//   Claude Desktop (MCP), as where it runs (Decision "Agent tab, folded"): this tab listens to GFit's MCP server (per
//            browser, `gfit.mcp`), how it stands on one line, the rest under ▸ Details; no chat: one asks in Claude
//            Desktop (what another plugin asks for, to copy there). Another provider picked, it stops listening
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from '../../../views/controls/Icon.tsx'
import { useAsked } from '../ask.ts'
import { useChat } from '../chat.ts'
import { useMcp } from '../mcp.ts'
import { PROVIDERS, providerOf, shortName, shortlist, type ProviderId } from '../providers.ts'
import { connectionOf, useAgentSettings } from '../settings.ts'
import { METERED, SHARED_VENDOR, everyoneUsed, fetchEveryone, usageLine, useUsage, type Used } from '../usage.ts'
import { listModels, type ToolResult, type Turn } from '../wire.ts'
import { t as tr } from '../../../i18n/idioma.ts' // mixed-use-mvp

const fieldClass =
  'h-row w-full min-w-0 select-text rounded-control border border-separator bg-panel-sunken px-1.5 text-label text-ink outline-none focus:border-ink disabled:text-ink-tertiary'

const EXAMPLES = ['Solve the brief and tell me what is left', 'Turn the office 90° and arrange again', 'Why does this option have issues?']

/** Claude Desktop in *Runs on*: not a provider of the chat, the MCP bridge turned on. */
const DESKTOP = 'desktop'

export default function AgentTab() {
  const turns = useChat((s) => s.turns)
  const desktop = useMcp((m) => m.on)
  return (
    <div className="flex min-h-full flex-col gap-4">
      <ModelSettings />
      {desktop ? (
        <DesktopIntro />
      ) : (
        <>
          {turns.length === 0 ? <Intro /> : <Conversation turns={turns} />}
          <Composer />
        </>
      )}
    </div>
  )
}

// ---- Model ----

type Listed = { state: 'idle' | 'loading' | 'done' | 'error'; models: string[]; error?: string }

function ModelSettings() {
  const s = useAgentSettings()
  const mcp = useMcp()
  const provider = providerOf(s.provider)
  const key = s.keys[s.provider] ?? ''
  // what it lists the models with: GFit's server needs nothing of the designer's
  const reach = provider.needs === 'server' ? s.server : provider.needs === 'key' ? key : s.provider
  const [list, setList] = useState<Listed>({ state: 'idle', models: [] })
  const [again, setAgain] = useState(0)
  useEffect(() => {
    if (!reach || mcp.on) {
      setList({ state: 'idle', models: [] })
      return
    }
    const ctl = new AbortController()
    setList({ state: 'loading', models: [] })
    listModels(connectionOf(useAgentSettings.getState()), ctl.signal).then(
      (listed) => {
        const models = shortlist(providerOf(s.provider), listed)
        setList({ state: 'done', models })
        // the first one, if none was chosen or the chosen one is gone (or not among its candidates)
        const chosen = useAgentSettings.getState().models[s.provider]
        if (models.length > 0 && (!chosen || !models.includes(chosen))) useAgentSettings.getState().setModel(s.provider, models[0])
      },
      (e: unknown) => {
        if (!ctl.signal.aborted) setList({ state: 'error', models: [], error: e instanceof Error ? e.message : String(e) })
      },
    )
    return () => ctl.abort()
  }, [reach, again, s.provider, mcp.on])

  const model = s.models[s.provider] ?? ''
  const options = list.models.includes(model) || !model ? list.models : [model, ...list.models]
  return (
    <section aria-label="Where it runs" className="flex flex-col gap-2">
      <Row label="Runs on">
        <select
          aria-label="Runs on"
          className={fieldClass}
          value={mcp.on ? DESKTOP : s.provider}
          onChange={(e) => {
            if (e.target.value === DESKTOP) return mcp.setOn(true)
            mcp.setOn(false)
            s.set({ provider: e.target.value as ProviderId })
          }}
        >
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
          <option value={DESKTOP}>{tr("Claude Desktop (MCP)")}</option>
        </select>
      </Row>
      {mcp.on ? <DesktopSettings /> : chatSettings()}
    </section>
  )

  /** The chat's model, its server or key, its error and its details (a part of this view, not a component of its own). */
  function chatSettings() {
    return (
      <>
        <Row label="Model">
          <div className="flex min-w-0 gap-1">
            <select aria-label="Model" disabled={options.length === 0} className={fieldClass} value={model} onChange={(e) => s.setModel(s.provider, e.target.value)}>
              {options.length === 0 && <option value="">{list.state === 'loading' ? 'Listing…' : `Listed by ${shortName(provider)}`}</option>}
              {options.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <button
              type="button"
              aria-label="List the models again"
              title={`Ask ${shortName(provider)} for its models again`}
              disabled={!reach || list.state === 'loading'}
              onClick={() => setAgain(again + 1)}
              className="pressable grid h-row w-6 shrink-0 place-items-center rounded-control text-ink-secondary hover:bg-hover hover:text-ink disabled:opacity-40"
            >
              <Icon name="rotate" className="h-3.5 w-3.5" />
            </button>
          </div>
        </Row>
        {provider.needs === 'server' && (
          <Row label="Server">
            <Draft label="Server" value={s.server} onCommit={(v) => s.set({ server: v || provider.server! })} />
          </Row>
        )}
        {provider.needs === 'key' && (
          <Row label="API key">
            <Draft label="API key" secret value={key} placeholder="Paste your key" onCommit={(v) => s.setKey(s.provider, v)} />
          </Row>
        )}
        {list.state === 'error' && <p className="text-caption text-status-over">{list.error}</p>}
        <Details>
          <p className="text-caption text-ink-secondary">{provider.note}</p>
          <p className="text-caption text-ink-secondary">
            Each change it makes is one undo step, as yours are, and the decision log says it was the agent’s. It answers from
            the app’s own figures and checks, never from guesses.
          </p>
          <UsageLine provider={s.provider} />
        </Details>
      </>
    )
  }
}

const DETAILS_KEY = 'gfit.agent.details'

/** What the provider is, how the agent works and what was used, folded under ▸ Details; open or not, per browser. */
function Details({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(DETAILS_KEY) === 'open'
    } catch {
      return false
    }
  })
  const toggle = () => {
    setOpen(!open)
    try {
      localStorage.setItem(DETAILS_KEY, open ? 'closed' : 'open')
    } catch {
      // blocked: it lasts as long as the tab
    }
  }
  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        aria-expanded={open}
        title={open ? 'Hide the details' : 'What it is, how it works and what was used'}
        onClick={toggle}
        className="pressable flex items-center gap-1 self-start rounded-control text-caption text-ink-secondary hover:text-ink"
      >
        <Icon name={open ? 'chevronDown' : 'chevronRight'} className="h-3 w-3" />
        {tr("Details")}
      </button>
      {open && children}
    </div>
  )
}

/** How often everyone's line asks GFit's server again: others use it too. */
const EVERYONE_EVERY = 30_000

/** What this browser has used of the provider: shown for one that says its tokens, or once it has some. Through GFit's
 *  server, what everyone has used too (Decision "Agent usage for everyone"). */
function UsageLine({ provider }: { provider: ProviderId }) {
  const used = useUsage((u) => u.used[provider])
  const reset = useUsage((u) => u.reset)
  const vendor = METERED.includes(provider) ? SHARED_VENDOR[provider] : undefined
  const [everyone, setEveryone] = useState<{ used?: Used; error?: string } | null>(null)
  useEffect(() => {
    if (!vendor) return setEveryone(null)
    const ctl = new AbortController()
    const ask = () =>
      fetchEveryone(ctl.signal).then(
        (e) => setEveryone({ used: everyoneUsed(e, vendor) }),
        (e: unknown) => !ctl.signal.aborted && setEveryone({ error: e instanceof Error ? e.message : String(e) }),
      )
    void ask()
    const timer = setInterval(() => void ask(), EVERYONE_EVERY)
    return () => {
      ctl.abort()
      clearInterval(timer)
    }
    // asked again after each of this browser's answers (`used`), and every EVERYONE_EVERY for the others'
  }, [vendor, used])
  if (!used && !METERED.includes(provider)) return null
  return (
    <>
      <UsedRow
        label="You"
        aria="Used"
        title={used ? `In this browser since ${new Date(used.since).toLocaleDateString()}, at each model’s listed price` : 'In this browser'}
        line={usageLine(used)}
      >
        {used && (
          <button type="button" className="shrink-0 text-caption text-ink-secondary underline hover:text-ink" onClick={() => reset(provider)}>
            {tr("Reset")}
          </button>
        )}
      </UsedRow>
      {everyone && (
        <UsedRow
          label="Everyone"
          aria="Used by everyone"
          title={everyone.used ? `Everyone through GFit’s server since ${new Date(everyone.used.since).toLocaleDateString()}, at each model’s listed price` : 'Everyone through GFit’s server'}
          line={everyone.error ?? usageLine(everyone.used)}
        />
      )}
    </>
  )
}

function UsedRow(props: { label: string; aria: string; title: string; line: string; children?: ReactNode }) {
  return (
    <Row label={props.label}>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span aria-label={props.aria} title={props.title} className="truncate text-caption text-ink-secondary tabular-nums">
          {props.line}
        </span>
        {props.children}
      </div>
    </Row>
  )
}

/** A field kept as typed until Enter or leaving it. */
function Draft(props: { label: string; value: string; secret?: boolean; placeholder?: string; onCommit(v: string): void }) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft !== null && draft.trim() !== props.value) props.onCommit(draft.trim())
    setDraft(null)
  }
  return (
    <input
      aria-label={props.label}
      type={props.secret ? 'password' : 'text'}
      autoComplete="off"
      spellCheck={false}
      className={fieldClass}
      placeholder={props.placeholder}
      value={draft ?? props.value}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
    />
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-2">
      <span className="text-label text-ink-secondary">{label}</span>
      {children}
    </div>
  )
}

// ---- Claude Desktop ----

/** Claude Desktop as where it runs: how the bridge stands, on one line; what it is, under Details. */
function DesktopSettings() {
  const { status, calls, last, setOn } = useMcp()
  const said: Record<typeof status, string> = {
    off: 'Off',
    waiting: 'Waiting for Claude Desktop',
    connected: `Connected · ${calls} ${calls === 1 ? 'call' : 'calls'}${last ? `, the last ${last.name} ${last.ok ? '✓' : '✕'}` : ''}`,
    elsewhere: 'Another GFit tab has it',
  }
  return (
    <>
      <Row label="Status">
        <span aria-label="Claude Desktop status" className="flex min-w-0 items-center gap-1.5 text-caption text-ink-secondary">
          {status === 'connected' && <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-pill bg-status-within" />}
          <span className="truncate">{said[status]}</span>
          {status === 'elsewhere' && (
            <button type="button" className="shrink-0 text-ink underline" onClick={() => setOn(true)}>
              {tr("Connect here")}
            </button>
          )}
        </span>
      </Row>
      <Details>
        <p className="text-caption text-ink-secondary">
          Claude Desktop works on this project with the same tools, through GFit’s MCP server on this computer: each change
          one undo step, the decision log says it was the agent’s. Add GFit to Claude Desktop first (docs/mcp.md), then open
          it; this tab listens while GFit is open.
        </p>
      </Details>
    </>
  )
}

/** In the chat's place: one asks in Claude Desktop (what another plugin asked for, to copy there). */
function DesktopIntro() {
  const asked = useAsked((s) => s.text)
  return (
    <section aria-label="Chat" className="flex flex-col gap-2 rounded-control bg-panel-sunken p-3">
      <h2 className="text-headline text-ink">{tr("Ask in Claude Desktop")}</h2>
      <p className="text-body text-ink">{tr("It works on this project with the app’s own buttons; what it changes shows here.")}</p>
      {asked && (
        <div aria-label="To ask" className="flex flex-col gap-1.5 border-t border-separator pt-2">
          <p className="select-text whitespace-pre-wrap text-label text-ink">{asked}</p>
          <div className="flex gap-3">
            <button type="button" className="text-caption text-ink-secondary hover:text-ink" onClick={() => void navigator.clipboard?.writeText(asked)}>
              {tr("Copy")}
            </button>
            <button type="button" className="text-caption text-ink-secondary hover:text-ink" onClick={() => useAsked.setState({ text: null })}>
              {tr("Dismiss")}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

// ---- Chat ----

function Intro() {
  const ask = useChat((s) => s.ask)
  return (
    <section aria-label="Chat" className="flex flex-col gap-3 rounded-control bg-panel-sunken p-3">
      <h2 className="text-headline text-ink">{tr("Ask, or give it steps")}</h2>
      <p className="text-body text-ink">{tr("It works the app’s own buttons, as you would, and tells you what it did.")}</p>
      <ul className="flex flex-col items-start gap-1.5">
        {EXAMPLES.map((e) => (
          <li key={e}>
            <button
              type="button"
              onClick={() => void ask(e)}
              className="pressable rounded-pill border border-separator px-2.5 py-1 text-left text-label text-ink-secondary hover:bg-hover hover:text-ink"
            >
              {e}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Conversation({ turns }: { turns: Turn[] }) {
  const busy = useChat((s) => s.busy)
  const end = useRef<HTMLLIElement>(null)
  // in braces: a browser's scrollIntoView may return a promise, which an effect must not
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end' })
  }, [turns.length, busy])
  // each call with what it answered (the next tools turn)
  const results = new Map<string, ToolResult>(turns.flatMap((t) => (t.role === 'tools' ? t.results.map((r) => [r.id, r] as const) : [])))
  return (
    <ol aria-label="Conversation" className="flex flex-col gap-3">
      {turns.map((t, i) =>
        t.role === 'user' ? (
          <li key={i} className="ml-6 select-text self-end whitespace-pre-wrap rounded-control bg-fill px-2.5 py-1.5 text-body text-ink">
            {t.text}
          </li>
        ) : t.role === 'assistant' ? (
          <li key={i} className="flex flex-col gap-1.5">
            {t.text && <p className="select-text whitespace-pre-wrap text-body text-ink">{t.text}</p>}
            {t.calls.length > 0 && (
              <ul aria-label="Tools it called" className="flex flex-col gap-0.5">
                {t.calls.map((c) => {
                  const r = results.get(c.id)
                  return (
                    <li
                      key={c.id}
                      title={`${JSON.stringify(c.input)}${r ? `\n→ ${r.output.slice(0, 400)}` : ''}`}
                      className={`flex min-w-0 items-center gap-1.5 text-caption ${r && !r.ok ? 'text-status-over' : 'text-ink-secondary'}`}
                    >
                      <span aria-hidden>{!r ? '…' : r.ok ? '✓' : '✕'}</span>
                      <span className="font-mono">{c.name}</span>
                      {r && !r.ok && <span className="truncate">{r.output}</span>}
                    </li>
                  )
                })}
              </ul>
            )}
          </li>
        ) : null,
      )}
      {busy && <li className="text-caption text-ink-secondary">{tr("Thinking…")}</li>}
      <li ref={end} aria-hidden />
    </ol>
  )
}

function Composer() {
  const { busy, error, ask, stop, clear, turns } = useChat()
  const [text, setText] = useState('')
  const field = useRef<HTMLTextAreaElement>(null)
  // what another plugin asked for: written in, to read and send
  const asked = useAsked((s) => s.text)
  useEffect(() => {
    if (asked === null) return
    setText(asked)
    useAsked.setState({ text: null })
    field.current?.focus()
  }, [asked])
  const go = () => {
    if (!text.trim() || busy) return
    void ask(text)
    setText('')
  }
  return (
    <div className="sticky -bottom-panel-pad z-10 -mx-panel-pad mt-auto flex flex-col gap-2 border-t border-separator bg-panel px-panel-pad pb-panel-pad pt-3">
      {error && <p className="text-caption text-status-over">{error}</p>}
      <div className="flex items-end gap-2">
        <textarea
          ref={field}
          aria-label="Message"
          rows={2}
          value={text}
          placeholder="Ask, or give steps to follow…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              go()
            }
          }}
          className="min-w-0 flex-1 resize-none select-text rounded-control border border-separator bg-panel-sunken px-2 py-1.5 text-body text-ink outline-none placeholder:text-ink-tertiary focus:border-ink"
        />
        {busy ? (
          <button
            type="button"
            aria-label="Stop"
            title="Stop: what it already did stays (each one undo step)"
            onClick={stop}
            className="pressable grid h-6 w-6 shrink-0 place-items-center rounded-pill border border-separator bg-panel text-ink shadow-control"
          >
            <span aria-hidden className="text-caption">
              ■
            </span>
          </button>
        ) : (
          <button
            type="button"
            aria-label="Send"
            title="Send (Enter)"
            disabled={!text.trim()}
            onClick={go}
            className="pressable grid h-6 w-6 shrink-0 place-items-center rounded-pill border border-separator bg-panel text-ink shadow-control disabled:opacity-40"
          >
            <Icon name="play" className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {turns.length > 0 && (
        <button type="button" onClick={clear} className="self-start text-caption text-ink-secondary hover:text-ink" title="Start again: the changes it made stay">
          {tr("New chat")}
        </button>
      )}
    </div>
  )
}
