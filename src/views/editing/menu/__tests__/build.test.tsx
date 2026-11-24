// The one builder of the right-click menu (Phase AS.4, Decision "One menu"): from the `Ref`s picked, the entries in the user's order (the kind's own verbs,
// Copy · Paste · Paste here · Duplicate · Delete, Rename · Select all <kind> · Lock · Hide, Properties alone and last), a separator between the parts and
// none leading, trailing or doubled; a base verb the kind does not take is absent and one that cannot run now is greyed with its reason; a warehouse block adds
// the module's two verbs at the top; *To building ▸* and *Program ▸* are sub-menus with every building and every program; several kinds, nothing picked and a
// locked mass are as *Decided by the plan* says. Demo masses: m1 x 40…200 y 70…150 and m2 x 250…390 y 70…150 (warehouses); m3 x 100…140 y 190…210 (office).
import { act } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Ref } from '../../../../kinds/types.ts'
import { derive } from '../../../../engine/derive.ts'
import { actions } from '../../../../state/actions/index.ts'
import { demoProject } from '../../../../state/demo.ts'
import { emptyHistory } from '../../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../../state/store.ts'
import { newProject } from '../../../../typologies/index.ts'
import { placeCopy } from '../../../../modules/warehouse/views/commands.ts'
import { useClipboard } from '../../../plan/clipboard.ts'
import { useToast } from '../../../layout/toast.ts'
import { menuFor } from '../build.ts'
import { leaf, rowKeyed, rowsIn, shape } from './helpers.ts'

const s = () => useApp.getState()
const masses = (...ids: string[]): Ref[] => ids.map((id) => ({ kind: 'mass', id }))
const start = (project = demoProject()) => {
  useApp.setState({ project, derived: derive(project), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: project.options[0].id })
}

beforeEach(() => {
  localStorage.clear()
  start()
  useClipboard.setState({ masses: [], roads: [] })
  useToast.setState({ toast: null, confirmation: null })
})

