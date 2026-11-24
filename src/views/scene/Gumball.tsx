// The 3D gumball (Decision "Gumball"): on the selected masses (on top of them, at their box's middle), three arrows: x
// and y move them along the plan, z up and down. A drag snaps as it goes (gumball.ts: the grid's modules, else whole
// metres; half metres up) and draws the masses where they would go; let go, it is one undo step. Up or down to a height
// where their building has a level: they go to it; where it has none, their level goes with them when they are all of
// its masses, else one is made there (Decision "Levels follow the masses"). Landing within SAME_FLOOR of another
// level's floor, a quiet notice asks whether it is that floor (*Same floor* puts them on it). Not in a Compare pane,
// nor while a look shows.
import { PivotControls } from '@react-three/drei'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { gridOf } from '../../engine/grid/index.ts'
import { massIsLocked } from '../../kinds/locked.ts'
import { actions } from '../../state/actions/index.ts'
import { useApp } from '../../state/store.ts'
import { offerSameFloor } from '../panels/buildingCommands.ts'
import { useLooking } from '../viewport/look.ts'
import type { SceneColors } from './colors.ts'
import { gumballAt, snapMove, targetElevation, useGumball } from './gumball.ts'
import { liftOf, useLaid } from './laid.ts'

/** px: a press on an arrow that moves less than this is a click, not a drag (nothing moves). */
const CLICK_PX = 4


/**
 * What a drag does when it ends: the plan's move, then the move up or down. The level follows its masses, or one is
 * made where they land (Decision "Levels follow the masses"); landing near another level's floor, a quiet notice asks
 * whether it is that floor (offerSameFloor).
 */
export function commitGumball(ids: string[], d: { x: number; y: number; z: number }): void {
  const { apply, project } = useApp.getState()
  const along = Math.abs(d.x) > 1e-9 || Math.abs(d.y) > 1e-9
  const target = Math.abs(d.z) > 1e-9 ? targetElevation(project, ids, d.z) : null
  const moved = (p: typeof project) => (along ? actions.moveMasses(p, ids, { x: d.x, y: d.y }) : p)
  if (target === null) {
    if (along) apply(moved)
    return
  }
  apply((p) => actions.moveMassesToElevation(moved(p), ids, target, true) ?? moved(p))
  const landed = useApp.getState().project.masses.find((m) => m.id === ids[0])
  if (landed) offerSameFloor(landed.levelId)
}

export function Gumball({ colors }: { colors: SceneColors }) {
  const ids = useApp((s) => s.selection.massIds)
  const project = useApp((s) => s.project)
  const derived = useApp((s) => s.derived)
  const option = useApp((s) => s.option)
  const looking = useLooking()
  const laid = useLaid()
  const offset = useGumball((s) => s.offset)
  const place = useMemo(() => gumballAt(project, derived, ids), [project, derived, ids])
  const lift = ids.length ? liftOf(laid, ids[0]) : 0
  const anchor = useMemo(() => (place ? new THREE.Vector3(place.at.x, place.top + lift, -place.at.y) : null), [place, lift])
  // the drag's start: the gumball's world position when it began
  const start = useRef<THREE.Vector3 | null>(null)
  // where the pointer went down and where it is (a click on an arrow moves nothing)
  const pointer = useRef({ down: { x: 0, y: 0 }, at: { x: 0, y: 0 } })
  useEffect(() => {
    const down = (e: PointerEvent) => {
      pointer.current = { down: { x: e.clientX, y: e.clientY }, at: { x: e.clientX, y: e.clientY } }
    }
    const move = (e: PointerEvent) => {
      pointer.current.at = { x: e.clientX, y: e.clientY }
    }
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('pointermove', move, true)
    return () => {
      window.removeEventListener('pointerdown', down, true)
      window.removeEventListener('pointermove', move, true)
    }
  }, [])
  const matrix = useMemo(() => {
    if (!anchor) return new THREE.Matrix4()
    const o = offset ?? { x: 0, y: 0, z: 0 }
    return new THREE.Matrix4().makeTranslation(anchor.x + o.x, anchor.y + o.z, anchor.z - o.y)
  }, [anchor, offset])
  if (!anchor || looking || project.masses.some((m) => ids.includes(m.id) && massIsLocked(project, m))) return null
  const grid = gridOf(project, option)
  return (
    <PivotControls
      matrix={matrix}
      autoTransform={false}
      disableRotations
      disableScaling
      disableSliders
      fixed
      scale={70}
      lineWidth={2.5}
      depthTest={false}
      axisColors={[colors.error, colors.met, colors.gridLine]}
      hoveredColor={colors.halo}
      onDragStart={() => {
        start.current = anchor.clone()
      }}
      onDrag={(_l, _dl, w) => {
        const from = start.current
        if (!from) return
        const at = new THREE.Vector3().setFromMatrixPosition(w)
        // the scene's (x, y up, z) back to the plan's (x, y; z up)
        const d = snapMove({ x: at.x - from.x, y: -(at.z - from.z), z: at.y - from.y }, grid)
        useGumball.getState().set(ids, d)
      }}
      onDragEnd={() => {
        const d = useGumball.getState().offset
        start.current = null
        useGumball.getState().set([], null)
        const { down, at } = pointer.current
        if (d && Math.hypot(at.x - down.x, at.y - down.y) >= CLICK_PX) commitGumball(ids, d)
      }}
    />
  )
}
