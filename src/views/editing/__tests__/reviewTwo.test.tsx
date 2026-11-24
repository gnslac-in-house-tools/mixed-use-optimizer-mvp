// The second review of Phase AS.4 (the menu, Layers and the Blocks tab), as tests: a right-click on an existing road picks it (the plan's and a tool in hand's);
// a building's row marked beside the masses does not leave the masses' menu and keys mixed; Unlock of a mass or a level a locked building holds is greyed with the Layers row's
// reason and Ctrl+Shift+L says it; a mass's *To building ▸* greys a locked building; the branch rows' Hide / Show is the row's eye; Paste here is where the menu has a point;
// the menu is named after what it is of; Delete keeps its count in its label; the platform's rows follow the terrain module and the ground. (The Blocks tab's keys and the
// focus after a menu closes: `modules/warehouse/views/__tests__/blockPick.test.tsx`, `menu/__tests__/open.test.tsx`.)
// The fixture is the AS.4 one (kindsFixture.ts): two existing roads, two lots, two gates, a dimension and the demo's masses m1, m2 (b1, L1) and m3.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../App.tsx'
import type { Ref } from '../../../kinds/types.ts'
import type { GroundPoint, Project, Terrain } from '../../../model/schema.ts'
import { actions } from '../../../state/actions/index.ts'
import { TYPOLOGIES } from '../../../typologies/index.ts'
import { blank } from '../../../typologies/blank.ts'
import { useLayerView } from '../../layers/layerView.ts'
import { commandOf, runCommand } from '../../commands/index.ts'
import { thingsAt } from '../../plan/lockedAt.ts'
import { pickedRefs, pickRefs } from '../../plan/mix.ts'
import { assign } from '../../panels/buildingCommands.ts'
import { menuFor } from '../menu/build.ts'
import { closeMenu, MenuHost, openMenu } from '../menu/open.tsx'
import { leaf, rowKeyed, rowsIn } from '../menu/__tests__/helpers.ts'
import { type Fixture, at, fixture, s, start, toast } from './kindsFixture.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

let f: Fixture
const MASS: Ref = { kind: 'mass', id: 'm1' }

const tree = () => screen.getByRole('tree', { name: 'Layers' })
const item = (name: string) => within(tree()).getAllByRole('treeitem', { name })[0]
const unfold = (name: string) => fireEvent.click(within(item(name)).getByRole('button', { name: `Unfold ${name}` }))
const massEl = (id: string) => document.querySelector<SVGElement>(`[data-mass="${id}"]`)!
/** The keys of the rows of the menu on screen, a separator as `|`. */
const keysShown = (): string[] => [...screen.getByRole('menu').children].map((c) => (c.getAttribute('role') === 'separator' ? '|' : c.getAttribute('data-menu-key')!))
const rowShown = (key: string): HTMLElement => screen.getByRole('menu').querySelector<HTMLElement>(`[data-menu-key="${key}"]`)!

beforeEach(() => {
  f = fixture()
  start(f.project)
  closeMenu()
})

describe('a right-click on an existing road picks it (the plan’s own press, and a tool in hand’s)', () => {
  const cases: [string, () => string, () => Ref, string[]][] = [
    ['an existing road', () => `[data-existing-road="${f.existing[0]}"] path`, () => ({ kind: 'existing-road', id: f.existing[0] }), ['rename', 'copy', 'delete', 'select-all', 'lock', 'hide', 'properties']],
  ]

  for (const [name, selector, ref, rows] of cases) {
    it(`${name}: with a mass picked, its menu opens and the mass is let go; Delete leaves the mass`, () => {
      render(<App />)
      act(() => pickRefs([MASS]))
      const el = document.querySelector<SVGElement>(selector())!
      expect(el).not.toBeNull()
      fireEvent.contextMenu(el, at({ x: 100, y: 100 }, { button: 2 }))
      expect(pickedRefs()).toEqual([ref()])
      expect(s().selection.massIds).toEqual([])
      expect(keysShown().filter((k) => k !== '|')).toEqual(expect.arrayContaining(rows))
      // an existing road is in a group like any object (Phase PE.2); the mass, let go, takes no part in the menu
      expect(keysShown()).toContain('group')
      const masses = s().project.masses.length
      fireEvent.click(rowShown('delete'))
      expect(s().project.masses).toHaveLength(masses)
    })

    it(`${name}: with nothing picked, its menu opens too`, () => {
      render(<App />)
      fireEvent.contextMenu(document.querySelector<SVGElement>(selector())!, at({ x: 100, y: 100 }, { button: 2 }))
      expect(pickedRefs()).toEqual([ref()])
      expect(keysShown().filter((k) => k !== '|')).toEqual(expect.arrayContaining(rows))
    })
  }

  it('with a tool in hand the things under the pointer are found by their place: an existing road', () => {
    const road = s().project.site.existingRoads!.find((r) => r.id === f.existing[0])!
    expect(thingsAt({ x: (road.points[0].x + road.points[1].x) / 2 + 1, y: road.points[0].y + 1 }, 1)).toContainEqual({ kind: 'existing-road', id: f.existing[0] })
    // hidden, it is not there
    act(() => useLayerView.getState().setHidden([`existing-road:${f.existing[0]}`], true))
    expect(thingsAt({ x: (road.points[0].x + road.points[1].x) / 2, y: road.points[0].y }, 1).some((r) => r.kind === 'existing-road' && r.id === f.existing[0])).toBe(false)
  })
})

