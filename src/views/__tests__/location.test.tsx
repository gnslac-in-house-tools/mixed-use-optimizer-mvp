// The site's Location and map (Phase 5.4, Decision "Site step layout"; in Properties of the Site and Map rows of Layers since Phase AS.3):
// a pasted link locates the site and captures the map round it; the map lies under the plan where the georeference puts it; View ›
// Overlays › Map (and the Map row's eye) turns it off and on (the viewer's, not an undo step); the source captures it again; Remove map
// takes it away.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../App.tsx'
import type { MapSource, SiteMap } from '../../model/schema.ts'
import { derive } from '../../engine/derive.ts'
import { toPlan } from '../../engine/geo/local.ts'
import { siteCenter } from '../../engine/geo/site.ts'
import { demoProject } from '../../state/demo.ts'
import { emptyHistory } from '../../state/history.ts'
import { NO_SELECTION, useApp } from '../../state/store.ts'
import { useUi } from '../layout/ui.ts'
import { useMapView } from '../plan/site/mapView.ts'
import { MAP } from '../layers/keys.ts'
import { showLayer } from '../layers/show.ts'
import { overlayEnabled, overlayOn, toggleOverlay } from './overlays.ts'
import { isHidden, LAYERS_KEY } from '../layers/layerView.ts'
import { NO_COORDINATES, SHORT_LINK } from '../panels/LocationSection.tsx'

vi.mock('../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))
const capture = vi.hoisted(() => vi.fn())
vi.mock('../../io/map/tiles.ts', async (real) => ({ ...(await real<typeof import('../../io/map/tiles.ts')>()), captureMap: capture }))

const fake = (lat: number, lon: number, source: MapSource): SiteMap => ({
  source,
  lat,
  lon,
  zoom: 18,
  image: 'data:image/jpeg;base64,AAAA',
  width: 500,
  height: 497,
  attribution: source === 'street' ? '© OpenStreetMap contributors' : 'Tiles © Esri',
})

beforeEach(() => {
  localStorage.clear()
  capture.mockReset()
  capture.mockImplementation(async (lat: number, lon: number, source: MapSource) => fake(lat, lon, source))
  useMapView.setState({ opacity: 0.8, busy: false, error: null })
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p, 'o1'), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
  useUi.setState({ view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null })
})

const left = () => screen.getByRole('complementary', { name: 'Layers and properties' })
/** Location is in Properties of the Site row, open (Decision "Settings by what is picked"): the helper picks the row. */
const location = () => {
  if (!within(left()).queryByRole('region', { name: 'Location' })) act(() => showLayer('site'))
  return within(left()).getByRole('region', { name: 'Location' })
}
const paste = (text: string) => {
  const input = within(location()).getByRole('textbox', { name: 'Google Maps link or lat, lon' })
  fireEvent.change(input, { target: { value: text } })
  fireEvent.click(within(location()).getByRole('button', { name: 'Locate' }))
}

describe('Location', () => {
  it('is shown open in Properties of the Site row, with no fold button; nothing of it is in the panel until the row is picked', () => {
    render(<App />)
    expect(within(left()).queryByRole('textbox', { name: 'Google Maps link or lat, lon' })).toBeNull()
    location()
    expect(within(left()).getByRole('textbox', { name: 'Google Maps link or lat, lon' })).toBeInTheDocument()
    expect(within(left()).queryByRole('button', { name: /^(Open|Close) Location$/ })).toBeNull()
  })

  it('a pasted link puts that place at the site’s centre and captures the map round it', async () => {
    render(<App />)
    expect(overlayEnabled('map')).toBe(false)
    paste('https://www.google.com/maps/place/X/@20.6597,-103.3496,17z')
    const p = useApp.getState().project
    const at = toPlan(p.site.geo!, { lat: 20.6597, lon: -103.3496 })
    const c = siteCenter(p)
    expect(at.x).toBeCloseTo(c.x, 2)
    expect(at.y).toBeCloseTo(c.y, 2)
    await waitFor(() => expect(useApp.getState().project.site.map).toBeDefined())
    expect(capture).toHaveBeenCalledTimes(1)
    expect(capture.mock.calls[0][0]).toBeCloseTo(20.6597, 6)
    expect(capture.mock.calls[0][2]).toBe('street')
    expect(document.querySelector('[data-map-layer] image')).not.toBeNull()
    expect(screen.getByText('© OpenStreetMap contributors')).toBeInTheDocument()
    expect(within(location()).getByRole('textbox', { name: /Latitude/ })).toHaveValue('20.6597')
  })

  it('a short link or rubbish says why, and changes nothing', () => {
    render(<App />)
    paste('https://maps.app.goo.gl/abc')
    expect(within(location()).getByRole('alert')).toHaveTextContent(SHORT_LINK)
    paste('hello')
    expect(within(location()).getByRole('alert')).toHaveTextContent(NO_COORDINATES)
    expect(useApp.getState().project.site.geo).toBeUndefined()
  })

  it('View › Overlays › Map hides and shows it, as the viewer’s (no undo step); Satellite captures it again; Remove map', async () => {
    render(<App />)
    paste('20.6597, -103.3496')
    await waitFor(() => expect(useApp.getState().project.site.map).toBeDefined())
    const steps = useApp.getState().history.past.length
    expect(overlayOn('map')).toBe(true)
    toggleOverlay('map')
    expect(overlayOn('map')).toBe(false)
    expect(document.querySelector('[data-map-layer]')).toBeNull()
    expect(useApp.getState().history.past.length).toBe(steps)
    expect(isHidden(MAP)).toBe(true)
    expect(JSON.parse(localStorage.getItem(LAYERS_KEY)!)[useApp.getState().project.id].hidden).toEqual([MAP])
    expect(localStorage.getItem('gfit.map.visible')).toBeNull()
    toggleOverlay('map')
    expect(document.querySelector('[data-map-layer]')).not.toBeNull()
    fireEvent.click(within(location()).getByRole('button', { name: 'Satellite' }))
    await waitFor(() => expect(useApp.getState().project.site.map?.source).toBe('satellite'))
    fireEvent.click(within(location()).getByRole('button', { name: 'Remove map' }))
    expect(useApp.getState().project.site.map).toBeUndefined()
    expect(useApp.getState().project.site.geo).toBeDefined()
  })

  it('a capture that fails shows its error, and the site keeps its location', async () => {
    capture.mockRejectedValue(new Error('The map could not be captured (no connection, or the tile server refused)'))
    render(<App />)
    paste('20.6597, -103.3496')
    await waitFor(() => expect(within(location()).getByRole('alert')).toHaveTextContent('could not be captured'))
    expect(useApp.getState().project.site.geo).toBeDefined()
    expect(useApp.getState().project.site.map).toBeUndefined()
  })

  it('north is typed and turns the Earth round the site’s centre', () => {
    render(<App />)
    paste('20.6597, -103.3496')
    const north = within(location()).getByRole('textbox', { name: /North/ })
    fireEvent.change(north, { target: { value: '30' } })
    fireEvent.blur(north)
    const p = useApp.getState().project
    expect(p.site.geo!.north).toBeCloseTo(30, 9)
    const at = toPlan(p.site.geo!, { lat: 20.6597, lon: -103.3496 })
    expect(at.x).toBeCloseTo(siteCenter(p).x, 2)
    act(() => useApp.getState().undo())
    expect(useApp.getState().project.site.geo!.north).toBe(0)
  })
})
