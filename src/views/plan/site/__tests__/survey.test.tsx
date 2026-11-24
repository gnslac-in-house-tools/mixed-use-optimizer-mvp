// The survey window (Phase E.1c, Decision "Site file survey"): a drawing or a table opens it; each layer says what it
// is, the boundary is picked on the plan, Import brings the boundary, its frame and the ground in one undo step;
// a setup is remembered only when asked, and the next file starts from it (or from the site's) by layer name; the
// window's rows draw their layer strong on the plan, and Escape lets it go.
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { contourToPolygon } from '../../../../engine/geom/contour.ts'
import { area } from '../../../../engine/geom/polygon.ts'
import { readSiteFile } from '../../../../io/site/siteFile.ts'
import { demoProject } from '../../../../state/demo.ts'
import { useApp } from '../../../../state/store.ts'
import { useToast } from '../../../layout/toast.ts'
import { ImportLayer } from '../ImportLayer.tsx'
import { useSiteImport, type SurveyImport } from '../importState.ts'
import { SurveyWindow } from '../SurveyWindow.tsx'
import { SETUPS_KEY } from '../surveySetups.ts'

/** An ASCII DXF of these entities, in metres. */
function dxf(entities: (string | number)[][]): string {
  const lines: (string | number)[] = [0, 'SECTION', 2, 'HEADER', 9, '$INSUNITS', 70, 6, 0, 'ENDSEC', 0, 'SECTION', 2, 'ENTITIES']
  for (const e of entities) lines.push(...e)
  lines.push(0, 'ENDSEC', 0, 'EOF')
  return lines.join('\n') + '\n'
}
function lw(layer: string, vs: [number, number][], closed = false, elevation?: number): (string | number)[] {
  const out: (string | number)[] = [0, 'LWPOLYLINE', 8, layer, 90, vs.length, 70, closed ? 1 : 0]
  if (elevation !== undefined) out.push(38, elevation)
  for (const [x, y] of vs) out.push(10, x, 20, y)
  return out
}
const point = (layer: string, x: number, y: number, z: number) => [0, 'POINT', 8, layer, 10, x, 20, y, 30, z]
const text = (layer: string, s: string) => [0, 'TEXT', 8, layer, 10, 0, 20, 0, 30, 0, 40, 2.5, 1, s]

/** A surveyor's file, mixed: a parcel, master and minor contours, points, height labels. */
const MIXED = dxf([
  lw('POLIGONAL', [[0, 0], [100, 0], [100, 60], [0, 60]], true),
  lw('CN_MAESTRAS', [[0, 10], [100, 10]], false, 1200),
  lw('CN_MAESTRAS', [[0, 50], [100, 50]], false, 1205),
  lw('CN_SECUND', [[0, 20], [100, 20]], false, 1201),
  point('PUNTOS', 50, 30, 1202.5),
  point('PUNTOS', 20, 40, 1203.7),
  text('COTAS', '1200'),
])

const bytes = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer
const begin = async (name: string, s: string) => useSiteImport.getState().begin(await readSiteFile(name, bytes(s)))
const pending = () => useSiteImport.getState().pending as SurveyImport
const site = () => useApp.getState().project.site

beforeEach(() => {
  localStorage.clear()
  useApp.getState().open(demoProject())
  useSiteImport.getState().cancel()
})

