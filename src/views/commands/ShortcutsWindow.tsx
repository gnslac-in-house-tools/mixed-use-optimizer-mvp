// The keyboard shortcuts window (Project C, AS.1 task 6; spec "Shortcuts"): Edit › Keyboard shortcuts… (commands/edit.ts)
// opens it, the top bar shows it (`useShortcutsWindow`, shortcutsWindowState.ts). Every command of the registry, grouped by
// its menu path (File, File › Export, Tools › Massing…; the Rules window's and the block editor's own keys, which are in no
// menu, under *Rules window* and *Block editor*) in the registry's order, each row its label and its keys as chips
// ("—" for none); a search on top finds by label, menu path or key; the list scrolls inside, the search and the foot stay.
//   Giving a key   a row's Change (or its key chip) → "Press a key…": the window waits, and the next key whose chord is not
//                  a modifier alone is the command's only key (Escape cancels the waiting). It listens in the capture phase and
//                  stops the event, so while it waits no command runs and Escape does not close the window. The waiting ends by
//                  itself when the pointer goes down outside the row or the focus goes to a field (the search): what is typed
//                  there is typed. A reserved chord
//                  (keys.ts RESERVED) is refused with its reason; a chord another command has in a place both answer in asks
//                  "‹chord› is ‹that command›’s: move it here?" (Move takes it from the other, which keeps its remaining keys;
//                  Cancel leaves both); anything else becomes the key. Two commands that never answer in the same place may
//                  share a chord (shortcuts.ts `conflictsOf`, which counts the user's keys, not only the defaults, and every
//                  command the registry was given: one another typology offers, a Dock where there are no docks, is named too).
//   Per row        Back to the default (only when it differs), Remove the key (only when it has one).
//   At the foot    All back to the defaults (asks first, with the app's confirmation), and where the keys are kept.
// Left out of the list: the per-option rows of Design › Options (`design.option.go.<id>`: the id is the project's, it changes
// with the project, so a key given to it would not follow); every other command is listed, the dynamic ones with a fixed id
// (New … project per typology, the Terrain and Detail choices, the plugins' rows) included.
// Whatever the user gives is `useShortcutsStore` (kept per browser, `gfit.shortcuts`); every title and menu reads it, and
// `App` renders again on a change so a button's title is the new key without a reload.
import { useEffect, useId, useRef, useState } from 'react'
import { Icon } from '../controls/Icon.tsx'
import { trapTab } from '../controls/focus.ts'
import { useToast } from '../layout/toast.ts'
import { chordLabel, chordOf, normalizeChord, RESERVED, reservedReason } from './keys.ts'
import { commands, knownCommand } from './registry.ts'
import { conflictsOf, differsFromDefault, giveKey, keysFor, resetKeys, setKeys, useShortcutsStore } from './shortcuts.ts'
import { closeShortcuts, useShortcutsWindow } from './shortcutsWindowState.ts'
import { WINDOW_GROUPS, type Command } from './types.ts'
import { t as tr } from '../../i18n/idioma.ts' // mixed-use-mvp

/** What one row is doing: waiting for a key, refusing one, or asking whether to take it from another command. */
type Editing =
  | { id: string; stage: 'wait' }
  | { id: string; stage: 'reserved'; why: string }
  | { id: string; stage: 'conflict'; chord: string; others: string[] }

/** The per-option rows of Design › Options: their id is the project's option, not a command to bind. */
const bindable = (c: Command): boolean => !c.id.startsWith('design.option.go.')

/** The group a row stands under: its menu path, or the window it is the own command of. */
const groupOf = (c: Command): string => (c.window ? WINDOW_GROUPS[c.window] : c.menu.join(' › '))

const labelOf = (c: Command): string => (typeof c.label === 'function' ? c.label() : c.label)

const BUTTON = 'pressable rounded-control px-2 py-1 text-label font-medium text-ink-secondary hover:bg-hover hover:text-ink'

export function ShortcutsWindow() {
  const open = useShortcutsWindow((s) => s.open)
  // the window goes with the bar (Home covers it): it is not left open for the next time the bar shows
  useEffect(() => closeShortcuts, [])
  return open ? <Window /> : null
}

