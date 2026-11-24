// The plan's paint (Decision "Plan style"; port of Plaza-Practiko `vistas/planta/estiloPlanta.ts`): the active level's
// masses in their colour at 85 % over the paper, an ink outline, a paper halo under the selected one, and labels in
// two lines (the name in bold, the area) with a halo, left out of a mass too small to hold them. Sizes in screen px.

/** The colour's share over the paper. */
export const FILL_OPACITY = 0.85
/** A mass's fill (and hatch) in Ghosted (Decision "Ghosted detail"): what is under it shows through. */
export const SEE_THROUGH = 0.35
export const STROKE_PX = 1.25
/** Heavier than Practiko's 2 px: on the white site its paper halo does not show, so the line alone marks it. */
export const SELECTED_PX = 2.5
/** The paper-coloured halo under a selected mass's outline. */
export const HALO_PX = 5
export const LABEL_PX = 13

/** A character's width, as a share of the font size (Inter, roughly). */
const CHAR = 0.56

/** Do the label's lines fit in a w × h m box (the mass's bounds) at `px` metres per screen pixel? */
export function labelFits(w: number, h: number, px: number, lines: string[]): boolean {
  if (!(px > 0) || lines.length === 0) return false
  const textW = Math.max(...lines.map((l) => l.length)) * LABEL_PX * CHAR
  const textH = lines.length * LABEL_PX * 1.2
  return w / px >= textW + 6 && h / px >= textH + 4
}
