// The Gate tool leaves out what an eye hides (Phase PE.2 review V3): a street segment, an existing street or the boundary that is hidden is not a place for a gate,
// neither under the press (its paving) nor as the nearest side.
import { act } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { derive } from '../../../../engine/derive.ts'
import { addExistingRoad } from '../../../../state/actions/circulation.ts'
import { drawStreet } from '../../../../state/actions/streets.ts'
import { demoProject } from '../../../../state/demo.ts'
import { emptyHistory } from '../../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../../state/store.ts'
import { BOUNDARY, EXISTING_ROADS, existingRoad, STREETS, street } from '../../../layers/keys.ts'
import { useLayerView } from '../../../layers/layerView.ts'
import { gateHostAt } from '../gateHosts.ts'

let seg = ''
let road = ''
beforeEach(() => {
  localStorage.clear()
  const base = demoProject({ streets: false, southStreet: false })
  const bare = { ...base, site: { ...base.site, gates: undefined } }
  // a street along y 235 (8 m: its sides y 239 and y 231) and an existing street along y 100 (10 m)
  const drawn = drawStreet(bare, 'o1', [{ x: 40, y: 235 }, { x: 200, y: 235 }], undefined, 8)!
  seg = drawn.segments[0]
  const e = addExistingRoad(drawn.project, [{ x: 20, y: 100 }, { x: 420, y: 100 }], 10)!
  road = e.id
  useApp.setState({ project: e.project, derived: derive(e.project, 'o1'), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
  useLayerView.setState({ hidden: [], onTop: [], folded: [] })
})

const hide = (...keys: string[]) => act(() => useLayerView.getState().setHidden(keys, true))

describe('the Gate tool and the eyes', () => {
  it('a press on a street’s paving, or near its side, takes it; with the segment hidden, or Streets, it takes nothing', () => {
    expect(gateHostAt({ x: 100, y: 237 }, 1)?.host).toEqual({ kind: 'street', id: `street:${seg}` })
    expect(gateHostAt({ x: 100, y: 245 }, 1)?.host.kind).toBe('street')
    hide(street(seg))
    expect(gateHostAt({ x: 100, y: 237 }, 1)).toBeNull()
    expect(gateHostAt({ x: 100, y: 245 }, 1)).toBeNull()
    act(() => useLayerView.getState().setHidden([street(seg)], false))
    hide(STREETS)
    expect(gateHostAt({ x: 100, y: 237 }, 1)).toBeNull()
    expect(gateHostAt({ x: 100, y: 245 }, 1)).toBeNull()
  })

  it('an existing street hidden (its own eye, or the kind’s) is no place either', () => {
    expect(gateHostAt({ x: 200, y: 102 }, 1)?.host).toEqual({ kind: 'existing-road', id: road })
    expect(gateHostAt({ x: 200, y: 110 }, 1)?.host.kind).toBe('existing-road')
    hide(existingRoad(road))
    expect(gateHostAt({ x: 200, y: 102 }, 1)).toBeNull()
    expect(gateHostAt({ x: 200, y: 110 }, 1)).toBeNull()
    act(() => useLayerView.getState().setHidden([existingRoad(road)], false))
    hide(EXISTING_ROADS)
    expect(gateHostAt({ x: 200, y: 102 }, 1)).toBeNull()
    expect(gateHostAt({ x: 200, y: 110 }, 1)).toBeNull()
  })

  it('the boundary hidden is no place: the nearest side skips it', () => {
    expect(gateHostAt({ x: 200, y: 3 }, 1)?.host).toEqual({ kind: 'boundary', id: 'site' })
    hide(BOUNDARY)
    expect(gateHostAt({ x: 200, y: 3 }, 1)).toBeNull()
  })

  it('a hidden street beside a shown boundary leaves the boundary its place', () => {
    hide(street(seg), existingRoad(road))
    expect(gateHostAt({ x: 200, y: 3 }, 1)?.host.kind).toBe('boundary')
  })
})
