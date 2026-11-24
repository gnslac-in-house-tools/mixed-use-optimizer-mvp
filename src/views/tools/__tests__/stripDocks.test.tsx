// The Tools strip's five docks (AS.2 task 5; `tools/ToolStrip.tsx`, `viewport/DockArea.tsx`, `App.tsx`, `layout/ui.ts`): the layout keeps
// where it stands (`stripDock` in `gfit.layout`, anything else reads `top`, above the viewport); each dock draws it in its place with its orientation;
// it moves by its grip (the arrow keys, a drag with a line where it would land), by its right-click menu and by View › Bars ›
// Tools strip; Default layout puts it above the viewport; below 880 px it lies flat whatever was saved and has no grip; an
// open ▾ closes when it moves; a layout saved before AS.2 opens. (jsdom has no layout: a drag is tested with mocked rects.)
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../App.tsx'
import { derive } from '../../../engine/derive.ts'
import { demoProject } from '../../../state/demo.ts'
import { emptyHistory } from '../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../state/store.ts'
import { registerAll } from '../../commands/index.ts'
import { commandOf, menuEntries } from '../../commands/registry.ts'
import { resetKeys } from '../../commands/shortcuts.ts'
import { useCompare } from '../../compare/compareView.ts'
import { useToast } from '../../layout/toast.ts'
import { readSaved, STORAGE_KEY, STRIP_DOCKS, useUi, type StripDock } from '../../layout/ui.ts'
import { pickMenu } from '../../__tests__/pickMenu.ts'
import { letGo } from '../hand.ts'
import { useStripDrag } from '../ToolStrip.tsx'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const strip = () => screen.getByRole('toolbar', { name: 'Tools' })
const button = (name: string) => within(strip()).getByRole('button', { name })
const grip = () => button('Move the tools')
const area = () => document.querySelector('[data-dock-area]') as HTMLElement
const dock = () => useUi.getState().stripDock
/** `a` stands before `b` in the document. */
const before = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
const rect = (left: number, top: number, right: number, bottom: number): DOMRect => ({ left, top, right, bottom, x: left, y: top, width: right - left, height: bottom - top, toJSON: () => ({}) })

function reset() {
  localStorage.clear()
  registerAll()
  resetKeys()
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p, 'o1'), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
  useUi.setState({
    dialog: null,
    view: 'plan',
    rail: 'layers',
    panels: { left: true, right: true },
    sheet: null,
    docks: { drafting: 'bottom' },
    stripDock: 'left',
    show: { kpis: true, drafting: true, tools: true },
  })
  useStripDrag.setState({ to: null })
  useToast.setState({ toast: null, confirmation: null })
  useCompare.getState().close()
  letGo()
}

beforeEach(reset)
afterEach(() => {
  vi.unstubAllGlobals()
  useCompare.getState().close()
})

