// Each level as a plane at its height in the 3D (Decision "Level planes"; the user: "see them in the 3D view as some
// reference plane, and turn the height planes on or off"), Show's *Levels*: for every shown building of the active
// option, a thin sheet at each level's floor over the building's footprint (its masses' box, a little wider; the
// site's when it has none), its edge drawn, the active level's darker. On the ground's surface each building's stand on
// its platform (Decision "Platforms in 3D").
// A click on a plane (not on a mass standing on it; Decision "Level chip") picks its level: a chip at its corner names
// it and holds its floor's height, to type (Enter or leaving keeps it, Escape leaves it), and a gumball's up arrow
// moves it by half metres (the levels above stay where they are: updateLevel's elevation moves it alone). A click on
// empty space, or another plane, lets it go.
import { Html, PivotControls } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { create } from 'zustand'
import type { Id, Project } from '../../model/schema.ts'
import { bounds } from '../../engine/geom/polygon.ts'
import type { Derived } from '../../engine/types.ts'
import { actions } from '../../state/actions/index.ts'
import { useApp } from '../../state/store.ts'
import { shownBuildings } from '../buildingView.ts'
import { useLayerView } from '../layers/layerView.ts'
import { useShown } from '../viewport/look.ts'
import type { SceneColors } from './colors.ts'
import { Z_STEP } from './gumball.ts'
import { buildingLift, useLaid } from './laid.ts'
import { t as tr } from '../../i18n/idioma.ts' // mixed-use-mvp

/** The level whose chip shows (the view's). */
export const useLevelChip = create<{ levelId: Id | null; pick(id: Id | null): void }>()((set) => ({
  levelId: null,
  pick: (levelId) => set({ levelId }),
}))

/** m: a mass this much nearer than the plane under the pointer is what the click is on. */
const ON_MASS = 0.5

/** The chip: the level's name and its floor's height, typed. */
function Chip({ id, name, elevation }: { id: Id; name: string; elevation: number }) {
  const [text, setText] = useState(elevation.toFixed(2))
  useEffect(() => setText(elevation.toFixed(2)), [elevation])
  const keep = () => {
    const v = Number(text.replace(',', '.'))
    if (Number.isFinite(v) && Math.abs(v - elevation) > 1e-9) useApp.getState().apply((p) => actions.updateLevel(p, id, { elevation: Math.round(v * 1000) / 1000 }))
    else setText(elevation.toFixed(2))
  }
  return (
    <div role="group" aria-label={`Level ${name}`} className="glass flex items-center gap-1.5 whitespace-nowrap rounded-pill py-1 pl-2.5 pr-1.5 text-label text-ink" onPointerDown={(e) => e.stopPropagation()}>
      <span className="font-medium">{name}</span>
      <input
        aria-label={`${name}'s floor height`}
        title={tr("The level's floor height (m); its gumball moves it by half metres")}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={keep}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            setText(elevation.toFixed(2))
            useLevelChip.getState().pick(null)
          }
        }}
        className="h-6 w-16 select-text rounded-control border border-separator bg-panel-sunken px-1.5 text-right tabular-nums outline-none focus:border-ink"
      />
      <span className="text-ink-secondary">m</span>
    </div>
  )
}

/** A level's plane: the building's footprint box at the level's floor (plan axes: x, y; `z` the elevation). */
export interface PlaneSpec {
  id: Id
  building: Id
  x: number
  y: number
  z: number
  width: number
  depth: number
  active: boolean
}

/** Every shown building's levels as planes: its masses' box a little wider (the site's when it has none). Pure. */
export function levelPlanes(project: Project, derived: Derived, option: Id, hidden: readonly string[], active: Id): PlaneSpec[] {
  const site = derived.site.polygon
  return shownBuildings(project, option, hidden).flatMap((b) => {
    const ids = new Set(b.levels.map((l) => l.id))
    const pts = project.masses.filter((m) => ids.has(m.levelId)).flatMap((m) => derived.masses[m.id]?.polygon ?? [])
    const from = pts.length ? pts : (site ?? [])
    if (from.length < 2) return []
    const box = bounds(from)
    const pad = Math.max(box.maxX - box.minX, box.maxY - box.minY) * (pts.length ? 0.12 : 0.02)
    return b.levels.map((l) => ({
      id: l.id,
      building: b.id,
      x: (box.minX + box.maxX) / 2,
      y: (box.minY + box.maxY) / 2,
      z: l.elevation,
      width: box.maxX - box.minX + 2 * pad,
      depth: box.maxY - box.minY + 2 * pad,
      active: l.id === active,
    }))
  })
}

