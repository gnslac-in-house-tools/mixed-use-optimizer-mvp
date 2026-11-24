// One option's plan in Compare (Decision "Compare options"): read-only, every level of its shown buildings, lowest
// first (as *All*), in their program's or building's colour, context grey and dashed, a red outline on an error of that
// option. It draws as the viewport does (Phase S.3, Decision "Stress test views"): the streets and gates, the roads,
// and by the Detail (detail.ts) the truck courts, parking, docks and labels, and the programs' hatches, from the
// plan's own layers reading this option (`ShownProvider`), still; what the layer store hides (views/layers) it does not draw, as the plan does. Every pane shares one camera (compareView.ts): the wheel zooms, a drag pans and a double-click fits, in all
// of them at once, so the same spot of the site is under the same spot of each pane.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import type { Id, Mass } from '../../model/schema.ts'
import { optionOf } from '../../engine/buildings.ts'
import { asOption } from '../../engine/derive.ts'
import { bounds, type Bounds } from '../../engine/geom/polygon.ts'
import type { Derived } from '../../engine/types.ts'
import { useApp } from '../../state/store.ts'
import { fillOf, isContext, massEyeOff, shownBuildings, useBuildingView } from '../buildingView.ts'
import { BOUNDARY, BUILDABLE, LABELS } from '../layers/keys.ts'
import { useHidden, useLayerView } from '../layers/layerView.ts'
import { CLICK_TOLERANCE, fit, pan, pathOf, UNMEASURED_SIZE, viewBoxOf, zoomAt, ZOOM_MAX, ZOOM_MIN, type Size } from '../plan/camera.ts'
import { useCompare } from './compareView.ts'
import { drawsAll, seeThrough, useDetail } from '../detail.ts'
import { SEE_THROUGH } from '../plan/planStyle.ts'
import { AccessLayer } from '../plan/access/AccessLayer.tsx'
import { CourtsLayer, DocksLayer } from '../../modules/docks/views/DocksLayer.tsx'
import { RoadsLayer, StallsLayer } from '../plan/circulation/RoadsLayer.tsx'
import { HatchFill, HatchPatterns, hatchOf } from '../plan/hatches.tsx'
import { LABEL_PX, labelFits } from '../plan/planStyle.ts'
import { STILL_DRAG } from '../plan/useDrag.ts'
import { ShownProvider } from '../viewport/look.ts'
import { centroid } from '../../engine/geom/polygon.ts'
import { m2 } from '../format.ts'
import { beginDrag } from '../controls/beginDrag.ts'

/** The site and every mass: the same box for every pane, so they fit alike. */
function contentBounds(d: Derived): Bounds {
  const pts = [...(d.site.polygon ?? []), ...Object.values(d.masses).flatMap((m) => m.polygon)]
  return pts.length ? bounds(pts) : { minX: -50, minY: -50, maxX: 50, maxY: 50 }
}