describe('the layout keeps where the strip stands', () => {
  it('the store keeps the dock, saves it in gfit.layout, and a reload reads it back', () => {
    expect(readSaved().stripDock).toBe('top')
    // (the dock it is at already is not saved again: it ends at the one it started at)
    for (const d of ['panel', 'right', 'top', 'bottom', 'left'] as const) {
      act(() => useUi.getState().setStripDock(d))
      expect(dock()).toBe(d)
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).stripDock).toBe(d)
      expect(readSaved().stripDock).toBe(d)
    }
  })

  it('anything else reads top, above the viewport: garbage, a number, a missing key, an old layout', () => {
    for (const raw of [{ stripDock: 'diagonal' }, { stripDock: 3 }, { stripDock: null }, {}, { docks: { drafting: 'top' } }]) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(raw))
      expect(readSaved().stripDock, JSON.stringify(raw)).toBe('top')
    }
    localStorage.setItem(STORAGE_KEY, 'not json')
    expect(readSaved().stripDock).toBe('top')
  })

  it('a layout that holds a valid stripDock keeps it, the old left included: whoever moved the strip keeps it there', () => {
    for (const d of STRIP_DOCKS) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ stripDock: d.key }))
      expect(readSaved().stripDock, d.key).toBe(d.key)
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ stripDock: 'left', show: { tools: true } }))
    expect(readSaved().stripDock).toBe('left')
  })

  it('a layout with no stripDock gets top, whatever else it holds', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ rail: 'layers', docks: { drafting: 'top' }, show: { kpis: true, drafting: true, tools: true } }))
    expect(readSaved().stripDock).toBe('top')
  })

  it('the five places have the names the menus use', () => {
    expect(STRIP_DOCKS.map((d) => [d.key, d.label])).toEqual([
      ['left', "At the window's left"],
      ['panel', 'Beside the panel'],
      ['right', "At the viewport's right"],
      ['top', 'Above the viewport'],
      ['bottom', 'Below the viewport'],
    ])
  })

  it('a layout saved before AS.2 opens: its tools bar’s dock ignored, the strip shown above the viewport even if its bar was hidden', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ docks: { drafting: 'bottom', tools: 'top' }, rail: 'layers', show: { kpis: true, drafting: true, tools: false } }))
    const saved = readSaved()
    expect(saved.stripDock).toBe('top')
    expect(saved.show.tools).toBe(true)
    act(() => useUi.setState({ ...saved }))
    render(<App />)
    expect(strip()).toHaveAttribute('data-dock', 'top')
    expect(strip()).toHaveAttribute('aria-orientation', 'horizontal')
  })

  it('a layout saved from AS.2 on (it has a stripDock) keeps its hidden strip; saving always writes the dock', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ stripDock: 'right', show: { kpis: true, drafting: true, tools: false } }))
    expect(readSaved().show.tools).toBe(false)
    act(() => useUi.getState().setShow('tools', false))
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).stripDock).toBeDefined()
  })
})