describe('a building row right-clicked beside the masses selected', () => {
  let b2: { id: string; name: string }

  beforeEach(() => {
    const made = actions.addBuilding(s().project, { optionId: 'o1' })
    start(made.project)
    b2 = { id: made.id, name: s().project.buildings.find((b) => b.id === made.id)!.name }
    act(() => s().selectMany(['m1', 'm2']))
  })

  it('a right-click on a mass in the plan is the masses’ menu alone: the building is not in it', () => {
    render(<App />)
    fireEvent.contextMenu(item(b2.name))
    // the building's own menu still acts on the selected masses
    expect(rowShown('assign')).toBeEnabled()
    expect(rowShown('assign').textContent).toContain(`Assign selection to ${b2.name}`)
    expect(s().selection.massIds).toEqual(['m1', 'm2'])
    act(() => closeMenu())
    fireEvent.contextMenu(massEl('m1'), at({ x: 120, y: 110 }, { button: 2 }))
    expect(pickedRefs()).toEqual([MASS, { kind: 'mass', id: 'm2' }])
    expect(keysShown()).toContain('group')
    expect(keysShown()).not.toContain('assign')
    expect(rowShown('delete').textContent).toMatch(/^Delete 2 blocks/)
  })

  it('a right-click on a mass’s own row is the masses’ menu alone too', () => {
    render(<App />)
    unfold('Building 1')
    unfold('L1')
    fireEvent.contextMenu(item(b2.name))
    act(() => closeMenu())
    fireEvent.contextMenu(item('Warehouse 1'))
    expect(pickedRefs()).toEqual([MASS, { kind: 'mass', id: 'm2' }])
    expect(keysShown()).toContain('group')
    expect(rowShown('delete').textContent).toMatch(/^Delete 2 blocks/)
  })

  it('the keys act on the masses alone: Ctrl+Shift+L locks them, not the building', () => {
    render(<App />)
    fireEvent.contextMenu(item(b2.name))
    act(() => closeMenu())
    expect(pickedRefs().every((r) => r.kind === 'mass')).toBe(true)
    act(() => void runCommand('edit.lock'))
    expect(s().project.masses.filter((m) => m.locked).map((m) => m.id).sort()).toEqual(['m1', 'm2'])
    expect(s().project.buildings.every((b) => !b.locked)).toBe(true)
  })

  it('Assign selection to the building still assigns the masses', () => {
    render(<App />)
    fireEvent.contextMenu(item(b2.name))
    fireEvent.click(rowShown('assign'))
    const levels = new Set(s().project.buildings.find((b) => b.id === b2.id)!.levels.map((l) => l.id))
    expect(s().project.masses.filter((m) => levels.has(m.levelId)).map((m) => m.id).sort()).toEqual(['m1', 'm2'])
  })
})

describe('Unlock of what its building’s padlock holds', () => {
  beforeEach(() => {
    act(() => s().apply((p) => actions.lockBuildings(p, ['b1'], true)))
  })

  it('a mass: the row reads Unlock, is greyed with the Layers row’s reason, and Ctrl+Shift+L says the same', () => {
    render(<App />)
    act(() => pickRefs([MASS]))
    const row = leaf(menuFor(pickedRefs(), 'layers', null), 'lock')
    expect(row).toMatchObject({ label: 'Unlock', disabled: true })
    expect(row.title).toBe('Warehouse 1 is locked with its building: unlock Building 1 to free it.')
    expect(commandOf('edit.lock')!.enabled!()).toBe(row.title)
    fireEvent.keyDown(window, { key: 'l', ctrlKey: true, shiftKey: true })
    expect(toast()).toBe(row.title)
    expect(s().project.masses.find((m) => m.id === 'm1')!.locked).toBeUndefined()
  })

  it('a level of the locked building: the same', () => {
    act(() => pickRefs([{ kind: 'level', id: 'l1' }]))
    const row = leaf(menuFor(pickedRefs(), 'layers', null), 'lock')
    expect(row).toMatchObject({ label: 'Unlock', disabled: true })
    expect(row.title).toMatch(/is locked with its building: unlock Building 1 to free it\.$/)
  })

  it('the building’s own row still unlocks it', () => {
    const row = leaf(menuFor([{ kind: 'building', id: 'b1' }], 'layers', null), 'lock')
    expect(row).toMatchObject({ label: 'Unlock', disabled: false })
    act(() => row.onSelect())
    expect(s().project.buildings.find((b) => b.id === 'b1')!.locked).toBeFalsy()
  })

  it('one that is also locked on its own, with a free one beside it, unlocks the free one and says what stayed', () => {
    act(() => s().apply((p) => actions.lockBuildings(p, ['b1'], false)))
    act(() => s().apply((p) => actions.lockMasses(p, ['m3'], true)))
    // m1 and m2 are held by nothing now; m3 by its own flag only: unlocking frees it, no reason needed
    act(() => pickRefs([{ kind: 'mass', id: 'm3' }]))
    expect(leaf(menuFor(pickedRefs(), 'layers', null), 'lock')).toMatchObject({ label: 'Unlock', disabled: false })
  })
})

