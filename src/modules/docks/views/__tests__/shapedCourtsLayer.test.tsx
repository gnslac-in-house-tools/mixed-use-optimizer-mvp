// The site's courts layer draws a shaped court as its shapes (Phase D.3, task 5): one dashed path a docked wall, a sub-path to each court of it, the
// corners the shapes have (a chamfer's two), the warned ones too; a wall with no shape is the rectangle it was.
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { derive } from '../../../../engine/derive.ts'
import { emptyHistory } from '../../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../../state/store.ts'
import { pathOf } from '../../../../views/plan/camera.ts'
import { CourtsLayer } from '../DocksLayer.tsx'
import { shapedDocks, shapedSite } from '../../__tests__/shapedCourtFixture.ts'

function show(p: ReturnType<typeof shapedSite>['p'], optionId: string, levelId: string) {
  useApp.setState({ project: p, derived: derive(p, optionId), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: levelId, showAll: false, option: optionId })
}

beforeEach(() => localStorage.clear())

describe('CourtsLayer reads the shapes', () => {
  it('a wall with two courts: one path of two sub-paths, the chamfered corner’s two points in it; the rectangle is not drawn', () => {
    const s = shapedSite()
    show(s.p, s.optionId, s.building.levels[0].id)
    const { split, single } = shapedDocks(s.p, s.optionId, s.hall.id)
    const { container } = render(<svg><CourtsLayer approaches={false} /></svg>)
    const path = container.querySelector(`[data-court="${s.hall.id}:${split.wall}"]`)!
    expect(path.getAttribute('d')).toBe(pathOf(split.shapes!))
    expect((path.getAttribute('d')!.match(/M/g) ?? []).length).toBe(2)
    // the first court's chamfer: five corners, not four
    expect(split.shapes![0]).toHaveLength(5)
    expect(path.getAttribute('d')).not.toBe(pathOf([split.court]))
    const one = container.querySelector(`[data-court="${s.hall.id}:${single.wall}"]`)!
    expect(one.getAttribute('d')).toBe(pathOf(single.shapes!))
  })

  it('a court without a shape is its rectangle, as before', () => {
    const s = shapedSite([{ edge: 'e1', depth: 24 }])
    show(s.p, s.optionId, s.building.levels[0].id)
    const { container } = render(<svg><CourtsLayer approaches={false} /></svg>)
    const mine = derive(s.p, s.optionId).circulation.docks.filter((k) => k.massId === s.hall.id)
    expect(mine.length).toBeGreaterThan(0)
    for (const k of mine) {
      expect(k.shapes).toBeUndefined()
      expect(container.querySelector(`[data-court="${s.hall.id}:${k.wall}"]`)!.getAttribute('d')).toBe(pathOf([k.court]))
    }
  })
})
