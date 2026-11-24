// Streets that meet, one paving (Phase PE.1, task 8): the plan draws the union of every road shown as one path, the 3D and
// the CAD the same region, a hidden road leaves it, the axes are cut at a T, and a street's drawn line attracts.
import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { derive } from '../../../engine/derive.ts'
import { regionsArea } from '../../../engine/geom/boolean.ts'
import { joinedPaving } from '../../../engine/path/join.ts'
import { pavingRings } from '../../../io/planPaving.ts'
import { planOf } from '../../../io/exportPlan.ts'
import type { Project } from '../../../model/schema.ts'
import { addExistingRoad } from '../../../state/actions/circulation.ts'
import { drawStreet } from '../../../state/actions/streets.ts'
import { demoProject } from '../../../state/demo.ts'
import { emptyHistory } from '../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../state/store.ts'
import { useLayerView } from '../../layers/layerView.ts'
import { EXISTING_ROADS, STREETS } from '../../layers/keys.ts'
import { pavingOf } from '../../scene/Paving.tsx'
import { AccessLayer } from '../access/AccessLayer.tsx'
import { useAccess } from '../access/accessState.ts'
import { RoadsLayer } from '../circulation/RoadsLayer.tsx'
import { useRoads } from '../circulation/roadState.ts'
import { roadSources } from '../snap/sources.ts'
import { STILL_DRAG } from '../useDrag.ts'

