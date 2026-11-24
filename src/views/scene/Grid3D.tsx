// The structural grid in the 3D (Decision "Grid in 3D"; the user: "the grid shows in 3D"), while Show's Grid is on and
// the option stands on one: its bay lines across the site (the module lines would hatch the ground), lying on the ground (on its
// surface while Show's Terrain lays it, exaggerated as it is), in the colour and at the opacity Show's Grid sets. The
// bubbles and the names stay the plan's. Faint, as the plan's hairlines (Decision "Grid always"): the paper the model
// stands on, not a drawing of its own. Never answers the pointer.
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { Id, Point } from '../../model/schema.ts'
import { gridLines, gridOf, nameBase } from '../../engine/grid/index.ts'
import { useShown } from '../viewport/look.ts'
import { gridToken, useGridShown, useGridView } from '../plan/grid/gridView.ts'
import { token, type SceneColors } from './colors.ts'
import { useLaid } from './laid.ts'
import { drapedSegments, LIFT } from './terrain3d.ts'

/** How far past the site the lines run (m). */
const PAD = 6
/** The lines' opacity at Show's Grid's 100 %: faint, as the plan's. */
const FAINT = 0.35

/** Lines flat on the scene's 0, a hair over it. */
function flatSegments(lines: Point[][]): Float32Array {
  const out: number[] = []
  for (const [a, b] of lines) out.push(a.x, LIFT, -a.y, b.x, LIFT, -b.y)
  return new Float32Array(out)
}

function Lines({ positions, color, opacity, name }: { positions: Float32Array; color: string; opacity: number; name: string }) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return g
  }, [positions])
  useEffect(() => () => geometry.dispose(), [geometry])
  if (positions.length === 0) return null
  return (
    <lineSegments name={name} geometry={geometry} raycast={() => null}>
      <lineBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
    </lineSegments>
  )
}

export function Grid3D({ option, colors }: { option?: Id; colors: SceneColors }) {
  const project = useShown((s) => s.project)
  const derived = useShown((s) => s.derived)
  const visible = useGridShown()
  const colorKey = useGridView((s) => s.color)
  const opacity = useGridView((s) => s.opacity)
  const laid = useLaid(option)
  const g = gridOf(project, option ?? derived.option)
  const site = derived.site.polygon
  const lines = useMemo(() => {
    if (!g) return null
    const extent = site ?? Object.values(derived.masses).flatMap((m) => m.polygon)
    if (extent.length === 0) return null
    const segs = gridLines(g, extent, nameBase(g, site), { pad: PAD }).map((l) => [l.a, l.b])
    return laid ? drapedSegments(segs, laid.ground.elevation, laid.base, 3, laid.k, true) : flatSegments(segs)
  }, [g, site, derived.masses, laid])
  // the token read again with the colour, and with the theme (`colors` changes with it)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const color = useMemo(() => token(gridToken(colorKey)), [colorKey, colors])
  if (!visible || !lines) return null
  return (
    <group name="grid-3d">
      <Lines name="grid-3d:bays" positions={lines} color={color} opacity={opacity * FAINT} />
    </group>
  )
}
