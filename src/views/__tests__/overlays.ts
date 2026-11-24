// A test helper, not a test: the overlays that were chips in the drafting bar's *Overlays ▾* (Phase AS.3 took the menu away) are
// View › Overlays now, and an eye of Layers. `toggleOverlay('graph')` runs the command the menu row runs; `overlayOn` is its tick and
// `overlayEnabled` whether it can run (the plan's three rest in the 3D, Labels with Schematic detail).
import { act } from '@testing-library/react'
import { commandOf, runCommand } from '../commands/index.ts'

const IDS = {
  graph: 'view.overlay.graph',
  map: 'view.overlay.map',
  planes: 'view.overlay.planes',
  labels: 'view.overlay.labels',
  dims: 'view.overlay.dims',
  issues: 'view.overlay.issues',
  rules: 'view.overlay.rules',
} as const

export type Overlay = keyof typeof IDS

/** Runs the overlay's command, as its menu row does; false when it says it cannot run. */
export function toggleOverlay(name: Overlay): boolean {
  let ran = false
  act(() => {
    ran = runCommand(IDS[name])
  })
  return ran
}

/** Whether the overlay is on (the row's tick). */
export const overlayOn = (name: Overlay): boolean => commandOf(IDS[name])?.checked?.() ?? false

/** Whether the overlay can be toggled now (the row is not greyed). */
export const overlayEnabled = (name: Overlay): boolean => (commandOf(IDS[name])?.enabled?.() ?? true) === true