describe('each dock draws the strip in its place', () => {
  it('left: upright, the first column of the grid, before the left panel and outside the viewport’s column', () => {
    render(<App />)
    expect(strip()).toHaveAttribute('aria-orientation', 'vertical')
    expect(strip().parentElement).toBe(screen.getByRole('main'))
    expect(strip().closest('[data-dock-area]')).toBeNull()
    expect(before(strip(), screen.getByRole('complementary', { name: 'Layers and properties' }))).toBe(true)
    expect(screen.getByRole('main').style.gridTemplateColumns).toMatch(/^auto /)
  })

  it('panel: upright, between the left panel and the viewport; it takes no grid column of its own', () => {
    useUi.setState({ stripDock: 'panel' })
    render(<App />)
    expect(strip()).toHaveAttribute('aria-orientation', 'vertical')
    expect(strip()).toHaveAttribute('data-dock', 'panel')
    expect(strip().closest('[data-dock-area]')).toBeNull()
    expect(strip().closest('main')).not.toBeNull()
    expect(before(screen.getByRole('complementary', { name: 'Layers and properties' }), strip())).toBe(true)
    expect(before(strip(), area())).toBe(true)
    expect(before(strip(), screen.getByRole('region', { name: 'Viewport' }))).toBe(true)
    expect(screen.getByRole('main').style.gridTemplateColumns).not.toMatch(/auto/)
  })

  it('right: upright, at the viewport’s right, before Summary', () => {
    useUi.setState({ stripDock: 'right' })
    render(<App />)
    expect(strip()).toHaveAttribute('aria-orientation', 'vertical')
    expect(strip().closest('[data-dock-area]')).toBeNull()
    expect(before(area(), strip())).toBe(true)
    expect(before(strip(), screen.getByRole('complementary', { name: 'Summary' }))).toBe(true)
    expect(screen.getByRole('main').style.gridTemplateColumns).not.toMatch(/auto/)
  })

  it('top: flat, in the viewport’s column above the viewport; with the drafting bar there too, the strip is nearer the viewport', () => {
    useUi.setState({ stripDock: 'top' })
    render(<App />)
    expect(strip()).toHaveAttribute('aria-orientation', 'horizontal')
    expect(strip().parentElement).toBe(area())
    expect(before(strip(), screen.getByRole('region', { name: 'Viewport' }))).toBe(true)
    // the drafting bar is below: the strip above the viewport, the bar under it
    expect(before(screen.getByRole('region', { name: 'Viewport' }), screen.getByRole('region', { name: 'Drafting' }))).toBe(true)
    act(() => useUi.getState().setDock('drafting', 'top'))
    expect(before(screen.getByRole('region', { name: 'Drafting' }), strip())).toBe(true)
    expect(before(strip(), screen.getByRole('region', { name: 'Viewport' }))).toBe(true)
  })

  it('bottom: flat, below the viewport; with the drafting bar there too, the strip is nearer the viewport', () => {
    useUi.setState({ stripDock: 'bottom' })
    render(<App />)
    expect(strip()).toHaveAttribute('aria-orientation', 'horizontal')
    expect(strip().parentElement).toBe(area())
    expect(before(screen.getByRole('region', { name: 'Viewport' }), strip())).toBe(true)
    expect(before(strip(), screen.getByRole('region', { name: 'Drafting' }))).toBe(true)
    act(() => useUi.getState().setDock('drafting', 'top'))
    expect(before(screen.getByRole('region', { name: 'Drafting' }), screen.getByRole('region', { name: 'Viewport' }))).toBe(true)
    expect(before(screen.getByRole('region', { name: 'Viewport' }), strip())).toBe(true)
  })

  it('a hidden left panel and a hidden Summary: panel and right still stand at the viewport’s sides, left at the window’s left', () => {
    useUi.setState({ panels: { left: false, right: false }, stripDock: 'panel' })
    render(<App />)
    expect(strip()).toHaveAttribute('data-dock', 'panel')
    expect(before(strip(), area())).toBe(true)
    act(() => useUi.getState().setStripDock('right'))
    expect(strip()).toHaveAttribute('data-dock', 'right')
    expect(before(area(), strip())).toBe(true)
    act(() => useUi.getState().setStripDock('left'))
    expect(strip().parentElement).toBe(screen.getByRole('main'))
    expect(screen.getByRole('main').style.gridTemplateColumns).toBe('auto minmax(0, 1fr)')
  })

  it('hidden with show.tools off in every dock', () => {
    useUi.setState({ show: { kpis: true, drafting: true, tools: false } })
    for (const d of STRIP_DOCKS) {
      act(() => useUi.setState({ stripDock: d.key }))
      const { unmount } = render(<App />)
      expect(screen.queryByRole('toolbar', { name: 'Tools' }), d.key).toBeNull()
      unmount()
    }
  })

  it('moving it keeps the viewport’s element: the 3D view and the command line are not made again', () => {
    render(<App />)
    const viewport = screen.getByRole('region', { name: 'Viewport' })
    const column = area()
    for (const d of ['panel', 'right', 'top', 'bottom', 'left'] as const) {
      act(() => useUi.getState().setStripDock(d))
      expect(screen.getByRole('region', { name: 'Viewport' }), d).toBe(viewport)
      expect(area(), d).toBe(column)
    }
  })
})

