// The block's truck courts on the type's plan (Decision "Truck court", BE.4): one in front of every docked wall and of every wall given
// one, dashed in the court's colour (a court with a shape of its own, D.3, as its contour, one for each court of a wall). This file only draws them:
// a court's depth pill, its sides and its corners are the shape handles' (views/editing/shape/, through blockShapeHost.ts; D.3 task 7), the far edge of a rectangle
// a typed value of its own and the wall side a fixed one. The type's walls, bays and corners are the same handles' (D.1 task 6).
import type { WarehouseType } from '../../../model/schema.ts'
import type { Generated } from '../engine/generate.ts'
import { courtBand, courtsOf } from './handleMath.ts'

/** The block's truck courts (Decision "Truck court", BE.4): one in front of every docked wall and of every wall given one, dashed in the court's colour. */
export function Courts({ t, g, standard }: { t: WarehouseType; g: Generated; standard: number }) {
  const courts = courtsOf(t, g, standard)
  if (!courts.length) return null
  return (
    <g data-layer="block-courts">
      {courts.flatMap((c) =>
        c.parts.map((part, k) => {
          const key = `${c.edge.id}:${part.id ?? k}`
          const style = { fill: 'var(--court)', fillOpacity: 0.6, stroke: 'var(--ink-tertiary)', strokeDasharray: '6 4' } as const
          // a court with a shape of its own: its contour, as the shape handles' own
          if (part.shaped)
            return (
              <path
                key={key}
                data-court={c.edge.id}
                data-court-part={part.id}
                d={`M${part.polygon.map((q) => `${q.x},${-q.y}`).join('L')}Z`}
                {...style}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            )
          const depth = part.depth ?? c.depth
          const { rect } = courtBand(c.edge, depth)
          return <rect key={key} data-court={c.edge.id} data-court-depth={depth} x={rect.x} y={-(rect.y + rect.h)} width={rect.w} height={rect.h} {...style} vectorEffect="non-scaling-stroke" pointerEvents="none" />
        }),
      )}
    </g>
  )
}
