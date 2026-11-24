// What attracts a tool's point (Phase BE.10): the site's, as before, unless a plan provides its own through
// SnapSourceContext (the block plan: its columns, walls, module nodes and doors), with its own length format and grid.
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { derive } from '../../../../engine/derive.ts'
import { footprintContour } from '../../../../engine/geom/footprint.ts'
import { demoProject } from '../../../../state/demo.ts'
import { emptyHistory } from '../../../../state/history.ts'
import { useApp } from '../../../../state/store.ts'
import { useSnapTargets, useToolSnap } from '../../tools/common.tsx'
import { DEFAULT_SNAP } from '../kinds.ts'
import type { Targets } from '../move.ts'
import { useSnapSettings } from '../settings.ts'
import { SnapSourceContext, useLengthFormat, type SnapSource } from '../SnapSourceContext.tsx'
import { lengthText } from '../../tools/toolState.ts'

beforeEach(() => {
  localStorage.clear()
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), level: p.masses[0].levelId, option: p.options[0].id })
  useSnapSettings.setState({ settings: structuredClone(DEFAULT_SNAP) })
})

const own: Targets = { points: [{ p: { x: 1000, y: 1000 }, kind: 'endpoint', label: 'Column' }], walls: [], edges: [] }
const wrap = (source: SnapSource) => ({ children }: { children: ReactNode }) => <SnapSourceContext.Provider value={source}>{children}</SnapSourceContext.Provider>

describe('the site, without a source of its own (unchanged)', () => {
  it('snaps to a mass corner; the grid is the plan’s; metres to 0.1 m', () => {
    const corner = footprintContour(useApp.getState().project.masses[0].footprint).vertices[0]
    const { result } = renderHook(() => ({ snap: useToolSnap(10), targets: useSnapTargets(), format: useLengthFormat() }))
    expect(result.current.targets.points.length).toBeGreaterThan(4)
    const r = result.current.snap({ x: corner.x + 0.3, y: corner.y + 0.2 }, { shiftKey: false })
    expect(r).toMatchObject({ point: { x: corner.x, y: corner.y }, how: 'endpoint' })
    expect(result.current.format(12.345)).toBe(lengthText(12.345))
  })
})

describe('a plan that provides its own', () => {
  it('its targets alone, its format, and its grid where nothing else attracts', () => {
    const corner = footprintContour(useApp.getState().project.masses[0].footprint).vertices[0]
    const source: SnapSource = { targets: () => own, format: (m) => `${m} u`, grid: (q) => ({ x: Math.round(q.x / 5) * 5, y: Math.round(q.y / 5) * 5 }) }
    const { result } = renderHook(() => ({ snap: useToolSnap(10), targets: useSnapTargets(), format: useLengthFormat() }), { wrapper: wrap(source) })
    expect(result.current.targets).toBe(own)
    expect(result.current.snap({ x: 1000.3, y: 999.8 }, { shiftKey: false })).toMatchObject({ point: { x: 1000, y: 1000 }, how: 'endpoint' })
    // the site's corner no longer attracts: the source's grid takes it
    expect(result.current.snap({ x: corner.x + 0.3, y: corner.y + 0.2 }, { shiftKey: false }).how).toBe('grid')
    expect(result.current.snap({ x: 12.4, y: 3.1 }, { shiftKey: false }).point).toEqual({ x: 10, y: 5 })
    expect(result.current.format(3)).toBe('3 u')
  })
})
