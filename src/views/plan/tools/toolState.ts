// The plan's tools (port of Plaza-Practiko's `herramienta` in `estado/store.ts`, `vistas/planta/medidas.ts`): UI
// state, never in the Project or the history.
//   tool        Select · Mass (Draw: it makes a block) · Hole (Phase H.3) · Corner · Chamfer · Dimension · Street (Decision "Streets layout")
//               · Lot (Decision "Lot tool": a parking lot against a wall, or free)
//               · Reference line (Phase AS.5: a guide drawn point by point, the other tools snap to it)
//               · Note (Phase AS.5: a text placed by a click, its words typed in Properties; the tool lets go after one)
//               (their keys are their commands'; the one in hand is `tools/hand.ts`'s, its only writer)
//               · Move · Copy · Rotate · Mirror · Array · Align: the general tools (Decision "Tools strip"; the last three, Phase AS.5)
//               every tool works whatever panel tab is open; the Tools strip lists them
//   ruler       a temporary measurement, only with Select; not saved (`active` is the hand's too)
//   dimensions  which hand-drawn dimension is selected (Delete removes it), and the ones picked beside it. Whether they
//               show on the screen plan is a preference of whoever looks: the layer store's key `DIMENSIONS`
//               (views/layers/layerView.ts, per project); hiding them lets the selected one go (views/layers/letGo.ts)
import { create } from 'zustand'
import type { Id, Point, Project } from '../../../model/schema.ts'
import { useApp } from '../../../state/store.ts'
import { keyHint, titleWith } from '../../commands/shortcuts.ts'
import { mixing } from '../mixing.ts'

export type Tool = 'select' | 'mass' | 'hole' | 'corner' | 'chamfer' | 'split' | 'dimension' | 'referenceLine' | 'note' | 'street' | 'lot' | 'move' | 'copy' | 'rotate' | 'mirror' | 'array' | 'align'

/** A tool's button: `hint` says what it does, as plain text (the command's hint in the Tools strip reads it); its title adds the
 *  key its command has (commands/shortcuts.ts: read when the title is, so a key the user gave shows at once); no key, no brackets. */
const tool = (key: Tool, label: string, text: string): { key: Tool; label: string; hint: string; readonly title: string } => ({
  key,
  label,
  hint: text,
  get title() {
    return titleWith(text, `tool.${key}`)
  },
})

export const TOOLS: { key: Tool; label: string; hint: string; readonly title: string }[] = [
  {
    key: 'select',
    label: 'Select',
    hint: 'Select and edit what is on the plan; Esc clears the selection',
    get title() {
      const k = keyHint('tool.select')
      return `Select and edit masses (${k ? `${k}; ` : ''}Esc clears the selection)`
    },
  },
  tool('mass', 'Block', 'Draw a block: drag a rectangle or click corner by corner, Enter closes; the stroke is its outer face'),
  tool('hole', 'Hole', 'Cut a hole in a block (a court): drag a rectangle or click corner by corner inside it, Enter closes'),
  tool('corner', 'Corner', 'Round a corner: click it and move to set the radius, or type it'),
  tool('chamfer', 'Chamfer', 'Chamfer a corner: click it and move to set the cut, or type its set-back; drag its two ends apart after'),
  tool('split', 'Split', 'Split a truck court: two clicks draw a line at any angle (the second point may be typed) and the court it crosses is cut in two'),
  tool('dimension', 'Dimension', 'A dimension by hand: two points and its distance; it stays on the plan'),
  tool('referenceLine', 'Reference line', 'A reference line: click point by point, Enter or a double click ends it; the other tools snap to it'),
  tool('note', 'Note', 'A note: click where it goes, then type its words in Properties; the tool lets go after one'),
  tool('street', 'Street', 'Draw a street: click node by node (on a node it joins it, on a street it makes a T), Enter or a double click ends it; its type is the drafting bar’s, w 10 a width of its own; once drawn, its sides are pulled by their pills, Shift for the whole street and Ctrl for free, and the lane pill adds or takes a lane'),
  tool('lot', 'Lot', 'A parking lot: next to a wall, a click lays it along the whole wall up to the first street in its way (a drag along it, a length and its rows); on open ground, drag a free one'),
  tool('move', 'Move', 'Move what is picked: a base point, then where it goes'),
  tool('copy', 'Copy', 'Copy what is picked: a base point, then where each copy goes; Enter ends'),
  tool('rotate', 'Rotate', 'Rotate what is picked: the pivot, the start of the turn, then its end; Ortho turns by 15°'),
  tool('mirror', 'Mirror', 'Mirror what is picked about a line: two points give it; Ortho steps its angle by 15°; the ▾ keeps the original or not'),
  tool('array', 'Array', 'Array what is picked: a base point, then where the first copy goes; x5 sets the count, the ▾ the rows'),
  tool('align', 'Align', 'Align what is picked on a line: two points give it; the ▾ sets edges or centres'),
]

