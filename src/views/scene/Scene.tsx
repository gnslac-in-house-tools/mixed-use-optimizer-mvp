// The 3D view: the Canvas with lights, ground (site and buildable line) and masses, and orbit controls (left drag
// turns, the wheel's drag pans, the wheel zooms; the right button opens the one right-click menu, Decision "3D mouse"). Its
// Frame button is the viewport's (Viewport.tsx), shared with the plan. Port of Plaza-Practiko `vistas/tresd/Escena.tsx`, without levels, derived parts or program drops (those
// arrive with their phases). It reads the same store as the plan, so the selection is shared: a click on a mass
// selects it in both, a click on empty space clears it. Loaded lazily (LazyScene.tsx): three.js stays out of the
// first download.
// With `graph` (the Graph workspace's 3D, Decision "Graph mode") the masses are ghosts and the graph floats over them.
// With `option` it is a Compare pane (Decision "Compare options"): that option's masses, read-only, framing the whole
// project as every pane does, and one camera for all the panes: the pane being moved writes it, the others follow.
import { OrbitControls } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { Id, Point, Project } from '../../model/schema.ts'
import { optionOf } from '../../engine/buildings.ts'
import { asOption } from '../../engine/derive.ts'
import { useApp } from '../../state/store.ts'
import { useShown } from '../viewport/look.ts'
import { useBuildingView } from '../buildingView.ts'
import { useCompare } from '../compare/compareView.ts'
import { openMenu } from '../editing/menu/open.tsx'
import { pickForMenu } from '../plan/massCommands.ts'
import { pickedRefs } from '../plan/mix.ts'
import { letGo, useHand } from '../tools/hand.ts'
import { takeRequest, useGoTo } from '../viewport/goTo.ts'
import { dropOnMass, isMassDrop } from '../panels/massDrop.ts'
import { isTypeDrag, TYPE_MIME } from '../../modules/warehouse/views/TypePalette.tsx'
import { BlockFixtures3D } from '../../modules/warehouse/views/BlockFixtures3D.tsx'
import { Residencial3d } from '../../modules/residential/views/Residencial3d.tsx' // mixed-use-mvp
import { SectionClip } from './SectionClip.tsx' // mixed-use-mvp
import { HeightHandle } from './HeightHandle.tsx' // mixed-use-mvp
import { placeCopy } from '../../modules/warehouse/views/commands.ts'
import { useSceneColors } from './colors.ts'
import { sceneBox } from './geometry3d.ts'
import { Fixtures } from './Fixtures.tsx'
import { Graph3D } from './Graph3D.tsx'
import { Grid3D } from './Grid3D.tsx'
import { Gumball } from './Gumball.tsx'
import { Ground } from './Ground.tsx'
import { LevelPlanes, useLevelChip } from './LevelPlanes.tsx'
import { Lights } from './Lights.tsx'
import { Masses } from './Masses.tsx'
import { Paving } from './Paving.tsx'
import { drawsAll, useDetail } from '../detail.ts'
import { useSceneRef } from './sceneRef.ts'
import { clip, framingDistance, useFraming } from './useFraming.ts'

/** The camera frames by itself only when this changes: another project, another site, from empty to some masses. */
export function framingKey(p: Project, opened: number): string {
  const site = p.site.boundary?.vertices.map((v) => `${v.x},${v.y}`).join(';') ?? ''
  return `${opened}|${site}|${p.masses.length > 0 ? 1 : 0}`
}

/** Shared between what lives inside the Canvas and the DOM around it (a program drop, a block drop, the right-click
 *  menu): the mass under a point, and the plan point on the ground under it. */
const live: {
  locate: ((clientX: number, clientY: number) => string | null) | null
  ground: ((clientX: number, clientY: number) => Point | null) | null
} = { locate: null, ground: null }

/** The ground, y = 0 in the scene (the plan's x is its x, the plan's y its −z). */
const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)