describe('the grip', () => {
  it('is the strip’s first item, named, with its title', () => {
    render(<App />)
    expect(strip().firstElementChild).toBe(grip())
    expect(grip().getAttribute('title')).toBe("Drag to the window's left, beside the panel, to the viewport's right, above or below it (or the arrow keys)")
    // and flat too
    act(() => useUi.getState().setStripDock('top'))
    expect(strip().firstElementChild).toBe(grip())
  })

  it('← → walk left · panel · right and stop at the ends; ↑ goes above the viewport, ↓ below it; from there ← → go to panel and right', () => {
    render(<App />)
    grip().focus()
    // the key goes to whatever has the focus, as in the browser: a strip that lost it would stop answering
    const press = (key: string) => {
      fireEvent.keyDown(document.activeElement!, { key })
      expect(document.activeElement, `after ${key}`).toBe(grip())
    }
    press('ArrowLeft')
    expect(dock()).toBe('left')
    press('ArrowRight')
    expect(dock()).toBe('panel')
    press('ArrowRight')
    expect(dock()).toBe('right')
    press('ArrowRight')
    expect(dock()).toBe('right')
    press('ArrowLeft')
    expect(dock()).toBe('panel')
    press('ArrowUp')
    expect(dock()).toBe('top')
    press('ArrowRight')
    expect(dock()).toBe('right')
    press('ArrowDown')
    expect(dock()).toBe('bottom')
    press('ArrowUp')
    expect(dock()).toBe('top')
    press('ArrowDown')
    expect(dock()).toBe('bottom')
    press('ArrowLeft')
    expect(dock()).toBe('panel')
    press('Enter')
    expect(dock()).toBe('panel')
  })

  it('a move that does not come from the grip’s keys (a menu, the store) does not take the focus', () => {
    render(<App />)
    act(() => useUi.getState().setStripDock('panel'))
    // a move that did not come from the grip's keys leaves the focus alone
    expect(document.activeElement).toBe(document.body)
  })

  describe('dragged', () => {
    // the window's <main> and the viewport's column; the strip’s own rect does not matter
    const rects = () => {
      screen.getByRole('main').getBoundingClientRect = () => rect(0, 0, 1400, 800)
      area().getBoundingClientRect = () => rect(400, 100, 1000, 700)
    }
    const drop = (to: StripDock) => document.querySelector(`[data-strip-drop="${to}"]`)

    it('past a few pixels, a line shows where it would land; released, it lands there; a press that does not move changes nothing', () => {
      render(<App />)
      rects()
      fireEvent.pointerDown(grip(), { button: 0, clientX: 20, clientY: 300, pointerId: 1 })
      fireEvent.pointerMove(grip(), { clientX: 22, clientY: 301, pointerId: 1 })
      expect(document.querySelector('[data-strip-drop]')).toBeNull()
      fireEvent.pointerMove(grip(), { clientX: 950, clientY: 400, pointerId: 1 })
      expect(drop('right')).not.toBeNull()
      expect(drop('right')).toHaveAttribute('aria-hidden', 'true')
      expect(strip().className).toContain('opacity-60')
      fireEvent.pointerUp(grip(), { clientX: 950, clientY: 400, pointerId: 1 })
      expect(dock()).toBe('right')
      expect(document.querySelector('[data-strip-drop]')).toBeNull()
      expect(strip().className).not.toContain('opacity-60')
      // a press and a release in place: nothing moves
      fireEvent.pointerDown(grip(), { button: 0, clientX: 960, clientY: 300, pointerId: 1 })
      fireEvent.pointerUp(grip(), { clientX: 960, clientY: 300, pointerId: 1 })
      expect(dock()).toBe('right')
    })

    it('each zone: a vertical line for left, panel and right, a horizontal one for top and bottom, at the place the strip would stand', () => {
      render(<App />)
      rects()
      const zones: [StripDock, number, number][] = [
        ['left', 50, 400],
        ['panel', 450, 400],
        ['right', 950, 400],
        ['top', 700, 120],
        ['bottom', 700, 680],
      ]
      fireEvent.pointerDown(grip(), { button: 0, clientX: 20, clientY: 300, pointerId: 1 })
      for (const [to, x, y] of zones) {
        fireEvent.pointerMove(grip(), { clientX: x, clientY: y, pointerId: 1 })
        expect(useStripDrag.getState().to, to).toBe(to)
        const line = drop(to)!
        expect(line, to).not.toBeNull()
        // only the one line shows
        expect(document.querySelectorAll('[data-strip-drop]')).toHaveLength(1)
        if (to === 'top' || to === 'bottom') {
          expect(area().contains(line)).toBe(true)
          expect(line.className).toContain('h-1')
        } else {
          expect(line.className).toContain('w-1')
          expect(area().contains(line)).toBe(false)
          expect(line.closest('main')).not.toBeNull()
        }
      }
      // beside the column: the panel's line before it, the right's after it
      fireEvent.pointerMove(grip(), { clientX: 450, clientY: 400, pointerId: 1 })
      expect(before(drop('panel')!, area())).toBe(true)
      fireEvent.pointerMove(grip(), { clientX: 950, clientY: 400, pointerId: 1 })
      expect(before(area(), drop('right')!)).toBe(true)
      fireEvent.pointerUp(grip(), { pointerId: 1 })
      expect(dock()).toBe('right')
    })

    it('cancelled, nothing changes and no line is left', () => {
      render(<App />)
      rects()
      fireEvent.pointerDown(grip(), { button: 0, clientX: 20, clientY: 300, pointerId: 1 })
      fireEvent.pointerMove(grip(), { clientX: 700, clientY: 120, pointerId: 1 })
      expect(drop('top')).not.toBeNull()
      fireEvent.pointerCancel(grip(), { pointerId: 1 })
      expect(dock()).toBe('left')
      expect(document.querySelector('[data-strip-drop]')).toBeNull()
      // and a move after the cancel draws nothing
      fireEvent.pointerMove(grip(), { clientX: 700, clientY: 120, pointerId: 1 })
      expect(document.querySelector('[data-strip-drop]')).toBeNull()
    })

    it('another pointer’s moves and release are not the drag’s', () => {
      render(<App />)
      rects()
      fireEvent.pointerDown(grip(), { button: 0, clientX: 20, clientY: 300, pointerId: 1 })
      fireEvent.pointerMove(grip(), { clientX: 700, clientY: 120, pointerId: 2 })
      expect(document.querySelector('[data-strip-drop]')).toBeNull()
      fireEvent.pointerMove(grip(), { clientX: 700, clientY: 120, pointerId: 1 })
      expect(drop('top')).not.toBeNull()
      // a second finger lifting does not drop it, nor cancel it
      fireEvent.pointerUp(grip(), { clientX: 950, clientY: 400, pointerId: 2 })
      fireEvent.pointerCancel(grip(), { pointerId: 2 })
      expect(dock()).toBe('left')
      expect(drop('top')).not.toBeNull()
      fireEvent.pointerUp(grip(), { clientX: 700, clientY: 120, pointerId: 1 })
      expect(dock()).toBe('top')
    })

    it('the capture lost is a cancel: nothing changes, no line is left, and a move after it draws nothing', () => {
      render(<App />)
      rects()
      fireEvent.pointerDown(grip(), { button: 0, clientX: 20, clientY: 300, pointerId: 1 })
      fireEvent.pointerMove(grip(), { clientX: 700, clientY: 120, pointerId: 1 })
      expect(drop('top')).not.toBeNull()
      fireEvent.lostPointerCapture(grip(), { pointerId: 1 })
      expect(dock()).toBe('left')
      expect(document.querySelector('[data-strip-drop]')).toBeNull()
      expect(strip().className).not.toContain('opacity-60')
      fireEvent.pointerMove(grip(), { clientX: 700, clientY: 120, pointerId: 1 })
      expect(document.querySelector('[data-strip-drop]')).toBeNull()
    })

    it('a secondary button does not start a drag', () => {
      render(<App />)
      rects()
      fireEvent.pointerDown(grip(), { button: 2, clientX: 20, clientY: 300, pointerId: 1 })
      fireEvent.pointerMove(grip(), { clientX: 700, clientY: 120, pointerId: 1 })
      expect(document.querySelector('[data-strip-drop]')).toBeNull()
    })

    it('a strip standing flat can be dragged back to the window’s left', () => {
      useUi.setState({ stripDock: 'top' })
      render(<App />)
      rects()
      fireEvent.pointerDown(grip(), { button: 0, clientX: 600, clientY: 110, pointerId: 1 })
      fireEvent.pointerMove(grip(), { clientX: 60, clientY: 400, pointerId: 1 })
      expect(drop('left')).not.toBeNull()
      expect(drop('left')!.parentElement).toBe(screen.getByRole('main'))
      fireEvent.pointerUp(grip(), { pointerId: 1 })
      expect(dock()).toBe('left')
    })
  })
})

