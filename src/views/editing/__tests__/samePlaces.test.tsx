// The same menu in the plan, the 3D and Layers (Phase AS.4 task 7, Review Focus 2): a mass, a lot and a building right-clicked give, place by place, the same rows in the
// same order: the same keys, labels, keys' details, greyed rows and their reasons, separators in the same places. What the three really are:
//   plan    the right-click of the plan's own wrapper (`PlanSvg`), on empty ground with the thing already picked (a thing's own place is found by its drawing, which jsdom has not)
//   3D      the right-click of the scene's wrapper (`Scene`), the same way (its Canvas is a stub: three.js draws nothing here)
//   Layers  the right-click of the thing's own row, which picks it first
// The differences that are meant: what the plan's click point says. The mass's *Split at line …* names the grid line nearest the click, so in the plan it follows the pointer; the
// 3D and Layers have no point on the plan and take the mass's middle: the plan is asked at the mass's middle here, so the three say the same line (the line that follows the pointer is
// tested in `plan/grid/__tests__/onGrid.test.tsx`). And *Paste here*: it pastes where the menu was opened, so only a menu with a point (the plan's) has it; the 3D's and Layers' have
// *Paste* (the same two rows beside the *Split at line* one, a meant difference between the places, tested in each of the three below). The menu's name is the thing's, the same in each place.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../App.tsx'
import { actions } from '../../../state/actions/index.ts'
import { placeCopy } from '../../../modules/warehouse/views/commands.ts'
import type { Point } from '../../../model/schema.ts'
import type { Ref } from '../../../kinds/types.ts'
import { useLayerView } from '../../layers/layerView.ts'
import { Scene } from '../../scene/Scene.tsx'
import { pickedRefs, pickRefs } from '../../plan/mix.ts'
import { closeMenu, MenuHost } from '../menu/open.tsx'
import { type Fixture, at, fixture, plan, s, start } from './kindsFixture.ts'

// a stub Canvas: three.js draws nothing in jsdom, and the scene's wrapper (where the right-click is) is plain DOM
vi.mock('@react-three/fiber', async (orig) => ({ ...(await orig<typeof import('@react-three/fiber')>()), Canvas: () => <div data-testid="canvas" /> }))

let f: Fixture

/** Where the plan's click is for the mass: its middle, which is where the 3D and Layers (no pointer on the plan) put the grid's Split row. */
const MIDDLE_OF_M1: Point = { x: 120, y: 110 }

const tree = () => screen.getByRole('tree', { name: 'Layers' })
const item = (name: string) => within(tree()).getAllByRole('treeitem', { name })[0]
const unfold = (name: string) => fireEvent.click(within(item(name)).getByRole('button', { name: `Unfold ${name}` }))

/** The menu on screen, row by row: a separator as `|`, a row as its key, its text, whether it is greyed and its title. `name`: what it is of. */
function shown(name: string): string[] {
  const menu = screen.getByRole('menu', { name })
  return [...menu.children].map((c) =>
    c.getAttribute('role') === 'separator' ? '|' : `${c.getAttribute('data-menu-key')} · ${c.textContent} · ${(c as HTMLButtonElement).disabled ? 'greyed' : 'on'} · ${c.getAttribute('title') ?? ''}`,
  )
}

/** The rows of the other places have no Paste here (they have no point): the plan's without it, to be compared with theirs. */
const withoutPasteHere = (rows: string[]): string[] => rows.filter((r) => !r.startsWith('paste-here '))

const inPlan = (where: Point, name: string): string[] => {
  render(<App />)
  fireEvent.contextMenu(plan(), at(where, { button: 2 }))
  return shown(name)
}
const inScene = (name: string): string[] => {
  render(
    <>
      <MenuHost />
      <Scene />
    </>,
  )
  fireEvent.contextMenu(screen.getByTestId('canvas').parentElement!, { clientX: 200, clientY: 100, button: 2 })
  return shown(name)
}
/** Layers: the row is right-clicked; it picks what it stands for first, so what is picked is the same thing. */
const inLayers = (row: string, open: string[], name: string): string[] => {
  render(<App />)
  for (const name of open) unfold(name)
  fireEvent.contextMenu(item(row))
  return shown(name)
}

beforeEach(() => {
  f = fixture()
  start(f.project)
  useLayerView.setState({ hidden: [], onTop: [], folded: [] })
  closeMenu()
})

/** One thing picked, right-clicked in each place; every place gives the same rows. */
function sameInThreePlaces(ref: Ref, row: string, open: string[], where: Point = { x: 420, y: 20 }, copied = false, check?: (rows: string[]) => void) {
  // the menu is named after the thing: the row's name in Layers, the same in the plan and the 3D
  const picked = () => {
    pickRefs([ref])
    expect(pickedRefs()).toEqual([ref])
  }
  picked()
  const inThePlan = inPlan(where, row)
  cleanup()
  closeMenu()
  picked()
  const inThe3d = inScene(row)
  cleanup()
  closeMenu()
  start(f.project)
  const inTheLayers = inLayers(row, open, row)
  expect(pickedRefs(), 'the row picked what it stands for').toEqual([ref])
  expect(inThePlan.length, 'a menu with rows').toBeGreaterThan(5)
  // Paste here is the plan's: it pastes where the menu was opened, and only a menu with a point has it (of a kind that is copied: the mass)
  expect(inThePlan.some((r) => r.startsWith('paste-here '))).toBe(copied)
  expect(inThePlan.some((r) => r.startsWith('paste '))).toBe(copied)
  expect(inThe3d.some((r) => r.startsWith('paste-here '))).toBe(false)
  expect(inTheLayers.some((r) => r.startsWith('paste-here '))).toBe(false)
  expect(inThe3d).toEqual(withoutPasteHere(inThePlan))
  expect(inTheLayers).toEqual(withoutPasteHere(inThePlan))
  check?.(inThe3d)
}

describe('the same rows in the plan, the 3D and Layers', () => {
  it('a mass', () => {
    sameInThreePlaces({ kind: 'mass', id: 'm1' }, 'Warehouse 1', ['Building 1', 'L1'], MIDDLE_OF_M1, true)
  })

  it('a lot', () => {
    const lot = f.lots[0]
    sameInThreePlaces({ kind: 'lot', id: lot }, s().derived.circulation.lots.find((l) => l.id === lot)!.name, ['Parking', 'Lots'])
  })

  // a copy of a warehouse type: its two own verbs (Edit in the block editor, Save to the library) stand at the top in each place, the 3D too
  it('a block’s copy', () => {
    f.project = actions.addWarehouseType(f.project).project
    start(f.project)
    placeCopy('wt1', { x: 300, y: 200 })
    const refs: Ref[] = s().selection.massIds.map((id) => ({ kind: 'mass', id }))
    expect(refs).toHaveLength(1)
    f.project = s().project
    const row = s().project.masses.find((m) => m.id === refs[0].id)!.name
    sameInThreePlaces(refs[0], row, ['Warehouse A 1', 'L1'], { x: 300, y: 200 }, true, (rows) => expect(rows.slice(0, 3).map((r) => r.split(' · ')[0])).toEqual(['edit-block', 'save-block', '|']))
  })

  it('a building', () => {
    sameInThreePlaces({ kind: 'building', id: 'b1' }, 'Building 1', [])
  })
})
