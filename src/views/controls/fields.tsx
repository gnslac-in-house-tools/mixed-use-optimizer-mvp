// Small form controls shared by every panel.
// Fields keep a local draft while typing and commit on Enter or blur: one undo step per edit, not per keystroke.
import { useState, type ReactNode, type Ref } from 'react'
import { Icon } from './Icon.tsx'
import { t as tr } from '../../i18n/idioma.ts' // mixed-use-mvp

export const inputClass =
  'h-row select-text rounded-control border border-separator bg-panel-sunken px-2 text-body text-ink outline-none focus:border-ink'

function Row({ label, children, narrow = false }: { label: string; children: ReactNode; narrow?: boolean }) {
  return (
    <label className={`flex min-w-0 items-center justify-between ${narrow ? 'gap-1.5' : 'gap-3'}`}>
      <span className="text-label text-ink-secondary">{tr(label)}</span>
      {children}
    </label>
  )
}

export type NumberFieldProps = {
  label: string
  /** null: several values (a selection of masses that differ); the field shows — until one is typed. */
  value: number | null
  unit?: string
  min?: number
  max?: number
  /** Shown but not editable (a locked mass's measures). */
  disabled?: boolean
  /** Decimals shown (2; a latitude takes 6). */
  decimals?: number
  /** Half a panel's width (two side by side: Decision "Compact Properties"). */
  narrow?: boolean
  /** The field's tooltip: why it is disabled, say. */
  title?: string
  onCommit(v: number): void
  /** The field emptied (a value that may go back to a default: a street's width to its type's); without it an emptied
   *  field changes nothing. */
  onClear?(): void
}

export function NumberField(props: NumberFieldProps) {
  const { label, value, unit, min = -Infinity, max = Infinity, disabled = false, decimals = 2, narrow = false, onCommit } = props
  const k = 10 ** decimals
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft === null) return
    const v = Number(draft)
    // an emptied field is not 0: it clears, where the field may be cleared
    if (draft.trim() === '') props.onClear?.()
    else if (Number.isFinite(v) && v >= min && v <= max && v !== value) onCommit(v)
    setDraft(null)
  }
  return (
    <Row label={label} narrow={narrow}>
      <span className="flex items-center gap-1">
        <input
          className={`${inputClass} ${narrow ? 'w-[4rem]' : 'w-[5.5rem]'} text-right disabled:border-transparent disabled:bg-transparent disabled:text-ink-secondary`}
          disabled={disabled}
          title={props.title === undefined ? undefined : tr(props.title)}
          inputMode="decimal"
          placeholder={value === null ? '—' : undefined}
          value={draft ?? (value === null ? '' : String(Math.round(value * k) / k))}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') setDraft(null)
          }}
        />
        <span className={`${narrow ? 'w-[0.75rem]' : 'w-[1.5rem]'} text-caption text-ink-tertiary`}>{unit}</span>
      </span>
    </Row>
  )
}

/**
 * A bare field for a table cell (the Levels table, the Brief): no label beside it (`label` is its accessible name), the
 * same draft and commit as NumberField. `integer`: whole numbers only. `optional`: it may be emptied (it commits '').
 * `step` (Decision "Brief steppers"): ↑ and ↓ step the number while typing (Shift: ten steps), committed like a typed
 * one; `arrows` also draws ▲▼ inside the field, each click one step committed at once. Never below `min`; an empty
 * field steps up from 0 and not down.
 */
