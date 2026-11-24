// Home's Terrain (Decision "Home libraries"): GFit's two terrains as cards; *New project here* opens Create new on a
// project on it, and the project starts on its site under the typology's rules; a .gfs uploaded comes into this
// browser's terrains (the same version not again); a survey uploaded opens the terrain editor, whose *Save to library*
// keeps the site and whose *Close* goes back to Home's Terrain and to the project the store held.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../App.tsx'
import { terrainOf, writeTerrainFile } from '../../../io/terrains.ts'
import { demoProject } from '../../../state/demo.ts'
import { sampleProject } from '../../../state/sample.ts'
import { useApp } from '../../../state/store.ts'
import { industrial } from '../../../typologies/industrial.ts'
import { startProject } from '../../layout/files.ts'
import { useSaving } from '../../layout/saving.ts'
import { useToast } from '../../layout/toast.ts'
import { useUi } from '../../layout/ui.ts'
import { useTour } from '../../tour/tour.ts'
import { useScreen } from '../screen.ts'
import { saveEditedTerrain, TERRAIN_EDITOR_ID, UNSAVED_TERRAIN, useTerrainEditor } from '../terrainEditor.ts'
import { importTerrain, uploadTerrain } from '../TerrainLibraryView.tsx'
import { libraryTerrain, loadGfitTerrains } from '../terrainLibrary.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const file = (text: string, name: string) => new File([text], name, { type: 'application/octet-stream' })

beforeEach(() => {
  localStorage.clear()
  useScreen.setState({ home: true, homeView: 'terrains' })
  useToast.setState({ toast: null, confirmation: null })
  useTour.setState({ offer: false, active: false, index: 0 })
  useSaving.setState({ autosave: true, kept: null })
  useTerrainEditor.setState({ open: false, name: '', id: null, saved: null, back: null })
  useApp.getState().open(demoProject())
})

const terrainsView = () => screen.getByRole('region', { name: 'Terrain library' })
const cards = () => within(within(terrainsView()).getByRole('list', { name: 'Terrains' })).getAllByRole('listitem').map((li) => li.getAttribute('data-library-terrain'))