/** The ruler's button, as plain text (the drafting bar's chip and the strip's button add its key). */
export const RULER_HINT = 'Ruler: click and click (or drag) to measure; Shift free; Esc clears'

/** The general tools, over what is picked (Decision "General tools"): the Tools strip's first group. */
export type GeneralTool = 'move' | 'copy' | 'rotate' | 'mirror' | 'array' | 'align'

/** The drawing or general tool in hand (Select: none). Written by `tools/hand.ts` alone (`take`, `toggle`, `letGo`). */
export const useTool = create<{ tool: Tool }>()(() => ({ tool: 'select' }))

/**
 * The program a block drawn with the Draw tool takes (Decisions "Mass with its program", "Draw makes a block"), picked in the Massing
 * group's ▾ of the Tools strip ("Draw makes") before drawing: the stroke is the outer face of a block of that program's type (made on the
 * first stroke when the program has none). undefined: none picked yet, the brief's first program; null: no program (the shared *Block*
 * type). UI state, this session.
 */
export const useMassProgram = create<{
  programId: Id | null | undefined
  setProgram(id: Id | null): void
}>()((set) => ({
  programId: undefined,
  setProgram: (programId) => set({ programId }),
}))

/** The program a new block drawn now takes: the one picked, if it is still in the brief; else the brief's first. */
export function newMassProgram(p: Project, picked: Id | null | undefined = useMassProgram.getState().programId): Id | null {
  if (picked === null) return null
  if (picked !== undefined && p.programs.some((g) => g.id === picked)) return picked
  return p.programs[0]?.id ?? null
}

/** The ruler: on or off (`tools/hand.ts` writes `active`), and the measurement in progress (from `a` to `b`; `b` null while placing the second point). */
export const useRuler = create<{ active: boolean; a: Point | null; b: Point | null; clear(): void }>()((set) => ({
  active: false,
  a: null,
  b: null,
  clear: () => set({ a: null, b: null }),
}))

export const useDimensions = create<{
  selected: Id | null
  /** The other dimensions picked with Shift+click beside `selected` (Decision "Mixed selection"). */
  also: Id[]
  select(id: Id | null): void
  /** Shift+click: the dimension joins what is picked, or leaves it; it lets go of nothing else. */
  toggleSelect(id: Id): void
}>()((set, get) => ({
  selected: null,
  also: [],
  select: (selected) => set({ selected, also: [] }),
  toggleSelect: (id) => {
    const { selected, also } = get()
    if (selected === null) return set({ selected: id, also: [] })
    if (id === selected) return set({ selected: also[0] ?? null, also: also.slice(1) })
    set({ also: also.includes(id) ? also.filter((x) => x !== id) : [...also, id] })
  },
}))

/** Every dimension selected: the one first, then those Shift+clicked beside it. */
export const selectedDimensionIds = (s: { selected: Id | null; also: Id[] }): Id[] => (s.selected === null ? [] : [s.selected, ...s.also])

// One thing is selected at a time (Properties shows it): picking a mass lets go of the dimension, and a dimension that
// is deleted or undone away, or is on another level than the plan shows, is let go too.
useApp.subscribe((s, before) => {
  const d = useDimensions.getState().selected
  if (d === null) return
  const massPicked = !mixing.on && s.selection.massIds.length > 0 && s.selection.massIds !== before.selection.massIds
  const dim = s.project.dimensions?.find((x) => x.id === d)
  if (massPicked || !dim || dim.levelId !== s.level || s.showAll) useDimensions.getState().select(null)
})

/** «12.4 m»: to 0.1 m. */
export const lengthText = (m: number) => `${m.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} m`

/** Where the pointer is on the plan (world metres), for "paste at the cursor"; null when it is not over the plan. */
export const planPointer: { point: Point | null } = { point: null }
