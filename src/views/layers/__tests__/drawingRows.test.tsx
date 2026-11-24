// The drawings of the site in the Layers tree (Phase AS.3, task 6): what the Site tab's Drawing layers section did (Phases DL.2,
// DM.4 and DM.5, Decisions "Drawing layers", "Drawings move", "Drawing pick") is the Drawings row of Site now: a file, its layers
// with their colour, eye and padlock, its Parcels with their area; a file with parcels alone has a group of its own and a loose
// parcel stays in a Parcels group of its own; Separate / Join layers and Remove are the file's menu and its Properties; the names pick
// what Move and Rotate carry (the file whole while joined; its layers and Parcels once separated). Hidden is the viewer's, kept per
// project, no undo step; a padlock and Separate are the project's, one undo step each. The colours are AutoCAD's.
// Not carried over, on purpose: a hidden or locked layer's name said "Hidden: show it to pick it" and picked nothing — a row of
// Layers picks a locked or hidden one too (Decision "The padlock is CAD's", tests in layersTab.test.tsx), and the section's folds are
// the tree's.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../App.tsx'
import { derive } from '../../../engine/derive.ts'
import type { Contour } from '../../../model/schema.ts'
import { demoProject } from '../../../state/demo.ts'
import { emptyHistory } from '../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../state/store.ts'
import { useUi } from '../../layout/ui.ts'
import { useDrawingPick } from '../../plan/site/drawingPick.ts'
import { aciColor } from '../../plan/site/aci.ts'
import { letGo } from '../../tools/hand.ts'
import { drawingLayer, parcel } from '../keys.ts'
import { LAYERS_KEY, useLayerView } from '../layerView.ts'
import { useLayerPick } from '../layerPick.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const sq = (x: number, s: number): Contour => ({ vertices: [{ x, y: 0, r: 0 }, { x: x + s, y: 0, r: 0 }, { x: x + s, y: s, r: 0 }, { x, y: s, r: 0 }] })
const line = { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }

const s = () => useApp.getState()
const site = () => s().project.site
/** What the layer store kept for the open project, in this browser. */
const kept = () => (JSON.parse(localStorage.getItem(LAYERS_KEY)!) as Record<string, { hidden: string[] }>)[s().project.id].hidden

const tree = () => screen.getByRole('tree', { name: 'Layers' })
const items = (name: string) => within(tree()).queryAllByRole('treeitem', { name })
const item = (name: string, nth = 0): HTMLElement => {
  const all = items(name)
  if (!all[nth]) throw new Error(`No row "${name}" (rows: ${within(tree()).queryAllByRole('treeitem').map((r) => r.getAttribute('aria-label')).join(', ')})`)
  return all[nth]
}
const unfold = (name: string, nth = 0) => fireEvent.click(within(item(name, nth)).getByRole('button', { name: `Unfold ${name}` }))
const nameOf = (name: string, nth = 0) => item(name, nth).querySelector<HTMLElement>('[data-row-pick]')!
const click = (name: string, extra: object = {}, nth = 0) => fireEvent.click(nameOf(name, nth), extra)
const eye = (name: string, nth = 0) => within(item(name, nth)).getByRole('button', { name: `Show ${name}` })
const padlock = (name: string, nth = 0) => within(item(name, nth)).getByRole('button', { name: `Lock ${name}` })
const menuOf = (name: string, nth = 0) => {
  fireEvent.contextMenu(item(name, nth))
  return screen.getByRole('menu')
}

