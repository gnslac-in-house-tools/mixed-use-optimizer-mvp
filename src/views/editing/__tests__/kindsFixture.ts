// What the tests of the other kinds' menu, padlock and eye share (Phase AS.4 task 4): the demo with an object of each kind and a sibling of each,
// every id known, and the plan's pointer arithmetic (jsdom has no layout: the plan uses UNMEASURED_SIZE and `at` turns world metres into screen pixels).
//   streets      an L-bend run n1 → n2 → n3 → n4 (segments s1, s2, s3: the street `street:s1`) and a second one, s4 (`street:s4`, n5 → n6, along y = 240), apart; away from the buildings
//   gates        the demo's gate and a second one (`gates`)
//   existing     two existing roads, beside the demo's south street (`south`, an existing road since Phase PE.2)       lots   two free lots (`lots`)       dimension   one on level l1 (`dim`)
import { fireEvent, screen } from '@testing-library/react'
import type { Id, Point, Project } from '../../../model/schema.ts'
import { addLot } from '../../../modules/parking/actions.ts'
import { derive } from '../../../engine/derive.ts'
import { actions } from '../../../state/actions/index.ts'
import { demoProject } from '../../../state/demo.ts'
import { emptyHistory } from '../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../state/store.ts'
import { useLots } from '../../../modules/parking/views/lotState.ts'
import { useLayerView } from '../../layers/layerView.ts'
import { useLayerPick } from '../../layers/layerPick.ts'
import { useToast } from '../../layout/toast.ts'
import { useUi } from '../../layout/ui.ts'
import { useAccess } from '../../plan/access/accessState.ts'
import { useAnnotations } from '../../plan/annotations/annotationState.ts'
import { fit, UNMEASURED_SIZE } from '../../plan/camera.ts'
import { useRoads } from '../../plan/circulation/roadState.ts'
import { letGoAll } from '../../plan/mix.ts'
import { useDrawingPick } from '../../plan/site/drawingPick.ts'
import { useDimensions } from '../../plan/tools/toolState.ts'
import { letGo } from '../../tools/hand.ts'
import { closeMenu } from '../menu/open.tsx'

export const s = () => useApp.getState()
export const plan = () => screen.getByRole('img', { name: 'Site plan' })
export const toast = () => useToast.getState().toast?.text

const v = fit({ minX: 0, minY: -15, maxX: 440, maxY: 280 }, UNMEASURED_SIZE)
export const at = (q: Point, extra: object = {}) => ({
  clientX: (q.x - v.cx) * v.scale + UNMEASURED_SIZE.w / 2,
  clientY: UNMEASURED_SIZE.h / 2 - (q.y - v.cy) * v.scale,
  button: 0,
  pointerId: 1,
  ...extra,
})
export const WHOLE = { a: { x: -50, y: -50 }, b: { x: 500, y: 350 } }

/** A click: a press and its release on the same element. */
export function press(el: Element, q: Point, extra: object = {}): void {
  fireEvent.pointerDown(el, at(q, extra))
  fireEvent.pointerUp(el, at(q, extra))
}

export interface Fixture {
  project: Project
  gates: Id[]
  existing: Id[]
  /** The demo's own south street, an existing road too: it keeps the plan framed 15 m below the site. */
  south: Id
  lots: Id[]
  dim: Id
}

/** The L-bend street's nodes and segments, and a second street's, apart (n5 → n6). */
const NODES = [
  { id: 'n1', x: 40, y: 235 },
  { id: 'n2', x: 80, y: 235 },
  { id: 'n3', x: 120, y: 235 },
  { id: 'n4', x: 120, y: 260 },
  { id: 'n5', x: 160, y: 240 },
  { id: 'n6', x: 240, y: 240 },
]
const SEGMENTS = [
  { id: 's1', a: 'n1', b: 'n2', type: 'trucks', left: 4, right: 4 },
  { id: 's2', a: 'n2', b: 'n3', type: 'trucks', left: 4, right: 4 },
  { id: 's3', a: 'n3', b: 'n4', type: 'trucks', left: 4, right: 4 },
  { id: 's4', a: 'n5', b: 'n6', type: 'trucks', left: 4, right: 4 },
]

export function fixture(): Fixture {
  const d = demoProject({ streets: false })
  let p: Project = { ...d, options: [{ ...d.options[0], streets: { nodes: NODES, segments: SEGMENTS } }, ...d.options.slice(1)] }
  p = actions.addGate(p, 'o1', 0.1).project
  const e1 = actions.addExistingRoad(p, [{ x: -60, y: 310 }, { x: 500, y: 310 }], 12)!
  const e2 = actions.addExistingRoad(e1.project, [{ x: -60, y: 340 }, { x: 500, y: 340 }], 12)!
  const l1 = addLot(e2.project, 'o1', { rect: { center: { x: 380, y: 230 }, width: 50, depth: 24, rotation: 0 } })!
  const l2 = addLot(l1.project, 'o1', { rect: { center: { x: 300, y: 205 }, width: 50, depth: 24, rotation: 0 } })!
  const dim = actions.addDimension(l2.project, { x: 60, y: 60 }, { x: 100, y: 60 }, 8, 'l1')!
  p = dim.project
  const c = derive(p, 'o1').circulation
  return { project: p, gates: c.gates.map((g) => g.id), existing: [e1.id, e2.id], south: d.site.existingRoads![0].id, lots: [l1.id, l2.id], dim: dim.id }
}

/** Opens the fixture (or a project made of it) as the app's, with nothing picked, hidden or locked but what the project says. */
export function start(p: Project = fixture().project): void {
  localStorage.clear()
  useApp.setState({ project: p, derived: derive(p, 'o1'), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null, help: false })
  useLayerView.setState({ hidden: [], onTop: [], folded: [] })
  letGo()
  letGoAll()
  useRoads.setState({ picked: null, also: [], node: null })
  useLots.setState({ picked: null, also: [] })
  useAccess.setState({ picked: null, alsoGates: [], tool: null })
  useDimensions.setState({ selected: null, also: [] })
  useAnnotations.setState({ lines: [], notes: [] })
  useDrawingPick.setState({ picked: [] })
  useLayerPick.setState({ keys: [] })
  useToast.setState({ toast: null, confirmation: null })
  closeMenu()
}

/** The derived street that runs along this segment. */
export const roadOf = (seg: Id) => s().derived.circulation.roads.find((r) => r.kind === 'street' && r.segments?.includes(seg))!

/** Locks (or frees) the objects through the verbs, as the menu does. */
export const lockStreets = (ids: Id[], on = true) => s().apply((p) => actions.lockStreets(p, ids, on, 'o1'))
export const lockLots = (ids: Id[], on = true) => s().apply((p) => actions.lockLots(p, ids, on))
export const lockGates = (ids: Id[], on = true) => s().apply((p) => actions.lockGates(p, ids, on))
