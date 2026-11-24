// Port of Plaza-Practiko `vistas/comunes/foco.ts`.
import type { KeyboardEvent } from 'react'

const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [href], [tabindex]:not([tabindex="-1"])'

/** Keeps the focus inside a dialog: Tab from the last control goes back to the first, and the other way round. */
export function trapTab(e: KeyboardEvent<HTMLElement>, root: HTMLElement | null) {
  if (!root) return
  const list = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)]
  if (list.length === 0) return
  const first = list[0]
  const last = list[list.length - 1]
  const active = document.activeElement
  if (e.shiftKey && (active === first || active === root)) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && active === last) {
    e.preventDefault()
    first.focus()
  }
}
