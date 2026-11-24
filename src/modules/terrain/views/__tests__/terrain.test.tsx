// The ground on the plan and in the Site tab (Phase E.2, Decision "Terrain layout"): every fifth interval a major
// contour with its height written along it, never upside down; the slope in classes; Show's Terrain draws one or the
// other; the Terrain section says what the ground is, and Remove terrain is one undo step. Heights (E.2b): a click on
// a contour and its height typed, one undo step; two neighbours given and the others are counted.
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Terrain } from '../../../../model/schema.ts'
import { actions } from '../../../../state/actions/index.ts'
import { demoProject } from '../../../../state/demo.ts'
import { useApp } from '../../../../state/store.ts'
import { TerrainSection } from '../TerrainSection.tsx'
import { HeightsLayer, typedHeight } from '../HeightsLayer.tsx'
import { useSiteTool } from '../../../../views/plan/site/siteTools.ts'
import { contoursOf, heightText, slopePathsOf } from '../terrainDraw.ts'
import { SlopeLegend, TerrainLayer } from '../TerrainLayer.tsx'
import { useTerrainView } from '../terrainView.ts'
import { take } from '../../../../views/tools/hand.ts'

/** Eleven straight contours, 1200 to 1210 m, 8 m apart going north (12.5 %), drawn west to east. */
const slope = (): Terrain => ({
  contours: Array.from({ length: 11 }, (_, k) => ({
    points: [
      { x: 0, y: 8 * k },
      { x: 60, y: 8 * k },
    ],
    z: 1200 + k,
  })),
  points: [{ x: 30, y: 4, z: 1200.5 }],
  source: { file: 'topo.dxf', layers: ['CN', 'PUNTOS'] },
})

beforeEach(() => {
  useApp.getState().open(demoProject())
  useTerrainView.getState().setShow('contours')
})

describe('the drawing', () => {
  it('every fifth interval is major; a label sits halfway along, upright', () => {
    const t = slope()
    // drawn east to west: the label still reads left to right
    t.contours[5] = { ...t.contours[5], points: [...t.contours[5].points].reverse() }
    const cs = contoursOf(t)
    expect(cs.filter((c) => c.major).map((c) => c.z)).toEqual([1200, 1205, 1210])
    expect(cs[5].label).toEqual({ at: { x: 30, y: 40 }, angle: 0 })
    expect(contoursOf(t)).toBe(cs)
    expect(heightText(1205)).toBe('1,205')
    expect(heightText(1205.257)).toBe('1,205.26')
  })

  it('the slope in classes: a ground of 12.5 % is all in 10–15 %', () => {
    const paths = slopePathsOf(slope())!
    expect(paths.map((d) => d.length > 0)).toEqual([false, false, false, true, false])
  })
})

