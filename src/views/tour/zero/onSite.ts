// From zero, chapter 4 — The block on the site: a copy placed from Blocks, picked, then edited on the site as that copy
// alone with the block tools (Decision "Blocks on the site"): docks by the dock rule on its back, a level door, a
// pattern, a truck court of its own; why a docked wall refuses a court; the copy keeps its own elements now, and Back
// to type (Properties) would undo that.
import type { HallElement } from '../../../model/schema.ts'
import { copyGenerated, copyOnPlan } from '../../../modules/warehouse/engine/copies.ts'
import { edgeModules, type ShapeEdge } from '../../../modules/warehouse/engine/shape.ts'
import { placeCopy, putCopyElements, setCopyEdgeCourt } from '../../../modules/warehouse/views/commands.ts'
import { onDockRule } from '../../../modules/warehouse/engine/dockRule.ts'
import { useApp } from '../../../state/store.ts'
import { useUi } from '../../layout/ui.ts'
import type { TourStep } from '../tour.ts'
import { tutorialCopies, tutorialHall, tutorialType, tutorialTypeId } from './common.ts'

const CHAPTER = 'The block on the site'

/** The first copy as it stands: its building, its type, what it makes. */
function copyNow() {
  const { project: p } = useApp.getState()
  const b = p.buildings.find((x) => x.id === tutorialCopies()[0])
  const t = tutorialType()
  const hall = p.masses.find((m) => m.id === tutorialHall())
  if (!b?.warehouse || !t) return null
  const g = copyGenerated(t, copyOnPlan(t, b.warehouse, hall?.footprint))
  return { b, t, g }
}
/** The copy's edge on a side and every module along it. */
function edgeOn(side: ShapeEdge['side']) {
  const c = copyNow()
  const e = c?.g.edges.find((x) => x.side === side)
  if (!c || !e) return null
  const span = edgeModules(e)
  return { ...c, e, all: Array.from({ length: span.hi - span.lo }, (_, i) => span.lo + i) }
}
/** How many of a kind the copy has more than its type. */
const more = (kind: HallElement['kind']) => {
  const c = copyNow()
  return c ? c.g.doors.filter((d) => d.kind === kind).length - c.t.elements.filter((e) => e.kind === kind).length : 0
}
const backByRule = () => {
  const at = edgeOn('back')
  if (!at) return false
  const docks = at.g.doors.filter((d) => d.kind === 'dock' && d.edge === at.e.id).map((d) => d.module).sort((a, b) => a - b)
  return docks.length > 0 && JSON.stringify(docks) === JSON.stringify(onDockRule(at.g, at.e, at.all))
}
const middle = (all: number[], by = 0) => all[Math.min(all.length - 1, Math.floor(all.length / 2) + by)]
/** Blocks open, the copy picked. */
function onCopy() {
  const ui = useUi.getState()
  ui.closeDialog()
  ui.setRail('blocks')
  ui.setView('plan')
  const hall = tutorialHall()
  if (hall && !useApp.getState().selection.massIds.includes(hall)) useApp.getState().select(hall)
}

export const ON_SITE_STEPS: TourStep[] = [
  {
    id: 'zero-place',
    chapter: CHAPTER,
    title: 'Place the block',
    body: ['Drag Tutorial warehouse from Blocks onto the site. (Or right-click it and choose Place: a copy goes in the middle of what can be built.)'],
    why: 'What stands on the site is a copy: it follows its block, and edits of the block reach every copy.',
    anchor: 'block-card',
    before: () => {
      const ui = useUi.getState()
      ui.closeDialog()
      ui.setRail('blocks')
    },
    act: () => {
      const id = tutorialTypeId()
      if (id) placeCopy(id)
    },
    done: () => tutorialCopies().length > 0,
  },
  {
    id: 'zero-pick',
    chapter: CHAPTER,
    title: 'Pick it',
    body: ['Click the block on the plan to pick it.'],
    anchor: 'viewport',
    act: () => {
      const hall = tutorialHall()
      if (hall) useApp.getState().select(hall)
    },
    done: () => {
      const hall = tutorialHall()
      return !!hall && useApp.getState().selection.massIds.includes(hall)
    },
  },
  {
    id: 'zero-site-docks',
    chapter: CHAPTER,
    title: 'Docks on the site',
    body: ['In the Elements group of the Tools strip, pick Dock and drag along the block’s back wall.'],
    why: 'The block tools edit this copy alone: its block stays as it is. The docks follow the dock rule, as in the block.',
    anchor: 'tool-dock',
    before: onCopy,
    act: () => {
      const at = edgeOn('back')
      if (at) putCopyElements(at.b.id, 'dock', at.e.id, onDockRule(at.g, at.e, at.all), true)
    },
    done: backByRule,
  },
  {
    id: 'zero-site-door',
    chapter: CHAPTER,
    title: 'A door on the site',
    body: ['In the Elements group, pick Door and press a module of the left-hand wall.'],
    anchor: 'tool-door',
    before: onCopy,
    act: () => {
      const at = edgeOn('left')
      if (at) putCopyElements(at.b.id, 'door', at.e.id, [middle(at.all)], true)
    },
    done: () => more('door') > 0,
  },
  {
    id: 'zero-site-pattern',
    chapter: CHAPTER,
    title: 'A pattern on the site',
    body: ['In the Elements group, pick Pattern and press another module of the same wall.'],
    anchor: 'tool-pattern',
    before: onCopy,
    act: () => {
      const at = edgeOn('left')
      if (at) putCopyElements(at.b.id, 'pattern', at.e.id, [middle(at.all, 2)], true)
    },
    done: () => more('pattern') > 0,
  },
  {
    id: 'zero-site-court',
    chapter: CHAPTER,
    title: 'A truck court',
    body: ['In the Elements group, pick Court and press the left-hand wall: it has no docks, so it gets a court of its own.'],
    why: 'A court is the paved yard in front of a wall where trucks turn. Its pill, on the court’s outer edge, drags its depth; type a number beside it, during the drag or right after, and press Enter for an exact one. With Select, click the court itself to pull its sides, chamfer its corners or cut it with Split.',
    anchor: 'tool-court',
    before: onCopy,
    act: () => {
      const at = edgeOn('left')
      if (at) setCopyEdgeCourt(at.b.id, at.e.id, {})
    },
    done: () => (copyNow()?.b.warehouse?.overrides?.courts?.length ?? 0) > 0,
  },
  {
    id: 'zero-site-court-docked',
    chapter: CHAPTER,
    title: 'A wall with docks',
    body: ['Try Court on the front wall: GFit says why not — a docked wall always has its truck court.'],
    why: 'Docks need a court to be reached, so a docked wall keeps one whatever you press; drag its pill for a depth of its own.',
    anchor: 'tool-court',
    before: onCopy,
  },
  {
    id: 'zero-own',
    chapter: CHAPTER,
    title: 'This copy’s own',
    body: ['This copy now keeps its own docks, doors, patterns and courts: later edits of its block no longer reach them.'],
    why: 'Back to type, in Properties, makes it its block’s again in every respect (its own edits go).',
    anchor: 'back-to-type',
    before: () => {
      onCopy()
      useUi.getState().setRail('properties')
    },
  },
]
