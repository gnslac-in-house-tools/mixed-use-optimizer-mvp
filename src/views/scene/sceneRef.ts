// What the rest of the app may ask of the mounted 3D scene, without importing three: the Export menu's image capture,
// the viewport's Frame button.
// The scene registers itself here while it is mounted (only one at a time) and clears it on unmount.
// Port of the `escenaRef` of Plaza-Practiko `vistas/tresd/Escena.tsx`.
import { create } from 'zustand'

interface SceneRef {
  /** A PNG (data URL) of the 3D view as it is now; null while no scene is mounted. */
  capturePng: (() => string) | null
  register(capture: (() => string) | null): void
  /** Frames the model (the camera's distance and angle as it opens); null while no scene is mounted. */
  frame: (() => void) | null
  registerFrame(frame: (() => void) | null): void
}

export const useSceneRef = create<SceneRef>()((set) => ({
  capturePng: null,
  register: (capture) => set({ capturePng: capture }),
  frame: null,
  registerFrame: (frame) => set({ frame }),
}))
