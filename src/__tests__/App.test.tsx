import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from '../App.tsx'
import { useApp } from '../state/store.ts'
import { fit, UNMEASURED_SIZE } from '../views/plan/camera.ts'

// Smoke test: the whole chain (store → derive → views) renders the demo project.
describe('App shell', () => {
  it('renders the frame: top bar, Parameters, viewport and Summary', () => {
    render(<App />)
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Layers and properties' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Viewport' })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Summary' })).toBeInTheDocument()
  })

  it('draws the demo masses on the plan and shows its metrics', () => {
    const { container } = render(<App />)
    expect(container.querySelectorAll('[data-mass]')).toHaveLength(3)
    expect(screen.getByText('Warehouse 1')).toBeInTheDocument()
    // the industrial brief's example rules: the demo's office stands 40 m from its warehouse (a warning, on purpose),
    // with its chip on the plan
    expect(screen.getAllByText(/Office must be adjacent to Warehouse/).length).toBeGreaterThan(0)
    expect(container.querySelector('[data-issue-marker="pair:m1|m3"]')).toBeInTheDocument()
  })

  it('a selected mass shows its handles; double-clicking a wall adds a corner; Del removes the selected corner', () => {
    const { container } = render(<App />)
    act(() => useApp.getState().select('m3'))
    expect(container.querySelectorAll('[data-handle^="wall-"]')).toHaveLength(4)
    expect(container.querySelectorAll('[data-handle^="vertex-"]')).toHaveLength(4)
    // jsdom has no layout: the plan uses the default size, so the camera math says where (120, 190) is on screen,
    // the middle of Office 1's bottom wall
    const v = fit({ minX: 0, minY: 0, maxX: 440, maxY: 280 }, UNMEASURED_SIZE)
    const at = { clientX: (120 - v.cx) * v.scale + UNMEASURED_SIZE.w / 2, clientY: UNMEASURED_SIZE.h / 2 - (190 - v.cy) * v.scale }
    fireEvent.doubleClick(container.querySelector('[data-handle="line-0"]')!, at)
    const f = useApp.getState().project.masses.find((m) => m.id === 'm3')!.footprint
    expect(f.kind === 'contour' && f.contour.vertices).toHaveLength(5)
    const added = f.kind === 'contour' ? f.contour.vertices[1] : null
    expect(added?.x).toBeCloseTo(120, 6)
    expect(added?.y).toBeCloseTo(190, 6)
    expect(useApp.getState().selection).toEqual({ massId: 'm3', vertex: 1, massIds: ['m3'] })
    // the corner's fields are the rail's Properties (Decision "Properties on the rail")
    fireEvent.click(within(container.querySelector<HTMLElement>('[data-panel-tabs]')!).getByRole('tab', { name: 'Properties' }))
    expect(screen.getByText('Corner 2')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Delete' })
    const g = useApp.getState().project.masses.find((m) => m.id === 'm3')!.footprint
    expect(g.kind === 'contour' && g.contour.vertices).toHaveLength(4)
    expect(container.querySelectorAll('[data-handle^="vertex-"]')).toHaveLength(4)
  })

  it('shows the snap toolbar over the plan, snap on by default', () => {
    render(<App />)
    expect(screen.getByRole('toolbar', { name: 'Snap' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Snap' })).toHaveAttribute('aria-pressed', 'true')
  })
})