/** The element's size, followed. */
function useSize(ref: React.RefObject<Element | null>): Size | null {
  const [size, setSize] = useState<Size | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof ResizeObserver === 'undefined') {
      setSize(UNMEASURED_SIZE)
      return
    }
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) setSize({ w: width, h: height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return size
}

export function ComparePlan({ option }: { option: Id }) {
  const project = useApp((s) => s.project)
  const derived = useApp((s) => s.derived)
  const hidden = useLayerView((s) => s.hidden)
  const colorBy = useBuildingView((s) => s.colorBy)
  const shared = useCompare((s) => s.plan)
  const setPlan = useCompare((s) => s.setPlan)
  const svg = useRef<SVGSVGElement>(null)
  const size = useSize(svg)
  const fitted = useMemo(() => (size ? fit(contentBounds(derived), size) : null), [derived, size])
  const view = shared ?? fitted
  const name = optionOf(project, option).name

  // its masses, lowest level first; its errors
  const masses = useMemo(
    () =>
      shownBuildings(project, option, hidden)
        .flatMap((b) => [...b.levels].sort((x, y) => x.elevation - y.elevation))
        .flatMap((l) => project.masses.filter((m) => m.levelId === l.id && !massEyeOff(hidden, m.id))),
    [project, option, hidden],
  )
  const mine = useMemo(() => asOption(derived, option), [derived, option])
  const shown = useMemo(() => ({ project, derived: mine }), [project, mine])
  const withError = useMemo(() => new Set(mine.issues.filter((i) => i.severity === 'error').flatMap((i) => i.massIds)), [mine])
  const detail = useDetail((s) => s.detail)
  const labels = !useHidden(LABELS) && drawsAll(detail)
  const boundaryShown = !useHidden(BOUNDARY)
  const buildableShown = !useHidden(BUILDABLE)
  const designed = drawsAll(detail)
  const see = seeThrough(detail)

  // the wheel zooms every pane around the pointer (a native listener: React's is passive and cannot stop the scroll)
  const live = useRef({ view, size, fitted })
  live.current = { view, size, fitted }
  useEffect(() => {
    const el = svg.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      const { view: v, size: s, fitted: f } = live.current
      if (!v || !s) return
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const base = f?.scale ?? v.scale
      setPlan(zoomAt(v, s, e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015), base * ZOOM_MIN, base * ZOOM_MAX))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [setPlan])

  // a drag pans every pane
  const drag = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null)
  const down = (e: PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 && e.button !== 1) return
    beginDrag(e)
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false }
  }
  const move = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId || !view) return
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < CLICK_TOLERANCE) return
    d.moved = true
    setPlan(pan(view, e.clientX - d.x, e.clientY - d.y))
    d.x = e.clientX
    d.y = e.clientY
  }
  const up = (e: PointerEvent<SVGSVGElement>) => {
    if (drag.current?.id !== e.pointerId) return
    drag.current = null
    e.currentTarget.releasePointerCapture?.(e.pointerId)
  }

  // metres per screen pixel; the hatches' ids are this pane's own (several panes, several sets)
  const px = view ? 1 / view.scale : 1
  const hatchBase = `compare-${option}`
  const fillOfMass = (m: Mass) => (isContext(project, m) ? 'var(--context-fill)' : (fillOf(project, m, colorBy) ?? 'var(--fill)'))

  return (
    <svg
      ref={svg}
      role="img"
      aria-label={`Plan of ${name}`}
      viewBox={view && size ? viewBoxOf(view, size) : undefined}
      data-view={view ? `${view.cx.toFixed(3)} ${view.cy.toFixed(3)} ${view.scale.toFixed(5)}` : undefined}
      className="h-full w-full cursor-grab touch-none select-none active:cursor-grabbing"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onDoubleClick={() => setPlan(null)}
    >
      {view && (
        <ShownProvider value={shown}>
          <defs>
            <HatchPatterns base={hatchBase} px={px} />
          </defs>
          {derived.site.polygon && <path d={pathOf([derived.site.polygon])} fill="var(--panel)" stroke={boundaryShown ? 'var(--ink)' : 'none'} strokeWidth={1.25} vectorEffect="non-scaling-stroke" />}
          {buildableShown && derived.site.buildable.map((region, i) => (
            <path key={i} d={pathOf(region)} fill="none" stroke="var(--ink-secondary)" strokeDasharray="4 3" strokeWidth={1} vectorEffect="non-scaling-stroke" fillRule="evenodd" />
          ))}
          {designed && <CourtsLayer compare />}
          {designed && <StallsLayer />}
          <RoadsLayer px={px} interactive={false} drag={STILL_DRAG} />
          <AccessLayer px={px} drag={STILL_DRAG} interactive={false} />
          {masses.map((m) => {
            const d = mine.masses[m.id]
            if (!d || d.polygon.length < 3) return null
            const context = isContext(project, m)
            const program = m.programId ? project.programs.find((g) => g.id === m.programId) : null
            const ring = pathOf([d.polygon, ...d.holes])
            return (
              <g key={m.id}>
                <path
                  data-compare-mass={m.id}
                  d={ring}
                  fill={fillOfMass(m)}
                  fillOpacity={context ? 1 : see ? SEE_THROUGH : 0.75}
                  stroke={withError.has(m.id) ? 'var(--status-over)' : context ? 'var(--context-stroke)' : 'var(--ink-secondary)'}
                  strokeWidth={withError.has(m.id) ? 2 : 1}
                  strokeDasharray={context ? '5 3' : undefined}
                  vectorEffect="non-scaling-stroke"
                />
                {!context && designed && <HatchFill base={hatchBase} hatch={hatchOf(program)} d={ring} opacity={see ? SEE_THROUGH : undefined} />}
              </g>
            )
          })}
          {designed && <DocksLayer px={px} compare />}
          {labels &&
            masses.map((m) => {
              const d = mine.masses[m.id]
              if (!d || d.polygon.length < 3 || isContext(project, m)) return null
              const b = bounds(d.polygon)
              const area = m2(d.area)
              if (!labelFits(b.maxX - b.minX, b.maxY - b.minY, px, [m.name, area])) return null
              const c = centroid(d.polygon)
              return (
                <text
                  key={m.id}
                  x={c.x}
                  y={-c.y}
                  textAnchor="middle"
                  fontSize={LABEL_PX * px}
                  fill="var(--ink)"
                  stroke="var(--panel)"
                  strokeWidth={LABEL_PX * 0.25 * px}
                  strokeLinejoin="round"
                  paintOrder="stroke"
                  pointerEvents="none"
                  data-compare-label={m.id}
                >
                  <tspan x={c.x} dy={-0.15 * LABEL_PX * px} fontWeight={600}>
                    {m.name}
                  </tspan>
                  <tspan x={c.x} dy={1.2 * LABEL_PX * px}>
                    {area}
                  </tspan>
                </text>
              )
            })}
        </ShownProvider>
      )}
    </svg>
  )
}