/** The mouse in 3D (Decision "3D mouse"; the user: "the wheel's click to pan, the right click for the menu alone"):
 *  left turns, the wheel pans, the right button does nothing to the camera (it opens the menu). */
const MOUSE = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: null } as unknown as { LEFT: THREE.MOUSE; MIDDLE: THREE.MOUSE; RIGHT: THREE.MOUSE }

/** Inside the Canvas: registers the PNG capture for the Export menu and the ray that finds the mass under a point. */
function Bridge() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const register = useSceneRef((s) => s.register)
  useEffect(() => {
    register(() => {
      gl.render(scene, camera)
      return gl.domElement.toDataURL('image/png')
    })
    const ray = new THREE.Raycaster()
    const aim = (cx: number, cy: number) => {
      const r = gl.domElement.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) return false
      ray.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), camera)
      return true
    }
    live.ground = (cx, cy) => {
      const hit = aim(cx, cy) ? ray.ray.intersectPlane(GROUND, new THREE.Vector3()) : null
      return hit ? { x: hit.x, y: -hit.z } : null
    }
    live.locate = (cx, cy) => {
      if (!aim(cx, cy)) return null
      for (const hit of ray.intersectObjects(scene.children, true))
        for (let o: THREE.Object3D | null = hit.object; o; o = o.parent) if (typeof o.userData?.massId === 'string') return o.userData.massId
      return null
    }
    return () => {
      register(null)
      live.locate = null
      live.ground = null
    }
  }, [gl, scene, camera, register])
  return null
}

function Controls({ box, framing }: { box: THREE.Box3 | null; framing: string }) {
  const go = useFraming(box, framing)
  const camera = useThree((s) => s.camera)
  // further than 8 times the framing distance the model is a dot
  const maxDistance = useMemo(() => (box ? framingDistance(camera as THREE.PerspectiveCamera, box) * 8 : undefined), [box, camera])
  // From 3D to Split (or a big move of the divider) the canvas changes shape: a box framed for a wide view is cut in a
  // narrow one. Over 25 % of change it frames again; small changes (resizing the window) leave the user's camera.
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height))
  const framedAspect = useRef(aspect)
  useEffect(() => {
    if (Math.abs(aspect / framedAspect.current - 1) <= 0.25) return
    framedAspect.current = aspect
    go()
  }, [aspect, go])
  const registerFrame = useSceneRef((s) => s.registerFrame)
  useEffect(() => {
    registerFrame(go)
    return () => registerFrame(null)
  }, [go, registerFrame])
  // a warning's "go to": the camera looks at the point without changing its distance or angle
  const target = useGoTo((s) => s.target)
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update(): void } | null
  useEffect(() => {
    if (!target || !controls || !takeRequest('3d', target.n)) return
    const d = new THREE.Vector3(target.point.x, 0, -target.point.y).sub(controls.target).setY(0)
    controls.target.add(d)
    camera.position.add(d)
    controls.update()
    // only on a new request
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.n, controls])
  return (
    <OrbitControls
      makeDefault
      mouseButtons={MOUSE}
      maxDistance={maxDistance}
      enableDamping
      dampingFactor={0.08}
      // it stops before the horizon: a building is never seen from under the ground
      maxPolarAngle={Math.PI / 2 - 0.02}
    />
  )
}

/** The model's box, and its size and centre for the lights, shadow and ground: of what the viewport shows (a look's,
 *  Decision "Specimen preview"), of the design in a Compare pane. */
function useModelBox(compare = false) {
  const shownProject = useShown((s) => s.project)
  const shownDerived = useShown((s) => s.derived)
  const designProject = useApp((s) => s.project)
  const designDerived = useApp((s) => s.derived)
  const project = compare ? designProject : shownProject
  const derived = compare ? designDerived : shownDerived
  const box = useMemo(() => sceneBox(project, derived), [project, derived])
  const measure = useMemo(() => {
    if (!box) return { size: 100, center: [0, 0, 0] as [number, number, number] }
    const s = box.getSize(new THREE.Vector3())
    const c = box.getCenter(new THREE.Vector3())
    return { size: Math.max(s.x, s.y, s.z, 50), center: [c.x, c.y, c.z] as [number, number, number] }
  }, [box])
  // lights, shadow and ground keep the previous measure until it changes by more than 2 m: they do not jump during a drag
  const [steady, setSteady] = useState(measure)
  if (
    Math.abs(measure.size - steady.size) > 2 ||
    Math.hypot(...(measure.center.map((v, i) => v - steady.center[i]) as [number, number, number])) > 2
  )
    setSteady(measure)
  return { box, steady }
}