describe('the survey, imported', () => {
  it('a surveyor’s file: each layer guessed; Import brings the boundary, its frame and the ground in one undo step', async () => {
    const before = site()
    await begin('levantamiento.dxf', MIXED)
    expect(pending().kind).toBe('survey')
    expect(pending().choice).toMatchObject({ units: 'm', coordinates: { kind: 'local' }, kinds: { POLIGONAL: 'boundary', CN_MAESTRAS: 'contours', CN_SECUND: 'contours', PUNTOS: 'points', COTAS: 'points' } })
    // one shape: it is the boundary, nothing to click
    expect(pending().picked).toBe(0)
    useSiteImport.getState().commit()
    expect(useSiteImport.getState().pending).toBeNull()
    const s = site()
    expect(area(contourToPolygon(s.boundary!))).toBeCloseTo(6000, 6)
    expect(s.source).toBe('levantamiento.dxf')
    expect(s.frame).toEqual({ units: 'm', origin: { x: 50, y: 30 }, layers: { POLIGONAL: 'boundary', CN_MAESTRAS: 'contours', CN_SECUND: 'contours', PUNTOS: 'points', COTAS: 'points' } })
    expect(s.terrain?.contours.map((c) => c.z)).toEqual([1200, 1205, 1201])
    // the two points and the spot height (Decision "Survey points and roads")
    expect(s.terrain?.points.map((p) => p.z)).toEqual([1202.5, 1203.7, 1200])
    expect(s.terrain?.source).toEqual({ file: 'levantamiento.dxf', layers: ['CN_MAESTRAS', 'CN_SECUND', 'PUNTOS', 'COTAS'] })
    expect(useToast.getState().toast?.text).toMatch(/Imported the boundary, 3 contours and 3 points from levantamiento\.dxf/)
    useApp.getState().undo()
    expect(site()).toEqual(before)
  })

  it('several shapes: Import waits for one picked on the plan; a layer set to Ignore brings nothing', async () => {
    await begin('lots.dxf', dxf([lw('LOTES', [[0, 0], [100, 0], [100, 60], [0, 60]], true), lw('LOTES', [[200, 0], [210, 0], [210, 10], [200, 10]], true), lw('CN', [[0, 10], [100, 10]], false, 1200)]))
    expect(pending().candidates).toHaveLength(2)
    expect(pending().picked).toBeNull()
    useSiteImport.getState().commit()
    expect(pending()).not.toBeNull()
    useSiteImport.getState().pick(1)
    expect(pending().picked).toBe(1)
    useSiteImport.getState().setKind('CN', 'ignore')
    expect(pending().read?.contours).toHaveLength(0)
    // the kinds changed: the pick goes with them (the candidates may be others)
    expect(pending().picked).toBeNull()
    useSiteImport.getState().pick(1)
    const ground = site().terrain
    useSiteImport.getState().commit()
    expect(area(contourToPolygon(site().boundary!))).toBeCloseTo(100, 6)
    expect(site().terrain).toEqual(ground)
  })

  it('ground alone: the boundary layer set to Ignore leaves the site’s, the contours replace its ground', async () => {
    const boundary = site().boundary
    await begin('topo.dxf', MIXED)
    useSiteImport.getState().setKind('POLIGONAL', 'ignore')
    expect(pending().candidates).toHaveLength(0)
    useSiteImport.getState().commit()
    expect(site().boundary).toEqual(boundary)
    expect(site().terrain?.contours).toHaveLength(3)
  })

  it('a table of points: its columns, imported as the ground', async () => {
    await begin('puntos.csv', 'P,Este,Norte,Cota,Desc\n1,10,20,1200.5,TN\n2,30,20,1201,TN\n3,20,40,1202,TN\n')
    expect(pending().columns).toEqual({ x: 1, y: 2, z: 3 })
    expect(pending().candidates).toHaveLength(0)
    useSiteImport.getState().setColumns({ x: 2, y: 1, z: 3 })
    expect(pending().read?.points).toHaveLength(3)
    useSiteImport.getState().commit()
    expect(site().terrain?.points.map((p) => p.z)).toEqual([1200.5, 1201, 1202])
  })
})