export function CellField(props: {
  label: string
  value: number | string | null
  /** Absent: text. */
  number?: { min?: number; integer?: boolean }
  optional?: boolean
  placeholder?: string
  disabled?: boolean
  step?: number
  arrows?: boolean
  onCommit(v: string): void
}) {
  const { label, value, number, optional = false, disabled = false, step, arrows = false, onCommit } = props
  const [draft, setDraft] = useState<string | null>(null)
  const shown = value === null ? '' : typeof value === 'number' ? String(Math.round(value * 100) / 100) : value
  /** What the field shows stepped `n` times (null: it stays as it is). */
  const stepped = (n: number): string | null => {
    const text = (draft ?? shown).trim().replace(',', '.')
    const from = text === '' ? 0 : Number(text)
    if (!number || !step || !Number.isFinite(from) || (text === '' && n < 0)) return null
    const v = Math.max(number.min ?? -Infinity, Math.round((from + n * step) * 100) / 100)
    return String(number.integer ? Math.round(v) : v)
  }
  const stepButton = (n: 1 | -1) => (
    <button
      type="button"
      tabIndex={-1}
      aria-label={`${n > 0 ? 'Up' : 'Down'}: ${label}`}
      title={n > 0 ? 'One more (Shift: ten)' : 'One less (Shift: ten)'}
      // the field keeps the focus, so a typed draft and the step go in together
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        const v = stepped(e.shiftKey ? n * 10 : n)
        setDraft(null)
        if (v !== null && v !== shown) onCommit(v)
      }}
      className="grid flex-1 place-items-center rounded-[3px] text-ink-tertiary hover:bg-hover hover:text-ink"
    >
      <Icon name={n > 0 ? 'chevronUp' : 'chevronDown'} className="h-2.5 w-2.5" />
    </button>
  )
  const commit = () => {
    if (draft === null) return
    const t = draft.trim()
    setDraft(null)
    if (t === shown) return
    if (!t) {
      if (optional) onCommit('')
      return
    }
    if (number) {
      const v = Number(t.replace(',', '.'))
      if (!Number.isFinite(v) || v < (number.min ?? -Infinity) || (number.integer && !Number.isInteger(v))) return
    }
    onCommit(t.replace(',', '.'))
  }
  const field = (
    <input
      aria-label={label}
      className={`${inputClass} w-full min-w-0 px-1.5 ${number ? 'text-right tabular-nums' : ''} ${arrows && !disabled ? 'pr-5' : ''} disabled:border-transparent disabled:bg-transparent disabled:text-ink-secondary`}
      disabled={disabled}
      inputMode={number ? 'decimal' : undefined}
      placeholder={props.placeholder}
      value={draft ?? shown}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') setDraft(null)
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          const v = stepped((e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1))
          if (v === null) return
          e.preventDefault()
          setDraft(v)
        }
      }}
    />
  )
  if (!arrows || disabled) return field
  return (
    <span className="relative flex">
      {field}
      <span className="absolute inset-y-[3px] right-[3px] flex w-4 flex-col">
        {stepButton(1)}
        {stepButton(-1)}
      </span>
    </span>
  )
}

export function TextField(props: {
  label: string
  value: string
  onCommit(v: string): void
  disabled?: boolean
  /** Why it is disabled, say. */
  title?: string
  /** The input itself, for what puts the focus there (Rename). */
  inputRef?: Ref<HTMLInputElement>
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft !== null && draft.trim() && draft !== props.value) props.onCommit(draft.trim())
    setDraft(null)
  }
  return (
    <Row label={props.label}>
      <input
        ref={props.inputRef}
        className={`${inputClass} w-[9rem] disabled:border-transparent disabled:bg-transparent disabled:text-ink-secondary`}
        disabled={props.disabled}
        title={props.title === undefined ? undefined : tr(props.title)}
        value={draft ?? props.value}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
    </Row>
  )
}

export function SelectField(props: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onCommit(v: string): void
  disabled?: boolean
  /** Why it is disabled, say. */
  title?: string
}) {
  return (
    <Row label={props.label}>
      <select
        className={`${inputClass} w-[9rem] disabled:border-transparent disabled:bg-transparent disabled:text-ink-secondary`}
        disabled={props.disabled}
        title={props.title === undefined ? undefined : tr(props.title)}
        value={props.value}
        onChange={(e) => props.onCommit(e.target.value)}
      >
        {props.options.map((o) => (
          <option key={o.value} value={o.value}>
            {tr(o.label)}
          </option>
        ))}
      </select>
    </Row>
  )
}

export function Button(props: { children: ReactNode; onClick(): void; disabled?: boolean; title?: string; tour?: string }) {
  return (
    <button
      type="button"
      data-tour={props.tour}
      title={props.title === undefined ? undefined : tr(props.title)}
      disabled={props.disabled}
      onClick={props.onClick}
      className="h-row rounded-control bg-fill px-3 text-label hover:bg-hover disabled:text-ink-tertiary disabled:hover:bg-fill"
    >
      {props.children}
    </button>
  )
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-label text-ink-secondary">{title}</h2>
      {children}
    </section>
  )
}

/** A figure in a panel's totals: its name, and its value right-aligned (inside a `<dl>`). */
export function Total({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-label text-ink-secondary">{label}</dt>
      <dd className="select-text text-body tabular-nums text-ink">{value}</dd>
    </div>
  )
}