/** The pane the user is moving: it writes the shared camera, the others follow it (no echo between them). */
let driver: Id | null = null

/** A Compare pane's controls: they frame on mount and on *Frame all*, and share one camera with the other panes. */
function SharedControls({ box, pane }: { box: THREE.Box3 | null; pane: Id }) {
  const framing = useCompare((s) => s.framing)
  useFraming(box, String(framing))
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as unknown as (THREE.EventDispatcher<{ start: object; change: object }> & { target: THREE.Vector3; update(): void }) | null
  useEffect(() => {
    if (!controls) return
    const follow = (c = useCompare.getState().camera) => {
      if (!c || c.from === pane) return
      camera.position.set(...c.position)
      controls.target.set(...c.target)
      clip(camera as THREE.PerspectiveCamera, camera.position.distanceTo(controls.target))
      controls.update()
    }
    const start = () => {
      driver = pane
    }
    const change = () => {
      if (driver !== pane) return
      useCompare.getState().setCamera({ position: camera.position.toArray(), target: controls.target.toArray(), from: pane })
    }
    // a pane that opens later takes the camera the others have
    follow()
    controls.addEventListener('start', start)
    controls.addEventListener('change', change)
    const off = useCompare.subscribe((s, before) => {
      if (s.camera !== before.camera) follow(s.camera)
    })
    return () => {
      controls.removeEventListener('start', start)
      controls.removeEventListener('change', change)
      off()
      if (driver === pane) driver = null
    }
  }, [controls, camera, pane])
  return <OrbitControls makeDefault mouseButtons={MOUSE} maxPolarAngle={Math.PI / 2 - 0.02} />
}

/** A Compare pane: one option, read-only. */
function CompareScene({ className, option }: { className?: string; option: Id }) {
  const derived = useApp((s) => s.derived)
  const circulation = useMemo(() => asOption(derived, option).circulation, [derived, option])
  const detail = useDetail((s) => s.detail)
  const name = useApp((s) => optionOf(s.project, option).name)
  const colors = useSceneColors()
  const { box, steady } = useModelBox(true)
  return (
    <div className={className} style={{ position: 'relative', width: '100%', height: '100%', minHeight: 0 }}>
      <Canvas shadows="soft" dpr={[1, 2]} camera={{ fov: 35 }} gl={{ antialias: true }} style={{ background: colors.bg }} aria-label={`3D view of ${name}`}>
        <Lights size={steady.size} center={steady.center} colors={colors} shadows={drawsAll(detail)} />
        <Ground size={steady.size} center={steady.center} site={derived.site.polygon} buildable={derived.site.buildable.flat()} colors={colors} option={option} />
        {drawsAll(detail) && <Paving circulation={circulation} masses={derived.masses} colors={colors} option={option} />}
        {drawsAll(detail) && <Fixtures circulation={circulation} masses={derived.masses} colors={colors} option={option} />}
        {drawsAll(detail) && <BlockFixtures3D masses={derived.masses} colors={colors} option={option} />}
        <Grid3D option={option} colors={colors} />
        <Masses colors={colors} option={option} />
        <SharedControls box={box} pane={option} />
      </Canvas>
    </div>
  )
}

export function Scene({ className, option, graph = false }: { className?: string; option?: Id; graph?: boolean }) {
  return option ? <CompareScene className={className} option={option} /> : <MainScene className={className} graph={graph} />
}

