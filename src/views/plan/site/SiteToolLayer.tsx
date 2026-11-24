// The Site step's Draw and Place on the plan (Decision "Site step layout", Phase 5.5): Draw is the boundary corner by
// corner (DrawPolyline, closed: Enter or a click on the first corner closes it), made the site's boundary as one undo
// step (what was placed on the old one goes with it, as an import's); Place moves and turns the map (PlaceLayer.tsx);
// Heights gives a contour its height (modules/terrain/views/HeightsLayer.tsx); Grid moves and turns the structural grid (grid/GridToolLayer.tsx).
import { useCallback } from 'react'
import type { Point } from '../../../model/schema.ts'
import { contourFromPolygon } from '../../../engine/geom/contour.ts'
import { area, isSimple } from '../../../engine/geom/polygon.ts'
import { actions } from '../../../state/actions/index.ts'
import { useApp } from '../../../state/store.ts'
import { useToast } from '../../layout/toast.ts'
import type { ToolCamera } from '../tools/common.tsx'
import { DrawPolyline } from '../tools/DrawPolyline.tsx'
import { GridToolLayer } from '../grid/GridToolLayer.tsx'
import { HeightsLayer } from '../../../modules/terrain/views/HeightsLayer.tsx'
import { PlaceLayer } from './PlaceLayer.tsx'
import { useSiteTool } from './siteTools.ts'
import { letGo } from '../../tools/hand.ts'

export const DRAWN = 'Drawn'

export function SiteToolLayer({ camera }: { camera: ToolCamera }) {
  const tool = useSiteTool((s) => s.tool)
  const exit = useCallback(() => letGo(), [])
  const drawn = useCallback((points: Point[]) => {
    if (!isSimple(points) || area(points) < 1) {
      useToast.getState().show('error', 'The boundary must not cross itself, and must enclose at least 1 m².')
      return false
    }
    useApp.getState().apply((p) => actions.setBoundary(p, contourFromPolygon(points), DRAWN))
    letGo()
    return true
  }, [])
  if (tool === 'draw') return <DrawPolyline camera={camera} tool="Boundary" width={0} closed onDone={drawn} onExit={exit} />
  if (tool === 'place') return <PlaceLayer camera={camera} />
  if (tool === 'heights') return <HeightsLayer camera={camera} />
  if (tool === 'grid') return <GridToolLayer camera={camera} />
  return null
}