describe('a mass’s menu, in the user’s order', () => {
  it('its own verbs, a separator, the clipboard, a separator, Rename · Select all blocks · Lock · Hide, a separator, Properties alone', () => {
    act(() => s().select('m3'))
    // the demo stands on its grid (Decision "Grid always"): bay line K runs through the office
    expect(shape(menuFor(masses('m3'), 'plan', { x: 120, y: 200 }))).toEqual([
      'Group', 'Ungroup', 'Union', '|',
      'Rotate 90°', '|',
      'Split at line K', '|',
      'To building', '|',
      'Program', '|',
      'Copy', 'Paste', 'Paste here', 'Duplicate', 'Delete', '|',
      'Rename', 'Select all blocks', 'Lock', 'Hide', '|',
      'Properties',
    ])
  })

  it('with ground the platform’s two rows stand beside the grid’s split; without it they are not there', () => {
    const p = demoProject()
    start({ ...p, site: { ...p.site, terrain: { contours: [], points: [] } } })
    act(() => s().select('m3'))
    const names = shape(menuFor(masses('m3'), 'plan', null))
    expect(names.slice(names.indexOf('Rotate 90°'), names.indexOf('To building'))).toEqual(['Rotate 90°', '|', 'Own platform', 'Back to the building’s', 'Split at line K', '|'])
  })

  it('says block wherever a block is named: Delete 2 blocks, and no title of the block’s own verbs says mass (Phase D.3, task 1)', () => {
    act(() => s().selectMany(['m1', 'm2']))
    const entries = menuFor(masses('m1', 'm2'), 'plan', { x: 0, y: 0 })
    expect(shape(entries)).toContain('Delete 2 blocks')
    // the block's own verbs and the base's, each row’s label and title
    const own = ['ungroup', 'union', 'delete'].map((k) => leaf(entries, k))
    for (const l of own) expect(`${l.label} ${l.title ?? ''}`, l.key).not.toMatch(/mass(es)?/i)
    act(() => s().select('m1'))
    const one = menuFor(masses('m1'), 'plan', null)
    expect(`${leaf(one, 'select-all').label} ${leaf(one, 'select-all').title ?? ''}`).not.toMatch(/mass(es)?/i)
    // nothing picked: Select all says block too
    expect(leaf(menuFor([], 'plan', null), 'select-all').title).toMatch(/block/i)
  })

  it('has no leading, trailing or doubled separator, whatever is picked', () => {
    const p = demoProject()
    const combos: Ref[][] = [
      [],
      masses('m1'),
      masses('m1', 'm2'),
      [...masses('m1'), { kind: 'street', id: 's1' }],
      [{ kind: 'street', id: 's1' }],
      [{ kind: 'gate', id: 'g1' }],
      [{ kind: 'building', id: 'b1' }],
      [{ kind: 'drawing', id: 'f.dxf', file: 'f.dxf' }],
    ]
    for (const refs of combos) {
      const entries = menuFor(refs, 'plan', null)
      expect(entries[0], JSON.stringify(refs)).not.toBe('separator')
      expect(entries.at(-1), JSON.stringify(refs)).not.toBe('separator')
      entries.forEach((e, i) => expect(e === 'separator' && entries[i - 1] === 'separator', JSON.stringify(refs)).toBe(false))
    }
    expect(p).toBeDefined()
  })

  it('a base verb is the registry’s command: its label, its key and, greyed, its reason', () => {
    act(() => s().select('m1'))
    const entries = menuFor(masses('m1'), 'plan', null)
    expect(leaf(entries, 'copy')).toMatchObject({ label: 'Copy', detail: 'Ctrl+C', disabled: false })
    expect(leaf(entries, 'lock')).toMatchObject({ label: 'Lock', detail: 'Ctrl+Shift+L' })
    expect(leaf(entries, 'hide')).toMatchObject({ label: 'Hide', detail: 'Ctrl+H' })
    expect(leaf(entries, 'rename')).toMatchObject({ label: 'Rename', detail: 'F2', disabled: false })
    expect(leaf(entries, 'properties')).toMatchObject({ label: 'Properties' })
    expect(leaf(entries, 'properties').detail).toBeUndefined()
    // Paste has nothing to paste: greyed, its reason the command’s
    expect(leaf(entries, 'paste')).toMatchObject({ disabled: true, title: 'Copy something first' })
  })

  it('what the selection cannot do is greyed with today’s reasons, word for word', () => {
    act(() => s().select('m1'))
    const one = menuFor(masses('m1'), 'plan', null)
    expect(leaf(one, 'group')).toMatchObject({ disabled: true, title: 'Select two or more masses to group them' })
    expect(leaf(one, 'ungroup')).toMatchObject({ disabled: true, title: 'None of them is in a group' })
    expect(leaf(one, 'union')).toMatchObject({ disabled: true, title: 'Select two or more blocks that touch to merge them' })
    act(() => s().selectMany(['m1', 'm2']))
    expect(leaf(menuFor(masses('m1', 'm2'), 'plan', null), 'group').disabled).toBe(false)
    // several masses: Rename is for one
    expect(leaf(menuFor(masses('m1', 'm2'), 'plan', null), 'rename')).toMatchObject({ disabled: true, title: 'Rename one thing at a time' })
  })

  it('a locked mass picked from a row: Delete and Rename are greyed with the lock’s reason, Lock reads Unlock', () => {
    act(() => s().apply((p) => actions.lockMasses(p, ['m3'], true)))
    act(() => s().selectMany(['m3']))
    const entries = menuFor(masses('m3'), 'layers', null)
    expect(leaf(entries, 'delete')).toMatchObject({ disabled: true, title: 'A locked mass: unlock first' })
    expect(leaf(entries, 'rename')).toMatchObject({ disabled: true, title: 'Locked: unlock it to change it' })
    expect(leaf(entries, 'lock')).toMatchObject({ label: 'Unlock', disabled: false })
    expect(rowKeyed(entries, 'split-at-line')?.disabled ?? true).toBe(true)
  })

  it('the same entries wherever it was asked: the plan, the 3D, Layers', () => {
    act(() => s().select('m1'))
    const plan = shape(menuFor(masses('m1'), 'plan', null))
    expect(shape(menuFor(masses('m1'), '3d', null))).toEqual(plan)
    expect(shape(menuFor(masses('m1'), 'layers', null))).toEqual(plan)
  })
})

describe('the sub-menus', () => {
  it('To building ▸: To a new building, then every other building of the option, with no cap', () => {
    let p = demoProject()
    for (let i = 0; i < 9; i++) {
      const r = actions.addBuilding(p)
      p = actions.addBuildingToOption(r.project, p.options[0].id, r.id)
    }
    start(p)
    act(() => s().select('m3'))
    const sub = rowKeyed(menuFor(masses('m3'), 'plan', null), 'to-building') as { items: { label: string }[] }
    const names = p.options[0].buildingIds.map((id) => p.buildings.find((b) => b.id === id)!.name)
    expect(sub.items[0].label).toBe('To a new building')
    // the mass’s own building is left out when it is the only one of its masses
    expect(sub.items.length - 1).toBeGreaterThan(6)
    expect(sub.items.slice(1).map((i) => i.label.replace(/^To /, ''))).toEqual(names.filter((n) => sub.items.some((i) => i.label === `To ${n}`)))
  })

  it('Program ▸: each program, then No program, the mass’s own ticked', () => {
    act(() => s().select('m1'))
    const sub = rowKeyed(menuFor(masses('m1'), 'plan', null), 'program') as { items: { label: string; checked?: boolean }[] }
    expect(sub.items.map((i) => i.label)).toEqual([...s().project.programs.map((g) => g.name), 'No program'])
    expect(sub.items.filter((i) => i.checked).map((i) => i.label)).toEqual(['Warehouse'])
  })
})

