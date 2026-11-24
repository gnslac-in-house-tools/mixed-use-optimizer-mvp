// Port of Plaza-Practiko `vistas/paneles/useCerrarFuera.ts`.
import { useEffect, type RefObject } from 'react'

/** Closes a floating box on a click outside `root` or on Escape (only while it is open); `box`: the box itself when it
 *  is drawn elsewhere (a portal on the body), a click on it is inside too. */
export function useCloseOutside(open: boolean, close: () => void, root: RefObject<HTMLElement | null>, box?: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node) && !box?.current?.contains(e.target as Node)) close()
    }
    // Escape in the capture phase: it closes the box and stops there (the plan does not also clear the selection)
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      e.preventDefault()
      close()
      root.current?.querySelector<HTMLElement>('[aria-expanded],[aria-haspopup]')?.focus()
    }
    window.addEventListener('pointerdown', outside)
    window.addEventListener('keydown', key, true)
    return () => {
      window.removeEventListener('pointerdown', outside)
      window.removeEventListener('keydown', key, true)
    }
  }, [open, close, root, box])
}
