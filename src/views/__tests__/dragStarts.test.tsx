// AS.6 (Decision "No text selected by a drag"): the pointerdown that starts a drag is cancelled (`beginDrag`), so the browser
// selects no text by it; a press that starts nothing is left alone. (fireEvent returns false when the event was cancelled.)
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { createRef } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../App.tsx'
import { derive } from '../../engine/derive.ts'
import { demoProject } from '../../state/demo.ts'
import { emptyHistory } from '../../state/history.ts'
import { NO_SELECTION, useApp } from '../../state/store.ts'
import { Divider } from '../controls/Divider.tsx'
import { useCompare } from '../compare/compareView.ts'
import { pickMenu } from './pickMenu.ts'
import { useUi } from '../layout/ui.ts'
import { useDrag, type Mover } from '../plan/useDrag.ts'
import { letGo } from '../tools/hand.ts'
import { useRoads } from '../plan/circulation/roadState.ts'
import { resetTyped, useTyped } from '../editing/dimension/typed.ts'

vi.mock('../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))
// the plan's unmeasured size, one object a test can resize: the lane lines take presses only where a lane is 24 px wide on the screen
const view = vi.hoisted(() => ({ size: { w: 800, h: 600 } }))
vi.mock('../plan/camera.ts', async (original) => ({ ...(await original<typeof import('../plan/camera.ts')>()), UNMEASURED_SIZE: view.size }))

beforeEach(() => {
  localStorage.clear()
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: NO_SELECTION })
  useUi.setState({
    dialog: null,
    view: 'plan',
    rail: 'layers',
    panels: { left: true, right: true },
    sheet: null,
    docks: { drafting: 'bottom' },
    stripDock: 'left',
    show: { kpis: true, drafting: true, tools: true },
    widths: { left: null, right: null },
  })
  useCompare.setState({ open: false, optionIds: [], mode: 'plan', plan: null, camera: null, framing: 0 })
  letGo()
})

function Handle(props: { mover: Mover | null }) {
  const drag = useDrag(() => ({ x: 0, y: 0 }))
  return (
    <svg>
      <rect data-testid="handle" width="10" height="10" {...drag.bind('h', () => props.mover)} />
    </svg>
  )
}