describe('a block, and the module’s two verbs', () => {
  const withBlock = () => {
    start(actions.addWarehouseType(demoProject()).project)
    act(() => placeCopy('wt1', { x: 300, y: 200 }))
    return s().selection.massIds.map((id) => ({ kind: 'mass', id }))
  }

  it('a mass that is a block has Edit in the block editor and Save to the library at the top, a separator under them', () => {
    const refs = withBlock()
    const names = shape(menuFor(refs, 'plan', null))
    expect(names.slice(0, 3)).toEqual(['Edit in the block editor', 'Save to the library', '|'])
    expect(names[3]).toBe('Group')
    expect(leaf(menuFor(refs, 'plan', null), 'edit-block').disabled).toBe(false)
  })

  it('a mass that is no block does not have them; neither does a typology without the module', () => {
    start(actions.addWarehouseType(demoProject()).project)
    expect(rowKeyed(menuFor(masses('m1'), 'plan', null), 'edit-block')).toBeUndefined()
    const refs = withBlock()
    expect(rowKeyed(menuFor(refs, 'plan', null), 'edit-block')).toBeDefined()
    const blank = newProject('blank')
    start(blank)
    expect(rowKeyed(menuFor(refs, 'plan', null), 'edit-block')).toBeUndefined()
  })
})

describe('several kinds, nothing picked, a kind with no runner registered', () => {
  it('nothing picked: Paste · Paste here, then Select all', () => {
    // the plan has a point (where it was clicked): Paste here is there; a menu without one (Layers') has Paste only
    const entries = menuFor([], 'plan', { x: 0, y: 0 })
    expect(shape(entries)).toEqual(['Paste', 'Paste here', '|', 'Select all'])
    expect(shape(menuFor([], 'layers', null))).toEqual(['Paste', '|', 'Select all'])
    expect(leaf(entries, 'paste').disabled).toBe(true)
    expect(leaf(entries, 'select-all').disabled).toBe(false)
  })

  it('several kinds: only the shared own verbs (Group, Ungroup), first; no Rename, Duplicate or Select all; Copy, Paste, Paste here and Delete where every kind takes them; Properties stays', () => {
    const refs: Ref[] = [...masses('m1'), { kind: 'street', id: 's1' }]
    // a mass and a street both take Copy, Delete, a padlock and an eye: the verbs they share (the street’s own Select all is left out with several kinds)
    expect(shape(menuFor(refs, 'plan', { x: 0, y: 0 }))).toEqual(['Group', 'Ungroup', '|', 'Copy', 'Paste', 'Paste here', 'Delete 2 things', '|', 'Lock', 'Hide', '|', 'Properties'])
    // a gate has no Copy: Delete, Lock, Hide and Properties
    expect(shape(menuFor([...masses('m1'), { kind: 'gate', id: 'g1' }], 'plan', null))).toEqual(['Group', 'Ungroup', '|', 'Delete 2 things', '|', 'Lock', 'Hide', '|', 'Properties'])
  })

  it('a street has its own menu now (task 4: views/editing/menu/__tests__/kinds.test.tsx)', () => {
    expect(shape(menuFor([{ kind: 'street', id: 's1' }], 'plan', { x: 0, y: 0 }))).toEqual(['Group', 'Ungroup', '|', 'Equal sides', 'Equal lanes', '|', 'Copy', 'Paste', 'Paste here', 'Delete', '|', 'Select all streets', 'Lock', 'Hide', '|', 'Properties'])
  })

  it('a kind’s own verb with no runner registered is left out (a block’s hole, until the block editor’s menu is built)', () => {
    expect(rowsIn(menuFor([{ kind: 'hole', id: 'h1' }], 'plan', null)).map((r) => r.key)).not.toContain('remove')
  })

  it('a building and a level have their menus now (task 5: views/layers/__tests__/rowMenus.test.tsx)', () => {
    const entries = menuFor([{ kind: 'building', id: 'b1' }], 'layers', null)
    expect(rowsIn(entries).map((r) => r.key)).toEqual(expect.arrayContaining(['assign', 'delete', 'rename', 'lock', 'hide', 'properties']))
  })

  it('a kind the registry does not know gives no menu', () => {
    expect(menuFor([{ kind: 'nope', id: 'x' }], 'plan', null)).toEqual([])
  })
})