describe('setups', () => {
  it('nothing is remembered unasked; Remember keeps it, and the next file starts from it by layer name', async () => {
    await begin('a.dxf', MIXED)
    useSiteImport.getState().setKind('COTAS', 'ignore')
    useSiteImport.getState().commit()
    expect(localStorage.getItem(SETUPS_KEY)).toBeNull()

    await begin('b.dxf', MIXED)
    useSiteImport.getState().setUnits('cm')
    useSiteImport.getState().setKind('CN_SECUND', 'ignore')
    useSiteImport.getState().setRemember(true)
    useSiteImport.getState().commit()
    expect(JSON.parse(localStorage.getItem(SETUPS_KEY)!)).toMatchObject([{ file: 'b.dxf', units: 'cm', kinds: { CN_SECUND: 'ignore' } }])

    // the site came from b.dxf: its setup first, then the remembered one
    await begin('c.dxf', MIXED)
    expect(pending().setups.map((s) => [s.file, s.coordinates.kind])).toEqual([
      ['b.dxf', 'site'],
      ['b.dxf', 'local'],
    ])
    expect(pending().choice.kinds.CN_SECUND).toBe('contours')
    useSiteImport.getState().startFrom(1)
    expect(pending().choice).toMatchObject({ units: 'cm', coordinates: { kind: 'local' }, kinds: { CN_SECUND: 'ignore', POLIGONAL: 'boundary' } })
    useSiteImport.getState().startFrom(0)
    expect(pending().choice).toMatchObject({ units: 'cm', coordinates: { kind: 'site' }, kinds: { CN_SECUND: 'contours', COTAS: 'points' } })
    useSiteImport.getState().startFrom(null)
    expect(pending().choice).toMatchObject({ units: 'm', kinds: { CN_SECUND: 'contours' } })
  })

  it('as the site’s: ground of the same survey, in other units, lands on the site', async () => {
    await begin('site.dxf', MIXED)
    useSiteImport.getState().commit()
    const [a, b] = site().terrain!.contours[0].points
    // the same contour, in cm, alone
    await begin('more.dxf', dxf([lw('CN_MAESTRAS', [[0, 1000], [10000, 1000]], false, 120000)]))
    // ground alone, local as the site's file was: it starts as the site's
    expect(pending().choice.coordinates.kind).toBe('site')
    useSiteImport.getState().setUnits('cm')
    useSiteImport.getState().commit()
    const c = site().terrain!.contours[0]
    expect(c.z).toBeCloseTo(1200, 6)
    expect(c.points[0].x).toBeCloseTo(a.x, 6)
    expect(c.points[1].y).toBeCloseTo(b.y, 6)
  })
})

