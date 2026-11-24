// The Site step's Draw and Place (Phase 5.5, Decision "Site step layout"): Draw makes the boundary corner by corner;
// Place drags and turns the map, which changes the georeference, not the drawing, one undo step a drag; one tool at a
// time with the access tools. Heights (Phase E.2b) needs the ground: its bar says how many contours have no height. jsdom has no layout: the plan uses UNMEASURED_SIZE and `at` turns metres into pixels.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Point, Project, SiteMap } from '../../model/schema.ts'
import { App } from '../../App.tsx'
import { derive } from '../../engine/derive.ts'
import { contourToPolygon } from '../../engine/geom/contour.ts'
import { area } from '../../engine/geom/polygon.ts'
import { toLatLon, toPlan } from '../../engine/geo/local.ts'
import { setGeo, setMap, setTerrain } from '../../state/actions/site.ts'
import { demoProject } from '../../state/demo.ts'
import { emptyHistory } from '../../state/history.ts'
import { NO_SELECTION, useApp } from '../../state/store.ts'
import { runCommand, commandOf } from '../commands/index.ts'
import { useGraph } from '../graph/graphState.ts'
import { useToast } from '../layout/toast.ts'
import { useUi } from '../layout/ui.ts'
import { useAccess } from '../plan/access/accessState.ts'
import { fit, UNMEASURED_SIZE } from '../plan/camera.ts'
import { useMapView } from '../plan/site/mapView.ts'
import { useSiteTool } from '../plan/site/siteTools.ts'
import { letGo, take } from '../tools/hand.ts'

