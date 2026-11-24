// The one context menu on screen (Phase AS.4, Decision "One menu"): a right-click in the plan or the 3D picks what is under the pointer and opens the menu of
// what is picked, the same entries in both; with a tool in hand the tool is let go first (as Escape does) and then it picks and opens; Escape closes it and
// the selection stays, the focus goes back where it was; a press outside closes it; the arrows move between its rows; a locked mass opens no menu.
// Demo masses: m1 x 40…200 y 70…150 and m2 x 250…390 y 70…150 (warehouses); m3 x 100…140 y 190…210 (office).
// jsdom has no layout: the plan uses UNMEASURED_SIZE and `at` turns world metres into screen pixels. The 3D's Canvas is a stub (no WebGL here): the menu is
// asked from the scene's own wrapper, with the mass already picked.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Point } from '../../../../model/schema.ts'
import { App } from '../../../../App.tsx'
import { derive } from '../../../../engine/derive.ts'
import { actions } from '../../../../state/actions/index.ts'
import { demoProject } from '../../../../state/demo.ts'
import { emptyHistory } from '../../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../../state/store.ts'
import { useToast } from '../../../layout/toast.ts'
import { useUi } from '../../../layout/ui.ts'
import { fit, UNMEASURED_SIZE } from '../../../plan/camera.ts'
import { letGoAll, pickedRefs } from '../../../plan/mix.ts'
import { contentBounds } from '../../../plan/PlanSvg.tsx'
import { DEFAULT_SNAP } from '../../../plan/snap/kinds.ts'
import { useSnapSettings } from '../../../plan/snap/settings.ts'
import { inHand, letGo, take } from '../../../tools/hand.ts'
import { Scene } from '../../../scene/Scene.tsx'
import { closeMenu, MenuHost, openMenu } from '../open.tsx'
import { menuFor } from '../build.ts'
import { shape } from './helpers.ts'

// a stub Canvas: three.js draws nothing in jsdom, and the scene's wrapper (where the right-click is) is plain DOM
vi.mock('@react-three/fiber', async (orig) => ({ ...(await orig<typeof import('@react-three/fiber')>()), Canvas: () => <div data-testid="canvas" /> }))

const v = fit(contentBounds(derive(demoProject())), UNMEASURED_SIZE)
const at = (q: Point) => ({
  clientX: (q.x - v.cx) * v.scale + UNMEASURED_SIZE.w / 2,
  clientY: UNMEASURED_SIZE.h / 2 - (q.y - v.cy) * v.scale,
  button: 2,
})
const s = () => useApp.getState()
const mass = (id: string) => document.querySelector(`[data-mass="${id}"]`)!
const plan = () => screen.getByRole('img', { name: 'Site plan' })
// the menu is named after what it is of (a mass's name, "2 masses"), the place's name only when nothing is picked
const menu = (name?: string) => (name ? screen.getByRole('menu', { name }) : screen.getByRole('menu'))
const labels = (name?: string) => within(menu(name)).getAllByRole('menuitem').map((b) => b.querySelector('span')!.textContent)
const labelsOf = (entries: ReturnType<typeof menuFor>) => entries.flatMap((e) => (e === 'separator' ? [] : [e.label]))

beforeEach(() => {
  localStorage.clear()
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false })
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null })
  useSnapSettings.setState({ settings: { ...DEFAULT_SNAP, on: false, grid: false } })
  letGo()
  letGoAll()
  useToast.setState({ toast: null, confirmation: null })
  // the menu is app state: one a test left open is not the next test’s
  closeMenu()
})

