import { act, render, screen, waitFor, within } from '@testing-library/react'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { actions } from '../../../state/actions/index.ts'
import { demoProject } from '../../../state/demo.ts'
import { createAppStore } from '../../../state/store.ts'
import { connectTraceChannel } from '../../../state/trace/channel.ts'
import { snapshot } from '../../../state/trace/tracer.ts'
import { StateGraph } from '../StateGraph.tsx'

// React Flow measures its pane; jsdom has no ResizeObserver
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

// the real app side: a traced store and the real channel (BroadcastChannel works between instances in one process)
const store = createAppStore(demoProject())
let disconnect = () => {}
afterAll(() => disconnect())

describe('StateGraph page', () => {
  it('maps the modules, connects to the app, and logs each store call with its data', async () => {
    render(<StateGraph />)
    expect(screen.getByText(/\d+ modules · \d+ imports/)).toBeInTheDocument() // the cards of src/modules/ say "modules · n lines" too
    expect(screen.getByRole('status')).toHaveTextContent('Waiting for the app')

    disconnect = connectTraceChannel(() => snapshot(store.getState()))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('App connected'))

    act(() => store.getState().apply((p) => actions.rotateMass(p, 'm2', 90)))
    const log = await screen.findByRole('list', { name: 'Events' })
    await waitFor(() => expect(within(log).getByText(/rotateMass · derive/)).toBeInTheDocument())
    // the detail of the event on display: the verb with its args, and what changed
    expect(screen.getByText('("m2", 90)')).toBeInTheDocument()
    expect(screen.getByText(/masses\.m2\.footprint/)).toBeInTheDocument()

    // the State tab shows the data the app sent after the call
    act(() => screen.getByRole('button', { name: 'State' }).click())
    await waitFor(() => expect(screen.getByText('1 undo · 0 redo')).toBeInTheDocument())
    expect(screen.getByText('Warehouse 2')).toBeInTheDocument()

    // the map's filters: a layer turned off stays off on the next visit
    act(() => screen.getByRole('button', { name: 'engine' }).click())
    expect(screen.getByRole('button', { name: 'engine' })).toHaveAttribute('aria-pressed', 'false')
    expect(JSON.parse(localStorage.getItem('gfit.state-graph.view')!)).toMatchObject({ hidden: ['engine'] })
  }, 20_000) // React Flow lays out every module: ~5 s when the whole suite runs at once
})
