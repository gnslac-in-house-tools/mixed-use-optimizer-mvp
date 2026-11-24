// What the block editor's bottom bar does with the keys its titles name (Phase BE.10; Project C, AS.1): whether a bar is
// on screen, and the Dimension and Ruler toggles (the hand's `toggle`) as the bar's chips and the keys (the commands `block.dimension` and
// `block.ruler`, in `commands.ts`) both call them. The bar (BlockDraftingBar.tsx) says when it is shown and gone; the
// keys themselves are the commands' now, answered in the block editor's place by the dispatcher
// (views/commands/dispatch.ts), so nothing here listens to a key.
import { toggle } from '../../../views/tools/hand.ts'

/** How many bars are on screen (the block editor's plan, in the Program window): their keys are heard then. */
let shownBars = 0

/** The bar mounted (true) or went (false). */
export function barShown(on: boolean): void {
  shownBars = Math.max(0, shownBars + (on ? 1 : -1))
}

/** Is a block editor's bar on screen? */
export const blockBarShown = (): boolean => shownBars > 0

/** D: the Dimension tool, or Select again when it is in hand (the ruler gives way). */
export function toggleBlockDimension(): void {
  toggle('dimension')
}

/** T: the ruler on or off; it works with Select, so a drawing tool gives way. */
export function toggleBlockRuler(): void {
  toggle('ruler')
}
