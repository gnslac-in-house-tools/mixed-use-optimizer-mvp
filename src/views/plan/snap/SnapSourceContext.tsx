// What a plan's tools snap to and how they read a length (Phase BE.10): the drawing tools (views/plan/tools: the Ruler,
// the Dimension tool) are the main plan's, and a plan with a frame of its own lends them its own through this context,
// so they are reused, not forked (spec "Block editor tools", anti-goal "reuse, not fork"). Without a provider: the
// site's targets (useSnapTargets), the plan's grid and metres to 0.1 m, as before. The block editor's plan
// (modules/warehouse/views/WarehousePlan.tsx) provides its columns, wall corners, module-line nodes and door points,
// its module nodes as the grid, and its unit (BE.8): this file never imports a module.
import { createContext, useContext } from 'react'
import type { Point } from '../../../model/schema.ts'
import { lengthText } from '../tools/toolState.ts'
import type { Targets } from './move.ts'

export interface SnapSource {
  /** What attracts (built once per source: the provider keeps the object while its geometry stays). */
  targets: () => Targets
  /** A length as the readouts show it: the Ruler's label, a dimension's text. Absent: metres, to 0.1 m. */
  format?: (m: number) => string
  /** With Grid on, the grid node nearest a point, where nothing else attracts (along an ortho line, its line along
   *  it); null where the grid does not reach (`tol`: the point aperture, m). Absent: no grid. */
  grid?: (q: Point, tol: number) => Point | null
  /** The plan's own element: a drawing tool's keys are its own while the topmost modal window holds it
   *  (`useDrawingKeys`). Absent: as the site's, any modal window takes the keys. */
  root?: () => Element | null
}

/** null: the site's (the main plan). */
export const SnapSourceContext = createContext<SnapSource | null>(null)

/** The source a plan provides, or null for the site's. */
export const useSnapSource = (): SnapSource | null => useContext(SnapSourceContext)

/** How the readouts write a length: the source's format, else metres to 0.1 m. */
export function useLengthFormat(): (m: number) => string {
  return useSnapSource()?.format ?? lengthText
}