describe('a drag that starts cancels the pointerdown', () => {
  it('useDrag.bind: when `start` gives a mover; not when it gives none, nor for a right button', () => {
    const { rerender } = render(<Handle mover={Object.assign(() => ({ ok: true, mark: null }), {})} />)
    const h = screen.getByTestId('handle')
    expect(fireEvent.pointerDown(h, { button: 2, pointerId: 1 })).toBe(true)
    expect(fireEvent.pointerDown(h, { button: 0, pointerId: 1 })).toBe(false)
    fireEvent.pointerUp(h, { pointerId: 1 })
    rerender(<Handle mover={null} />)
    expect(fireEvent.pointerDown(screen.getByTestId('handle'), { button: 0, pointerId: 2 })).toBe(true)
  })

  it('Divider: the left button; a right or a middle button starts nothing', () => {
    const onChange = vi.fn()
    const container = createRef<HTMLDivElement>()
    render(
      <div ref={container}>
        <Divider between="columns" label="Split" title="t" container={container} fraction={0.5} reset={0.5} onChange={onChange} />
      </div>,
    )
    const d = screen.getByRole('separator', { name: 'Split' })
    expect(fireEvent.pointerDown(d, { button: 2, pointerId: 1 })).toBe(true)
    expect(fireEvent.pointerDown(d, { button: 1, pointerId: 1 })).toBe(true)
    container.current!.getBoundingClientRect = () => ({ left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100, x: 0, y: 0, toJSON: () => ({}) })
    fireEvent.pointerMove(d, { clientX: 70, clientY: 10, pointerId: 1 })
    expect(onChange).not.toHaveBeenCalled() // nothing was dragging
    expect(fireEvent.pointerDown(d, { button: 0, pointerId: 1 })).toBe(false)
    fireEvent.pointerMove(d, { clientX: 70, clientY: 10, pointerId: 1 })
    expect(onChange).toHaveBeenCalledWith(0.7)
  })

  it('PanelColumn: the width edge (left button only)', () => {
    render(<App />)
    const edge = screen.getByRole('separator', { name: 'Summary width' })
    expect(fireEvent.pointerDown(edge, { button: 2, pointerId: 1 })).toBe(true)
    expect(fireEvent.pointerDown(edge, { button: 0, pointerId: 1 })).toBe(false)
    fireEvent.pointerUp(edge, { pointerId: 1 })
  })

  it('PanelColumn: a sheet’s handle', () => {
    // a tablet: neither wide nor a phone, so the left column is a sheet over the plan
    vi.stubGlobal('matchMedia', (media: string) => ({ media, matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    try {
      render(<App />)
      pickMenu('View', 'Panels', 'Layers and properties panel')
      const grip = screen.getByRole('complementary', { name: 'Layers and properties' }).querySelector<HTMLElement>('[aria-hidden].touch-none')
      expect(grip).not.toBeNull()
      expect(fireEvent.pointerDown(grip!, { button: 2, pointerId: 1 })).toBe(true)
      expect(fireEvent.pointerDown(grip!, { button: 0, pointerId: 1 })).toBe(false)
      fireEvent.pointerUp(grip!, { pointerId: 1 })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('ToolStrip: the grip (left button only)', () => {
    render(<App />)
    const grip = within(screen.getByRole('toolbar', { name: 'Tools' })).getByRole('button', { name: 'Move the tools' })
    expect(fireEvent.pointerDown(grip, { button: 2, pointerId: 1 })).toBe(true)
    expect(fireEvent.pointerDown(grip, { button: 0, pointerId: 1 })).toBe(false)
    fireEvent.pointerUp(grip, { pointerId: 1 })
    act(() => undefined)
  })

  it('the plan background: a left or a middle press is cancelled, a right one is not', () => {
    render(<App />)
    const plan = screen.getByRole('img', { name: 'Site plan' })
    expect(fireEvent.pointerDown(plan, { button: 2, pointerId: 1 })).toBe(true)
    expect(fireEvent.pointerDown(plan, { button: 0, pointerId: 1 })).toBe(false)
    fireEvent.pointerUp(plan, { pointerId: 1 })
    expect(fireEvent.pointerDown(plan, { button: 1, pointerId: 1 })).toBe(false)
    fireEvent.pointerUp(plan, { pointerId: 1 })
  })

  it('the On edge views begin every drag with beginDrag: a press of a tool, a press on a picked element and a press on a pill', () => {
    const sources = import.meta.glob<string>(['/src/views/editing/edge/*.tsx'], { query: '?raw', import: 'default', eager: true })
    const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
    const text = code(sources['/src/views/editing/edge/EdgeHandles.tsx'])
    expect(text.match(/\bbeginDrag\(/g)?.length).toBe(3)
    expect(text).not.toMatch(/setPointerCapture/)
  })

  it('the path handles: a press on a node or a stretch’s diamond starts a drag and a typed dimension (Phase PE.1 task 10)', () => {
    render(<App />)
    const street = useApp.getState().derived.circulation.roads.find((r) => r.kind === 'street' && r.nodes)!
    act(() => useRoads.getState().pick(street.id))
    for (const sel of ['[data-path-node]', '[data-path-stretch]']) {
      const h = document.querySelector(sel)!
      expect(h).not.toBeNull()
      expect(fireEvent.pointerDown(h, { button: 2, pointerId: 1 })).toBe(true)
      expect(fireEvent.pointerDown(h, { button: 0, pointerId: 1 })).toBe(false)
      expect(useTyped.getState().cur?.phase).toBe('dragging')
      fireEvent.pointerUp(h, { pointerId: 1 })
      resetTyped()
    }
  })

  it('the path handles: a press on a lane line starts a drag and a typed dimension (Phase PE.2 task 4)', () => {
    Object.assign(view.size, { w: 8000, h: 6000 }) // 16 px per metre, the lanes wide enough for their lines
    render(<App />)
    const street = useApp.getState().derived.circulation.roads.find((r) => r.kind === 'street' && r.nodes)!
    act(() => useRoads.getState().pick(street.id))
    const h = document.querySelector('[data-path-line]')!
    expect(h).not.toBeNull()
    expect(fireEvent.pointerDown(h, { button: 2, pointerId: 1 })).toBe(true)
    expect(fireEvent.pointerDown(h, { button: 0, pointerId: 1 })).toBe(false)
    expect(useTyped.getState().cur?.phase).toBe('dragging')
    expect(useTyped.getState().cur?.what).toBe('Lane width')
    fireEvent.pointerUp(h, { pointerId: 1 })
    resetTyped()
    Object.assign(view.size, { w: 800, h: 600 })
  })

  it('no setPointerCapture outside beginDrag (comments aside)', () => {
    const sources = import.meta.glob<string>(['/src/**/*.{ts,tsx}', '!**/__tests__/**'], { query: '?raw', import: 'default', eager: true })
    const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
    const outside = Object.entries(sources)
      .filter(([path, text]) => path !== '/src/views/controls/beginDrag.ts' && /setPointerCapture/.test(code(text)))
      .map(([path]) => path)
    expect(outside).toEqual([])
    expect(/setPointerCapture/.test(code(sources['/src/views/controls/beginDrag.ts']))).toBe(true)
  })
})