describe('its right-click menu', () => {
  it('the five places, the current one ticked, then Hide the tools with its title', () => {
    useUi.setState({ stripDock: 'right' })
    render(<App />)
    fireEvent.contextMenu(button('Select'), { clientX: 30, clientY: 200 })
    const menu = screen.getByRole('menu', { name: 'Tools strip' })
    const rows = within(menu).getAllByRole('menuitemcheckbox')
    expect(rows.map((r) => r.textContent?.replace('✓', ''))).toEqual(STRIP_DOCKS.map((d) => d.label))
    expect(rows.map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'false', 'true', 'false', 'false'])
    expect(within(menu).getByRole('separator')).toBeInTheDocument()
    const hide = within(menu).getByRole('menuitem', { name: 'Hide the tools' })
    expect(hide).toHaveAttribute('title', 'View › Panels › Tools brings it back')
  })

  it('a place picked moves the strip and closes the menu', () => {
    render(<App />)
    fireEvent.contextMenu(strip(), { clientX: 30, clientY: 200 })
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitemcheckbox', { name: 'Below the viewport' }))
    expect(screen.queryByRole('menu')).toBeNull()
    expect(dock()).toBe('bottom')
    expect(strip()).toHaveAttribute('aria-orientation', 'horizontal')
    // from the flat strip too
    fireEvent.contextMenu(button('Select'), { clientX: 300, clientY: 700 })
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitemcheckbox', { name: 'Beside the panel' }))
    expect(dock()).toBe('panel')
  })

  it('Hide the tools hides it; View › Panels › Tools brings it back where it was', () => {
    useUi.setState({ stripDock: 'panel' })
    render(<App />)
    fireEvent.contextMenu(strip(), { clientX: 30, clientY: 200 })
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Hide the tools' }))
    expect(useUi.getState().show.tools).toBe(false)
    expect(screen.queryByRole('toolbar', { name: 'Tools' })).toBeNull()
    pickMenu('View', 'Panels', 'Tools')
    expect(strip()).toHaveAttribute('data-dock', 'panel')
  })

  it('a right-click in a ▾’s panel keeps the browser’s menu: the panel is in the body, not the strip', () => {
    render(<App />)
    fireEvent.click(button('Massing options'))
    fireEvent.contextMenu(screen.getByRole('dialog', { name: 'Draw makes' }), { clientX: 300, clientY: 200 })
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('a field keeps the browser’s menu', () => {
    render(<App />)
    const field = document.createElement('input')
    strip().appendChild(field)
    fireEvent.contextMenu(field)
    expect(screen.queryByRole('menu')).toBeNull()
  })
})

describe('View › Bars › Tools strip', () => {
  const rows = () => {
    const bars = menuEntries(['View', 'Bars'])
    const sub = bars.find((e) => e !== 'separator' && e.label === 'Tools strip')
    if (!sub || sub === 'separator' || !('items' in sub)) throw new Error('no Tools strip sub-menu in Bars')
    return sub.items.filter((e) => e !== 'separator')
  }

  it('five rows, ids view.strip.<dock>, the labels of the menus, the current one ticked', () => {
    expect(rows().map((r) => r.key)).toEqual(STRIP_DOCKS.map((d) => `view.strip.${d.key}`))
    expect(rows().map((r) => r.label)).toEqual(STRIP_DOCKS.map((d) => d.label))
    expect(rows().map((r) => ('checked' in r ? r.checked : null))).toEqual([true, false, false, false, false])
    act(() => useUi.getState().setStripDock('top'))
    expect(rows().map((r) => ('checked' in r ? r.checked : null))).toEqual([false, false, false, true, false])
    act(() => useUi.getState().setStripDock('bottom'))
    act(() => useUi.getState().resetLayout())
    expect(rows().map((r) => ('checked' in r ? r.checked : null))).toEqual([false, false, false, true, false])
  })

  it('a separator stands before the sub-menu, after the bars’ docks', () => {
    const bars = menuEntries(['View', 'Bars'])
    const i = bars.findIndex((e) => e !== 'separator' && e.label === 'Tools strip')
    expect(bars[i - 1]).toBe('separator')
  })

  it('a row also shows the strip, when it was hidden', () => {
    useUi.setState({ show: { kpis: true, drafting: true, tools: false } })
    render(<App />)
    expect(screen.queryByRole('toolbar', { name: 'Tools' })).toBeNull()
    pickMenu('View', 'Bars', 'Tools strip', "At the viewport's right")
    expect(useUi.getState().show.tools).toBe(true)
    expect(dock()).toBe('right')
    expect(strip()).toHaveAttribute('data-dock', 'right')
    // and the other four, from hidden again
    for (const d of STRIP_DOCKS) {
      act(() => useUi.getState().setShow('tools', false))
      act(() => void commandOf(`view.strip.${d.key}`)!.run())
      expect(useUi.getState().show.tools, d.key).toBe(true)
      expect(dock(), d.key).toBe(d.key)
    }
  })

  it('a row moves the strip, through the menu bar as the user does', () => {
    render(<App />)
    pickMenu('View', 'Bars', 'Tools strip', 'Above the viewport')
    expect(dock()).toBe('top')
    expect(strip()).toHaveAttribute('aria-orientation', 'horizontal')
    pickMenu('View', 'Bars', 'Tools strip', "At the viewport's right")
    expect(dock()).toBe('right')
    expect(commandOf('view.strip.right')!.checked!()).toBe(true)
    expect(commandOf('view.strip.top')!.checked!()).toBe(false)
  })
})

describe('Default layout', () => {
  it('puts the strip back above the viewport, shown', () => {
    useUi.setState({ stripDock: 'bottom', show: { kpis: true, drafting: true, tools: false } })
    render(<App />)
    pickMenu('View', 'Default layout')
    expect(dock()).toBe('top')
    expect(useUi.getState().show.tools).toBe(true)
    expect(readSaved().stripDock).toBe('top')
    expect(strip()).toHaveAttribute('data-dock', 'top')
    expect(strip()).toHaveAttribute('aria-orientation', 'horizontal')
    expect(strip().parentElement).toBe(area())
  })

  it('resetLayout from any of the five places gives top', () => {
    for (const d of STRIP_DOCKS) {
      act(() => useUi.setState({ stripDock: d.key }))
      act(() => useUi.getState().resetLayout())
      expect(dock(), d.key).toBe('top')
    }
  })
})

describe('below 880 px', () => {
  const narrow = () => vi.stubGlobal('matchMedia', vi.fn((media: string) => ({ media, matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })))

  it('flat under the viewport, under the drafting bar, whatever was saved; the saved dock is kept; no grip', () => {
    narrow()
    for (const d of STRIP_DOCKS) {
      act(() => useUi.setState({ stripDock: d.key }))
      const { unmount } = render(<App />)
      expect(strip(), d.key).toHaveAttribute('aria-orientation', 'horizontal')
      expect(strip().parentElement, d.key).toBe(area())
      expect(before(screen.getByRole('region', { name: 'Drafting' }), strip()), d.key).toBe(true)
      expect(within(strip()).queryByRole('button', { name: 'Move the tools' }), d.key).toBeNull()
      expect(strip(), d.key).not.toHaveAttribute('data-dock')
      expect(dock()).toBe(d.key)
      unmount()
    }
  })

  it('its menu has Hide the tools alone: nowhere to move it to', () => {
    narrow()
    useUi.setState({ stripDock: 'right' })
    render(<App />)
    fireEvent.contextMenu(button('Select'), { clientX: 30, clientY: 200 })
    const menu = screen.getByRole('menu', { name: 'Tools strip' })
    expect(within(menu).queryAllByRole('menuitemcheckbox')).toHaveLength(0)
    expect(within(menu).getAllByRole('menuitem').map((r) => r.textContent)).toEqual(['Hide the tools'])
    expect(within(menu).queryByRole('separator')).toBeNull()
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Hide the tools' }))
    expect(useUi.getState().show.tools).toBe(false)
    expect(dock()).toBe('right')
  })

  it('a wide window again: the saved dock is where it stands', () => {
    narrow()
    useUi.setState({ stripDock: 'right' })
    const { unmount } = render(<App />)
    expect(strip()).toHaveAttribute('aria-orientation', 'horizontal')
    unmount()
    vi.unstubAllGlobals()
    render(<App />)
    expect(strip()).toHaveAttribute('data-dock', 'right')
    expect(strip()).toHaveAttribute('aria-orientation', 'vertical')
  })
})

describe('an open ▾ closes when the strip moves', () => {
  const opened = (name = 'Massing options') => button(name).getAttribute('aria-expanded') === 'true'

  it('standing up and moving from the window’s left to beside the panel', () => {
    render(<App />)
    fireEvent.click(button('Massing options'))
    expect(opened()).toBe(true)
    expect(screen.getByRole('dialog', { name: 'Draw makes' })).toBeInTheDocument()
    act(() => useUi.getState().setStripDock('panel'))
    expect(opened()).toBe(false)
    expect(screen.queryByRole('dialog', { name: 'Draw makes' })).toBeNull()
  })

  it('flat, from above the viewport to below it (the strip keeps its element: the dock itself closes it)', () => {
    useUi.setState({ stripDock: 'top' })
    render(<App />)
    const was = strip()
    fireEvent.click(button('Streets options'))
    expect(opened('Streets options')).toBe(true)
    act(() => useUi.getState().setStripDock('bottom'))
    expect(strip()).toBe(was)
    expect(opened('Streets options')).toBe(false)
    expect(screen.queryByRole('dialog', { name: 'New street' })).toBeNull()
    // and it opens again where it is now
    fireEvent.click(button('Streets options'))
    expect(opened('Streets options')).toBe(true)
  })
})

describe('an open ▾ closes when its place in the strip changes', () => {
  const opened = () => button('Massing options').getAttribute('aria-expanded') === 'true'

  it('the strip scrolling closes it, and opening it again works', () => {
    render(<App />)
    fireEvent.click(button('Massing options'))
    expect(opened()).toBe(true)
    fireEvent.scroll(strip())
    expect(opened()).toBe(false)
    expect(screen.queryByRole('dialog', { name: 'Draw makes' })).toBeNull()
    fireEvent.click(button('Massing options'))
    expect(opened()).toBe(true)
  })

  it('going from one column to two closes it, and coming back to one does not open it again', () => {
    let room = 800
    const observers: (() => void)[] = []
    vi.stubGlobal('ResizeObserver', class { constructor(cb: () => void) { observers.push(cb) } observe() {} unobserve() {} disconnect() {} })
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return this.hasAttribute('data-tool-strip') ? (this.getAttribute('data-cols') === '2' ? 380 : 700) : 0
    })
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return this.hasAttribute('data-tool-strip') ? room : 0
    })
    render(<App />)
    expect(strip()).toHaveAttribute('data-cols', '1')
    fireEvent.click(button('Massing options'))
    expect(opened()).toBe(true)
    room = 400
    act(() => observers[observers.length - 1]())
    expect(strip()).toHaveAttribute('data-cols', '2')
    expect(opened()).toBe(false)
    expect(screen.queryByRole('dialog', { name: 'Draw makes' })).toBeNull()
    room = 800
    act(() => observers[observers.length - 1]())
    expect(strip()).toHaveAttribute('data-cols', '1')
    expect(opened()).toBe(false)
    vi.restoreAllMocks()
  })
})
