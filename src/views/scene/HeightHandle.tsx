// mixed-use-mvp: push-pull in 3D. On the one selected mass, an up arrow at the east end of its top: dragged, the mass
// grows or shrinks by whole storeys of its level's height (pushPull.ts), drawn as a ghost with its height and storeys;
// let go, it is one undo step (actions.updateMass). Its storeys follow by themselves (the residential module derives
// its levels from the height). Not while a look shows, nor on a locked mass.
import { PivotControls } from '@react-three/drei'
import { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { levelOf, massHeight } from '../../engine/levels.ts'
import { massIsLocked } from '../../kinds/locked.ts'
import { actions } from '../../state/actions/index.ts'
import { useApp } from '../../state/store.ts'
import { useLooking } from '../viewport/look.ts'
import type { SceneColors } from './colors.ts'
import { extrude } from './geometry3d.ts'
import { pushPullHeight, pushPullLabel, usePushPull } from './pushPull.ts'

export function HeightHandle({ colors }: { colors: SceneColors }) {
  const ids = useApp((s) => s.selection.massIds)
  const project = useApp((s) => s.project)
  const derived = useApp((s) => s.derived)
  const looking = useLooking()
  const [preview, setPreviewState] = useState<number | null>(null)
  // the last height of the drag, for its end (the controls may keep an earlier handler)
  const last = useRef<number | null>(null)
  const setPreview = (h: number | null) => {
    last.current = h
    setPreviewState(h)
    usePushPull.getState().set(h === null || !place ? null : pushPullLabel(h, place.step, place.h0))
  }
  const mass = ids.length === 1 ? project.masses.find((m) => m.id === ids[0]) : undefined
  const dm = mass ? derived.masses[mass.id] : undefined
  const place = useMemo(() => {
    if (!mass || !dm || dm.polygon.length < 3) return null
    const xs = dm.polygon.map((q) => q.x), ys = dm.polygon.map((q) => q.y)
    const h0 = massHeight(project, mass)
    const step = levelOf(project, mass).height
    return { x: Math.max(...xs), y: (Math.min(...ys) + Math.max(...ys)) / 2, base: dm.span[1] - h0, h0, step }
  }, [mass, dm, project])
  const ghost = useMemo(() => (dm && place && preview !== null ? extrude(dm.polygon, place.base, preview, dm.holes) : null), [dm, place, preview])
  if (!mass || !dm || !place || looking || massIsLocked(project, mass)) return null
  const matrix = new THREE.Matrix4().makeTranslation(place.x, place.base + place.h0, -place.y)
  return (
    <group>
      <PivotControls
        matrix={matrix}
        autoTransform={false}
        activeAxes={[false, true, false]}
        disableRotations
        disableScaling
        disableSliders
        fixed
        scale={90}
        lineWidth={4}
        depthTest={false}
        axisColors={[colors.error, '#E8892B', colors.gridLine]}
        hoveredColor={colors.halo}
        onDrag={(_l, _dl, w) => {
          const at = new THREE.Vector3().setFromMatrixPosition(w)
          setPreview(pushPullHeight(place.h0, at.y - (place.base + place.h0), place.step))
        }}
        onDragEnd={() => {
          const h = last.current
          setPreview(null)
          if (h !== null && Math.abs(h - place.h0) > 1e-6) useApp.getState().apply((p) => actions.updateMass(p, mass.id, { height: h }))
        }}
      />
      {ghost && (
        <mesh geometry={ghost}>
          <meshStandardMaterial color="#E8892B" transparent opacity={0.25} depthWrite={false} />
        </mesh>
      )}
    </group>
  )
}
