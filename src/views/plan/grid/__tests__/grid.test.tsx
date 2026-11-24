// The grid on the plan and in the bottom bar (Phase G.2a, QF.3; Decisions "Grid layout", "Grid always", "Grid menu"): the
// bar's Grid menu (its fields, the option's own, Move pivot and Restore original, each field one undo step; no Add, Fit
// or Remove: there is always a grid); the Grid chip draws faint hairlines at the bay lines across the whole view (not just
// the site), the modules once they are wide enough on screen, small names at the view's edges once the bays are; the
// grid tool's handles (Move pivot) move and turn it.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { fitGrid, gridOf, toPlan } from '../../../../engine/grid/index.ts'
import type { Grid } from '../../../../model/schema.ts'
import { actions } from '../../../../state/actions/index.ts'
import { demoProject } from '../../../../state/demo.ts'
import { useApp } from '../../../../state/store.ts'
import { useUi } from '../../../layout/ui.ts'
import { MenuHost } from '../../../editing/menu/open.tsx'
import { SnapBar } from '../../SnapBar.tsx'
import { SiteToolLayer } from '../../site/SiteToolLayer.tsx'
import { useSiteTool } from '../../site/siteTools.ts'
import { GridLayer, viewBounds } from '../GridLayer.tsx'
import { GridToolLayer } from '../GridToolLayer.tsx'
import { useSnapSettings } from '../../snap/settings.ts'
import { letGo, take } from '../../../tools/hand.ts'

const square: Grid = { x: 12, y: 12, modules: 4, origin: { x: 0, y: 0 }, angle: 0 }
const project = () => useApp.getState().project
/** A view box (`x y w h`, y flipped) over plan x 0–480 and y 0–300. */
const VIEW = '0 -300 480 300'

beforeEach(() => {
  useApp.getState().open(demoProject())
  useSnapSettings.setState((s) => ({ settings: { ...s.settings, grid: true } }))
  letGo()
  useUi.setState({ view: 'plan' })
})

