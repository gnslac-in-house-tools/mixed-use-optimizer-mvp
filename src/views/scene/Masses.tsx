// Masses in 3D: extruded by their height, in their program's colour (roughness 0.92), white edges at 35 %. Port of
// Plaza-Practiko `vistas/tresd/Masas.tsx`. Hover glows white at 0.12; the selected one gets IZA's double outline
// (light halo, dark core). A mass named in an error issue gets red edges, as its red outline in the plan. A mass that
// is not built (outdoor storage) is a thin slab, without volume edges. Clicking a mass selects it, in the plan too;
// Shift+click adds it to the selection or takes it out (Decision "Multi-selection"). A locked mass is seen and not picked
// (the padlock is CAD's): a click on it picks nothing and says where the lock comes off; a tree's row picks it.
// Levels (Decision "Levels"): a mass stands at its level's elevation, once per floor when the level repeats ×N; the
// active building's other levels are faded (Practiko: 0.35), all of them solid in All. On the ground's surface (Show's
// Terrain on, Decision "Platforms in 3D") its levels stand on its platform: lifted by its level over the scene's 0.
// Buildings (Decision "Buildings layout"): only the active option's shown buildings; a context building is grey, the
// others take their program's colour, or their building's with *Color by: Building*.
// With `option` (a Compare pane, Decision "Compare options"): that option's, read-only: nothing fades, nothing is
// selected or picked, and the red edges are that option's errors.
// With `ghost` (the Graph workspace's 3D, Decision "Graph mode"): every mass faint, so the graph over them reads.
// While the viewport shows a look (Decision "Specimen preview"): its masses, read only, as a Compare pane's.
// While the gumball drags (Decision "Gumball"), the masses it moves are drawn where they would go.
import { Edges } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useState } from 'react'
import { massIsLocked } from '../../kinds/locked.ts'
import type { Id, Point } from '../../model/schema.ts'
import { buildingOfLevel } from '../../engine/buildings.ts'
import { asOption } from '../../engine/derive.ts'
import { useApp } from '../../state/store.ts'
import { useLooking, useShown } from '../viewport/look.ts'
import { fillOf, isContext, massEyeOff, shownBuildings, useBuildingView } from '../buildingView.ts'
import { useLayerView } from '../layers/layerView.ts'
import type { SceneColors } from './colors.ts'
import { extrude, massBody } from './geometry3d.ts'
import { liftOf, useLaid } from './laid.ts'
import { pickOnPlan } from '../plan/massCommands.ts'
import { seeThrough, useDetail } from '../detail.ts'
import { useGumball } from './gumball.ts'
import { inIsolated, useIsolate } from '../stats/isolate.ts'

/** The opacity of the levels that are not the active one (Practiko). */
const FADED = 0.35
/** The opacity of every mass under the graph. */
const GHOST = 0.18
/** The opacity of the masses in Ghosted (Decision "Ghosted detail"). */
const SEE = 0.45

function MassMesh({
  id,
  polygon,
  holes,
  color,
  z0,
  height,
  slab,
  faded,
  ghost,
  see,
  selected,
  error,
  hover,
  onHover,
  colors,
  interactive,
  locked,
}: {
  id: Id
  polygon: Point[]
  holes: Point[][]
  color: string
  z0: number
  height: number
  slab: boolean
  faded: boolean
  ghost: boolean
  see: boolean
  selected: boolean
  error: boolean
  hover: boolean
  onHover: (id: Id | null) => void
  colors: SceneColors
  /** False in a Compare pane: no hover, no picking. */
  interactive: boolean
  /** Locked: a click on it picks nothing (the notice says why) and the cursor stays plain. */
  locked: boolean
}) {
  const geometry = useMemo(() => extrude(polygon, z0, height, holes), [polygon, holes, z0, height])
  useEffect(() => () => geometry.dispose(), [geometry])
  // if the mass goes away under the cursor, the hand pointer does not stay
  useEffect(
    () => () => {
      document.body.style.cursor = ''
    },
    [],
  )
  if (geometry.getAttribute('position').count === 0) return null

  const handlers = interactive && {
    onClick: (e: ThreeEvent<MouseEvent>) => {
      if (e.delta > 4) return // a camera drag, not a click
      e.stopPropagation()
      // with its group (Decision "Groups"); Alt, alone
      pickOnPlan(id, e.nativeEvent.shiftKey, e.nativeEvent.altKey)
    },
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation()
      onHover(id)
      document.body.style.cursor = locked ? 'default' : 'pointer'
    },
    onPointerOut: () => {
      onHover(null)
      document.body.style.cursor = ''
    },
  }

  return (
    <mesh geometry={geometry} userData={{ massId: id }} castShadow={!slab} receiveShadow {...(handlers || {})}>
      <meshStandardMaterial
        color={color}
        roughness={0.92}
        metalness={0}
        transparent={faded || ghost || see}
        opacity={ghost ? GHOST : faded ? FADED : see ? SEE : 1}
        depthWrite={!faded && !ghost && !see}
        emissive={hover ? colors.halo : colors.outline}
        emissiveIntensity={hover ? 0.12 : 0}
        polygonOffset
        polygonOffsetFactor={1}
        polygonOffsetUnits={1}
      />
      {!selected && !slab && !error && <Edges color={colors.edge} lineWidth={0.6} transparent opacity={faded ? 0.15 : 0.35} />}
      {!selected && error && <Edges color={colors.error} lineWidth={1.5} />}
      {selected && (
        <>
          {/* light halo first, dark core on top: no single colour contrasts 3:1 with every program */}
          <Edges scale={1.008} color={colors.halo} />
          <Edges scale={1.002} color={error ? colors.error : colors.outline} />
        </>
      )}
    </mesh>
  )
}