describe('the window', () => {
  it('a row per layer: hovered, its layer is drawn strong on the plan; It is changes what it is', async () => {
    await begin('levantamiento.dxf', MIXED)
    render(
      <>
        <SurveyWindow />
        <svg>
          <ImportLayer />
        </svg>
      </>,
    )
    expect(screen.getByRole('dialog', { name: 'Import levantamiento.dxf' })).toBeTruthy()
    const row = document.querySelector('[data-layer-row="CN_SECUND"]')!
    expect(row.textContent).toMatch(/1 line · 1,201–1,201 m/)
    fireEvent.pointerEnter(row)
    expect(pending().hoverLayer).toBe('CN_SECUND')
    const layers = [...document.querySelectorAll('[data-survey-preview] [data-layer]')]
    expect(layers.at(-1)?.getAttribute('data-layer')).toBe('CN_SECUND')
    expect(layers.at(-1)?.getAttribute('stroke')).toBe('var(--ink)')
    // Delete takes a picked row out (Decision "Survey layers deleted"); Restore brings it back as its guess
    fireEvent.click(row)
    fireEvent.keyDown(screen.getByRole('listbox', { name: 'Layers' }), { key: 'Delete' })
    expect(pending().choice.kinds.CN_SECUND).toBe('ignore')
    expect(document.querySelector('[data-layer-row="CN_SECUND"]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }))
    expect(pending().choice.kinds.CN_SECUND).toBe('contours')
    // Shift picks a run; a kind given to a picked row goes to the others; the bar's Delete takes them all
    fireEvent.click(document.querySelector('[data-layer-row="CN_MAESTRAS"]')!)
    fireEvent.click(document.querySelector('[data-layer-row="CN_SECUND"]')!, { shiftKey: true })
    fireEvent.change(screen.getByLabelText('CN_SECUND is'), { target: { value: 'points' } })
    expect([pending().choice.kinds.CN_MAESTRAS, pending().choice.kinds.CN_SECUND]).toEqual(['points', 'points'])
    fireEvent.click(screen.getByRole('button', { name: /^Delete/ }))
    expect([pending().choice.kinds.CN_MAESTRAS, pending().choice.kinds.CN_SECUND]).toEqual(['ignore', 'ignore'])
    // no Ignore among a row's kinds: deleting is the list's
    expect([...(screen.getByLabelText('COTAS is') as HTMLSelectElement).options].map((o) => o.value)).toEqual(['boundary', 'parcels', 'contours', 'points', 'roads', 'reference'])
    // a layer of texts cannot be the boundary
    const boundary = [...(screen.getByLabelText('COTAS is') as HTMLSelectElement).options].find((o) => o.value === 'boundary')!
    expect(boundary.disabled).toBe(true)
  })

  it('Import waits for the boundary; a click on the plan picks it; Escape lets the file go', async () => {
    await begin('lots.dxf', dxf([lw('LOTES', [[0, 0], [100, 0], [100, 60], [0, 60]], true), lw('LOTES', [[200, 0], [210, 0], [210, 10], [200, 10]], true)]))
    render(
      <>
        <SurveyWindow />
        <svg>
          <ImportLayer />
        </svg>
      </>,
    )
    const button = screen.getByRole('button', { name: 'Import' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(screen.getByText(/2 shapes: click the boundary on the plan/)).toBeTruthy()
    fireEvent.click(document.querySelector('[data-candidate="1"]')!)
    expect(button.disabled).toBe(false)
    expect(document.querySelector('[data-candidate="1"]')?.hasAttribute('data-picked')).toBe(true)
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' })
    })
    expect(useSiteImport.getState().pending).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('a second drawing, for its references (Phase DL.1, Decision "Drawing layers")', () => {
  // the architect's drawing of the same survey: buildings and a fence round the parcel, and its own copy of the parcel
  const FRISA = dxf([
    lw('POLIGONAL', [[0, 0], [100, 0], [100, 60], [0, 60]], true),
    lw('ARQ-EDIF', [[10, 10], [30, 10], [30, 20], [10, 20]], true),
    lw('ARQ-BARDA', [[0, 55], [100, 55]]),
    lw('CN_MAESTRAS', [[0, 30], [100, 30]], false, 1999),
  ])

  it('Brings: References leaves the boundary and the ground, offers Reference, Parcels and nothing else, lands as the site’s', async () => {
    await begin('levantamiento.dxf', MIXED)
    useSiteImport.getState().commit()
    const before = site()
    render(<SurveyWindow />)
    await act(() => begin('frisa.dxf', FRISA))
    expect(pending().canReference).toBe(true)
    expect(pending().brings).toBe('site')
    fireEvent.click(screen.getByRole('button', { name: 'References' }))
    expect(pending().brings).toBe('references')
    expect(pending().choice.coordinates).toEqual({ kind: 'site' })
    // the parcel and the contours of this file are no longer read: only its references
    expect(pending().choice.kinds).toMatchObject({ POLIGONAL: 'ignore', CN_MAESTRAS: 'ignore', 'ARQ-EDIF': 'reference', 'ARQ-BARDA': 'reference' })
    expect([...(screen.getByLabelText('ARQ-EDIF is') as HTMLSelectElement).options].map((o) => o.value)).toEqual(['reference', 'parcels'])
    expect(screen.getByText(/2 reference layers/)).toBeTruthy()
    act(() => useSiteImport.getState().commit())
    const s = site()
    expect(s.boundary).toBe(before.boundary)
    expect(s.terrain).toBe(before.terrain)
    expect(s.frame).toBe(before.frame)
    expect(s.drawings?.map((d) => [d.file, d.layers.map((l) => l.name)])).toEqual([['frisa.dxf', ['ARQ-BARDA', 'ARQ-EDIF']]])
    // in the site's frame: the levantamiento's middle (50, 30) at the origin
    expect(s.drawings![0].layers[0].lines[0].points).toEqual([{ x: -50, y: 25 }, { x: 50, y: 25 }])
    expect(useToast.getState().toast?.text).toMatch(/Imported 2 reference layers from frisa\.dxf/)
  })

  it('opened from + Add drawing…, it already brings references; on a site with no boundary it cannot', async () => {
    const file = await readSiteFile('frisa.dxf', bytes(FRISA))
    useApp.getState().apply((p) => ({ ...p, site: { ...p.site, boundary: null } }))
    useSiteImport.getState().begin(file, true)
    expect(pending().brings).toBe('site')
    expect(pending().canReference).toBe(false)
    useSiteImport.getState().cancel()
    await begin('levantamiento.dxf', MIXED)
    useSiteImport.getState().commit()
    useSiteImport.getState().begin(file, true)
    expect(pending().brings).toBe('references')
  })
})
