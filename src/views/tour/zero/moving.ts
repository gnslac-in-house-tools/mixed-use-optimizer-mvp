// From zero, chapter 5 — Moving it: Select, Rotate (a quarter turn), Move (west) and Copy (a second block east), with
// the keys each has; Snap, Ortho and Align, which the drags follow; the Ruler. The moves go through the same verbs the
// tools commit (state/actions/selection.ts: turnPicked, movePicked, copyPicked) on what is picked.
import { centroid } from '../../../engine/geom/polygon.ts'
import type { Point } from '../../../model/schema.ts'
import { actions } from '../../../state/actions/index.ts'
import { useApp } from '../../../state/store.ts'
import { titleWith } from '../../commands/shortcuts.ts'
import { useUi } from '../../layout/ui.ts'
import { pickedNow } from '../../plan/mix.ts'
import type { TourStep } from '../tour.ts'
import { tutorialCopies, tutorialHall } from './common.ts'

const CHAPTER = 'Moving it'

/** The first copy's hall as the plan draws it. */
const hallPolygon = (): Point[] | null => {
  const id = tutorialHall()
  return (id && useApp.getState().derived.masses[id]?.polygon) || null
}
/** The angle of its longest side, in degrees, 0–180. */
function axis(poly: Point[]): number {
  let best = { len: 0, deg: 0 }
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (len > best.len) best = { len, deg: ((((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI) % 180) + 180) % 180 }
  })
  return best.deg
}
const turned = () => {
  const h = hallPolygon()
  return !!h && Math.abs(axis(h) - 90) < 0.5
}
/** The middle of what can be built, where the block was placed. */
const middle = (): Point | null => {
  const zone = useApp.getState().derived.site.buildable.flat()[0]
  return zone && zone.length >= 3 ? centroid(zone) : null
}
const movedWest = () => {
  const h = hallPolygon()
  const m = middle()
  return !!h && !!m && centroid(h).x < m.x - 40
}
/** The first copy picked, alone. */
function pickIt() {
  const hall = tutorialHall()
  if (hall) useApp.getState().select(hall)
}
const onPlan = () => {
  const ui = useUi.getState()
  ui.closeDialog()
  ui.setView('plan')
}

export const MOVING_STEPS: TourStep[] = [
  {
    id: 'zero-select',
    chapter: CHAPTER,
    title: 'Select',
    get body() {
      return [`${titleWith('Select', 'tool.select')} picks: click the block. Shift adds or takes away, a drag picks what is inside its box.`]
    },
    anchor: 'tool-select',
    before: onPlan,
    act: pickIt,
    done: () => {
      const hall = tutorialHall()
      return !!hall && useApp.getState().selection.massIds.includes(hall)
    },
  },
  {
    id: 'zero-rotate',
    chapter: CHAPTER,
    title: 'Rotate',
    get body() {
      return [`With the block picked, press ${titleWith('Rotate', 'tool.rotate')}: click the pivot, the start of the turn, then its end. Turn it a quarter, so it runs north–south.`]
    },
    why: 'Ortho turns by 15°, so a quarter is easy to hit; type an angle in the command line under the plan for an exact one, or beside the rotation handle of a picked block, with Enter.',
    anchor: 'tool-rotate',
    before: onPlan,
    act: () => {
      pickIt()
      const h = hallPolygon()
      if (!h) return
      const { option } = useApp.getState()
      useApp.getState().apply((p) => actions.turnPicked(p, option, pickedNow(), centroid(h), 90).project)
    },
    done: turned,
  },
  {
    id: 'zero-move',
    chapter: CHAPTER,
    title: 'Move',
    get body() {
      return [`Press ${titleWith('Move', 'tool.move')}: click a base point, then where it goes. Move the block about 90 m west, to make room for a second one.`]
    },
    why: 'Move, Copy and Rotate work on whatever is picked: blocks, masses, streets, existing streets, lots, gates, dimensions, reference lines and notes, together (Move and Rotate take imported drawings too).',
    anchor: 'tool-move',
    before: onPlan,
    act: () => {
      pickIt()
      const { option } = useApp.getState()
      useApp.getState().apply((p) => actions.movePicked(p, option, pickedNow(), { x: -90, y: 0 }).project)
    },
    done: movedWest,
  },
  {
    id: 'zero-copy',
    chapter: CHAPTER,
    title: 'Copy',
    get body() {
      return [`Press ${titleWith('Copy', 'tool.copy')}: a base point, then where the copy goes — about 180 m east. Enter ends.`]
    },
    why: 'A copied block is another copy of the same block: both follow it.',
    anchor: 'tool-copy',
    before: onPlan,
    act: () => {
      pickIt()
      const { option } = useApp.getState()
      useApp.getState().apply((p) => actions.copyPicked(p, option, pickedNow(), { x: 180, y: 0 }).project)
    },
    done: () => tutorialCopies().length >= 2,
  },
  {
    id: 'zero-snap',
    chapter: CHAPTER,
    title: 'Snap, Align and Ortho',
    get body() {
      return [`The drags follow the snap: points of what is drawn, Align with what is already there, ${titleWith('Ortho', 'view.ortho')} straight across.`]
    },
    get why() {
      return `Snap ▾ chooses what it snaps to: Drawing lines (the site’s imported drawings), Reference lines (the guides drawn on the plan) and Contours; ${titleWith('Grid', 'view.grid')} holds a drag to the structural grid’s modules.`
    },
    anchor: 'snap',
    before: onPlan,
  },
  {
    id: 'zero-ruler',
    chapter: CHAPTER,
    title: 'The ruler',
    get body() {
      return [`${titleWith('Ruler', 'tool.ruler')}: click and click to measure a distance; Dimension draws one that stays.`]
    },
    anchor: 'tool-ruler',
    before: onPlan,
  },
]