describe('Home’s Terrain', { timeout: 20_000 }, () => {
  it('GFit’s two terrains; New project here starts a project on one, under the typology’s rules', async () => {
    render(<App />)
    await waitFor(() => expect(cards()).toEqual(['gfit-industrial-park', 'gfit-quezaltepeque']))
    expect(within(terrainsView()).getAllByText(/^\d+\.\d ha · \d+ contours.* · GFit$/, { selector: 'span' })).toHaveLength(2)
    fireEvent.click(within(terrainsView()).getByRole('button', { name: 'New project on Quezaltepeque, El Salvador' }))
    const dialog = screen.getByRole('dialog', { name: 'Create new' })
    expect(within(dialog).getByRole('button', { name: /^Project/ })).toHaveAttribute('aria-pressed', 'true')
    expect(within(dialog).getByRole('button', { name: 'Quezaltepeque, El Salvador' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create project' }))
    const p = useApp.getState().project
    const t = libraryTerrain('gfit-quezaltepeque')!.terrain
    expect(useScreen.getState().home).toBe(false)
    expect(p).toMatchObject({ name: 'New industrial project', typology: 'industrial' })
    expect(p.site).toEqual({ ...t.site, rules: industrial.siteRules })
    expect(useToast.getState().toast?.text).toMatch(/^New industrial project on Quezaltepeque, El Salvador\./)
  })

  it('a .gfs uploaded comes into this browser’s terrains; the same version not again; not a terrain, it says so', async () => {
    await loadGfitTerrains()
    const mine = terrainOf(sampleProject().site, { id: 't-mine', name: 'My plot' })
    await importTerrain(file(writeTerrainFile(mine), 'my-plot.gfs'))
    expect(libraryTerrain('t-mine')).toMatchObject({ shelf: 'browser', terrain: { name: 'My plot' } })
    await importTerrain(file(writeTerrainFile(mine), 'my-plot.gfs'))
    expect(useToast.getState().toast?.text).toMatch(/in the library already \(version 1\)/)
    await importTerrain(file('[]', 'bad.gfs'))
    expect(useToast.getState().toast).toMatchObject({ kind: 'error', text: 'Could not upload bad.gfs: it is not a GFit terrain.' })
  })

  it('a survey uploaded opens the terrain editor on Site; saved, it is this browser’s; Close back to Home’s Terrain and the project held', async () => {
    render(<App />)
    const held = useApp.getState().project
    act(() => uploadTerrain(file('0\nEOF\n', 'Lote 7.dxf')))
    expect(useScreen.getState().home).toBe(false)
    expect(useApp.getState().project.id).toBe(TERRAIN_EDITOR_ID)
    expect(useUi.getState().rail).toBe('layers')
    const bar = screen.getByRole('region', { name: 'Terrain editor' })
    expect(within(bar).getByRole('textbox', { name: 'Terrain name' })).toHaveValue('Lote 7')
    expect(within(bar).getByRole('button', { name: 'Save to library' })).toBeDisabled()
    // the import done: the site has its boundary
    act(() => {
      const p = useApp.getState().project
      useApp.getState().open({ ...p, site: { ...p.site, boundary: sampleProject().site.boundary } })
    })
    fireEvent.click(within(bar).getByRole('button', { name: 'Save to library' }))
    const id = useTerrainEditor.getState().id!
    expect(libraryTerrain(id)).toMatchObject({ shelf: 'browser', terrain: { name: 'Lote 7' } })
    // changed after saving: Close asks
    act(() => {
      const p = useApp.getState().project
      useApp.getState().open({ ...p, site: { ...p.site, source: 'Drawn' } })
    })
    fireEvent.click(within(bar).getByRole('button', { name: 'Close' }))
    expect(useToast.getState().confirmation?.text).toBe(UNSAVED_TERRAIN)
    act(() => useToast.getState().confirmation!.onContinue())
    expect(useScreen.getState()).toMatchObject({ home: true, homeView: 'terrains' })
    expect(useApp.getState().project).toBe(held)
    await waitFor(() => expect(cards()).toContain(id))
  })

  it('left another way than Close (GFit/Home, another project): the editor ends, asking first when unsaved; the project held back', async () => {
    render(<App />)
    const held = useApp.getState().project
    const edit = () => {
      act(() => uploadTerrain(file('0\nEOF\n', 'Lote 7.dxf')))
      act(() => {
        const p = useApp.getState().project
        useApp.getState().open({ ...p, site: { ...p.site, boundary: sampleProject().site.boundary } })
      })
    }
    // GFit/Home, unsaved: asks; on Continue, Home with the project held
    edit()
    fireEvent.click(screen.getByRole('button', { name: /^GFit/ }))
    expect(useToast.getState().confirmation?.text).toBe(UNSAVED_TERRAIN)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(useTerrainEditor.getState()).toMatchObject({ open: false, back: null })
    expect(useScreen.getState().home).toBe(true)
    expect(useApp.getState().project).toBe(held)
    // another project, saved: no question; the bar gone over the new one
    edit()
    saveEditedTerrain()
    act(() => startProject('industrial'))
    expect(useToast.getState().confirmation).toBeNull()
    expect(useTerrainEditor.getState().open).toBe(false)
    expect(useApp.getState().project).toMatchObject({ name: 'New industrial project' })
    expect(screen.queryByRole('region', { name: 'Terrain editor' })).toBeNull()
  })

  it('saved again, the terrain is its next version: a .gfs of the first is in the library already', async () => {
    act(() => uploadTerrain(file('0\nEOF\n', 'Lote 7.dxf')))
    const site = (source: string) =>
      act(() => {
        const p = useApp.getState().project
        useApp.getState().open({ ...p, site: { ...p.site, boundary: sampleProject().site.boundary, source } })
      })
    site('Survey')
    saveEditedTerrain()
    const id = useTerrainEditor.getState().id!
    const first = libraryTerrain(id)!.terrain
    expect(first.version).toBe(1)
    site('Survey, boundary fixed')
    saveEditedTerrain()
    expect(libraryTerrain(id)!.terrain).toMatchObject({ version: 2, site: { source: 'Survey, boundary fixed' } })
    // the first's .gfs uploaded does not take the second's place
    await importTerrain(file(writeTerrainFile(first), 'lote-7.gfs'))
    expect(libraryTerrain(id)!.terrain).toMatchObject({ version: 2, site: { source: 'Survey, boundary fixed' } })
  })
})