describe('the bar’s Grid menu', () => {
  /** The menu's button (the chip is also named Grid; this one opens a dialog). */
  const menuButton = () => screen.getAllByRole('button', { name: 'Grid' }).find((b) => b.hasAttribute('aria-haspopup'))!
  const openMenu = () => {
    fireEvent.click(menuButton())
    return screen.getByRole('dialog', { name: 'Grid' })
  }
  const type = (name: RegExp, value: string) => {
    const field = screen.getByRole('textbox', { name })
    fireEvent.change(field, { target: { value } })
    fireEvent.keyDown(field, { key: 'Enter' })
  }
  const toWorld = (e: { clientX: number; clientY: number }) => ({ x: e.clientX, y: e.clientY })
  /** The bar and the plan's site-tool layer, as the app draws them (PlanSvg draws the layer in every area). */
  const bar = () =>
    render(
      <>
        <SnapBar />
        {/* the one right-click menu of the app (the grid's handles open it), mounted once in the frame */}
        <MenuHost />
        <svg data-testid="plan">
          <SiteToolLayer camera={{ scale: 1, viewBox: '0 -300 500 300', toWorld }} />
        </svg>
      </>,
    )

  it('is named Grid (not Grid look) and holds every field, the option’s choice and the look', () => {
    bar()
    expect(screen.queryByRole('button', { name: 'Grid look' })).toBeNull()
    expect(menuButton()).toHaveAttribute('title', expect.stringMatching(/parameters/i))
    const menu = within(openMenu())
    for (const name of [/^Bay x/, /^Bay y/, /^Modules/, /^Angle/, /^Origin x/, /^Origin y/]) expect(menu.getByRole('textbox', { name })).toBeInTheDocument()
    expect(menu.getByText('Module').nextSibling!.textContent).toBe('3 m')
    expect(menu.getByRole('button', { name: 'Move pivot' })).toHaveAttribute('aria-pressed', 'false')
    expect(menu.getByRole('button', { name: 'Restore original' })).toBeInTheDocument()
    expect(menu.getByRole('button', { name: 'Project' })).toBeInTheDocument()
    expect(menu.getByRole('group', { name: 'Grid colour' })).toBeInTheDocument()
    expect(menu.getByRole('slider', { name: 'Grid opacity' })).toBeInTheDocument()
    for (const name of ['Add grid', 'Fit to the site', 'Remove grid']) expect(menu.queryByRole('button', { name })).toBeNull()
  })

  it('always a grid: the demo’s, its fields, the option’s own, each one undo step', () => {
    bar()
    const menu = within(openMenu())
    const g = project().grid!
    expect([g.x, g.y, g.modules, g.angle]).toEqual([12, 12, 4, 0])
    const steps = useApp.getState().history.past.length
    type(/^Bay x/, '15')
    expect(project().grid!.x).toBe(15)
    expect(useApp.getState().history.past.length).toBe(steps + 1)
    expect(menu.getByText('Module').nextSibling!.textContent).toBe('3.75 × 3 m')
    type(/^Origin x/, '20')
    expect(project().grid!.origin).toEqual({ x: 20, y: g.origin.y })
    // the option's own: edited apart from the project's
    fireEvent.click(menu.getByRole('button', { name: 'Option 1’s own' }))
    type(/^Modules/, '3')
    expect([project().options[0].grid!.modules, project().grid!.modules]).toEqual([3, 4])
    fireEvent.click(menu.getByRole('button', { name: 'Project' }))
    expect(project().options[0].grid).toBeUndefined()
    act(() => useApp.getState().undo())
    expect(project().options[0].grid!.modules).toBe(3)
  })

  it('Move pivot turns the grid tool on (pressed, the origin’s handle on the plan); a press on the plan closes the menu and the tool stays on', () => {
    bar()
    const menu = openMenu()
    fireEvent.click(within(menu).getByRole('button', { name: 'Move pivot' }))
    expect(useSiteTool.getState().tool).toBe('grid')
    expect(within(menu).getByRole('button', { name: 'Move pivot' })).toHaveAttribute('aria-pressed', 'true')
    expect(document.querySelector('[data-handle="grid-move"]')).not.toBeNull()
    fireEvent.pointerDown(screen.getByTestId('plan'), { pointerId: 1, button: 0 })
    expect(screen.queryByRole('dialog', { name: 'Grid' })).toBeNull()
    expect(useSiteTool.getState().tool).toBe('grid')
    expect(document.querySelector('[data-handle="grid-move"]')).not.toBeNull()
    // reopened, the toggle still says it is on
    expect(within(openMenu()).getByRole('button', { name: 'Move pivot' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('works whatever the area: the Site tab is not needed, another area’s plan draws the handle', () => {
    useUi.setState({ rail: 'layers' })
    bar()
    fireEvent.click(within(openMenu()).getByRole('button', { name: 'Move pivot' }))
    expect(document.querySelector('[data-handle="grid-move"]')).not.toBeNull()
  })

  it('Escape leaves the tool (the menu closed), and so does the toggle', () => {
    bar()
    fireEvent.click(within(openMenu()).getByRole('button', { name: 'Move pivot' }))
    // Escape while the menu is open closes the menu only
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Grid' })).toBeNull()
    expect(useSiteTool.getState().tool).toBe('grid')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(useSiteTool.getState().tool).toBeNull()
    expect(document.querySelector('[data-handle="grid-move"]')).toBeNull()
    const on = within(openMenu()).getByRole('button', { name: 'Move pivot' })
    fireEvent.click(on)
    expect(useSiteTool.getState().tool).toBe('grid')
    fireEvent.click(on)
    expect(useSiteTool.getState().tool).toBeNull()
    expect(on).toHaveAttribute('aria-pressed', 'false')
  })

  it('Restore original puts the grid back along the site’s main axis (one undo step), the bays and modules kept', () => {
    act(() => useApp.getState().apply((p) => actions.updateGrid(p, p.options[0].id, { angle: 30, origin: { x: 7, y: 9 } })))
    bar()
    const fit = fitGrid(project(), project().grid!)
    const steps = useApp.getState().history.past.length
    fireEvent.click(within(openMenu()).getByRole('button', { name: 'Restore original' }))
    expect(gridOf(project())).toMatchObject({ origin: fit.origin, angle: fit.angle, x: 12, modules: 4 })
    expect(useApp.getState().history.past.length).toBe(steps + 1)
  })

  it('the 3D view alone lets the tool go (no plan on screen, no handle); so does opening another project', () => {
    bar()
    fireEvent.click(within(openMenu()).getByRole('button', { name: 'Move pivot' }))
    act(() => useUi.getState().setView('3d'))
    expect(useSiteTool.getState().tool).toBeNull()
    act(() => useUi.getState().setView('plan'))
    expect(useSiteTool.getState().tool).toBeNull()
    expect(document.querySelector('[data-handle="grid-move"]')).toBeNull()
    // split still shows the plan: the tool stays
    act(() => take('grid'))
    act(() => useUi.getState().setView('split'))
    expect(useSiteTool.getState().tool).toBe('grid')
    act(() => useApp.getState().open(demoProject()))
    expect(useSiteTool.getState().tool).toBeNull()
  })
})

describe('the plan', () => {
  it('the view box as plan metres', () => {
    expect(viewBounds(VIEW)).toEqual({ minX: 0, maxX: 480, minY: 0, maxY: 300 })
    expect(viewBounds(undefined)).toBeNull()
  })

  it('Show’s Grid: faint hairlines at the bay lines across the whole view; the modules and the names once wide enough; off, nothing', () => {
    act(() => useApp.getState().apply((p) => actions.setGrid(p, square)))
    const { rerender } = render(
      <svg>
        <GridLayer px={1} viewBox={VIEW} />
      </svg>,
    )
    // the whole view, past the site (x 0–440, y 0–280): lines A…AN (0–480) and 1…26 (0–300)
    const lines = document.querySelector('[data-grid-lines]')!
    expect(lines.getAttribute('data-grid-lines')).toBe(String(41 + 26))
    // hairlines: never scaled, faint
    expect(lines.getAttribute('vector-effect')).toBe('non-scaling-stroke')
    expect(Number(lines.getAttribute('stroke-width'))).toBeLessThanOrEqual(1)
    expect(Number(lines.getAttribute('stroke-opacity'))).toBeLessThan(0.5)
    expect(document.querySelector('[data-grid-bubble]')).toBeNull()
    // at 1 px a metre a 3 m module is too thin to draw, and a 12 m bay too narrow to name
    expect(document.querySelector('[data-grid-modules]')).toBeNull()
    expect(document.querySelector('[data-grid-name]')).toBeNull()
    // at 0.25 m a px a module is 12 px and a bay 48 px: the modules drawn, fainter, and each line named once, at the edge
    rerender(
      <svg>
        <GridLayer px={0.25} viewBox={VIEW} />
      </svg>,
    )
    const modules = document.querySelector('[data-grid-modules]')!
    expect(Number(modules.getAttribute('stroke-opacity'))).toBeLessThan(Number(lines.getAttribute('stroke-opacity')))
    const names = [...document.querySelectorAll('[data-grid-name]')].map((n) => n.getAttribute('data-grid-name'))
    // A (x 0) and 1 (y 0) run along the view's edges: past its inset, not named
    expect(names.slice(0, 2)).toEqual(['B', 'C'])
    expect(names).toContain('2')
    expect(names).not.toContain('A')
    expect(new Set(names).size).toBe(names.length)
    // the drafting bar's Grid off: the grid is not drawn (Decision "Grid chip")
    act(() => useSnapSettings.setState((s) => ({ settings: { ...s.settings, grid: false } })))
    expect(document.querySelector('[data-layer="grid"]')).toBeNull()
  })

  it('only the lines in view: a small view, a few lines; zoomed far out, the bays too close are left out', () => {
    act(() => useApp.getState().apply((p) => actions.setGrid(p, square)))
    const { rerender } = render(
      <svg>
        <GridLayer px={0.1} viewBox="100 -150 30 30" />
      </svg>,
    )
    // x 100–130, y 120–150: lines at 108, 120 and 120, 132, 144
    expect(document.querySelector('[data-grid-lines]')!.getAttribute('data-grid-lines')).toBe('5')
    rerender(
      <svg>
        <GridLayer px={5} viewBox={VIEW} />
      </svg>,
    )
    expect(document.querySelector('[data-layer="grid"]')).toBeNull()
  })
})

describe('the Grid tool', () => {
  it('the origin dragged moves it (Shift: free), the handle turns it (Shift: 15°), each one undo step', () => {
    act(() => useApp.getState().apply((p) => actions.setGrid(p, square)))
    act(() => take('grid'))
    const toWorld = (e: { clientX: number; clientY: number }) => ({ x: e.clientX, y: e.clientY })
    render(
      <svg>
        <GridToolLayer camera={{ scale: 1, viewBox: '0 -300 500 300', toWorld }} />
      </svg>,
    )
    const origin = document.querySelector('[data-handle="grid-move"]')!
    fireEvent.pointerDown(origin, { button: 0, pointerId: 1, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(origin, { pointerId: 1, clientX: 5, clientY: 2, shiftKey: true })
    fireEvent.pointerUp(origin, { pointerId: 1, clientX: 5, clientY: 2 })
    expect(gridOf(project())!.origin).toEqual({ x: 5, y: 2 })
    // the handle stands along the grid's x: turned a quarter round the origin, with Shift onto 15° steps
    const turn = document.querySelector('[data-handle="grid-turn"]')!
    const at = toPlan(gridOf(project())!, { x: 60, y: 0 })
    fireEvent.pointerDown(turn, { button: 0, pointerId: 2, clientX: at.x, clientY: at.y })
    fireEvent.pointerMove(turn, { pointerId: 2, clientX: 5 + 2, clientY: 2 + 60, shiftKey: true })
    fireEvent.pointerUp(turn, { pointerId: 2, clientX: 5 + 2, clientY: 2 + 60 })
    expect(gridOf(project())!.angle).toBe(90)
    act(() => useApp.getState().undo())
    expect(gridOf(project())!.angle).toBe(0)
  })

  it('both handles snap (a mass’s corner, Ortho from the origin); a double-click or Restore original puts it back on the site', () => {
    act(() => useApp.getState().apply((p) => actions.setGrid(p, square)))
    act(() => take('grid'))
    act(() => useSnapSettings.setState((s) => ({ settings: { ...s.settings, on: true, ortho: false, grid: false, kinds: { ...s.settings.kinds, endpoint: true } } })))
    const toWorld = (e: { clientX: number; clientY: number }) => ({ x: e.clientX, y: e.clientY })
    render(
      <>
        <MenuHost />
        <svg>
          <GridToolLayer camera={{ scale: 1, viewBox: '0 -300 500 300', toWorld }} />
        </svg>
      </>,
    )
    // the origin dropped near a mass's corner lands on it
    const corner = Object.values(useApp.getState().derived.masses)[0].polygon[0]
    const origin = document.querySelector('[data-handle="grid-move"]')!
    fireEvent.pointerDown(origin, { button: 0, pointerId: 1, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(origin, { pointerId: 1, clientX: corner.x + 0.6, clientY: corner.y - 0.4 })
    expect(document.querySelector('[data-snap]')).not.toBeNull()
    fireEvent.pointerUp(origin, { pointerId: 1, clientX: corner.x + 0.6, clientY: corner.y - 0.4 })
    expect(gridOf(project())!.origin.x).toBeCloseTo(corner.x, 2)
    expect(gridOf(project())!.origin.y).toBeCloseTo(corner.y, 2)
    // Ortho: the turning handle held to the axes through the origin
    act(() => useSnapSettings.setState((s) => ({ settings: { ...s.settings, on: false, ortho: true } })))
    const turn = document.querySelector('[data-handle="grid-turn"]')!
    const at = toPlan(gridOf(project())!, { x: 60, y: 0 })
    fireEvent.pointerDown(turn, { button: 0, pointerId: 2, clientX: at.x, clientY: at.y })
    fireEvent.pointerMove(turn, { pointerId: 2, clientX: corner.x + 5, clientY: corner.y + 60 })
    fireEvent.pointerUp(turn, { pointerId: 2, clientX: corner.x + 5, clientY: corner.y + 60 })
    expect(gridOf(project())!.angle).toBe(90)
    // a double-click: back along the site's main axis, from the buildable area's corner
    fireEvent.doubleClick(origin)
    const fit = fitGrid(project(), square)
    expect(gridOf(project())).toMatchObject({ origin: fit.origin, angle: fit.angle, x: 12, modules: 4 })
    // the right-click's Restore original does the same (the grid's menu of the one right-click menu: Restore original, Hide, Properties)
    act(() => useApp.getState().apply((p) => actions.updateGrid(p, p.options[0].id, { angle: 30 })))
    fireEvent.contextMenu(turn)
    fireEvent.click(screen.getByRole('menuitem', { name: /Restore original/ }))
    expect(gridOf(project())!.angle).toBe(fit.angle)
  })
})
