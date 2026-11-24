// The 3D scene's colours. three.js does not understand CSS variables, so the scene reads the tokens of
// src/styles/tokens.css instead of writing hex values in components. Program colours are project data (already hex)
// and pass through as they are. The tokens are `light-dark()` pairs (Decision "Dark mode"): a token is read through a
// probe's computed `color`, which the browser resolves to one rgb() for the theme that shows; the scene reads them
// again when the theme changes.
import { useMemo } from 'react'
import { useShownTheme } from '../layout/theme.ts'
import { useUi } from '../layout/ui.ts'

/** A token's colour as rgb(), e.g. `token('--scene-edge')`. Without a stylesheet (tests) a neutral grey. */
export function token(name: string): string {
  if (typeof document === 'undefined' || !document.body) return 'grey'
  const probe = document.createElement('i')
  probe.style.display = 'none'
  probe.style.color = `var(${name})`
  document.body.appendChild(probe)
  const v = getComputedStyle(probe).color.trim()
  probe.remove()
  return /^(rgb|#)/.test(v) ? v : 'grey'
}

/** Every scene colour at once. */
export function sceneColors() {
  return {
    bg: token('--scene-bg'),
    edge: token('--scene-edge'),
    outline: token('--scene-outline'),
    halo: token('--scene-halo'),
    noProgram: token('--scene-no-program'),
    context: token('--scene-context'),
    site: token('--scene-site'),
    gridCell: token('--scene-grid-cell'),
    gridSection: token('--scene-grid-section'),
    // the ground (Phase E.2c): its surface, its major contours, and the slope's classes as the plan's
    terrain: token('--scene-terrain'),
    contour: token('--scene-contour'),
    slope: [1, 2, 3, 4, 5].map((k) => token(`--slope-${k}`)),
    // the platforms' cut and fill (E.3c), as the plan's classes (index 0: the ground as it was)
    cut: [1, 2, 3].map((k) => token(`--cut-${k}`)),
    fill: [1, 2, 3].map((k) => token(`--fill-${k}`)),
    sky: token('--scene-sky'),
    groundLight: token('--scene-ground-light'),
    error: token('--status-over'),
    met: token('--status-within'),
    link: token('--ink-secondary'),
    // the paving (Phase S.4): the plan's own colours
    road: token('--road'),
      court: token('--court'),
    stall: token('--stall'),
    // the docks' doors and the gates' posts (Decision "Fixtures in 3D"), as the plan's doors
    door: token('--ink-secondary'),
    // the gumball's arrows (Decision "Gumball"): x red, y (up) green, the plan's y the grid's blue
    gridLine: token('--grid-line'),
    // the reference lines (Phase AS.5): the plan's guide colour
    guide: token('--guide'),
  }
}

export type SceneColors = ReturnType<typeof sceneColors>

/** The scene colours of the theme that shows, read again when it changes. */
export function useSceneColors(): SceneColors {
  const shown = useShownTheme(useUi((s) => s.theme))
  // the tokens change with the theme: `shown` is the key, though sceneColors does not take it
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(sceneColors, [shown])
}
