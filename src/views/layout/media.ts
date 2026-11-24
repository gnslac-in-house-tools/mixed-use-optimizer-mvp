// The screen sizes that change the frame's structure (not only its style). `usePhone` is a port of Plaza-Practiko
// `hooks/usePhone.ts`. What only changes size or place uses Tailwind's `phone:` and `panel:` variants instead.
import { useEffect, useState } from 'react'

/** The `phone` breakpoint of tailwind.config.js: a narrow portrait or a very low landscape. Change both together. */
export const PHONE_QUERY = '(max-width: 767.98px), (max-height: 519.98px)'
/** The `panel` breakpoint of tailwind.config.js: from here the side panels are columns; below, sheets. */
export const WIDE_QUERY = '(min-width: 880px)'

/** Without matchMedia (jsdom, tests) the answer is the desktop's: not a phone, wide. */
function matches(query: string, fallback: boolean): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : fallback
}

function useMedia(query: string, fallback: boolean): boolean {
  const [on, setOn] = useState(() => matches(query, fallback))
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia(query)
    const update = () => setOn(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [query])
  return on
}

export const isPhone = (): boolean => matches(PHONE_QUERY, false)
export const isWide = (): boolean => matches(WIDE_QUERY, true)

/** A phone: the ☰ menu takes the top bar, no Split view, the panels come up from below. */
export const usePhone = (): boolean => useMedia(PHONE_QUERY, false)

/** Wide enough for the side panels as columns next to the viewport. */
export const useWide = (): boolean => useMedia(WIDE_QUERY, true)
