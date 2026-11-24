// File › Export's files (the top bar's Export button went into the top menu, Project C AS.1; every test opens the menu and picks the row): the 3D model's dialog (Decision "Model export": Rhino or IFC; Geometry, Terrain or
// All; the writers mocked: io/__tests__/ tests the files themselves; Speckle in it: speckle.test.tsx) and the image of
// the 3D view, which needs a mounted scene.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../App.tsx'
import { readGft } from '../../../io/gft.ts'
import { export3dm } from '../../../io/export3dm.ts'
import { dxfFileName } from '../../../io/exportDxf.ts'
import { exportIfc } from '../../../io/exportIfc.ts'
import { setTerrain } from '../../../state/actions/site.ts'
import { demoProject } from '../../../state/demo.ts'
import { useApp } from '../../../state/store.ts'
import { openMenu, pickMenu, pickMenuAsync, rowOf } from '../../__tests__/pickMenu.ts'
import { useSceneRef } from '../../scene/sceneRef.ts'
import { useModelExport } from '../ModelExportDialog.tsx'
import { useCadPlan } from '../exporting.ts'
import { useSaving } from '../saving.ts'
import { useToast } from '../toast.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))
vi.mock('../../../io/export3dm.ts', () => ({ export3dm: vi.fn(async () => new Uint8Array([1, 2, 3])) }))
vi.mock('../../../io/exportIfc.ts', () => ({ exportIfc: vi.fn(() => 'ISO-10303-21;') }))

let names: string[] = []
let blobs: Blob[] = []
beforeEach(() => {
  names = []
  blobs = []
  useCadPlan.setState({ threeD: false })
  URL.createObjectURL = vi.fn((b: Blob | MediaSource) => {
    blobs.push(b as Blob)
    return 'blob:x'
  })
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    names.push(this.download)
  })
  useSceneRef.setState({ capturePng: null })
  useToast.setState({ toast: null, confirmation: null })
  useModelExport.setState({ open: false, format: 'rhino', part: 'all' })
  useApp.getState().open(demoProject())
})
afterEach(() => vi.restoreAllMocks())

/** Opens File › Export (the menu bar's File, then its Export sub-menu) and leaves it open. */
const open = () => pickMenu('File', 'Export')
/** The row of the open Export sub-menu. */
const row = (label: string) => rowOf(openMenu()!, label)
/** File › Export › `label`. */
const pick = (label: string) => pickMenu('File', 'Export', label)
/** As `pick`, for a row that works asynchronously (a download, a picker). */
const pickAsync = (label: string) => pickMenuAsync('File', 'Export', label)
/** Closes the open menu with Escape. */
const closeMenu = () => fireEvent.keyDown(document.activeElement ?? window, { key: 'Escape' })
const dialog = () => screen.getByRole('dialog', { name: 'Export 3D model' })
const choice = (group: string, name: string) => within(within(dialog()).getByRole('group', { name: group })).getByRole('button', { name })
async function exportModel() {
  await act(async () => fireEvent.click(within(dialog()).getByRole('button', { name: 'Export' })))
  await waitFor(() => expect(names).toHaveLength(1))
}