describe('the plan’s right-click', () => {
  it('picks the mass under the pointer and opens the menu of the kind, as menuFor builds it', () => {
    render(<App />)
    fireEvent.contextMenu(mass('m3'), at({ x: 120, y: 200 }))
    expect(s().selection.massIds).toEqual(['m3'])
    const entries = menuFor(pickedRefs(), 'plan', { x: 120, y: 200 })
    expect(labels()).toEqual(labelsOf(entries))
    expect(shape(entries)).toContain('To building')
  })

  it('on empty ground it opens the menu of nothing picked; the selection it found stays', () => {
    render(<App />)
    fireEvent.contextMenu(plan(), at({ x: 420, y: 20 }))
    expect(labels()).toEqual(['Paste', 'Paste here', 'Select all'])
    fireEvent.keyDown(window, { key: 'Escape' })
    act(() => s().select('m1'))
    fireEvent.contextMenu(plan(), at({ x: 420, y: 20 }))
    expect(s().selection.massIds).toEqual(['m1'])
    expect(labels()).toContain('Rotate 90°')
  })

  it('with a tool in hand it lets the tool go, picks what is under the pointer and opens the menu', () => {
    render(<App />)
    act(() => void take('dimension'))
    expect(inHand('dimension')).toBe(true)
    // the masses let the pointer through to the tool: the right-click lands on the plan, and the mass is found by its place
    fireEvent.contextMenu(plan(), at({ x: 120, y: 200 }))
    expect(inHand('select')).toBe(true)
    expect(s().selection.massIds).toEqual(['m3'])
    expect(labels()).toContain('Properties')
    expect(labels()).toContain('To building')
  })

  it('every tool lets go (Move, Street, Dimension, the ruler, a gate, Draw): no half-drawn shape stays', () => {
    render(<App />)
    for (const tool of ['move', 'street', 'dimension', 'ruler', 'gate', 'draw'] as const) {
      act(() => void take(tool))
      fireEvent.contextMenu(plan(), at({ x: 420, y: 20 }))
      expect(inHand('select'), tool).toBe(true)
      fireEvent.keyDown(window, { key: 'Escape' })
    }
  })

  it('a locked mass opens no menu: the notice says where the lock comes off', () => {
    render(<App />)
    act(() => s().apply((p) => actions.lockMasses(p, ['m3'], true)))
    fireEvent.contextMenu(mass('m3'), at({ x: 120, y: 200 }))
    expect(screen.queryByRole('menu')).toBeNull()
    expect(useToast.getState().toast?.text).toMatch(/locked/i)
  })

  it('Escape closes it and the selection stays; the focus goes back where it was', () => {
    render(<App />)
    const before = document.createElement('button')
    document.body.append(before)
    before.focus()
    fireEvent.contextMenu(mass('m1'), at({ x: 120, y: 110 }))
    expect(menu()).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(s().selection.massIds).toEqual(['m1'])
    expect(before).toHaveFocus()
    before.remove()
  })

  it('a press outside closes it; the arrows move between its rows; a pick closes it and runs', () => {
    render(<App />)
    fireEvent.contextMenu(mass('m1'), at({ x: 120, y: 110 }))
    const first = within(menu()).getAllByRole('menuitem').find((b) => !(b as HTMLButtonElement).disabled)!
    expect(first).toHaveFocus()
    fireEvent.keyDown(first, { key: 'ArrowDown' })
    expect(first).not.toHaveFocus()
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.contextMenu(mass('m1'), at({ x: 120, y: 110 }))
    fireEvent.click(within(menu()).getByRole('menuitem', { name: /^Rotate 90°/ }))
    expect(screen.queryByRole('menu')).toBeNull()
    expect(s().history.past).toHaveLength(1)
  })

  it('is one menu for the app: a second right-click replaces the first', () => {
    render(<App />)
    fireEvent.contextMenu(mass('m1'), at({ x: 120, y: 110 }))
    fireEvent.pointerDown(plan())
    fireEvent.contextMenu(mass('m2'), at({ x: 320, y: 110 }))
    expect(screen.getAllByRole('menu')).toHaveLength(1)
    expect(screen.getByRole('menu', { name: 'Warehouse 2' })).toBeInTheDocument()
    expect(s().selection.massIds).toEqual(['m2'])
  })
})

describe('the 3D’s right-click', () => {
  it('opens the same entries for the same mass, named after it', () => {
    render(
      <>
        <MenuHost />
        <Scene />
      </>,
    )
    act(() => s().select('m1'))
    fireEvent.contextMenu(screen.getByTestId('canvas').parentElement!, { clientX: 200, clientY: 100, button: 2 })
    expect(menu('Warehouse 1')).toBeInTheDocument()
    expect(labels()).toEqual(labelsOf(menuFor(pickedRefs(), '3d', null)))
    expect(labels()).toContain('Select all blocks')
  })

  it('with a tool in hand it lets the tool go first', () => {
    render(
      <>
        <MenuHost />
        <Scene />
      </>,
    )
    act(() => void take('move'))
    fireEvent.contextMenu(screen.getByTestId('canvas').parentElement!, { clientX: 200, clientY: 100, button: 2 })
    expect(inHand('select')).toBe(true)
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })
})

describe('openMenu', () => {
  it('opens nothing when there is nothing to show', () => {
    render(<MenuHost />)
    act(() => openMenu({ clientX: 10, clientY: 10, currentTarget: null }, [{ kind: 'nope', id: 'x' }], 'plan'))
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('asked from the keyboard (no pointer) it opens under the element', () => {
    render(
      <>
        <button data-testid="row">A row</button>
        <MenuHost />
      </>,
    )
    const row = screen.getByTestId('row')
    row.getBoundingClientRect = () => ({ left: 40, bottom: 60, right: 100, top: 40, width: 60, height: 20, x: 40, y: 40, toJSON() {} })
    act(() => openMenu({ clientX: 0, clientY: 0, currentTarget: row }, [], 'layers'))
    expect(menu('Layers')).toBeInTheDocument()
    expect(menu('Layers').style.left).toBe('48px')
  })
})
