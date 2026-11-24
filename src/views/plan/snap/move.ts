// Moving a whole mass: which snap wins. Same order as Plaza-Practiko (`edicion/Manijas.tsx`, `empezarCuerpo`):
//   1. a point pair: an own corner / middle / centre onto another's   → points.ts
//   2. otherwise, walls onto the lines of parallel walls              → walls.ts
//   3. otherwise, the grid                                            → grid.ts
// Shift skips all of it (the caller keeps the raw offset). Pure, so it is tested without React or a mouse.
import type { Contour, Point } from '../../../model/schema.ts'
import { GRID_STEP, gridDelta, type Step } from './grid.ts'
import { SNAP_NAMES, type SnapKind, type SnapSettings } from './kinds.ts'
import type { Line } from './lines.ts'
import { edgesOf, movePoints, ownPoints, snapPointsOf, snapShape, type SnapEdge, type SnapPoint, type Source } from './points.ts'
import { snapToWalls, straightWalls, type Guide, type LabeledWall, type Wall } from './walls.ts'

/** How far snapping reaches, in screen pixels: divided by the zoom (px per m) it gives metres. */
export const POINT_APERTURE_PX = 12
export const LINE_APERTURE_PX = 8

/** The apertures in metres at a zoom of `scale` px per metre. */
export function tolerances(scale: number): { point: number; line: number } {
  return { point: POINT_APERTURE_PX / scale, line: LINE_APERTURE_PX / scale }
}

/** What attracts, built once per drag. */
export interface Targets {
  points: SnapPoint[]
  walls: LabeledWall[]
  /** Every edge, arcs included: a dragged corner slides on them (nearest) or drops square onto them. */
  edges: SnapEdge[]
}

/** The dragged shape, as it was when the drag started. */
export interface Shape {
  points: SnapPoint[]
  walls: Wall[]
  /** The corner that goes onto the grid. */
  anchor: Point
}

export function targetsOf(sources: Source[]): Targets {
  return {
    points: snapPointsOf(sources),
    walls: sources.filter((s) => !s.edgesOnly).flatMap((s) => straightWalls(s.contour, s.open).map((w) => ({ ...w, label: s.label, ...(s.track === false && { track: false }) }))),
    edges: edgesOf(sources),
  }
}

export function shapeOf(c: Contour): Shape {
  const v = c.vertices[0]
  return { points: ownPoints(c), walls: straightWalls(c), anchor: v ? { x: v.x, y: v.y } : { x: 0, y: 0 } }
}

/** What the plan draws while snapping. */
export interface SnapMark {
  /** The sign drawn at `at`; null for an alignment (guides only). */
  kind: SnapKind | null
  at: Point
  label: string
  guides: Guide[]
  /** Tracking and ortho lines through `at`, drawn across the view. */
  lines?: Line[]
}

export interface MoveSnap {
  delta: Point
  mark: SnapMark | null
}

/** `tol` in metres: the apertures above divided by the current zoom. */
export function snapMove(
  raw: Point,
  shape: Shape,
  targets: Targets,
  s: SnapSettings,
  tol: { point: number; line: number },
  step: Step = GRID_STEP,
): MoveSnap {
  if (s.on) {
    const r = snapShape(movePoints(shape.points, raw), targets.points, s, tol.point)
    if (r) {
      const label = `${SNAP_NAMES[r.from.kind]} → ${SNAP_NAMES[r.to.kind]} · ${r.to.label}`
      return { delta: { x: raw.x + r.correction.x, y: raw.y + r.correction.y }, mark: { kind: r.to.kind, at: r.to.p, label, guides: [] } }
    }
  }
  const base = s.grid ? gridDelta(shape.anchor, raw, step) : raw
  if (s.on && s.align) {
    const w = snapToWalls(shape.walls, targets.walls, raw, base, tol.line)
    if (w) {
      const names = [...new Set(w.guides.map((g) => g.label))].join(' · ')
      return { delta: w.delta, mark: { kind: null, at: w.at, label: `Aligned · ${names}`, guides: w.guides } }
    }
  }
  return { delta: base, mark: null }
}