function start(drawings: ReturnType<typeof demoProject>['site']['drawings'], parcels: ReturnType<typeof demoProject>['site']['parcels']) {
  const d = demoProject()
  const p = { ...d, site: { ...d.site, drawings, parcels } }
  useApp.setState({ project: p, derived: derive(p, 'o1'), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
}

/** a.dxf: a WALLS layer and a locked TREES one, its parcel P1; b.dxf brought a parcel alone; one parcel has no file. */
const threeFiles = () =>
  start(
    [{ file: 'a.dxf', layers: [{ name: 'WALLS', color: 1, lines: [line] }, { name: 'TREES', locked: true, lines: [line] }] }],
    [
      { name: 'P1', contour: sq(0, 20), file: 'a.dxf' },
      { name: 'P2', contour: sq(30, 10), file: 'b.dxf' },
      { name: 'LOOSE 1', contour: sq(60, 10) },
    ],
  )

/** The tree with Site, Drawings and the files open. */
function openAll() {
  render(<App />)
  unfold('Site')
  unfold('Drawings')
  for (const f of ['a.dxf', 'b.dxf']) if (items(f).length) unfold(f)
}

beforeEach(() => {
  localStorage.clear()
  useUi.setState({ view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null, help: false, dialog: null })
  useLayerView.setState({ hidden: [], onTop: [], folded: [] })
  useLayerPick.setState({ keys: [] })
  useDrawingPick.setState({ picked: [] })
  letGo()
  threeFiles()
})

describe('a group per file', () => {
  it('each layer with its colour and its eye; the parcels with their area; a file with parcels alone has a group of its own, a loose parcel stays in Parcels', () => {
    openAll()
    expect(item('a.dxf')).toBeInTheDocument()
    expect(item('WALLS').querySelector('[data-row-pick] span[aria-hidden]')).toHaveStyle({ background: aciColor(1) })
    expect(within(item('WALLS')).getByRole('button', { name: 'Show WALLS' })).toBeInTheDocument()
    // a.dxf: its layers and its Parcels (P1); b.dxf: its Parcels alone (P2); the loose parcel in a Parcels group with no file
    expect(items('Parcels')).toHaveLength(3)
    unfold('Parcels', 0)
    unfold('Parcels', 1)
    unfold('Parcels', 2)
    expect(item('P1')).toHaveTextContent('400 m²')
    expect(item('P2')).toHaveTextContent('100 m²')
    expect(item('LOOSE 1')).toBeInTheDocument()
    // the loose group has no padlock (no file, no lock of its own: Decision "Padlocks stand where a lock exists")
    expect(within(item('Parcels', 2)).queryByRole('button', { name: /^Lock / })).toBeNull()
    expect(within(item('Parcels', 0)).getByRole('button', { name: 'Lock Parcels' })).toBeInTheDocument()
    // a file with parcels alone is a file of the tree: its menu can remove it
    expect(item('b.dxf')).toBeInTheDocument()
    fireEvent.click(within(menuOf('b.dxf')).getByRole('menuitem', { name: 'Remove' }))
    expect(site().parcels!.map((x) => x.name)).toEqual(['P1', 'LOOSE 1'])
  })

  it('nothing on a site with no boundary: there is nothing to add drawings to', () => {
    const p = demoProject()
    const bare = { ...p, site: { ...p.site, boundary: null, drawings: undefined, parcels: undefined } }
    useApp.setState({ project: bare, derived: derive(bare, 'o1') })
    render(<App />)
    expect(items('Drawings')).toHaveLength(0)
  })

  it('a file removed takes its layers and its parcels, one undo step', () => {
    openAll()
    const steps = s().history.past.length
    fireEvent.click(within(menuOf('a.dxf')).getByRole('menuitem', { name: 'Remove' }))
    expect(site().drawings ?? []).toEqual([])
    expect(site().parcels!.map((x) => x.name)).toEqual(['P2', 'LOOSE 1'])
    expect(s().history.past).toHaveLength(steps + 1)
    act(() => s().undo())
    expect(site().drawings!.map((d) => d.file)).toEqual(['a.dxf'])
    expect(site().parcels!.map((x) => x.name)).toEqual(['P1', 'P2', 'LOOSE 1'])
  })

  it('a file with no layers and no parcels has no eye, so it is never shown hidden', () => {
    start([{ file: 'empty.dxf', layers: [] }], undefined)
    render(<App />)
    unfold('Site')
    unfold('Drawings')
    expect(item('empty.dxf')).toBeInTheDocument()
    expect(within(item('empty.dxf')).queryByRole('button', { name: /^(Show|Hide) empty\.dxf$/ })).toBeNull()
  })
})

describe('eyes', () => {
  it('a layer’s eye and a file’s hide what the viewer chooses: kept per project in this browser, no undo step, and the plan no longer draws it', () => {
    openAll()
    const steps = s().history.past.length
    fireEvent.click(eye('WALLS'))
    expect(kept()).toEqual([drawingLayer('a.dxf', 'WALLS')])
    expect(s().history.past).toHaveLength(steps)
    fireEvent.click(eye('a.dxf'))
    expect(kept()).toContain(drawingLayer('a.dxf', 'TREES'))
    fireEvent.click(eye('a.dxf'))
    expect(kept()).toEqual([])
  })

  it('a file’s Parcels group has one eye for all its parcels: P1’s own key', () => {
    openAll()
    fireEvent.click(within(item('Parcels', 0)).getByRole('button', { name: 'Show Parcels' }))
    expect(kept()).toEqual([parcel('P1', 'a.dxf')])
  })

  it('two files with a parcel of the same name: an eye hides its own alone, a file’s eye only its own parcels', () => {
    start(undefined, [{ name: 'P1', contour: sq(0, 20), file: 'a.dxf' }, { name: 'P1', contour: sq(30, 10), file: 'b.dxf' }])
    const { container } = render(<App />)
    unfold('Site')
    unfold('Drawings')
    unfold('a.dxf')
    unfold('b.dxf')
    unfold('Parcels', 0)
    unfold('Parcels', 1)
    const drawn = () => container.querySelectorAll('[data-parcel="P1"]').length
    expect(drawn()).toBe(2)
    const shown = (nth: number) => eye('P1', nth).getAttribute('aria-pressed')
    fireEvent.click(eye('P1', 0))
    expect(drawn()).toBe(1)
    expect([shown(0), shown(1)]).toEqual(['false', 'true'])
    fireEvent.click(eye('P1', 0))
    expect(drawn()).toBe(2)
    fireEvent.click(eye('b.dxf'))
    expect(drawn()).toBe(1)
    expect([shown(0), shown(1)]).toEqual(['true', 'false'])
  })
})

describe('padlocks, separate and join', () => {
  it('each layer has a padlock pressed when locked; a click is one undo step', () => {
    openAll()
    expect(padlock('WALLS')).toHaveAttribute('aria-pressed', 'false')
    expect(padlock('TREES')).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(padlock('WALLS'))
    expect(site().drawings![0].layers[0].locked).toBe(true)
    fireEvent.click(padlock('TREES'))
    expect(site().drawings![0].layers[1].locked).toBeUndefined()
    act(() => s().undo())
    expect(site().drawings![0].layers[1].locked).toBe(true)
    act(() => s().undo())
    expect(site().drawings![0].layers[0].locked).toBeUndefined()
  })

  it('a file’s Parcels start locked, with one padlock for all; unlocking them is one undo step', () => {
    openAll()
    expect(within(item('Parcels', 0)).getByRole('button', { name: 'Lock Parcels' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(within(item('Parcels', 0)).getByRole('button', { name: 'Lock Parcels' }))
    expect(site().parcels!.filter((x) => x.file === 'a.dxf').every((x) => x.unlocked)).toBe(true)
    expect(site().parcels!.find((x) => x.file === 'b.dxf')!.unlocked).toBeUndefined()
    act(() => s().undo())
    expect(site().parcels!.find((x) => x.file === 'a.dxf')!.unlocked).toBeUndefined()
  })

  it('Separate layers splits the drawing (one undo step) and becomes Join layers', () => {
    openAll()
    expect(within(menuOf('a.dxf')).queryByRole('menuitem', { name: 'Join layers' })).toBeNull()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Separate layers' }))
    expect(site().drawings![0].split).toBe(true)
    fireEvent.click(within(menuOf('a.dxf')).getByRole('menuitem', { name: 'Join layers' }))
    expect(site().drawings![0].split).toBeUndefined()
    act(() => s().undo())
    expect(site().drawings![0].split).toBe(true)
  })
})

describe('what a name picks (Decision "Drawing pick")', () => {
  it('a click on the file’s name picks the whole drawing and marks it; a layer’s name does not pick the drawing before it is separated', () => {
    openAll()
    expect(item('a.dxf')).toHaveAttribute('aria-selected', 'false')
    click('a.dxf')
    expect(useDrawingPick.getState().picked).toEqual([{ file: 'a.dxf' }])
    expect(item('a.dxf')).toHaveAttribute('aria-selected', 'true')
    // a layer of a joined file is a row of Layers: it does not pick a part of the drawing
    click('WALLS')
    expect(useDrawingPick.getState().picked).toEqual([])
    expect(item('WALLS')).toHaveAttribute('aria-selected', 'true')
  })

  it('separated, a layer’s name picks that layer, Shift or Ctrl adds one more, the Parcels row picks the parcels; a locked one is picked from its row too', () => {
    openAll()
    fireEvent.click(within(menuOf('a.dxf')).getByRole('menuitem', { name: 'Separate layers' }))
    click('WALLS')
    expect(useDrawingPick.getState().picked).toEqual([{ file: 'a.dxf', layer: 'WALLS' }])
    expect(item('WALLS')).toHaveAttribute('aria-selected', 'true')
    click('Parcels', { ctrlKey: true }, 0)
    expect(useDrawingPick.getState().picked).toEqual([{ file: 'a.dxf', layer: 'WALLS' }, { file: 'a.dxf', parcels: true }])
    // TREES is locked: the row picks it (the padlock is CAD's: the plan does not), and it still does not move
    click('TREES', { shiftKey: true })
    expect(useDrawingPick.getState().picked.map((x) => x.layer ?? 'parcels')).toContain('TREES')
    // a plain click picks it alone
    click('Parcels', {}, 0)
    expect(useDrawingPick.getState().picked).toEqual([{ file: 'a.dxf', parcels: true }])
  })

  it('Ctrl+click on a part already picked takes it out', () => {
    openAll()
    fireEvent.click(within(menuOf('a.dxf')).getByRole('menuitem', { name: 'Separate layers' }))
    click('WALLS')
    click('TREES', { ctrlKey: true })
    expect(useDrawingPick.getState().picked).toHaveLength(2)
    click('TREES', { ctrlKey: true })
    expect(useDrawingPick.getState().picked).toEqual([{ file: 'a.dxf', layer: 'WALLS' }])
  })

  it('separating or joining a file lets go of its picked parts, not another file’s', () => {
    openAll()
    click('a.dxf')
    act(() => useDrawingPick.getState().toggle({ file: 'b.dxf' }))
    fireEvent.click(within(menuOf('a.dxf')).getByRole('menuitem', { name: 'Separate layers' }))
    expect(useDrawingPick.getState().picked).toEqual([{ file: 'b.dxf' }])
    click('WALLS')
    expect(useDrawingPick.getState().picked).toEqual([{ file: 'a.dxf', layer: 'WALLS' }])
    fireEvent.click(within(menuOf('a.dxf')).getByRole('menuitem', { name: 'Join layers' }))
    expect(useDrawingPick.getState().picked).toEqual([])
  })
})
