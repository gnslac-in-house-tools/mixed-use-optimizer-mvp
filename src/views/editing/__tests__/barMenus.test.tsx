// The bars' right-click menus on the app's one menu (Phase AS.4 task 7, Decision "One menu"): the Tools strip's and a docked bar's short lists keep their rows
// (stripDocks.test.tsx and workspace.test.tsx pin them) and are passed to the opener (`openEntries`), so they are the same menu as the plan's: one menu on screen at a
// time (a second right-click replaces the first, whichever place it is in), it opens at the pointer, ↑ ↓ wrap, Escape closes it and the focus goes back where it was,
// a press outside closes it. The old component each bar drew inside itself is gone; its keys and its closing are the `Menu`'s (`controls/__tests__/menu.test.tsx`).
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../App.tsx'
import { derive } from '../../../engine/derive.ts'
import { demoProject } from '../../../state/demo.ts'
import { emptyHistory } from '../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../state/store.ts'
import { useToast } from '../../layout/toast.ts'
import { useUi } from '../../layout/ui.ts'
import { letGoAll } from '../../plan/mix.ts'
import { letGo } from '../../tools/hand.ts'
import { closeMenu, menuOpen } from '../menu/open.tsx'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const strip = () => screen.getByRole('toolbar', { name: 'Tools' })
const bar = (name: string) => screen.getByRole('region', { name })
const menus = () => screen.queryAllByRole('menu')

beforeEach(() => {
  localStorage.clear()
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false })
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null, docks: { drafting: 'bottom' }, stripDock: 'left', show: { kpis: true, drafting: true, tools: true } })
  useToast.setState({ toast: null, confirmation: null })
  letGo()
  letGoAll()
  closeMenu()
})

describe('the bars’ menus are the app’s one menu', () => {
  it('the strip’s list opens on the opener, named for the bar, at the pointer', () => {
    render(<App />)
    expect(menuOpen()).toBe(false)
    fireEvent.contextMenu(strip(), { clientX: 30, clientY: 200 })
    expect(menuOpen()).toBe(true)
    const menu = screen.getByRole('menu', { name: 'Tools strip' })
    expect(menu).toHaveStyle({ left: '30px', top: '200px' })
    // the menu is the host's, on the body: not inside the strip it was asked in
    expect(strip().contains(menu)).toBe(false)
    expect(menu.parentElement).toBe(document.body)
  })

  it('the docked bar’s list: two places, a separator, Hide with its title', () => {
    render(<App />)
    fireEvent.contextMenu(bar('Drafting'), { clientX: 200, clientY: 500 })
    const menu = screen.getByRole('menu', { name: 'Drafting bar' })
    expect([...menu.children].map((c) => (c.getAttribute('role') === 'separator' ? '|' : c.querySelector('span')!.textContent))).toEqual(['Dock above the viewport', 'Dock below the viewport', '|', 'Hide the drafting bar'])
    expect(within(menu).getByRole('menuitem', { name: 'Hide the drafting bar' })).toHaveAttribute('title', 'The View menu brings it back')
  })

  it('one menu for the app: a bar’s menu is replaced by the plan’s, and the plan’s by a bar’s', () => {
    render(<App />)
    fireEvent.contextMenu(strip(), { clientX: 30, clientY: 200 })
    expect(menus().map((m) => m.getAttribute('aria-label'))).toEqual(['Tools strip'])
    fireEvent.pointerDown(screen.getByRole('img', { name: 'Site plan' }))
    fireEvent.contextMenu(screen.getByRole('img', { name: 'Site plan' }), { clientX: 420, clientY: 20, button: 2 })
    expect(menus().map((m) => m.getAttribute('aria-label'))).toEqual(['Plan'])
    fireEvent.pointerDown(document.body)
    fireEvent.contextMenu(bar('Drafting'), { clientX: 200, clientY: 500 })
    expect(menus().map((m) => m.getAttribute('aria-label'))).toEqual(['Drafting bar'])
    // a right-click on one bar while another’s menu is open replaces it as well
    fireEvent.contextMenu(strip(), { clientX: 30, clientY: 200 })
    expect(menus().map((m) => m.getAttribute('aria-label'))).toEqual(['Tools strip'])
  })

  it('the focus goes to the first row; ↑ from it wraps to the last, ↓ from the last to the first', () => {
    render(<App />)
    fireEvent.contextMenu(bar('Drafting'), { clientX: 200, clientY: 500 })
    const rows = [...screen.getByRole('menu').querySelectorAll<HTMLElement>('[role^="menuitem"]')]
    const first = rows[0]
    const last = rows[rows.length - 1]
    expect(first).toHaveFocus()
    fireEvent.keyDown(first, { key: 'ArrowUp' })
    expect(last).toHaveFocus()
    fireEvent.keyDown(last, { key: 'ArrowDown' })
    expect(first).toHaveFocus()
  })

  it('Escape closes it and gives the focus back where it was; a press outside closes it', () => {
    render(<App />)
    const before = document.createElement('button')
    document.body.append(before)
    before.focus()
    fireEvent.contextMenu(strip(), { clientX: 30, clientY: 200 })
    expect(menus()).toHaveLength(1)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(menus()).toHaveLength(0)
    expect(before).toHaveFocus()
    fireEvent.contextMenu(bar('Drafting'), { clientX: 200, clientY: 500 })
    fireEvent.pointerDown(document.body)
    expect(menus()).toHaveLength(0)
    before.remove()
  })

  it('a right-click on its own rows stays in it: the browser’s menu is not shown and the bar below does not open another', () => {
    render(<App />)
    fireEvent.contextMenu(strip(), { clientX: 30, clientY: 200 })
    const row = within(screen.getByRole('menu')).getAllByRole('menuitemcheckbox')[0]
    expect(fireEvent.contextMenu(row)).toBe(false)
    expect(menus().map((m) => m.getAttribute('aria-label'))).toEqual(['Tools strip'])
  })

  it('a pick closes it and runs: Hide the tools hides the strip', () => {
    render(<App />)
    fireEvent.contextMenu(strip(), { clientX: 30, clientY: 200 })
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Hide the tools' }))
    expect(menus()).toHaveLength(0)
    act(() => undefined)
    expect(useUi.getState().show.tools).toBe(false)
  })
})
