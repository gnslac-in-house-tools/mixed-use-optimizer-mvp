// The optimizer's main buttons (Decision "No accent"): its button beside the steps, Turn on, ▶ Run, Stop and Resume,
// in the interface's own greys and its selection, white and raised as the step switch's step in view: no colour of
// their own, no black, no sparkle.
import type { ReactNode } from 'react'

/**
 * Raised (white, as a selected step: the main action, or the button that is on) or plain (grey, as the switch's track).
 * `progress` (0 to 1) fills a plain one from the left, faintly, while a run goes.
 */
export function MainButton(props: {
  children: ReactNode
  onClick(): void
  filled?: boolean
  progress?: number
  disabled?: boolean
  title?: string
  pressed?: boolean
  label?: string
  className?: string
}) {
  const { filled = true, progress } = props
  return (
    <button
      type="button"
      aria-label={props.label}
      aria-pressed={props.pressed}
      title={props.title}
      disabled={props.disabled}
      onClick={props.onClick}
      className={`pressable relative overflow-hidden rounded-pill px-3 py-1 disabled:opacity-40 ${filled ? 'border border-separator bg-panel font-semibold text-ink shadow-control' : 'border border-transparent bg-fill text-ink-segment hover:text-ink'} ${props.className ?? ''}`}
    >
      {progress !== undefined && !filled && <span aria-hidden className="absolute inset-y-0 left-0 bg-ink opacity-10" style={{ width: `${Math.round(progress * 100)}%` }} />}
      <span className="relative flex items-center justify-center gap-1.5 whitespace-nowrap">{props.children}</span>
    </button>
  )
}