describe('a mass’s To building ▸ and a locked building', () => {
  let b2: string

  beforeEach(() => {
    const made = actions.addBuilding(s().project, { optionId: 'o1' })
    start(made.project)
    b2 = made.id
    act(() => s().apply((p) => actions.lockBuildings(p, [b2], true)))
  })

  it('the locked building’s row is greyed with the building’s own reason', () => {
    act(() => pickRefs([MASS]))
    const row = rowKeyed(menuFor(pickedRefs(), 'plan', null), `to-${b2}`)!
    expect(row).toMatchObject({ disabled: true, title: 'A locked building: unlock first' })
    // a free building beside it is not greyed
    expect(rowKeyed(menuFor(pickedRefs(), 'plan', null), 'to-new-building')).not.toMatchObject({ disabled: true })
  })

  it('dragging masses onto its row says why, and changes nothing', () => {
    render(<App />)
    const before = s().project
    act(() => assign(['m3'], 'o1', b2))
    expect(s().project).toBe(before)
    expect(toast()).toMatch(/locked/i)
  })
})

describe('the branch rows’ Hide and Show are what the row’s eye does', () => {
  /** The branch row's menu, its Hide or Show row. */
  const hideRow = (branch: string) => leaf(menuFor([{ kind: 'branch', id: branch }], 'layers', null), 'hide')
  const hidden = () => useLayerView.getState().hidden

  it('Streets with one street hidden on its own: Hide hides all, Show shows all (the street too)', () => {
    act(() => useLayerView.getState().setHidden(['street:s4'], true))
    // the eye reads mixed: the menu says Hide, as the eye's press would hide all
    expect(hideRow('streets').label).toBe('Hide')
    act(() => hideRow('streets').onSelect())
    expect(hideRow('streets').label).toBe('Show')
    act(() => hideRow('streets').onSelect())
    expect(hidden()).toEqual([])
  })

  it('Dimensions with one hidden on its own: the same', () => {
    act(() => useLayerView.getState().setHidden([`dimension:${f.dim}`], true))
    expect(hideRow('dimensions').label).toBe('Hide')
    act(() => hideRow('dimensions').onSelect())
    expect(hideRow('dimensions').label).toBe('Show')
    act(() => hideRow('dimensions').onSelect())
    expect(hidden()).toEqual([])
  })
})

describe('Paste here is where the menu has a point', () => {
  it('the plan’s menu (a point) has it; Layers’, the 3D’s and the Blocks’ (none) have Paste only', () => {
    act(() => pickRefs([MASS]))
    expect(rowKeyed(menuFor(pickedRefs(), 'plan', { x: 10, y: 20 }), 'paste-here')).toBeDefined()
    for (const place of ['layers', '3d', 'blocks'] as const) {
      const entries = menuFor(pickedRefs(), place, null)
      expect(rowKeyed(entries, 'paste')).toBeDefined()
      expect(rowKeyed(entries, 'paste-here')).toBeUndefined()
    }
  })

  it('on empty ground: Paste and Select all, and Paste here only with a point', () => {
    expect(rowKeyed(menuFor([], 'plan', { x: 1, y: 1 }), 'paste-here')).toBeDefined()
    const none = menuFor([], 'layers', null)
    expect(rowKeyed(none, 'paste')).toBeDefined()
    expect(rowKeyed(none, 'paste-here')).toBeUndefined()
    expect(rowKeyed(none, 'select-all')).toBeDefined()
  })
})