describe('the plan and the Site tab', () => {
  it('Show’s Terrain: the contours with the major heights, or the slope and its legend, or nothing', () => {
    useApp.getState().apply((p) => actions.setTerrain(p, slope()))
    const { rerender } = render(
      <>
        <svg>
          <TerrainLayer px={0.1} />
        </svg>
        <SlopeLegend />
      </>,
    )
    expect(document.querySelector('[data-terrain="contours"]')).not.toBeNull()
    expect([...document.querySelectorAll('[data-terrain] text')].map((t) => t.textContent)).toEqual(['1,200', '1,205', '1,210'])
    expect(screen.queryByLabelText('Slope')).toBeNull()
    useTerrainView.getState().setShow('slope')
    rerender(
      <>
        <svg>
          <TerrainLayer px={0.1} />
        </svg>
        <SlopeLegend />
      </>,
    )
    expect(document.querySelector('[data-terrain="slope"] [data-slope="3"]')).not.toBeNull()
    expect(screen.getByLabelText('Slope').textContent).toMatch(/10–15 %/)
    useTerrainView.getState().setShow('off')
    rerender(
      <svg>
        <TerrainLayer px={0.1} />
      </svg>,
    )
    expect(document.querySelector('[data-terrain]')).toBeNull()
  })

  it('the Terrain section: the file, its counts, the heights and the interval; Remove terrain is one undo step', () => {
    render(<TerrainSection />)
    expect(screen.getByText(/No ground yet/)).toBeTruthy()
    act(() => useApp.getState().apply((p) => actions.setTerrain(p, slope())))
    const t = useApp.getState().project.site.terrain
    const figures = screen.getByLabelText('Terrain figures').textContent
    expect(figures).toMatch(/Filetopo\.dxf/)
    expect(figures).toMatch(/Contours11/)
    expect(figures).toMatch(/Points1/)
    expect(figures).toMatch(/Heights1,200–1,210 m/)
    expect(figures).toMatch(/Interval1 m/)
    expect(screen.getByText(/11 from the file/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Remove terrain' }))
    expect(useApp.getState().project.site.terrain).toBeUndefined()
    expect(screen.getByText(/No ground yet/)).toBeTruthy()
    act(() => useApp.getState().undo())
    expect(useApp.getState().project.site.terrain).toBe(t)
  })
})

/** Five straight contours 8 m apart, drawn flat: their heights to be given. */
const flat = (): Terrain => ({
  contours: Array.from({ length: 5 }, (_, k) => ({
    points: [
      { x: 0, y: 8 * k },
      { x: 60, y: 8 * k },
    ],
  })),
  points: [],
})

describe('Heights', () => {
  const camera = { scale: 10, viewBox: '0 0 100 100', toWorld: () => ({ x: 30, y: 8 }) }
  const contour = (k: number) => document.querySelector(`[data-contour="${k}"]`)!
  const type = (k: number, text: string, key = 'Enter') => {
    fireEvent.click(contour(k).querySelectorAll('path')[1])
    const field = screen.getByLabelText('Contour height')
    fireEvent.change(field, { target: { value: text } })
    fireEvent.keyDown(field, { key })
  }
  const from = () => [0, 1, 2, 3, 4].map((k) => contour(k).getAttribute('data-from'))

  it('a typed height: a number, a decimal comma, or empty to take it back', () => {
    expect(typedHeight(' 1205.5 ')).toBe(1205.5)
    expect(typedHeight('1205,5')).toBe(1205.5)
    expect(typedHeight('')).toBeNull()
    expect(typedHeight('abc')).toBeUndefined()
  })

  it('two neighbours given, the others counted; each one undo step; empty takes it back; Escape leaves it', () => {
    act(() => useApp.getState().apply((p) => actions.setTerrain(p, flat())))
    take('heights')
    render(
      <svg>
        <HeightsLayer camera={camera} />
      </svg>,
    )
    expect(from()).toEqual(['none', 'none', 'none', 'none', 'none'])
    expect(contour(0).querySelector('text')?.textContent).toBe('?')
    type(1, '1201')
    expect(screen.queryByLabelText('Contour height')).toBeNull()
    type(2, '1202')
    expect(from()).toEqual(['counted', 'given', 'given', 'counted', 'counted'])
    expect([0, 1, 2, 3, 4].map((k) => contour(k).querySelector('text')?.textContent)).toEqual(['1,200', '1,201', '1,202', '1,203', '1,204'])
    // Escape: nothing changes
    type(3, '999', 'Escape')
    expect(contour(3).getAttribute('data-from')).toBe('counted')
    // empty: the given height taken back
    type(2, '')
    expect(contour(2).getAttribute('data-from')).not.toBe('given')
    act(() => useApp.getState().undo())
    expect(contour(2).getAttribute('data-from')).toBe('given')
    act(() => useApp.getState().undo())
    expect(from()).toEqual(['none', 'given', 'none', 'none', 'none'])
  })

  it('removed, the ground takes the tool with it', () => {
    act(() => useApp.getState().apply((p) => actions.setTerrain(p, flat())))
    take('heights')
    act(() => useApp.getState().apply((p) => actions.setTerrain(p, null)))
    expect(useSiteTool.getState().tool).toBeNull()
  })
})