describe('File › Export', () => {
  it('3D model… opens its dialog: Rhino downloads <project>-geometry_<date>.3dm; without a ground, only Geometry', async () => {
    render(<App />)
    pick('3D model…')
    expect(choice('Include', 'Terrain')).toBeDisabled()
    expect(choice('Include', 'All')).toBeDisabled()
    await exportModel()
    expect(names[0]).toMatch(/^Demo-site-geometry_\d{4}-\d{2}-\d{2}\.3dm$/)
    expect(vi.mocked(export3dm).mock.calls.at(-1)?.[2]).toBe('geometry')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(useToast.getState().toast).toBeNull()
  })

  it('on a ground: IFC with the terrain alone, then all; no Revit format (Decision "No Revit bridge")', async () => {
    act(() => useApp.getState().open(setTerrain(demoProject(), { contours: [], points: [{ x: 0, y: 0, z: 1 }, { x: 500, y: 0, z: 2 }, { x: 0, y: 400, z: 3 }] })))
    render(<App />)
    pick('3D model…')
    fireEvent.click(choice('Format', 'IFC'))
    fireEvent.click(choice('Include', 'Terrain'))
    await exportModel()
    expect(names[0]).toMatch(/^Demo-site-terrain_\d{4}-\d{2}-\d{2}\.ifc$/)
    expect(vi.mocked(exportIfc).mock.calls.at(-1)?.slice(2)).toEqual(['terrain'])

    names = []
    pick('3D model…')
    expect(within(within(dialog()).getByRole('group', { name: 'Format' })).queryByRole('button', { name: 'Revit' })).toBeNull()
    fireEvent.click(choice('Include', 'All'))
    await exportModel()
    expect(names[0]).toMatch(/^Demo-site_\d{4}-\d{2}-\d{2}\.ifc$/)
    expect(vi.mocked(exportIfc).mock.calls.at(-1)?.slice(2)).toEqual(['all'])
  })

  it('the image waits for a 3D view; with one, it downloads a .png', async () => {
    render(<App />)
    open()
    // greyed, and the reason is its title
    expect(row('Image of the 3D view (.png)')).toBeDisabled()
    expect(row('Image of the 3D view (.png)')).toHaveAttribute('title', 'Open the 3D or Split view first')
    closeMenu()
    act(() => useSceneRef.getState().register(() => 'data:image/png;base64,iVBORw0KGgo='))
    globalThis.fetch = vi.fn(async () => ({ blob: async () => new Blob(['png']) })) as unknown as typeof fetch
    await pickAsync('Image of the 3D view (.png)')
    await waitFor(() => expect(names[0]).toMatch(/^Demo-site_\d{4}-\d{2}-\d{2}\.png$/))
  })

  it('Project (.gft) is the first row: with no picker it downloads <name>_<date>.gft, which reads back as the project, and it counts nothing as saved', async () => {
    useSaving.setState({ kept: null, savedAt: null, failed: false })
    render(<App />)
    open()
    expect(within(openMenu()!).getAllByRole('menuitem')[0]).toHaveTextContent(/^Project \(\.gft\)/)
    closeMenu()
    await pickAsync('Project (.gft)')
    expect(names).toHaveLength(1)
    expect(names[0]).toMatch(/^Demo-site_\d{4}-\d{2}-\d{2}\.gft$/)
    expect(readGft(await blobs[0].text())).toEqual({ ok: true, project: useApp.getState().project })
    expect(useToast.getState().toast?.text).toBe(`Exported “${names[0]}”: all its options.`)
    expect(useSaving.getState()).toMatchObject({ kept: null, savedAt: null, failed: false })
  })

  it('Project (.gft) with a picker writes the picked file; a closed picker says nothing; a failure says why', async () => {
    const writes: string[] = []
    const handle = { name: 'mine.gft', getFile: async () => new File([''], 'mine.gft'), createWritable: async () => ({ write: async (d: string) => void writes.push(d), close: async () => {} }) }
    const show = vi.fn(async () => handle)
    ;(window as { showSaveFilePicker?: unknown }).showSaveFilePicker = show
    try {
      render(<App />)
      await pickAsync('Project (.gft)')
      expect(show).toHaveBeenCalledTimes(1)
      expect(names).toHaveLength(0)
      expect(readGft(writes[0])).toEqual({ ok: true, project: useApp.getState().project })
      expect(useToast.getState().toast?.text).toBe('Exported “mine.gft”: all its options.')

      useToast.setState({ toast: null })
      show.mockRejectedValueOnce(new DOMException('closed', 'AbortError'))
      await pickAsync('Project (.gft)')
      expect(useToast.getState().toast).toBeNull()

      show.mockRejectedValueOnce(new Error('disk full'))
      await pickAsync('Project (.gft)')
      expect(useToast.getState().toast?.text).toBe('Could not export the file: disk full.')
    } finally {
      delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker
    }
  })

  it('on a phone the row is in the ☰ sheet with the other export rows', () => {
    const mm = vi.fn((media: string) => ({ media, matches: media.includes('max-width: 767'), addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    vi.stubGlobal('matchMedia', mm)
    try {
      render(<App />)
      fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
      const sheet = screen.getByRole('dialog', { name: 'Menu' })
      const unfold = (label: string) => fireEvent.click(sheet.querySelector<HTMLElement>(`[data-sheet-label="${label}"]`)!)
      unfold('File')
      unfold('Export')
      const rows = Array.from(sheet.querySelectorAll('[data-sheet-key^="file.export."]')).map((r) => r.textContent ?? '')
      expect(rows.slice(0, 2)).toEqual(['Project (.gft)', '3D model…'])
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('CAD plan (.dxf) comes after 3D model…; its click downloads the Windows-1252 bytes of a DXF', async () => {
    render(<App />)
    open()
    const rows = Array.from(openMenu()!.querySelectorAll('[data-menu-key]')).map((r) => r.textContent ?? '')
    expect(rows.findIndex((t) => t.startsWith('CAD plan (.dxf)'))).toBe(rows.findIndex((t) => t.startsWith('3D model…')) + 1)
    closeMenu()
    pick('CAD plan (.dxf)')
    expect(names).toEqual([dxfFileName('Demo site', false)])
    expect(names[0]).toMatch(/plan_.*\.dxf$/)
    expect(blobs).toHaveLength(1)
    expect(await bytesOf(blobs[0])).toMatch(/^\s*0\r\nSECTION/)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('the 3D box is a tick beside the plan: it changes the state only (no download); then the plan downloads as the 3D file', async () => {
    render(<App />)
    open()
    expect(row('3D box in the CAD plan')).toHaveAttribute('aria-checked', 'false')
    closeMenu()
    pick('3D box in the CAD plan')
    expect(useCadPlan.getState().threeD).toBe(true)
    expect(names).toHaveLength(0)
    open()
    expect(row('3D box in the CAD plan')).toHaveAttribute('aria-checked', 'true')
    closeMenu()
    pick('CAD plan (.dxf)')
    expect(names).toEqual([dxfFileName('Demo site', true)])
    expect(names[0]).toMatch(/plan-3D_.*\.dxf$/)
    expect(await bytesOf(blobs[0])).toMatch(/^\s*0\r\nSECTION/)
  })
})

/** A Blob's bytes read as Latin-1 text (jsdom's Blob has no arrayBuffer()). */
function bytesOf(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(Array.from(new Uint8Array(r.result as ArrayBuffer), (b) => String.fromCharCode(b)).join(''))
    r.onerror = () => reject(r.error)
    r.readAsArrayBuffer(blob)
  })
}
