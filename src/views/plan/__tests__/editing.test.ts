// The corner drag of the shape engine (editing/shape/drags.ts) against the app's store (the demo project), as the plan runs them.
import { afterEach, describe, expect, it } from 'vitest'
import type { PointerEvent } from 'react'
import { footprintContour } from '../../../engine/geom/footprint.ts'
import { useApp } from '../../../state/store.ts'
import { startCorner } from '../../editing/shape/drags.ts'
import { DEFAULT_SNAP } from '../snap/kinds.ts'
import { useSnapSettings } from '../snap/settings.ts'

const press = {} as PointerEvent<SVGElement>
const corner = (i: number) => {
  const m = useApp.getState().project.masses.find((x) => x.id === 'm1')!
  return footprintContour(m.footprint).vertices[i]
}

afterEach(() => {
  useApp.getState().cancel()
  useSnapSettings.setState({ settings: DEFAULT_SNAP })
})

// the demo stands on its grid (Decision "Grid always"), whose module nodes come before ortho and tracking: F9 off here,
// so these are ortho's and tracking's alone (the modules' are onGrid.test.tsx's)
const NO_GRID_SNAP = { ...DEFAULT_SNAP, grid: false }

describe('corner drag (F9 off)', () => {
  it('with ortho, the bottom-right corner of Warehouse 1 goes straight up (it used to stay level with its neighbour)', () => {
    useSnapSettings.setState({ settings: { ...NO_GRID_SNAP, ortho: true } })
    expect(corner(1)).toMatchObject({ x: 200, y: 70 })
    const move = startCorner({ kind: 'mass', id: 'm1' }, 1, 2)(press, { x: 200, y: 70 })!
    const r = move({ x: 3, y: 20 }, { shiftKey: false }) // mostly up, with a little drift
    expect(r.mark?.label).toBe('Ortho')
    expect(corner(1)).toMatchObject({ x: 200, y: 90 })
  })

  it('without ortho, tracking still holds it on the vertical through the top-right corner; without both, the drift stays', () => {
    useSnapSettings.setState({ settings: NO_GRID_SNAP })
    const move = startCorner({ kind: 'mass', id: 'm1' }, 1, 2)(press, { x: 200, y: 70 })!
    expect(move({ x: 3, y: 20 }, { shiftKey: false }).mark?.lines?.length).toBeGreaterThan(0)
    expect(corner(1)).toMatchObject({ x: 200, y: 90 })
    useApp.getState().cancel()
    useSnapSettings.setState({ settings: { ...NO_GRID_SNAP, align: false } })
    const free = startCorner({ kind: 'mass', id: 'm1' }, 1, 2)(press, { x: 200, y: 70 })!
    free({ x: 3, y: 20 }, { shiftKey: false })
    expect(corner(1)).toMatchObject({ x: 203, y: 90 }) // where the pointer took it
  })
})
