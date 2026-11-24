// The command line (port of Plaza-Practiko `vistas/paneles/LineaComando.tsx`), at the left of the drafting bar: while
// a tool places points, what it expects, what can be typed, and the field; otherwise which keys start a tool. Typing a
// digit (or #, @, <) while drawing writes here (and does not switch to 3D with the 3). Enter applies; Escape clears
// the field, and with it empty cancels the tool's step; Backspace with it empty removes the last point.
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useApp } from '../../../state/store.ts'
import { usePhone } from '../../layout/media.ts'
import { keyHint, titleWith } from '../../commands/shortcuts.ts'
import { useUi } from '../../layout/ui.ts'
import { enterTyped, escapeTyped, setTyped, useTyped } from '../../editing/dimension/typed.ts'
import { typingIn } from '../tools/common.tsx'
import { parseCommand } from './command.ts'
import { useCommand, type Registration } from './commandState.ts'
import { t as tr } from '../../../i18n/idioma.ts' // mixed-use-mvp

/** What starts a command: typed while drawing, it goes to the field. */
const STARTS = /^[0-9#@<.\-+]$/
/** What starts a count ("x5"), typed while a tool that takes one is on (`CommandContext.count`: Array). */
const COUNT_STARTS = /^[xX×]$/

/** The note under the help switch: a few tools' keys, as the registry has them (a command with no key is left out). */
const KEY_NOTE = (): string =>
  [['tool.mass', 'draws a block'], ['tool.corner', 'rounds a corner'], ['tool.dimension', 'dimensions'], ['tool.ruler', 'measures'], ['design.solve', 'solves']]
    .flatMap(([id, what]) => (keyHint(id) ? [`${keyHint(id)} ${what}`] : []))
    .join(' · ')

export function CommandLine() {
  const registration = useCommand((s) => s.registration)
  const phone = usePhone()
  const plan = useUi((s) => s.view !== '3d')
  // the keys are a note: shown while Help is on (Help › Help; Decision "Help")
  const help = useUi((s) => s.help)
  if (phone) return null
  if (registration === null)
    return (
      <div role="group" aria-label="Command" className="flex min-w-0 items-center gap-2 px-1.5">
        <span className="text-label text-ink-secondary">{tr("Command")}</span>
        {help && (
        <span className="truncate text-caption text-ink-tertiary">
          {plan ? KEY_NOTE() : titleWith('The tools draw on the plan', 'view.plan')}
        </span>
        )}
      </div>
    )
  // each tool starts with an empty field: what was typed in one does not pass to the next (keyed by the tool only: a
  // tool's prompt changes at every point, and the field must keep the focus)
  return <Field key={registration.tool} registration={registration} />
}

function Field({ registration }: { registration: Registration }) {
  const angle = useCommand((s) => s.angle)
  const [own, setText] = useState('')
  const [ownError, setError] = useState<string | null>(null)
  const field = useRef<HTMLInputElement>(null)
  // a typed drag stands (D.1 task 4): the keys are the dimension's, and this field shows and edits its text
  const typed = useTyped((s) => (s.cur?.mode === 'live' ? s.cur : null))
  const text = typed ? typed.text : own
  const error = typed ? typed.error : ownError

  // a digit (or #, @, <…) while drawing focuses the field without losing the character
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (useTyped.getState().cur) return
      // AltGr (how @ is typed on a Spanish keyboard) arrives as Ctrl+Alt on Windows
      const altGr = typeof e.getModifierState === 'function' && e.getModifierState('AltGraph')
      if ((e.ctrlKey || e.metaKey || e.altKey) && !altGr) return
      // the x of "x5" is a start only where the tool takes a count (Array): for every other tool it is a key as it was
      if (!STARTS.test(e.key) && !(COUNT_STARTS.test(e.key) && useCommand.getState().registration?.context().count)) return
      if (typingIn(e.target) || document.querySelector('[aria-modal="true"]')) return
      e.preventDefault()
      e.stopPropagation()
      setText((t) => t + e.key)
      setError(null)
      field.current?.focus()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  const onFieldKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    // the field's keys are the field's: the plan's shortcuts do not see them
    e.stopPropagation()
    if (typed) {
      // the dimension's: Enter applies the typed text exactly, Escape clears it, and with it empty lets the drag go
      if (e.key === 'Enter') {
        e.preventDefault()
        if (text.trim() === '' || enterTyped()) field.current?.blur()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        escapeTyped()
        if (text === '') field.current?.blur()
      }
      return
    }
    // an empty field has no text of its own to undo: Ctrl+Z and Ctrl+Y are the project's (the field keeps the focus after a typed point, for the next one)
    if ((e.ctrlKey || e.metaKey) && !e.altKey && text === '') {
      const k = e.key.toLowerCase()
      if (k === 'z' || k === 'y') {
        e.preventDefault()
        if (k === 'z' && !e.shiftKey) useApp.getState().undo()
        else useApp.getState().redo()
        return
      }
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const context = { ...registration.context(), angle: useCommand.getState().angle }
      const c = registration.parse ? registration.parse(text) : parseCommand(text, context)
      if (c.kind === 'error') {
        setError(c.reason)
        return
      }
      // an angle fixes the next segment's, but where the tool takes angles (Rotate's end) it is the tool's
      if (c.kind === 'angle' && !context.angleOnly) {
        useCommand.getState().fixAngle(c.degrees)
        setText('')
        setError(null)
        return
      }
      if (registration.apply(c)) {
        setText('')
        setError(null)
        if (c.kind === 'empty' || registration.oneShot) field.current?.blur()
      } else setError('Could not place it there')
    } else if (e.key === 'Escape') {
      e.preventDefault()
      if (text !== '') {
        setText('')
        setError(null)
      } else {
        field.current?.blur()
        registration.cancel()
      }
    } else if (e.key === 'Backspace' && text === '') {
      e.preventDefault()
      registration.back?.()
    }
  }

  return (
    <div role="group" aria-label="Command" className="flex min-w-0 items-center gap-x-2 px-1.5">
      <span className="shrink-0 text-label text-ink">{registration.tool}</span>
      {/* short of room (a compact drafting bar), the prompt shortens before the field does */}
      <span className="min-w-0 shrink-[4] truncate text-label text-ink-secondary" title={registration.prompt}>
        {registration.prompt}
      </span>
      {angle !== null && <span className="shrink-0 text-caption text-ink-secondary">fixed angle {angle}°</span>}
      <input
        ref={field}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        aria-label="Command line"
        aria-invalid={error !== null}
        placeholder="type…"
        value={text}
        onChange={(e) => {
          if (typed) return setTyped(e.target.value)
          setText(e.target.value)
          setError(null)
        }}
        onKeyDown={onFieldKey}
        className={`w-28 min-w-20 shrink select-text rounded-pill bg-fill px-2 py-0.5 text-label text-ink outline-none ${error ? 'ring-1 ring-status-over' : ''}`}
        style={{ fontVariantNumeric: 'tabular-nums' }}
      />
      <span className={`truncate text-caption ${error ? 'text-status-over' : 'text-ink-secondary'}`} title={error ?? registration.help}>
        {error ?? registration.help}
      </span>
    </div>
  )
}
