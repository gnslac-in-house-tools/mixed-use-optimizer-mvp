// The grid's look (Decision "Grid in 3D"): its colour and opacity, the viewer's for the session. The last part of the
// bottom bar's *Grid ▾* menu beside the Grid chip (GridMenu.tsx; Decision "Grid chip": the chip that snaps to the grid also
// shows it).
import { Segmented } from '../../controls/Segmented.tsx'
import { GRID_COLORS, useGridView, type GridColor } from './gridView.ts'
import { t as tr } from '../../../i18n/idioma.ts' // mixed-use-mvp

export function GridLook() {
  const color = useGridView((s) => s.color)
  const opacity = useGridView((s) => s.opacity)
  return (
    <div role="group" aria-label="Grid look" className="flex flex-col gap-2 p-0.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-label text-ink-secondary">{tr("Colour")}</span>
        <Segmented
          kind="toggle"
          label="Grid colour"
          options={GRID_COLORS.map((c) => ({ key: c.key, label: c.label, title: `The grid in ${c.label.toLowerCase()}` }))}
          value={color}
          onChange={(k) => useGridView.getState().setColor(k as GridColor)}
        />
      </div>
      <label className="flex items-center justify-between gap-3">
        <span className="text-label text-ink-secondary">{tr("Opacity")}</span>
        <input
          type="range"
          aria-label="Grid opacity"
          min={10}
          max={100}
          step={5}
          value={Math.round(opacity * 100)}
          onChange={(e) => useGridView.getState().setOpacity(Number(e.target.value) / 100)}
          className="w-28 accent-ink"
        />
        <span className="w-10 whitespace-nowrap text-right text-label tabular-nums text-ink-secondary">{Math.round(opacity * 100)} %</span>
      </label>
    </div>
  )
}
