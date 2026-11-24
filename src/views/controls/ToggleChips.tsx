// Switches that turn on and off one by one (the drafting bar's snap, Ortho, Grid, Dims), with the segmented control's
// look (`Segmented.tsx`): a grey track, the white pill with its shadow under what is on, grey ink for what is off.
// Never a black fill: on and off read like the rest of the app's controls.
import type { ReactNode } from 'react'

export function ChipTrack({ children, dim = false }: { children: ReactNode; dim?: boolean }) {
  return <div className={`flex shrink-0 items-center gap-0.5 rounded-segment bg-fill p-0.5 ${dim ? 'opacity-50' : ''}`}>{children}</div>
}

export function ToggleChip(props: {
  pressed: boolean
  title: string
  /** The accessible name when the chip shows only a sign. */
  label?: string
  disabled?: boolean
  /** The smaller chips (Show's, Decision "Show fixed"). */
  small?: boolean
  /** A guided tour's anchor (`data-tour`). */
  tour?: string
  onClick(): void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      data-tour={props.tour}
      aria-pressed={props.pressed}
      aria-label={props.label}
      title={props.title}
      disabled={props.disabled}
      onClick={props.onClick}
      className={`pressable flex items-center justify-center gap-1 rounded-segment-pill text-label ${props.small ? 'h-[1.25rem] min-w-[1.25rem] px-1.5' : 'h-6 min-w-6 px-2'} ${
        props.pressed ? 'bg-panel text-ink shadow-control' : 'text-ink-segment hover:text-ink'
      } disabled:cursor-default disabled:hover:text-ink-segment`}
    >
      {props.children}
    </button>
  )
}
