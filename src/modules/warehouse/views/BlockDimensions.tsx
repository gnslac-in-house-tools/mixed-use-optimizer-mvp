// The type's hand-drawn dimensions on the block plan (Phase BE.10): drawn as the site's (views/plan/dimensions), their
// length in the block editor's unit (BE.8). With Select a click picks one (it turns dark, and what was picked on the
// plan is let go) and Delete removes it, one undo step; picking anything else lets it go. They measure, they do not
// constrain: no anchors, no lock, no typed length (the block is edited by its steps and its handles).
import { useEffect, useState, type PointerEvent } from 'react'
import type { Id, WarehouseType } from '../../../model/schema.ts'
import { DimensionFigure } from '../../../views/plan/dimensions/DimensionFigure.tsx'
import { dimensionDrawing } from '../../../views/plan/dimensions/drawing.ts'
import { useRuler, useTool } from '../../../views/plan/tools/toolState.ts'
import { removeBlockDimension } from './commands.ts'
import { useLengths } from './units.ts'
import { useWarehouse } from './warehouseState.ts'

/** `pick`: a click picks one (Select, no measure on). */
export function BlockDimensions({ t, px, pick }: { t: WarehouseType; px: number; pick: boolean }) {
  const { text } = useLengths()
  const [picked, setPicked] = useState<Id | null>(null)
  // what is picked on the plan changes: this lets go
  useEffect(() => useWarehouse.subscribe((s, before) => s.picked !== before.picked && setPicked(null)), [])
  useEffect(() => {
    if (!picked) return
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      // never while a measure is on: its keys are its own (WarehousePlan's Delete the same)
      if (useTool.getState().tool === 'dimension' || useRuler.getState().active) return
      removeBlockDimension(t.id, picked)
      setPicked(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [picked, t.id])
  const dims = t.dimensions ?? []
  if (!dims.length) return null
  return (
    <g data-layer="block-dimensions">
      {dims.map((dim) => {
        const d = dimensionDrawing(dim, px, (m) => text(m))
        if (!d) return null
        const on = dim.id === picked
        return (
          <g
            key={dim.id}
            data-block-dimension={dim.id}
            data-picked-dimension={on}
            style={{ cursor: pick ? 'pointer' : undefined }}
            pointerEvents={pick ? 'auto' : 'none'}
            onPointerDown={(e: PointerEvent) => {
              if (!pick || e.button !== 0) return
              e.stopPropagation()
              useWarehouse.getState().setPicked([])
              setPicked(dim.id)
            }}
          >
            {/* a wide invisible stroke makes the thin line easy to hit */}
            <path d={`M${d.line.a.x} ${-d.line.a.y}L${d.line.b.x} ${-d.line.b.y}`} stroke="transparent" strokeWidth={10} vectorEffect="non-scaling-stroke" />
            <DimensionFigure d={d} color={on ? 'var(--ink)' : 'var(--ink-secondary)'} width={on ? 2 : 1} />
          </g>
        )
      })}
    </g>
  )
}