vi.mock('../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

/** The demo without its access, so its boundary frames the plan as in access.test.tsx. */
const bareDemo = (): Project => {
  const p = demoProject()
  return { ...p, site: { boundary: p.site.boundary, rules: p.site.rules } }
}
const v = fit({ minX: 0, minY: 0, maxX: 440, maxY: 280 }, UNMEASURED_SIZE)
const at = (q: Point, extra: object = {}) => ({
  clientX: (q.x - v.cx) * v.scale + UNMEASURED_SIZE.w / 2,
  clientY: UNMEASURED_SIZE.h / 2 - (q.y - v.cy) * v.scale,
  button: 0,
  pointerId: 1,
  ...extra,
})
const capture = () => document.querySelector('[data-capture]')!
const s = () => useApp.getState()
const left = () => screen.getByRole('complementary', { name: 'Layers and properties' })
// Draw boundary and Place map are the Site menu's commands (no button of the strip's): taken as the menu takes them
const draw = () => act(() => void runCommand('site.draw'))
const place = () => act(() => void runCommand('site.place-map'))
const click = (q: Point) => {
  fireEvent.pointerDown(capture(), at(q, { shiftKey: true }))
  fireEvent.pointerUp(capture(), at(q, { shiftKey: true }))
}

function start(p: Project = bareDemo()) {
  useApp.setState({ project: p, derived: derive(p, 'o1'), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
  useUi.setState({ view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null, help: false })
  render(<App />)
}

/** A located demo with a map round (220, 140), the site's middle. */
function located(): Project {
  const geo = { lat: 20.6597, lon: -103.3496, north: 0 }
  const c = toLatLon(geo, { x: 220, y: 140 })
  const map: SiteMap = { source: 'street', lat: c.lat, lon: c.lon, zoom: 18, image: 'data:image/jpeg;base64,AAAA', width: 600, height: 600, attribution: '© OpenStreetMap contributors' }
  return setMap(setGeo(bareDemo(), geo), map)
}

beforeEach(() => {
  localStorage.clear()
  useGraph.setState({ graph: false, rule: null, relation: null })
  letGo()
  useAccess.setState({ picked: null })
  letGo()
  useMapView.setState({ opacity: 0.8, busy: false, error: null })
  useToast.setState({ toast: null, confirmation: null })
})

describe('Draw', () => {
  it('corner by corner; a click on the first closes it: the new boundary, one undo step', () => {
    start()
    draw()
    expect(useSiteTool.getState().tool).toBe('draw')
    click({ x: 50, y: 50 })
    click({ x: 250, y: 50 })
    click({ x: 250, y: 150 })
    click({ x: 50, y: 150 })
    click({ x: 50, y: 50 })
    const b = s().project.site.boundary!
    expect(area(contourToPolygon(b))).toBeCloseTo(20000, 0)
    expect(s().project.site.source).toBe('Drawn')
    expect(useSiteTool.getState().tool).toBeNull()
    s().undo()
    expect(area(contourToPolygon(s().project.site.boundary!))).toBeGreaterThan(100000)
  })

  it('an outline that crosses itself is refused, and says why', () => {
    start()
    draw()
    click({ x: 50, y: 50 })
    click({ x: 250, y: 150 })
    click({ x: 250, y: 50 })
    click({ x: 50, y: 150 })
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(useToast.getState().toast?.text).toMatch(/must not cross itself/)
    expect(s().project.site.source).toBeUndefined()
  })

  it('one tool at a time with the access tools', () => {
    start()
    draw()
    act(() => take('gate'))
    expect(useSiteTool.getState().tool).toBeNull()
    draw()
    expect(useAccess.getState().tool).toBeNull()
  })
})

describe('Place', () => {
  it('needs a map', () => {
    start()
    expect(commandOf('site.place-map')!.enabled?.()).toBe('No map under the plan yet')
    place()
    expect(useSiteTool.getState().tool).toBeNull()
  })

  it('a drag of the map moves the Earth under the plan, one undo step; the drawing stays', () => {
    start(located())
    const boundary = s().project.site.boundary
    const here = { lat: 20.6597, lon: -103.3496 }
    const before = toPlan(s().project.site.geo!, here)
    place()
    const body = document.querySelector('[data-handle="map-move"]')!
    fireEvent.pointerDown(body, at({ x: 200, y: 100 }))
    fireEvent.pointerMove(body, at({ x: 230, y: 90 }))
    fireEvent.pointerUp(body, at({ x: 230, y: 90 }))
    const after = toPlan(s().project.site.geo!, here)
    expect(after.x - before.x).toBeCloseTo(30, 0)
    expect(after.y - before.y).toBeCloseTo(-10, 0)
    expect(s().project.site.boundary).toBe(boundary)
    expect(s().history.past).toHaveLength(1)
  })

  it('its handle turns it round its centre; Shift in steps of 15°; Escape cancels a drag', () => {
    start(located())
    place()
    const handle = document.querySelector('[data-handle="map-turn"]')!
    // from straight above the centre (220, 140) to its left: a quarter turn, counter-clockwise
    fireEvent.pointerDown(handle, at({ x: 220, y: 240 }))
    fireEvent.pointerMove(handle, at({ x: 120, y: 147 }, { shiftKey: true }))
    fireEvent.pointerUp(handle, at({ x: 120, y: 147 }, { shiftKey: true }))
    expect(s().project.site.geo!.north).toBeCloseTo(90, 6)
    fireEvent.pointerDown(handle, at({ x: 220, y: 240 }))
    fireEvent.pointerMove(handle, at({ x: 300, y: 200 }))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(s().project.site.geo!.north).toBeCloseTo(90, 6)
    expect(useSiteTool.getState().tool).toBe('place')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(useSiteTool.getState().tool).toBeNull()
  })
})

describe('Heights', () => {
  it('hidden from Site’s tools (`ui:tool.heights`, spec "The panel"); its mode still works: its bar says how many have no height; Escape leaves it', () => {
    const ground = { contours: [0, 1, 2].map((k) => ({ points: [{ x: 0, y: 100 + 8 * k }, { x: 400, y: 100 + 8 * k }] })), points: [] }
    start()
    expect(within(left()).queryByRole('group', { name: 'Terrain tools' })).toBeNull()
    act(() => s().apply((p) => setTerrain(p, ground)))
    expect(within(left()).queryByRole('button', { name: 'Heights' })).toBeNull()
    act(() => take('heights'))
    expect(useSiteTool.getState().tool).toBe('heights')
    expect(screen.getByRole('toolbar', { name: 'Heights' }).textContent).toMatch(/3 without one/)
    expect(document.querySelectorAll('[data-heights] [data-contour]')).toHaveLength(3)
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' })
    })
    expect(useSiteTool.getState().tool).toBeNull()
    expect(screen.queryByRole('toolbar', { name: 'Heights' })).toBeNull()
  })
})
