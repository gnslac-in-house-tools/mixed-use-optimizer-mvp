// From zero, chapter 3 — A block: Blocks, + New block, and its six steps in the Program window, each typed and locked
// (the values the tutorial gives, so the later chapters start from a known block); its front's docks taken away and put
// back by the dock rule (Decision "Dock rule": the two middle modules of each bay), a level door and a pattern.
import type { HallElement, WarehouseStep } from '../../../model/schema.ts'
import { generate } from '../../../modules/warehouse/engine/generate.ts'
import { edgeModules, type ShapeEdge } from '../../../modules/warehouse/engine/shape.ts'
import type { StepPatch } from '../../../modules/warehouse/engine/steps.ts'
import { lockStep, newType, openProgram, putElements, updateStep } from '../../../modules/warehouse/views/commands.ts'
import { onDockRule } from '../../../modules/warehouse/engine/dockRule.ts'
import { useWarehouse } from '../../../modules/warehouse/views/warehouseState.ts'
import { useApp } from '../../../state/store.ts'
import { useUi } from '../../layout/ui.ts'
import type { TourStep } from '../tour.ts'
import { adoptBlock, tutorialType } from './common.ts'

const CHAPTER = 'A block'

/** The tutorial's block, the Program window open on it at `step`. */
function onBlock(step?: WarehouseStep) {
  adoptBlock()
  const t = tutorialType()
  if (!t) return
  if (useWarehouse.getState().typeId !== t.id) useWarehouse.getState().pick(t.id)
  if (useUi.getState().dialog !== 'program') openProgram()
  if (step) useWarehouse.getState().show(step)
}

/** The block's edge on a side, and every module along it. */
function edgeOn(side: ShapeEdge['side']): { g: ReturnType<typeof generate>; e: ShapeEdge; all: number[] } | null {
  const t = tutorialType()
  if (!t) return null
  const g = generate(t)
  const e = g.edges.find((x) => x.side === side)
  if (!e) return null
  const span = edgeModules(e)
  return { g, e, all: Array.from({ length: span.hi - span.lo }, (_, i) => span.lo + i) }
}
const kindOn = (kind: HallElement['kind'], side: ShapeEdge['side']) => {
  const at = edgeOn(side)
  return at ? (tutorialType()?.elements ?? []).filter((x) => x.kind === kind && x.edge === at.e.id).map((x) => x.module).sort((a, b) => a - b) : []
}
/** The front's docks are by the dock rule. */
const byRule = () => {
  const at = edgeOn('front')
  const docks = kindOn('dock', 'front')
  return !!at && docks.length > 0 && JSON.stringify(docks) === JSON.stringify(onDockRule(at.g, at.e, at.all))
}
const locked = (step: WarehouseStep) => tutorialType()?.locks?.[step] === 'locked'

/** A step typed (`patch`, when its fields differ) and locked. */
function typed<S extends WarehouseStep>(step: S, patch: StepPatch[S] | null, title: string, body: string, why: string): TourStep {
  const matches = () => {
    const t = tutorialType()
    if (!t) return false
    if (!patch) return true
    const now = t[step as Exclude<WarehouseStep, 'elements'>] as Record<string, unknown>
    return Object.entries(patch).every(([k, v]) => now[k] === v)
  }
  return {
    id: `zero-block-${step}`,
    chapter: CHAPTER,
    title,
    body: [body],
    why,
    anchor: `block-step-${step}`,
    before: () => onBlock(step),
    act: () => {
      const t = tutorialType()
      if (!t) return
      if (patch && !matches()) updateStep(t.id, step, patch)
      if (!locked(step)) lockStep(t.id, step)
    },
    done: () => matches() && locked(step),
  }
}