function Window() {
  const user = useShortcutsStore((s) => s.user)
  const [query, setQuery] = useState('')
  const [editing, setEditingState] = useState<Editing | null>(null)
  // the capture listener reads the row being edited as it is now, not as the render it was added in saw it
  const editingRef = useRef<Editing | null>(null)
  const setEditing = (e: Editing | null) => {
    editingRef.current = e
    setEditingState(e)
  }
  const titleId = useId()
  const root = useRef<HTMLDivElement>(null)
  const first = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    first.current?.focus()
    return () => before?.focus?.()
  }, [])

  // a pick that removes the button it was on leaves the focus on the page: back inside the window
  useEffect(() => {
    if (root.current && !root.current.contains(document.activeElement)) root.current.focus()
  })

  /** A chord was pressed for `id`: refused, asked about, or given. */
  const receive = (id: string, chord: string) => {
    const c = normalizeChord(chord)
    const why = reservedReason(c)
    if (why) return setEditing({ id, stage: 'reserved', why })
    const others = conflictsOf(id, c)
    if (others.length > 0) return setEditing({ id, stage: 'conflict', chord: c, others: others.map((o) => o.id) })
    giveKey(id, c)
    setEditing(null)
  }

  // the waiting ends when the user goes elsewhere: a press outside the row, or the focus on a field (the search); what
  // is typed after that is typed, not given to a command
  useEffect(() => {
    const waitingRow = (): Element | undefined => {
      const cur = editingRef.current
      if (cur?.stage !== 'wait') return undefined
      return Array.from(root.current?.querySelectorAll('[data-command]') ?? []).find((r) => r.getAttribute('data-command') === cur.id)
    }
    const onDown = (e: PointerEvent) => {
      if (editingRef.current?.stage !== 'wait') return
      const row = waitingRow()
      if (!row || !row.contains(e.target as Node)) setEditing(null)
    }
    const onFocus = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null
      if (editingRef.current?.stage === 'wait' && t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) setEditing(null)
    }
    window.addEventListener('pointerdown', onDown, true)
    document.addEventListener('focusin', onFocus)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('focusin', onFocus)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reads the ref and `setEditing`, which only touches it
  }, [])

  useEffect(() => {
    const stop = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()
    }
    const onKey = (e: KeyboardEvent) => {
      const cur = editingRef.current
      if (cur?.stage === 'wait') {
        // the next key is the key: no command runs, Escape cancels the waiting and the window stays
        if (e.key === 'Escape') {
          stop(e)
          setEditing(null)
          return
        }
        const chord = chordOf(e)
        if (!chord) return // a modifier alone: the key is the one that comes with it
        stop(e)
        receive(cur.id, chord)
        return
      }
      // a confirmation (All back to the defaults) and an open menu have their own Escape
      if (e.key === 'Escape' && !useToast.getState().confirmation && !document.querySelector('[role="menu"]')) {
        stop(e)
        closeShortcuts()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `receive` only reads the stores and the ref
  }, [])

  const all = commands().filter(bindable)
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)
  const shown = all.filter((c) => {
    if (editing?.id === c.id) return true // the row being edited stays, whatever the search says
    if (tokens.length === 0) return true
    const hay = `${labelOf(c)} ${groupOf(c)} ${keysFor(c, user).map(chordLabel).join(' ')}`.toLowerCase()
    return tokens.every((t) => hay.includes(t))
  })
  // by menu path, groups in the order their first command comes in the registry
  const groups: { path: string; rows: Command[] }[] = []
  for (const c of shown) {
    const path = groupOf(c)
    const g = groups.find((x) => x.path === path)
    if (g) g.rows.push(c)
    else groups.push({ path, rows: [c] })
  }

  const askAllBack = () => useToast.getState().confirm('Put every command’s key back to its default?', () => resetKeys())

  return (
    <div
      data-dialog-backdrop
      className="fixed inset-0 z-[60] grid place-items-center bg-black/30 p-gutter"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeShortcuts()
      }}
    >
      <div
        ref={root}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="panel relative flex h-full max-h-[48rem] min-h-0 w-full max-w-2xl select-text flex-col gap-3 p-panel-pad text-ink shadow-sheet outline-none"
        onKeyDown={(e) => {
          if (e.key === 'Tab') trapTab(e, root.current)
        }}
      >
        <header className="flex flex-col gap-2 pr-8">
          <h2 id={titleId} className="text-headline">
            {tr("Keyboard shortcuts")}
          </h2>
          <input
            ref={first}
            type="search"
            aria-label="Search the commands"
            placeholder="Search by name, menu or key"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-control bg-fill px-2 py-1.5 text-body outline-none placeholder:text-ink-tertiary focus:bg-hover"
          />
          <details className="text-label text-ink-secondary">
            <summary className="cursor-pointer select-none">{tr("Keys that cannot be given")}</summary>
            <ul className="mt-1 flex max-h-28 flex-col gap-0.5 overflow-y-auto pl-4">
              {RESERVED.map((r) => (
                <li key={r.name}>
                  <span className="font-medium text-ink">{r.name}</span>: {r.why}
                </li>
              ))}
            </ul>
          </details>
        </header>

        <div data-shortcuts-list className="min-h-0 flex-1 overflow-y-auto pr-1">
          {groups.length === 0 && <p className="px-2 py-6 text-center text-body text-ink-secondary">Nothing matches “{query}”.</p>}
          {groups.map((g) => (
            <section key={g.path} className="mb-3">
              <h3 className="sticky top-0 z-[1] bg-panel px-2 py-1 text-label font-semibold text-ink-secondary">{g.path}</h3>
              <ul>
                {g.rows.map((c) => (
                  <Row key={c.id} c={c} user={user} editing={editing?.id === c.id ? editing : null} onChange={() => setEditing({ id: c.id, stage: 'wait' })} onEditing={setEditing} />
                ))}
              </ul>
            </section>
          ))}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-separator pt-3">
          <p className="min-w-0 flex-1 text-label text-ink-secondary">{tr("Your keys are kept in this browser.")}</p>
          <button type="button" onClick={askAllBack} className={`${BUTTON} shrink-0 bg-fill shadow-control`}>
            {tr("All back to the defaults")}
          </button>
        </footer>

        <button
          type="button"
          aria-label="Close the Keyboard shortcuts"
          title="Close (Esc)"
          onClick={closeShortcuts}
          className="pressable absolute right-3 top-3 z-10 grid h-7 w-7 place-items-center rounded-control text-ink-secondary hover:bg-hover hover:text-ink"
        >
          <Icon name="close" className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

