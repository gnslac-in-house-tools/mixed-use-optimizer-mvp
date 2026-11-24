// How a note looks on the plan (Phase AS.5, Decision "Notes"), pure: its size on screen (12 px as the plan's labels, *Small* 10, *Large* 16: the same at any zoom), its lines,
// and the box its text fills, which the window picks it by and a press finds it by. The plan cannot measure a glyph in the model's units without drawing it, so the box is the
// text's extent as a monospace of 0.6 em would fill it (the plan's labels are sized the same way, `planStyle.ts`): near enough for a window, and the same in a test as in a browser.
// The text's first line sits on its point (its baseline starts there), left-aligned, and the next lines go down the screen; `angle` turns it counter-clockwise about that point.
import { noteLines } from '../../../engine/annotations.ts'
import type { Note, Point } from '../../../model/schema.ts'

/** A note's text size on screen, in px, by its `size` (absent: the middle one, the plan's labels'). */
export const NOTE_PX = { small: 10, medium: 12, large: 16 } as const

/** How wide one character is, and how tall a line is, as a share of the text size. */
const CHAR_EM = 0.6
const LINE_EM = 1.25
/** How far the first line rises above its baseline and how far the last one falls below, as a share of the text size. */
const ASCENT_EM = 0.85
const DESCENT_EM = 0.25

/** The note's size on screen, in px. */
export const notePx = (n: Pick<Note, 'size'>): number => NOTE_PX[n.size ?? 'medium']

/** The lines of a text, as written (an empty line stays one): the CAD plan splits them the same way (`engine/annotations.ts`). */
export { noteLines }

export interface NoteBox {
  /** The corners of its extent, counter-clockwise, in the plan's world (metres). */
  polygon: Point[]
  /** The text's size, the line's height and the longest line's width, in metres at this zoom. */
  size: number
  line: number
  width: number
  /** Where a place of the note's own frame is on the plan: `x` along the text, `y` down the screen (both metres, from its point). */
  place(x: number, y: number): Point
}

/** The extent of a note at a zoom: `px` is one screen pixel in metres (`1 / camera.scale`). */
export function noteBox(n: Pick<Note, 'at' | 'text' | 'angle' | 'size'>, px: number): NoteBox {
  const size = notePx(n) * px
  const lines = noteLines(n.text)
  const width = Math.max(1, ...lines.map((l) => l.length)) * CHAR_EM * size
  const line = LINE_EM * size
  const a = ((n.angle ?? 0) * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  // the frame's x runs along the text and its y down the screen, so the plan's up is the frame's −y: a turn counter-clockwise on the plan
  const place = (x: number, y: number): Point => ({ x: n.at.x + x * cos + y * sin, y: n.at.y + x * sin - y * cos })
  const top = -ASCENT_EM * size
  const bottom = (lines.length - 1) * line + DESCENT_EM * size
  return { polygon: [place(0, bottom), place(width, bottom), place(width, top), place(0, top)], size, line, width, place }
}