export function LevelPlanes({ colors }: { colors: SceneColors }) {
  const chip = useLevelChip((s) => s.levelId)
  const [dz, setDz] = useState(0)
  const start = useRef<number | null>(null)
  const project = useShown((s) => s.project)
  const derived = useShown((s) => s.derived)
  const option = useApp((s) => s.option)
  const active = useApp((s) => s.level)
  const hidden = useLayerView((s) => s.hidden)
  const laid = useLaid()

  const planes = useMemo(() => {
    // one sheet per building, shared by its levels
    const sheets = new Map<Id, { sheet: THREE.PlaneGeometry; edge: THREE.EdgesGeometry }>()
    return levelPlanes(project, derived, option, hidden, active).map((p) => {
      let g = sheets.get(p.building)
      if (!g) {
        const sheet = new THREE.PlaneGeometry(p.width, p.depth)
        sheet.rotateX(-Math.PI / 2)
        g = { sheet, edge: new THREE.EdgesGeometry(sheet) }
        sheets.set(p.building, g)
      }
      const level = project.buildings.flatMap((b) => b.levels).find((l) => l.id === p.id)!
      return {
        id: p.id,
        name: level.name,
        elevation: level.elevation,
        at: new THREE.Vector3(p.x, p.z + buildingLift(laid, p.building), -p.y),
        corner: new THREE.Vector3(p.x - p.width / 2, p.z + buildingLift(laid, p.building), -(p.y + p.depth / 2)),
        ...g,
        on: p.active,
      }
    })
  }, [project, derived, option, hidden, active, laid])

  useEffect(
    () => () => {
      for (const p of new Set(planes.flatMap((x) => [x.sheet, x.edge]))) p.dispose()
    },
    [planes],
  )

  const click = (id: Id) => (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 4) return // a camera drag
    // a mass on the plane, or in front of it, is what was clicked
    if (e.intersections.some((x) => typeof x.object.userData?.massId === 'string' && x.distance <= e.distance + ON_MASS)) return
    e.stopPropagation()
    useLevelChip.getState().pick(id)
  }
  const picked = planes.find((p) => p.id === chip)

  return (
    <group>
      {planes.map((p) => (
        <group key={p.id} position={p.id === chip ? p.at.clone().setY(p.at.y + dz) : p.at} userData={{ levelPlane: p.id }}>
          <mesh geometry={p.sheet} renderOrder={5} onClick={click(p.id)}>
            <meshBasicMaterial color={colors.link} transparent opacity={p.on || p.id === chip ? 0.16 : 0.06} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
          <lineSegments geometry={p.edge} raycast={() => null}>
            <lineBasicMaterial color={colors.link} transparent opacity={p.on || p.id === chip ? 0.9 : 0.4} />
          </lineSegments>
        </group>
      ))}
      {picked && (
        <>
          <Html position={picked.corner.clone().setY(picked.corner.y + dz)} style={{ transform: 'translate(8px, -120%)' }} zIndexRange={[20, 0]}>
            <Chip id={picked.id} name={picked.name} elevation={picked.elevation + dz} />
          </Html>
          <PivotControls
            matrix={new THREE.Matrix4().makeTranslation(picked.corner.x, picked.corner.y + dz, picked.corner.z)}
            autoTransform={false}
            activeAxes={[false, true, false]}
            disableRotations
            disableScaling
            disableSliders
            fixed
            scale={60}
            lineWidth={2.5}
            depthTest={false}
            axisColors={[colors.error, colors.met, colors.gridLine]}
            hoveredColor={colors.halo}
            onDragStart={() => {
              start.current = picked.corner.y
            }}
            onDrag={(_l, _dl, w) => {
              if (start.current === null) return
              setDz(Math.round((new THREE.Vector3().setFromMatrixPosition(w).y - start.current) / Z_STEP) * Z_STEP)
            }}
            onDragEnd={() => {
              start.current = null
              setDz((by) => {
                if (by !== 0) {
                  const to = Math.round((picked.elevation + by) * 1000) / 1000
                  // after this render: the store's change re-renders the planes at the new height
                  queueMicrotask(() => useApp.getState().apply((p) => actions.updateLevel(p, picked.id, { elevation: to })))
                }
                return 0
              })
            }}
          />
        </>
      )}
    </group>
  )
}