export const BLOCK_STEPS: TourStep[] = [
  {
    id: 'zero-blocks',
    chapter: CHAPTER,
    title: 'Blocks',
    body: ['Open Blocks, the tab on the left.'],
    why: 'A block is a building designed once — its grid, its hall, its walls, its docks — and placed on the site as copies that follow it.',
    anchor: 'tab-blocks',
    act: () => useUi.getState().setRail('blocks'),
    done: () => useUi.getState().rail === 'blocks' || !!tutorialType(),
  },
  {
    id: 'zero-new-block',
    chapter: CHAPTER,
    title: 'A new block',
    body: ['Click + New block. It opens in the Program window, step by step.'],
    anchor: 'new-block',
    before: () => {
      if (!tutorialType()) useUi.getState().setRail('blocks')
    },
    act: () => {
      newType()
      adoptBlock()
      openProgram()
    },
    done: () => (useApp.getState().project.warehouseTypes?.length ?? 0) > 0,
  },
  typed(
    'grid',
    { x: 12, y: 12, modules: 4 },
    '① Grid',
    'Keep a bay of 12 × 12 m in 4 modules, then press Lock ① Grid.',
    'The bay is the distance between column lines; the modules split it (here 3 m), docks and doors sit on module lines, and the outline’s corners snap to them. Lock only marks a step checked: every step stays editable, in any order.',
  ),
  typed(
    'hall',
    { length: 180, width: 96 },
    '② Hall',
    'Type a length of 180 m and a width of 96 m (15 × 8 bays), then Lock.',
    'The hall’s length and width, in whole bays where they can be; its end bays take what is left over.',
  ),
  typed('columns', null, '③ Columns', 'Keep the columns as they are, then Lock.', 'Their size, and which column lines carry one (every line, or every second…).'),
  typed(
    'envelope',
    { height: 12 },
    '④ Envelope',
    'Keep a clear height of 12 m, then Lock.',
    'How tall the block is and how thick its walls are; an edge can have its own wall in Shape.',
  ),
  typed(
    'morphology',
    null,
    '⑤ Shape',
    'Keep the rectangle, then Lock.',
    'The block’s outline is free, its module lines a snap: drag a wall or a corner, add corners, holes (courts) and zones of other programs.',
  ),
  {
    id: 'zero-block-docks-off',
    chapter: CHAPTER,
    title: '⑥ Elements: the docks',
    body: ['A new block has a dock on every module of its front. Pick Dock in the Program window’s tools, above the plan, and drag along the front wall to take them away.'],
    why: 'A drag along a wall paints the modules it passes: it takes away when it starts on a dock, it puts docks when it starts on an empty module.',
    anchor: 'block-step-elements',
    before: () => onBlock('elements'),
    act: () => {
      const at = edgeOn('front')
      const t = tutorialType()
      if (at && t) putElements(t.id, 'dock', at.e.id, at.all, false)
    },
    done: () => kindOn('dock', 'front').length === 0 || byRule(),
  },
  {
    id: 'zero-block-docks-on',
    chapter: CHAPTER,
    title: 'Docks by the rule',
    body: ['Drag along the front wall again: the docks go only on the two middle modules of each bay.'],
    why: 'The dock rule: a drag or a bay filled puts docks where the block’s docked bays have them (here, none yet: the middle ones). A press on one module puts one exactly there.',
    anchor: 'block-step-elements',
    before: () => onBlock('elements'),
    act: () => {
      const at = edgeOn('front')
      const t = tutorialType()
      if (at && t) putElements(t.id, 'dock', at.e.id, onDockRule(at.g, at.e, at.all), true)
    },
    done: byRule,
  },
  {
    id: 'zero-block-door',
    chapter: CHAPTER,
    title: 'A level door',
    body: ['Pick Door and press a module of the right-hand wall: a door at ground level.'],
    anchor: 'block-step-elements',
    before: () => onBlock('elements'),
    act: () => {
      const at = edgeOn('right')
      const t = tutorialType()
      if (at && t) putElements(t.id, 'door', at.e.id, [at.all[Math.floor(at.all.length / 2)]], true)
    },
    done: () => (tutorialType()?.elements ?? []).some((x) => x.kind === 'door'),
  },
  {
    id: 'zero-block-pattern',
    chapter: CHAPTER,
    title: 'A pattern',
    body: ['Pick Pattern and press a module of the back wall: a mark of your own, a downpipe.'],
    why: 'Patterns are marks you name (downpipes, louvres…); they are counted, drawn on the plan and the 3D, and stay on their module.',
    anchor: 'block-step-elements',
    before: () => onBlock('elements'),
    act: () => {
      const at = edgeOn('back')
      const t = tutorialType()
      if (at && t) putElements(t.id, 'pattern', at.e.id, [at.all[Math.floor(at.all.length / 2)]], true)
    },
    done: () => (tutorialType()?.elements ?? []).some((x) => x.kind === 'pattern'),
  },
  {
    id: 'zero-block-lock-elements',
    chapter: CHAPTER,
    title: 'Lock ⑥ Elements',
    body: ['Press Lock ⑥ Elements.'],
    anchor: 'block-lock',
    before: () => onBlock('elements'),
    act: () => {
      const t = tutorialType()
      if (t && !locked('elements')) lockStep(t.id, 'elements')
    },
    done: () => locked('elements'),
  },
  {
    id: 'zero-block-close',
    chapter: CHAPTER,
    title: 'Your block',
    body: ['Close the Program window: the block waits in Blocks, ready to place.'],
    anchor: 'dialog-close',
    before: () => onBlock(),
    act: () => useUi.getState().closeDialog(),
    done: () => useUi.getState().dialog === null,
  },
]