export function Masses({ colors, option: only, ghost = false }: { colors: SceneColors; option?: Id; ghost?: boolean }) {
  const shownProject = useShown((s) => s.project)
  const shownDerived = useShown((s) => s.derived)
  const designProject = useApp((s) => s.project)
  const designDerived = useApp((s) => s.derived)
  const looking = useLooking()
  const picked = useApp((s) => s.selection.massIds)
  const level = useApp((s) => s.level)
  const showAll = useApp((s) => s.showAll)
  const activeOption = useApp((s) => s.option)
  const compare = only !== undefined
  // a Compare pane draws the design; the viewport, what it shows
  const project = compare ? designProject : shownProject
  const derived = compare ? designDerived : shownDerived
  const option = only ?? activeOption
  const selectedIds = compare ? [] : picked
  const hidden = useLayerView((s) => s.hidden)
  const colorBy = useBuildingView((s) => s.colorBy)
  const see = useDetail((s) => seeThrough(s.detail))
  const [hoverId, setHoverId] = useState<Id | null>(null)
  const laid = useLaid(only)
  const isolated = useIsolate((s) => (compare ? null : s.isolated))
  const draggedIds = useGumball((s) => s.ids)
  const offset = useGumball((s) => (compare ? null : s.offset))
  // the levels of the option's shown buildings, and the active building's (its other levels fade)
  const shown = useMemo(() => new Set(shownBuildings(project, option, hidden).flatMap((b) => b.levels.map((l) => l.id))), [project, option, hidden])
  const activeBuilding = buildingOfLevel(project, level)?.id
  const withError = useMemo(
    () => new Set(asOption(derived, option).issues.filter((i) => i.severity === 'error').flatMap((i) => i.massIds)),
    [derived, option],
  )

  return (
    <group>
      {project.masses.map((m) => {
        const d = derived.masses[m.id]
        if (!d || d.polygon.length < 3 || !shown.has(m.levelId) || massEyeOff(hidden, m.id)) return null
        const color = isContext(project, m) ? colors.context : (fillOf(project, m, colorBy) ?? colors.noProgram)
        const body = massBody(project, m)
        const lift = liftOf(laid, m.id)
        const by = offset && draggedIds.includes(m.id) ? offset : null
        return body.floors.map((z0, k) => (
          <group key={`${m.id}:${k}`} position={by ? [by.x, by.z, -by.y] : undefined}>
            <MassMesh
              id={m.id}
              polygon={d.polygon}
              holes={d.holes}
              color={color}
              z0={z0 + lift}
              height={body.height}
              slab={body.slab}
              faded={(!compare && !showAll && d.buildingId === activeBuilding && m.levelId !== level) || !inIsolated(project, m, isolated)}
              ghost={ghost}
              see={see}
              selected={selectedIds.includes(m.id)}
              error={withError.has(m.id)}
              hover={hoverId === m.id}
              onHover={setHoverId}
              colors={colors}
              interactive={!compare && !looking}
              locked={massIsLocked(project, m)}
            />
          </group>
        ))
      })}
    </group>
  )
}