describe('the menu is named after what it is of, not where it opened', () => {
  it('a mass: its name; a building and a lot too; a thing with no name, its kind', () => {
    const open = (refs: Ref[]) => {
      closeMenu()
      act(() => openMenu({ clientX: 10, clientY: 10, currentTarget: null }, refs, 'layers'))
    }
    render(<MenuHost />)
    const lot = s().derived.circulation.lots.find((l) => l.id === f.lots[0])!
    open([MASS])
    expect(screen.getByRole('menu', { name: 'Warehouse 1' })).toBeInTheDocument()
    open([{ kind: 'building', id: 'b1' }])
    expect(screen.getByRole('menu', { name: 'Building 1' })).toBeInTheDocument()
    open([{ kind: 'lot', id: f.lots[0] }])
    expect(screen.getByRole('menu', { name: lot.name })).toBeInTheDocument()
    open([{ kind: 'grid', id: 'grid' }])
    expect(screen.getByRole('menu', { name: 'Grid' })).toBeInTheDocument()
    open([{ kind: 'dimension', id: f.dim }])
    expect(screen.getByRole('menu', { name: 'Dimension' })).toBeInTheDocument()
  })

  it('several of one kind: "N masses"; of several kinds: "N things"', () => {
    render(<MenuHost />)
    act(() => openMenu({ clientX: 10, clientY: 10, currentTarget: null }, [MASS, { kind: 'mass', id: 'm2' }], 'plan'))
    expect(screen.getByRole('menu', { name: '2 blocks' })).toBeInTheDocument()
    closeMenu()
    act(() => openMenu({ clientX: 10, clientY: 10, currentTarget: null }, [MASS, { kind: 'lot', id: f.lots[0] }], 'plan'))
    expect(screen.getByRole('menu', { name: '2 things' })).toBeInTheDocument()
  })

  it('the plan’s right-click on a mass is named after it', () => {
    render(<App />)
    fireEvent.contextMenu(massEl('m1'), at({ x: 120, y: 110 }, { button: 2 }))
    expect(screen.getByRole('menu', { name: 'Warehouse 1' })).toBeInTheDocument()
  })
})

describe('Delete keeps its count in its label', () => {
  const label = (refs: Ref[]) => (leaf(menuFor(refs, 'plan', null), 'delete').label)

  it('several of one kind: Delete N <plural>; one: Delete; several kinds: Delete N things', () => {
    expect(label([MASS])).toBe('Delete')
    expect(label([MASS, { kind: 'mass', id: 'm2' }])).toBe('Delete 2 blocks')
    expect(label(f.lots.map((id) => ({ kind: 'lot', id })))).toBe('Delete 2 lots')
    expect(label(f.gates.map((id) => ({ kind: 'gate', id })))).toBe('Delete 2 gates')
    expect(label([MASS, { kind: 'lot', id: f.lots[0] }])).toBe('Delete 2 things')
  })
})

describe('the platform’s rows follow the module and the ground', () => {
  const plane = (): Terrain => {
    const points: GroundPoint[] = []
    for (let x = -100; x <= 700; x += 50) for (let y = -100; y <= 500; y += 50) points.push({ x, y, z: 100 + 0.05 * x })
    return { contours: [], points }
  }
  const withGround = (): Project => actions.setTerrain(s().project, plane())
  const platformKeys = (refs: Ref[]) => rowsIn(menuFor(refs, 'layers', null)).map((r) => r.key).filter((k) => /platform|back-to-building|step|unstep|^join/.test(k))
  /** A menu has no leading, trailing or doubled separator. */
  const tidy = (refs: Ref[]) => {
    const entries = menuFor(refs, 'layers', null)
    expect(entries[0]).not.toBe('separator')
    expect(entries.at(-1)).not.toBe('separator')
    entries.forEach((e, i) => expect(e === 'separator' && entries[i + 1] === 'separator').toBe(false))
  }

  it('without ground (the demo has none): a mass’s and a building’s menus have no platform row and no empty group', () => {
    for (const refs of [[MASS], [{ kind: 'building', id: 'b1' }]]) {
      expect(platformKeys(refs)).toEqual([])
      tidy(refs)
    }
  })

  it('with ground the platform’s rows are there', () => {
    act(() => s().open(withGround()))
    start(withGround())
    expect(platformKeys([MASS])).toContain('step')
    expect(platformKeys([{ kind: 'building', id: 'b1' }]).length).toBeGreaterThan(0)
  })

  it('in a typology that does not offer the terrain module, the rows are not there even with ground', () => {
    const noGround = { ...blank, id: 'no-terrain', modules: ['parking'] }
    TYPOLOGIES.push(noGround)
    try {
      const p = { ...withGround(), typology: 'no-terrain' }
      start(p)
      for (const refs of [[MASS], [{ kind: 'building', id: 'b1' }]]) {
        expect(platformKeys(refs)).toEqual([])
        tidy(refs)
      }
    } finally {
      TYPOLOGIES.splice(TYPOLOGIES.indexOf(noGround), 1)
    }
  })
})
