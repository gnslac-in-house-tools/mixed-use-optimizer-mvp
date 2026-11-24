// The plan camera as a React hook: measures the SVG, fits the content, zooms with the wheel around the cursor and
// pans by dragging the empty background. The math lives in camera.ts.
// With a `box` (the Select tool, Decision "Multi-selection"), a left drag on the background draws a selection window
// instead, as in AutoCAD and Revit; the pan is then the middle button, Space + drag, or a finger (touch has no window).
// Without one, the left button pans too. The block editor's plan uses it as well (BE.9), its bubbles and dimensions
// kept clear of the edges with `pad`.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react'
import type { Point } from '../../model/schema.ts'
import type { Bounds } from '../../engine/geom/polygon.ts'
import type { Box } from './windowSelect.ts'
import { CLICK_TOLERANCE, fit, pan, toWorld, UNMEASURED_SIZE, viewBoxOf, zoomAt, ZOOM_MAX, ZOOM_MIN, type Size, type View } from './camera.ts'
import { beginDrag } from '../controls/beginDrag.ts'

export interface PlanCamera {
  svgRef: React.RefObject<SVGSVGElement | null>
  view: View | null
  viewBox: string | undefined
  /** Screen px per metre (to size text and handles in pixels). */
  scale: number
  /** World point (m, y up) under a pointer event. */
  toWorld(ev: { clientX: number; clientY: number }): Point
  /** Back to the whole content. */
  fitContent(): void
  /** The view is still the one fitted: not zoomed, panned or moved since (the block plan fits again as its block changes). */
  untouched: boolean
  /** Looks at a world point without changing the zoom (a warning's "go to"). */
  centerOn(p: Point): void
  /** Handlers for the background: pan (or a window, with `box`) on drag, `onClick` when it was a click. */
  backgroundHandlers(onClick: (e: { shiftKey: boolean; clientX: number; clientY: number }) => void, box?: BoxHandlers): {
    onPointerDown(e: PointerEvent<SVGSVGElement>): void
    onPointerMove(e: PointerEvent<SVGSVGElement>): void
    onPointerUp(e: PointerEvent<SVGSVGElement>): void
  }
}

/** A selection window being drawn: `move` while dragging, `end` on release, `cancel` on Escape. In world metres. */
export interface BoxHandlers {
  move(box: Box): void
  end(box: Box, e: { shiftKey: boolean }): void
  cancel(): void
}

/** What to frame: a box, the screen px a window covers on its left (`left`, none by default), and the screen px to
 *  keep clear on every side besides the margin (`pad`, none by default: the block plan's bubbles and dimensions). */
export type Framed = Bounds & { left?: number; pad?: number }

/** `content()` is read when fitting (on first measure and on fitContent), not on every render. */
export function usePlanCamera(content: () => Framed): PlanCamera {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [size, setSize] = useState<Size | null>(null)
  const [view, setView] = useState<View | null>(null)
  const fitted = useRef<View | null>(null) // zoom limits are relative to this
  const contentRef = useRef(content)
  contentRef.current = content

  // Measure the SVG and follow its size.
  useLayoutEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    if (typeof ResizeObserver === 'undefined') {
      setSize(UNMEASURED_SIZE)
      return
    }
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) setSize({ w: width, h: height })
    })
    ro.observe(svg)
    return () => ro.disconnect()
  }, [])

  const fittedAspect = useRef(0) // the plan's width / height when it was last fitted
  const fitContent = useCallback(() => {
    if (!size) return
    const b = contentRef.current()
    const pad = b.pad ?? 0
    // fitted in what the pad leaves, centred all the same
    const v = fit(b, pad > 0 ? { w: Math.max(1, size.w - 2 * pad), h: Math.max(1, size.h - 2 * pad) } : size, undefined, b.left ?? 0)
    fitted.current = v
    fittedAspect.current = size.w / size.h
    setView(v)
  }, [size])

  // Fit once, when the size is first known; again when its shape changes by more than 25 % (Plan → Split, a side
  // panel shown or hidden), as the 3D view does. Small changes (resizing the window) leave the user's view.
  useEffect(() => {
    if (!size) return
    if (!fitted.current || Math.abs(size.w / size.h / fittedAspect.current - 1) > 0.25) fitContent()
  }, [size, fitContent])

  // Wheel zoom. A native listener: React's wheel listener is passive and cannot stop the page from scrolling.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg || !size) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = svg.getBoundingClientRect()
      const base = fitted.current?.scale ?? 1
      setView((v) => v && zoomAt(v, size, e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015), base * ZOOM_MIN, base * ZOOM_MAX))
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [size])

  const worldOf = useCallback(
    (ev: { clientX: number; clientY: number }): Point => {
      const svg = svgRef.current
      if (!svg || !size || !view) return { x: 0, y: 0 }
      const r = svg.getBoundingClientRect()
      return toWorld(view, size, ev.clientX - r.left, ev.clientY - r.top)
    },
    [size, view],
  )

  // Background drag = pan, or a window. Remembers where it started to tell a click from a drag.
  const panning = useRef<{
    id: number
    x: number
    y: number
    lastX: number
    lastY: number
    moved: boolean
    /** Drawing a window from this world point (null: panning). */
    box: (BoxHandlers & { a: Point }) | null
  } | null>(null)
  // Space held: a left drag pans even where it would draw a window (Photoshop, Figma). Not while typing in a field.
  const space = useRef(false)
  useEffect(() => {
    const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !typing(e.target)) space.current = true
      // Escape drops a window being drawn
      if (e.key === 'Escape' && panning.current?.box) {
        panning.current.box.cancel()
        panning.current = null
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') space.current = false
    }
    const blur = () => {
      space.current = false
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [])

  const backgroundHandlers: PlanCamera['backgroundHandlers'] = (onClick, box) => ({
    onPointerDown(e) {
      if (e.button !== 0 && e.button !== 1) return
      beginDrag(e)
      const windowing = box && e.button === 0 && e.pointerType !== 'touch' && !space.current
      panning.current = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        moved: false,
        box: windowing ? { ...box, a: worldOf(e) } : null,
      }
    },
    onPointerMove(e) {
      const p = panning.current
      if (!p || p.id !== e.pointerId) return
      if (!p.moved && Math.hypot(e.clientX - p.x, e.clientY - p.y) < CLICK_TOLERANCE) return
      p.moved = true
      if (p.box) return p.box.move({ a: p.box.a, b: worldOf(e) })
      const dx = e.clientX - p.lastX
      const dy = e.clientY - p.lastY
      p.lastX = e.clientX
      p.lastY = e.clientY
      setView((v) => v && pan(v, dx, dy))
    },
    onPointerUp(e) {
      const p = panning.current
      if (!p || p.id !== e.pointerId) return
      panning.current = null
      e.currentTarget.releasePointerCapture?.(e.pointerId)
      if (!p.moved) onClick(e)
      else if (p.box) p.box.end({ a: p.box.a, b: worldOf(e) }, e)
    },
  })

  return {
    svgRef,
    view,
    viewBox: view && size ? viewBoxOf(view, size) : undefined,
    scale: view?.scale ?? 1,
    toWorld: worldOf,
    fitContent,
    untouched: view !== null && view === fitted.current,
    centerOn: (p: Point) => setView((v) => v && { ...v, cx: p.x, cy: p.y }),
    backgroundHandlers,
  }
}