let exId = ''
let project: Project
beforeEach(() => {
  localStorage.clear()
  const d = demoProject({ streets: false })
  const e = addExistingRoad({ ...d, site: { ...d.site, existingRoads: [] } }, [{ x: 20, y: 150 }, { x: 420, y: 150 }], 10)!
  exId = e.id
  // a street T-joined to the existing one, ending on its centre line
  project = drawStreet(e.project, 'o1', [{ x: 220, y: 40 }, { x: 220, y: 150 }])!.project
  useApp.setState({ project, derived: derive(project, 'o1'), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
  useLayerView.setState({ hidden: [], onTop: [] })
  useRoads.getState().pick(null)
  useAccess.getState().pick(null)
})

const mount = () =>
  render(
    <svg>
      <AccessLayer px={1} drag={STILL_DRAG} interactive />
      <RoadsLayer px={1} interactive drag={STILL_DRAG} />
    </svg>,
  )
const roads = () => useApp.getState().derived.circulation.roads
const q = (s: string) => document.querySelectorAll<SVGElement>(s)
const hide = (...keys: string[]) => act(() => useLayerView.getState().setHidden(keys, true))

describe('one paving on the plan', () => {
  it('a street T-joined to an existing street is one [data-paving] path, no paving stroke per road', () => {
    mount()
    expect(q('[data-paving]')).toHaveLength(1)
    expect(q('[data-paving]')[0].getAttribute('fill-rule')).toBe('evenodd')
    expect(q('[data-paving]')[0].getAttribute('fill')).toBe('var(--road)')
    // the strokes that remain are hit strokes (transparent), the axes and the ink
    const painted = [...q('[data-road], [data-existing-road] > path')].filter((p) => p.getAttribute('stroke') === 'var(--road)' || p.getAttribute('stroke') === 'var(--street)')
    expect(painted).toEqual([])
  })

  it('a hidden road leaves the union: no seam where it was', () => {
    mount()
    const before = q('[data-paving]')[0].getAttribute('d')!
    hide(EXISTING_ROADS)
    const after = q('[data-paving]')[0].getAttribute('d')!
    expect(after).not.toBe(before)
    expect(q('[data-existing-road]')).toHaveLength(0)
    const street = roads().find((r) => r.kind === 'street')!
    expect(after.split('M').length).toBe(2) // one ring, no hole left by the one gone
    expect(street).toBeDefined()
    hide(STREETS)
    expect(q('[data-paving]')).toHaveLength(0)
  })

  it('the picked street’s ink stands under the paving, and a press on either road picks it', () => {
    const street = roads().find((r) => r.kind === 'street')!
    act(() => useRoads.getState().pick(street.street!))
    mount()
    const all = [...q('[data-layer="roads"] > *')]
    const ink = all.findIndex((n) => n.getAttribute('stroke') === 'var(--ink)')
    const paving = all.findIndex((n) => n.hasAttribute('data-paving'))
    expect(ink).toBeGreaterThanOrEqual(0)
    expect(ink).toBeLessThan(paving)
    expect(all[ink].getAttribute('stroke-linecap')).toBe('butt')
    act(() => useRoads.getState().pick(null))
    // the street answers through its own hit stroke (transparent, over the paving), and so does the existing street (Phase PE.2 task 12: the road layer's, its press is `existingPick.test.tsx`)
    expect(q(`[data-road="${street.id}"]`)[0].getAttribute('stroke')).toBe('transparent')
    expect(q('[data-road]')).toHaveLength(2)
    const site = q(`[data-existing-road="${exId}"] path`)[0]
    expect(site.getAttribute('data-road-kind')).toBe('existing')
    expect(site.getAttribute('data-street-id')).toBe(`existing:${exId}`)
    expect(site.getAttribute('stroke')).toBe('transparent')
    // a street that ends on it answers first: its hit stroke comes later in the layer
    expect(site.compareDocumentPosition(q(`[data-road="${street.id}"]`)[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // the paving itself never takes the pointer
    expect(q('[data-paving]')[0].getAttribute('pointer-events')).toBe('none')
  })

  it('the existing street’s axis is dash-dot, the street’s dashed and cut at the T', () => {
    mount()
    const axes = [...q('[data-axis]')]
    const dash = (k: string) => axes.filter((a) => a.getAttribute('stroke-dasharray') === k)
    expect(dash('10 4 2 4')).toHaveLength(1)
    const streetAxes = dash('10 6')
    expect(streetAxes).toHaveLength(1)
    // the street runs from y 40 to 150; its axis ends at the main strip's edge, y 145 (the plan's y is negated)
    const ys = streetAxes[0].getAttribute('d')!.match(/-?[\d.]+/g)!.map(Number).filter((_, i) => i % 2 === 1)
    expect(Math.max(...ys.map((y) => -y))).toBeLessThan(145.5)
    expect(Math.min(...ys.map((y) => -y))).toBeGreaterThan(39.9)
    expect(Math.min(...ys)).toBeLessThan(-39.9)
    expect(Math.max(...ys)).toBeGreaterThan(-145.5)
  })

  it('the lane lines (Phase PE.2): one dashed path for each road with two lanes or more, under the axes, the street’s cut at the T like its axis', () => {
    mount()
    const withLines = roads().filter((r) => (r.lanes?.length ?? 0) >= 2)
    expect(withLines.length).toBeGreaterThanOrEqual(2)
    expect([...q('[data-lane-lines]')].map((e) => e.getAttribute('data-lane-lines')).sort()).toEqual(withLines.map((r) => r.id).sort())
    const street = roads().find((r) => r.kind === 'street')!
    const own = q(`[data-lane-lines="${street.id}"]`)[0]
    expect(own.getAttribute('stroke')).toBe('var(--road-lane)')
    // the street runs from y 40 to 150 and ends on the main strip: its lines stop at the strip's edge, y 145, as its axis does
    const ys = own.getAttribute('d')!.match(/-?[\d.]+/g)!.map(Number).filter((_, i) => i % 2 === 1).map((y) => -y)
    expect(Math.max(...ys)).toBeLessThan(145.5)
    expect(Math.min(...ys)).toBeGreaterThan(39.9)
    const axis = q('[data-axis]')[0]
    expect(own.compareDocumentPosition(axis) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('the existing street’s paving and axis are no longer the access layer’s', () => {
    render(
      <svg>
        <AccessLayer px={1} drag={STILL_DRAG} interactive />
      </svg>,
    )
    expect(q('[data-existing-road]')).toHaveLength(0)
    expect(q('[data-paving]')).toHaveLength(0)
  })

  it('the roads layer draws the existing street: its hit stroke, in the one paving, with no `--street` paint', () => {
    mount()
    expect(q('[data-layer="roads"] [data-existing-road]')).toHaveLength(1)
    expect(q('[data-layer="access"] [data-existing-road]')).toHaveLength(0)
    expect(q('[stroke="var(--street)"]')).toHaveLength(0)
  })
})

describe('the 3D and the CAD', () => {
  it('pavingOf and pavingRings give one region for the same project', () => {
    const c = useApp.getState().derived.circulation
    const byHand = pavingOf(c).byHand
    expect(byHand).toHaveLength(1)
    const rings = pavingRings({ roads: c.roads.map((r) => ({ points: r.points, width: r.width, radius: r.radius })), areas: [] })
    expect(rings.filter((r) => r.points.length >= 3).length).toBeGreaterThanOrEqual(1)
    const outer = joinedPaving(c.roads.map((r) => ({ points: r.points, width: r.width, radius: r.radius })))
    expect(outer).toHaveLength(1)
    expect(Math.abs(regionsArea(byHand) - regionsArea(outer))).toBeLessThan(1e-6)
  })

  it('a hidden existing street leaves the 3D’s paving', () => {
    const c = useApp.getState().derived.circulation
    const whole = regionsArea(pavingOf(c).byHand)
    const without = regionsArea(pavingOf(c, new Set([EXISTING_ROADS])).byHand)
    expect(without).toBeLessThan(whole)
  })

  it('the CAD’s existing streets come by stretch: one centre line per run of equal stretches', () => {
    const d = demoProject({ streets: false })
    const e = addExistingRoad({ ...d, site: { ...d.site, existingRoads: [] } }, [{ x: 20, y: 150 }, { x: 220, y: 150 }, { x: 420, y: 150 }], 10)!.project
    const [r] = e.site.existingRoads!
    const uneven = { ...e, site: { ...e.site, existingRoads: [{ ...r, stretches: [{ left: 3, right: 3 }, { left: 0, right: 9 }] }] } }
    const runs = derive(uneven, 'o1').circulation.roads.filter((x) => x.kind === 'existing')
    expect(runs).toHaveLength(2)
    const centres = planOf(uneven, derive(uneven, 'o1'), { threeD: false }).entities.filter((x) => x.layer === 'C-ROAD-EXST')
    expect(centres).toHaveLength(2)
  })
})

describe('snap', () => {
  it('a one-sided street’s drawn line is a source (street drawn line)', () => {
    const d = demoProject({ streets: false })
    const p = drawStreet(d, 'o1', [{ x: 50, y: 50 }, { x: 250, y: 50 }], undefined, undefined, undefined, { side: 'left' })!.project
    const derived = derive(p, 'o1')
    const road = derived.circulation.roads.find((r) => r.kind === 'street')!
    const sources = roadSources(derived)
    const drawn = sources.filter((s) => s.label === 'street drawn line')
    expect(drawn).toHaveLength(1)
    expect(drawn[0].contour.vertices.map((v) => [v.x, v.y])).toEqual(road.nodePoints!.map((v) => [v.x, v.y]))
  })

  it('a centred street adds none: its drawn line is its centre line', () => {
    const derived = derive(project, 'o1')
    expect(roadSources(derived).filter((s) => s.label === 'street drawn line')).toEqual([])
  })

  it('a centred street with bends adds none either: its rounded centre line is not what is compared', () => {
    const d = demoProject({ streets: false })
    const p = drawStreet(d, 'o1', [{ x: 50, y: 50 }, { x: 250, y: 50 }, { x: 250, y: 150 }, { x: 150, y: 220 }], undefined, undefined, undefined, { side: 'centre' })!.project
    const road = derive(p, 'o1').circulation.roads.find((r) => r.kind === 'street')!
    // the bends are rounded: its centre line has more points than its nodes
    expect(road.points.length).toBeGreaterThan(road.nodePoints!.length)
    expect(roadSources(derive(p, 'o1')).filter((s) => s.label === 'street drawn line')).toEqual([])
  })
})
