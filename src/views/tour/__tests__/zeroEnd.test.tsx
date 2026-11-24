// From zero, chapters 7–8 and where it starts (spec 2026-11-10-from-zero-tutorial): the block's platform balanced with
// its banks, the cut and fill shown, the analysis (issues, figures, detail, overlays), the CAD plan exported; Home's
// "Learn GFit from zero" and the Tour button's two tutorials.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../App.tsx'
import { useTerrainView } from '../../../modules/terrain/views/terrainView.ts'
import { useApp } from '../../../state/store.ts'
import { useScreen } from '../../home/screen.ts'
import { exportDxf } from '../../layout/exporting.ts'
import { useToast } from '../../layout/toast.ts'
import { useUi } from '../../layout/ui.ts'
import { useSiteImport } from '../../plan/site/importState.ts'
import { chapters, stepsOf, useTour } from '../tour.ts'
import { tutorialCopies } from '../zero/common.ts'
import { startZero } from '../zero/run.ts'
import { setTutorialSiteSource } from '../zero/siteFile.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))
vi.mock('../../layout/exporting.ts', async (load) => ({ ...(await load<typeof import('../../layout/exporting.ts')>()), exportDxf: vi.fn() }))

const bytes = () => {
  const b = readFileSync('public/tutorial/site.dxf')
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
}

beforeEach(() => {
  localStorage.clear()
  vi.mocked(exportDxf).mockClear()
  setTutorialSiteSource(() => Promise.resolve(bytes()))
  useScreen.setState({ home: true })
  useUi.setState({ dialog: null, view: 'plan', panels: { left: true, right: true }, sheet: null })
  useToast.setState({ toast: null, confirmation: null })
  useSiteImport.setState({ pending: null })
  useTerrainView.setState({ show: 'contours' })
  useTour.setState({ offer: false, active: false, index: 0, tutorial: 'tour' })
})

describe('chapters 7–8, earthwork, analysis and the DXF', { timeout: 120_000 }, () => {
  it('by Do it for me: the platform balanced with its banks, the cut and fill shown, the CAD plan exported', async () => {
    render(<App />)
    await act(() => startZero('Earthwork and analysis'))
    const steps = stepsOf('zero')
    const from = steps.findIndex((s) => s.chapter === 'Earthwork and analysis')
    expect(useTour.getState().index).toBe(from)
    for (let i = from; i < steps.length; i++) {
      const step = steps[useTour.getState().index]
      await screen.findByRole('dialog', { name: `Tour: ${step.title}` })
      if (step.anchor) expect(document.querySelector(`[data-tour="${step.anchor}"]`), step.id).not.toBeNull()
      await act(() => useTour.getState().doIt())
      if (step.done) expect(step.done(), step.id).toBe(true)
    }
    expect(useTour.getState().active).toBe(false)
    const b = useApp.getState().project.buildings.find((x) => x.id === tutorialCopies()[0])!
    expect(typeof b.platform?.level).toBe('number')
    expect(useTerrainView.getState().show).toBe('earthwork')
    expect(exportDxf).toHaveBeenCalledTimes(1)
    expect(chapters('zero').at(-1)).toBe('The DXF')
  })
})

describe('where it starts', { timeout: 60_000 }, () => {
  it('Home’s sidebar Learn GFit from zero opens chapter 1 (in place of the guided tour; no card in the strip)', async () => {
    render(<App />)
    expect(screen.queryByRole('region', { name: 'Learn GFit from zero' })).toBeNull()
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Home' })).getByRole('button', { name: 'Learn GFit from zero' }))
    await screen.findByRole('dialog', { name: 'Tour: Build a project from zero' })
    expect(useTour.getState()).toMatchObject({ active: true, tutorial: 'zero', index: 0 })
  })

  it('the Help menu offers both tutorials (the Tour button went into it); Sample tour still opens the sample’s', async () => {
    useScreen.setState({ home: false })
    render(<App />)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Help' }))
    const menu = screen.getByRole('menu', { name: 'Help' })
    const labels = Array.from(menu.querySelectorAll('[data-menu-key]')).map((b) => b.querySelector('span')!.textContent)
    expect(labels).toEqual(expect.arrayContaining(['Learn GFit from zero', 'Sample tour']))
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Sample tour' }))
    expect(useTour.getState()).toMatchObject({ active: true, tutorial: 'tour' })
  })
})