function MainScene({ className, graph }: { className?: string; graph: boolean }) {
  const project = useShown((s) => s.project)
  const derived = useShown((s) => s.derived)
  const opened = useApp((s) => s.opened)
  const select = useApp((s) => s.select)
  const colors = useSceneColors()
  const pressAt = useRef<{ x: number; y: number } | null>(null)
  const { box, steady } = useModelBox()
  const detail = useDetail((s) => s.detail)
  const planes = useBuildingView((s) => s.planes)

  return (
    <div
      className={className}
      style={{ position: 'relative', width: '100%', height: '100%', minHeight: 0 }}
      onPointerDown={(e) => {
        pressAt.current = { x: e.clientX, y: e.clientY }
      }}
      // a program, a building or an option dragged from the panel and dropped on a mass (massDrop.ts; the ray says
      // which mass is under the pointer)
      onDragOver={(e) => {
        if (isMassDrop(e) || isTypeDrag(e)) e.preventDefault()
      }}
      onDrop={(e) => {
        // a block from the Blocks panel: a copy stands where it drops on the ground (Decision "Smart blocks")
        const type = isTypeDrag(e) ? e.dataTransfer.getData(TYPE_MIME) : ''
        const at = type ? live.ground?.(e.clientX, e.clientY) : null
        if (type && at) {
          e.preventDefault()
          placeCopy(type, at)
          return
        }
        const id = live.locate?.(e.clientX, e.clientY)
        if (id && dropOnMass(e, id)) e.preventDefault()
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        // the one right-click menu (Decision "One menu"): a tool in hand lets go first, as Escape does, then the mass under the pointer is
        // picked (a mass not selected, with its group) and the menu of what is picked opens
        if (useHand.getState().tool !== 'select') letGo()
        const id = live.locate?.(e.clientX, e.clientY)
        // a locked mass is not picked: the notice says so and no menu opens
        if (id && !pickForMenu(id, e.altKey)) return
        openMenu(e, pickedRefs(), '3d')
      }}
    >
      <Canvas
        shadows="soft"
        dpr={[1, 2]}
        camera={{ fov: 35 }}
        // preserveDrawingBuffer: the PNG capture reads the canvas outside the drawing loop
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        style={{ background: colors.bg }}
        aria-label="3D view"
        onPointerMissed={(e) => {
          // a click on empty space clears the selection; a camera drag does not
          const a = pressAt.current
          if ((a && Math.hypot(e.clientX - a.x, e.clientY - a.y) > 4) || e.shiftKey) return // Shift keeps it, as in the plan
          select(null)
          useLevelChip.getState().pick(null)
        }}
      >
        <Bridge />
        <Lights size={steady.size} center={steady.center} colors={colors} shadows={drawsAll(detail)} />
        <Ground size={steady.size} center={steady.center} site={derived.site.polygon} buildable={derived.site.buildable.flat()} colors={colors} />
        {drawsAll(detail) && <Paving circulation={derived.circulation} masses={derived.masses} colors={colors} />}
        {drawsAll(detail) && <Fixtures circulation={derived.circulation} masses={derived.masses} colors={colors} />}
        {drawsAll(detail) && <BlockFixtures3D masses={derived.masses} colors={colors} />}
        <Grid3D colors={colors} />
        <Masses colors={colors} ghost={graph} />
        {/* mixed-use-mvp: the residential module's slabs and columns */}
        <Residencial3d />
        {/* mixed-use-mvp: the section cut over a storey's interiors (Programs · Furniture) */}
        <SectionClip />
        {graph && <Graph3D colors={colors} />}
        {/* each level as a plane at its height (Show's Levels, Decision "Level planes") */}
        {planes && <LevelPlanes colors={colors} />}
        {!graph && <Gumball colors={colors} />}
        {/* mixed-use-mvp: push-pull, the selected mass's height in whole storeys */}
        {!graph && <HeightHandle colors={colors} />}
        <Controls box={box} framing={framingKey(project, opened)} />
      </Canvas>
    </div>
  )
}
