// The start of every drag (AS.6, Decision "No text selected by a drag"): one helper, so no handle forgets a step.
// A pointerdown that starts a drag
//   1. cancels its default (`preventDefault`): the browser selects no text by the drag, and the compatibility mousedown
//      that follows is not sent (a click and a double click still come: they are other events);
//   2. captures the pointer on the handle, so the move and the release come to it wherever the pointer goes;
//   3. moves the focus (cancelling the default stopped the browser's own), as the browser would have: to the handle, or
//      its nearest focusable ancestor (not disabled; a tabindex of -1 counts), so its arrow and Escape keys work; with
//      none, the active element is blurred, so a field being edited saves on blur, as a click elsewhere did.
// A handler calls it where the drag actually starts (after its guards and its refusals), not at the top.
import type { PointerEvent } from 'react'

/** What takes the focus by itself when pressed (or a tabindex says so), unless it is disabled. */
const FOCUSABLE = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]'

/**
 * @param target what captures the pointer, the handler's own element by default (the plan's svg, when a bubble inside
 * it starts a drag that the svg follows).
 */
export function beginDrag(e: Pick<PointerEvent, 'preventDefault' | 'pointerId' | 'currentTarget'>, target: Element | null = e.currentTarget as Element | null): void {
  e.preventDefault()
  try {
    target?.setPointerCapture?.(e.pointerId)
  } catch {
    // a pointer that is already gone (a synthetic event, a touch that ended): the drag still follows the window
  }
  const handle = e.currentTarget as unknown as HTMLElement | SVGElement | null
  const focusable = handle?.closest?.<HTMLElement | SVGElement>(FOCUSABLE) ?? null
  if (focusable && typeof focusable.focus === 'function') focusable.focus({ preventScroll: true })
  else if (document.activeElement instanceof HTMLElement || document.activeElement instanceof SVGElement) document.activeElement.blur()
}
