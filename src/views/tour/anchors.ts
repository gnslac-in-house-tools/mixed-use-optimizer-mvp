// What a step that points at a tool needs before its card can: the Tools strip shown (the layout may have it hidden). Every
// tutorial's list goes through `showToolsFor`, so a step's `before` shows the strip first, whatever else it sets. The anchor
// scrolled into view is the card's (TourCard.tsx), once the strip is drawn.
import { useUi } from '../layout/ui.ts'
import type { TourStep } from './tour.ts'

/** Is this step's anchor a button of the Tools strip (`tool-<id>`)? */
export const pointsAtTool = (step: TourStep): boolean => !!step.anchor?.startsWith('tool-')

/** The same steps (their getters kept), each that points at a tool with a `before` that shows the strip first. */
export function showToolsFor(steps: TourStep[]): TourStep[] {
  for (const step of steps) {
    if (!pointsAtTool(step)) continue
    const own = step.before?.bind(step)
    step.before = () => {
      useUi.getState().setShow('tools', true)
      own?.()
    }
  }
  return steps
}
