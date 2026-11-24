// What the drafting bar keeps of how the viewport looks: the Detail select (and the look of the small selects beside it). The
// overlays that were chips here (*Overlays ▾*: Graph, Map, Levels, Labels, Dims, Issues, Rules) went with Phase AS.3: each is an eye
// of the Layers tree (Graph, Labels, Dimensions, Issues, Rules, the Map row) and View › Overlays still toggles them, with Level planes
// and Issue count on the chip, which are not rows (Decision "Layers"). The terrain's look is the bar's too (TerrainViewRow).
import { DETAILS, useDetail, type Detail } from '../detail.ts'
import { t as tr } from '../../i18n/idioma.ts' // mixed-use-mvp

/** A Show menu's look: as small as the chips beside it. */
export const SHOW_SELECT = 'h-[1.25rem] min-w-0 flex-1 rounded-segment-pill bg-panel px-1 text-label text-ink shadow-control outline-none disabled:opacity-50'

/** Detail (Schematic · Design · Presentation): how the plan, the 3D and Compare draw; in the drafting bar. */
export function DetailSelect() {
  const detail = useDetail((s) => s.detail)
  const setDetail = useDetail((s) => s.setDetail)
  return (
    <select
      data-tour="detail"
      aria-label="Detail"
      title={DETAILS.find((d) => d.key === detail)!.title}
      value={detail}
      onChange={(e) => setDetail(e.target.value as Detail)}
      className="h-[1.75rem] shrink-0 rounded-control bg-panel px-1.5 text-label text-ink shadow-control outline-none"
    >
      {DETAILS.map((d) => (
        <option key={d.key} value={d.key}>
          {tr(d.label)}
        </option>
      ))}
    </select>
  )
}
