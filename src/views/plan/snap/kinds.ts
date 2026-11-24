// The snap vocabulary: which kinds of points attract, the settings, their names and the sign drawn on the plan.
// Port of Plaza-Practiko `vistas/planta/iman/signos.ts` (+ the settings from its `motor.ts`). The signs are AutoCAD's,
// so anyone who drafts recognises them without a manual.
//
// Moving a whole mass uses the point kinds (endpoint, midpoint, intersection, center, quadrant). Perpendicular,
// nearest, ortho and tracking only mean something when a single point (a corner) is dragged: resolve.ts.

export type SnapKind = 'endpoint' | 'midpoint' | 'intersection' | 'perpendicular' | 'center' | 'quadrant' | 'nearest'

/** In toolbar order. */
export const SNAP_KINDS: SnapKind[] = ['endpoint', 'midpoint', 'intersection', 'perpendicular', 'center', 'quadrant', 'nearest']

/** Two points at the same distance: the kind that comes first here wins. */
export const SNAP_PRIORITY: SnapKind[] = ['endpoint', 'midpoint', 'intersection', 'center', 'quadrant']

/** Per-browser drawing preferences. Never in the Project, never in the undo history. */
export interface SnapSettings {
  /** Master switch (F3). Off: only the grid is left. */
  on: boolean
  kinds: Record<SnapKind, boolean>
  /** Alignment and tracking: walls line up with parallel walls; a dragged corner follows the mass's axes and the
   *  lines of nearby walls. */
  align: boolean
  /** A dragged corner moves only horizontally or vertically (F8). */
  ortho: boolean
  /** The 1 m grid (F9). */
  grid: boolean
  /** What else attracts (Decision "Drawing layers"): the site's drawing lines and parcels, the reference lines drawn on the plan (Phase AS.5), and the ground's contours. */
  to: Record<SnapTo, boolean>
}

/**
 * The Snap ▾ menu's *Snap to*, in its order. `references` is the entry of the site's imported drawings: it was called *Reference lines* until Phase AS.5 gave that name to the
 * guides drawn on the plan (`referenceLines`), and is *Drawing lines* now; its stored key stays, so nobody's choice is lost.
 */
export type SnapTo = 'references' | 'referenceLines' | 'contours'
export const SNAP_TO: SnapTo[] = ['references', 'referenceLines', 'contours']
export const SNAP_TO_NAMES: Record<SnapTo, string> = { references: 'Drawing lines', referenceLines: 'Reference lines', contours: 'Contours' }
export const SNAP_TO_HELP: Record<SnapTo, string> = {
  references: 'The site’s drawings: their lines and parcels, those shown in Layers (corners, middles, edges)',
  referenceLines: 'The reference lines drawn on the plan: their points, middles and crossings, and the lines through them with Align on; those shown in Layers',
  contours: 'The ground’s contours: a point slides on them, or drops square onto them (their edges only)',
}

export const DEFAULT_SNAP: SnapSettings = {
  on: true,
  kinds: { endpoint: true, midpoint: true, intersection: true, perpendicular: true, center: true, quadrant: false, nearest: true },
  align: true,
  ortho: false,
  grid: true,
  // the contours off: on a site with ground, every drag would find one
  to: { references: true, referenceLines: true, contours: false },
}

export const SNAP_NAMES: Record<SnapKind, string> = {
  endpoint: 'Endpoint',
  midpoint: 'Midpoint',
  intersection: 'Intersection',
  perpendicular: 'Perpendicular',
  center: 'Center',
  quadrant: 'Quadrant',
  nearest: 'Nearest',
}

/** Tooltip of each toolbar chip. */
export const SNAP_HELP: Record<SnapKind, string> = {
  endpoint: 'Endpoint: corners of masses, the site and the setback',
  midpoint: 'Midpoint: the middle of every edge',
  intersection: 'Intersection: where two edges cross',
  perpendicular: 'Perpendicular: a dragged corner goes square to a wall, from the previous corner',
  center: 'Center: the centre of each mass, of arcs and of rounded corners',
  quadrant: 'Quadrant: the points of an arc at 0°, 90°, 180° and 270°',
  nearest: 'Nearest: any point on a wall',
}

/** The sign as an SVG path centred on (0, 0), half-size `s`, y down (screen). Drawn without fill. */
export function signPath(kind: SnapKind, s: number): string {
  switch (kind) {
    case 'endpoint': // square
      return `M${-s} ${-s}H${s}V${s}H${-s}Z`
    case 'midpoint': // triangle
      return `M0 ${-s}L${s} ${s}H${-s}Z`
    case 'intersection': // cross
      return `M${-s} ${-s}L${s} ${s}M${s} ${-s}L${-s} ${s}`
    case 'perpendicular': // ⊥
      return `M${-s} ${s}H${s}M0 ${s}V${-s}`
    case 'center': // circle
      return `M${-s} 0A${s} ${s} 0 1 0 ${s} 0A${s} ${s} 0 1 0 ${-s} 0Z`
    case 'quadrant': // diamond
      return `M0 ${-s}L${s} 0L0 ${s}L${-s} 0Z`
    case 'nearest': // hourglass
      return `M${-s} ${-s}H${s}L${-s} ${s}H${s}Z`
  }
}
