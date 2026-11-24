// The plan's drawings (Decision "Drawings move"): a layer's path is built once per layer object, so a move of one
// drawing rebuilds only the layers it moved, and a pick rebuilds none; a picked drawing marks what it carries, not its
// locked layers and parcels (they stay).
import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { contourFromPolygon } from '../../../../engine/geom/contour.ts'
import type { Project } from '../../../../model/schema.ts'
import { actions } from '../../../../state/actions/index.ts'
import { demoProject } from '../../../../state/demo.ts'
import { useApp } from '../../../../state/store.ts'
import { DrawingsLayer } from '../DrawingsLayer.tsx'
import { useDrawingPick } from '../drawingPick.ts'
import { drawingLayer as layerKey } from '../../../layers/keys.ts'
import { linesPath } from '../linesPath.ts'

vi.mock('../linesPath.ts', async (original) => {
  const real = await original<typeof import('../linesPath.ts')>()
  return { linesPath: vi.fn(real.linesPath) }
})
const built = vi.mocked(linesPath)

const line = (y: number) => ({ points: [{ x: 0, y }, { x: 10, y }] })
const project = (unlocked = false): Project => {
  const p = demoProject()
  return {
    ...p,
    site: {
      ...p.site,
      drawings: [
        { file: 'a.dxf', layers: [{ name: 'Walls', lines: [line(1)] }, { name: 'Axes', locked: true, lines: [line(2)] }] },
        { file: 'b.dxf', layers: [{ name: 'Trees', lines: [line(3)] }] },
      ],
      parcels: [{ name: 'P1', file: 'a.dxf', contour: contourFromPolygon([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }, { x: 0, y: 5 }]), ...(unlocked && { unlocked: true as const }) }],
    },
  }
}
const drawn = (c: Element, key: string) => c.querySelector(`[data-drawing-layer="${key}"]`)!

beforeEach(() => {
  localStorage.clear()
  useDrawingPick.setState({ picked: [] })
  useApp.getState().open(project())
  built.mockClear()
})

describe('the drawings’ paths', () => {
  it('a move of drawing a rebuilds a’s moved layer alone: b’s path and a’s locked layer are not built again', () => {
    const { container } = render(
      <svg>
        <DrawingsLayer px={1} />
      </svg>,
    )
    expect(built).toHaveBeenCalledTimes(3)
    const trees = drawn(container, layerKey('b.dxf', 'Trees')).getAttribute('d')
    built.mockClear()
    act(() => useApp.getState().preview((p) => actions.moveDrawings(p, [{ file: 'a.dxf' }], { x: 5, y: 0 }).project))
    expect(built).toHaveBeenCalledTimes(1)
    expect(built.mock.calls[0][0]).toBe(useApp.getState().project.site.drawings![0].layers[0].lines)
    expect(drawn(container, layerKey('b.dxf', 'Trees')).getAttribute('d')).toBe(trees)
    expect(drawn(container, layerKey('a.dxf', 'Walls')).getAttribute('d')).toContain('M5.00,-1.00')
    // another frame of the preview: the moved layer again, nothing else
    built.mockClear()
    act(() => useApp.getState().preview((p) => actions.moveDrawings(p, [{ file: 'a.dxf' }], { x: 6, y: 0 }).project))
    expect(built).toHaveBeenCalledTimes(1)
    act(() => useApp.getState().cancel())
  })

  it('a pick builds no path; a picked whole drawing marks what it carries, not its locked layer and parcels', () => {
    const { container } = render(
      <svg>
        <DrawingsLayer px={1} />
      </svg>,
    )
    built.mockClear()
    act(() => useDrawingPick.getState().pick({ file: 'a.dxf' }))
    expect(built).not.toHaveBeenCalled()
    expect(drawn(container, layerKey('a.dxf', 'Walls'))).toHaveAttribute('data-picked')
    expect(drawn(container, layerKey('a.dxf', 'Axes'))).not.toHaveAttribute('data-picked')
    expect(drawn(container, layerKey('b.dxf', 'Trees'))).not.toHaveAttribute('data-picked')
    expect(container.querySelector('[data-parcel="P1"] path')).not.toHaveAttribute('data-picked')
  })

  it('its parcels unlocked, they are marked with it', () => {
    useApp.getState().open(project(true))
    const { container } = render(
      <svg>
        <DrawingsLayer px={1} />
      </svg>,
    )
    act(() => useDrawingPick.getState().pick({ file: 'a.dxf' }))
    expect(container.querySelector('[data-parcel="P1"] path')).toHaveAttribute('data-picked')
  })
})
