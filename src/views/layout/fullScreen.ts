// The browser's full screen (as in IZA): the whole app, the same as normal, without the browser's interface. Port of
// Plaza-Practiko `vistas/paneles/pantallaCompleta.ts`. The Export menu and the F key share it. The iPhone has no API:
// there the menu row is not drawn. Escape is the app's (it cancels the tool, lets go of the selection): in full screen
// the keyboard is locked on it (Chromium's Keyboard Lock), so a press reaches the app and only holding it leaves, as
// the browser says. Firefox and Safari have no lock: there Escape still leaves full screen.
import { useSyncExternalStore } from 'react'

export const fullScreenAvailable = (): boolean => typeof document !== 'undefined' && document.fullscreenEnabled === true

interface KeyboardLock {
  lock(keys?: string[]): Promise<void>
  unlock(): void
}
const keyboard = (): KeyboardLock | undefined => (navigator as Navigator & { keyboard?: KeyboardLock }).keyboard

/** Out of full screen however it was left (holding Escape too), the keyboard is let go. */
function release() {
  if (document.fullscreenElement) return
  document.removeEventListener('fullscreenchange', release)
  keyboard()?.unlock()
}

export function toggleFullScreen(): void {
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
  else
    void document.documentElement
      .requestFullscreen()
      .then(() => {
        document.addEventListener('fullscreenchange', release)
        return keyboard()?.lock(['Escape'])
      })
      .catch(() => {})
}

const subscribe = (notify: () => void) => {
  document.addEventListener('fullscreenchange', notify)
  return () => document.removeEventListener('fullscreenchange', notify)
}

/** Whether the app is in full screen. It follows `fullscreenchange`, so leaving by holding Esc updates it too. */
export function useFullScreen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => document.fullscreenElement !== null && document.fullscreenElement !== undefined,
    () => false,
  )
}
