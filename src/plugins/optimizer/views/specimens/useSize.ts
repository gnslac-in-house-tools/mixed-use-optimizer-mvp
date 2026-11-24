// An element's size, followed (a chart draws in pixels, so its dots stay round at any width). Where nothing measures
// (the tests), the size given.
import { useLayoutEffect, useRef, useState } from 'react'

export interface Size {
  w: number
  h: number
}

export function useSize<T extends Element>(fallback: Size) {
  const ref = useRef<T>(null)
  const [size, setSize] = useState<Size>(fallback)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) setSize((s) => (s.w === width && s.h === height ? s : { w: width, h: height }))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, size] as const
}
