// A note (Decision "Help"; the user: "these long instructions that show up all the time can hide behind a ?"): a
// line that says how to use what it stands under. It shows only while Help is on (Help › Help, F1 or ?), so the panels stay
// short; the tooltips and the empty states (what to do when there is nothing yet) always show.
import type { ReactNode } from 'react'
import { useUi } from './ui.ts'

export function Note({ children, className = 'text-caption text-ink-secondary' }: { children: ReactNode; className?: string }) {
  const help = useUi((s) => s.help)
  if (!help) return null
  return (
    <p data-note="" className={`select-text ${className}`}>
      {children}
    </p>
  )
}