/** One command: its label, its keys, and what can be done to them; while it is being edited, what it waits for or asks. */
function Row({ c, user, editing, onChange, onEditing }: { c: Command; user: Record<string, string[]>; editing: Editing | null; onChange(): void; onEditing(e: Editing | null): void }) {
  const labelId = useId()
  const keys = keysFor(c, user)
  const label = labelOf(c)
  const waiting = editing?.stage === 'wait'
  return (
    <li data-command={c.id} aria-labelledby={labelId} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-control px-2 py-1 hover:bg-hover">
      <span id={labelId} className="min-w-0 flex-1 text-body">
        {label}
      </span>
      <span className="flex flex-wrap items-center gap-1">
        {waiting ? (
          <span className="text-label font-medium text-ink">{tr("Press a key…")}</span>
        ) : keys.length === 0 ? (
          <span aria-label="No key" className="px-1.5 text-label text-ink-tertiary">
            —
          </span>
        ) : (
          keys.map((k) => (
            <button key={k} type="button" title={`Change the key of ${label}`} onClick={onChange} className="pressable rounded-control bg-fill px-1.5 py-0.5 shadow-control hover:bg-hover">
              <kbd className="text-label font-medium">{chordLabel(k)}</kbd>
            </button>
          ))
        )}
      </span>
      <span className="flex items-center">
        <button type="button" title={`Change the key of ${label}`} onClick={onChange} className={BUTTON}>
          {tr("Change")}
        </button>
        {differsFromDefault(c.id) && (
          <button type="button" title={`Put ${label} back to its default key`} onClick={() => resetOne(c.id, onEditing)} className={BUTTON}>
            {tr("Back to the default")}
          </button>
        )}
        {keys.length > 0 && (
          <button type="button" title={`${label} will have no key`} onClick={() => removeOne(c.id, onEditing)} className={BUTTON}>
            {tr("Remove the key")}
          </button>
        )}
      </span>
      {waiting && <p className="basis-full text-label text-ink-secondary">{tr("Esc cancels.")}</p>}
      {editing?.stage === 'reserved' && (
        <p role="alert" className="basis-full text-label text-ink-secondary">
          {editing.why}.
        </p>
      )}
      {editing?.stage === 'conflict' && (
        <div className="flex basis-full flex-wrap items-center gap-2">
          <p role="alert" className="min-w-0 flex-1 text-label text-ink">
            {chordLabel(editing.chord)} is {editing.others.map((id) => labelOfId(id)).join(' and ')}’s: move it here?
          </p>
          <button
            type="button"
            onClick={() => {
              giveKey(c.id, editing.chord, true)
              onEditing(null)
            }}
            className="pressable rounded-control bg-ink px-2 py-1 text-label font-medium text-on-ink hover:opacity-90"
          >
            {tr("Move")}
          </button>
          <button type="button" onClick={() => onEditing(null)} className={BUTTON}>
            {tr("Cancel")}
          </button>
        </div>
      )}
    </li>
  )
}

const labelOfId = (id: string): string => {
  const c = knownCommand(id)
  return c ? labelOf(c) : id
}

function resetOne(id: string, onEditing: (e: Editing | null) => void): void {
  resetKeys(id)
  onEditing(null)
}

function removeOne(id: string, onEditing: (e: Editing | null) => void): void {
  setKeys(id, [])
  onEditing(null)
}
