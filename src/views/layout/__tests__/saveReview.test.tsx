// Fixes of the review of the save work (QF.4, Decision "Save in the app"): an editor's round trip gives back the outer
// project's history and failed flag; the read-back check sees a key the schema would drop; a pending autosave does not
// outlive its project; the indicator does not carry another project's time; the question before leaving says why.
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../App.tsx'
import { derive } from '../../../engine/derive.ts'
import {
  carRoads, dragSteps, extremeStandards, facingDocks, joined, many, nonsenseRoads, oddGates, oddMasses, pairs, shrinking, sidedStreets, siteShapes, turned,
} from '../../../engine/__tests__/stress/scenarios.ts'
import { library } from '../../../io/library.ts'
import type { Project } from '../../../model/schema.ts'
import { actions } from '../../../state/actions/index.ts'
import { demoProject } from '../../../state/demo.ts'
import { emptyHistory } from '../../../state/history.ts'
import { sampleProject } from '../../../state/sample.ts'
import { NO_SELECTION, useApp } from '../../../state/store.ts'
import { useScreen } from '../../home/screen.ts'
import { newProject } from '../../../typologies/index.ts'
import { closeBlockEditor, openBlockEditor, useBlockEditor } from '../../home/blockEditor.ts'
import { closeTerrainEditor, openTerrainEditor, useTerrainEditor } from '../../home/terrainEditor.ts'
import { startProject } from '../files.ts'
import { AUTOSAVE_DELAY, forgetKept, keep, readBack, unkept, useSaving } from '../saving.ts'
import { useToast } from '../toast.ts'
import { useUi } from '../ui.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))
vi.mock('../../../modules/warehouse/views/WarehouseScene.tsx', () => ({ WarehouseScene: () => <div data-testid="warehouse-scene" /> }))

beforeEach(() => {
  localStorage.clear()
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p, 'o1'), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, option: 'o1' })
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null })
  useScreen.setState({ home: false })
  forgetKept()
  useSaving.setState({ autosave: true, savedAt: null })
  useToast.setState({ toast: null, confirmation: null })
  useBlockEditor.setState({ open: false, typeId: null, saved: null, back: null })
  useTerrainEditor.setState({ open: false, name: '', id: null, saved: null, back: null })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const edit = () => act(() => useApp.getState().apply((p) => actions.removeMass(p, 'm3')))
const indicator = () => document.querySelector<HTMLElement>('[data-tour="save"]')
const storageFull = () =>
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('full', 'QuotaExceededError')
  })
const leaving = () => {
  const e = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(e)
  return e.defaultPrevented
}

describe('a trip through an editor gives back the outer project as it was', () => {
  it('A: storage full, autosave on, "Not saved": a block opened and closed leaves it failed, and leaving the page still asks', () => {
    vi.useFakeTimers()
    render(<App />)
    storageFull()
    edit()
    act(() => vi.advanceTimersByTime(AUTOSAVE_DELAY))
    expect(useSaving.getState().failed).toBe(true)
    const held = useApp.getState().project
    act(() => void openBlockEditor('gfit-cross-dock'))
    act(() => closeBlockEditor())
    act(() => useScreen.setState({ home: false }))
    expect(useApp.getState().project).toBe(held)
    expect(useSaving.getState().failed).toBe(true)
    expect(indicator()).toHaveTextContent('Not saved')
    expect(leaving()).toBe(true)
  })

  it('B: autosave off, the demo (never kept) edited: after a block round trip another project still asks first', () => {
    render(<App />)
    useSaving.getState().setAutosave(false)
    edit()
    expect(unkept()).toBe(true)
    act(() => void openBlockEditor('gfit-cross-dock'))
    act(() => closeBlockEditor())
    expect(unkept()).toBe(true)
    expect(useApp.getState().history.past).toHaveLength(1)
    act(() => startProject('industrial'))
    expect(useToast.getState().confirmation?.text).toMatch(/has changes this browser has not kept/)
    expect(useApp.getState().project.name).toBe('Demo site')
  })

  it('the terrain editor’s trip too: history and failed come back', () => {
    render(<App />)
    useSaving.getState().setAutosave(false)
    edit()
    useSaving.setState({ failed: true })
    act(() => openTerrainEditor(new File(['x'], 'lote.dxf')))
    expect(useApp.getState().history.past).toHaveLength(0)
    act(() => closeTerrainEditor())
    expect(useApp.getState().history.past).toHaveLength(1)
    expect(useSaving.getState().failed).toBe(true)
    expect(unkept()).toBe(true)
  })

  it('the editors show no save indicator: their project is never kept', () => {
    render(<App />)
    expect(indicator()).not.toBeNull()
    act(() => void openBlockEditor('gfit-cross-dock'))
    expect(indicator()).toBeNull()
    act(() => closeBlockEditor())
    act(() => useScreen.setState({ home: false }))
    expect(indicator()).not.toBeNull()
  })
})

describe('the read-back check sees what the schema would drop', () => {
  it('a project with a key the schema does not know: keep() is false, the indicator reads Not saved', () => {
    render(<App />)
    act(() => useApp.getState().open({ ...useApp.getState().project, extra: 1 } as Project))
    expect(keep()).toBe(false)
    expect(useSaving.getState().failed).toBe(true)
    expect(indicator()).toHaveTextContent('Not saved')
  })

  it('the demo, the sample and the stress projects all still read back as kept', () => {
    const builders = [siteShapes, pairs, turned, shrinking, many, facingDocks, nonsenseRoads, oddGates, extremeStandards, oddMasses, dragSteps, joined, carRoads, sidedStreets]
    // one scenario sets a field of version 10 by a cast (persistence.test.ts): it is no field of the project
    const legacy = ['ringOff', 'removedRoads', 'ringParking']
    const clean = (p: Project): Project => ({ ...p, options: p.options.map((o) => Object.fromEntries(Object.entries(o).filter(([k]) => !legacy.includes(k))) as Project['options'][number]) })
    const all = [demoProject(), sampleProject(), ...builders.flatMap((b) => b().map((s) => clean(s.project)))]
    expect(all.length).toBeGreaterThan(190)
    for (const p of all) {
      const option = p.options[0].id
      expect(library.write(p, option, 1), p.name).toBe(true)
      expect(readBack(p, option), p.name).toBe(true)
      library.remove(p.id)
    }
  })
})

describe('autosave and the project replaced', () => {
  it('an edit and another project opened within the delay: the new one is not kept as if edited', () => {
    vi.useFakeTimers()
    render(<App />)
    edit()
    act(() => useApp.getState().open(newProject('blank', 'Fresh')))
    act(() => vi.advanceTimersByTime(AUTOSAVE_DELAY * 2))
    expect(library.list().map((e) => e.name)).not.toContain('Fresh')
    expect(indicator()).toHaveTextContent('Not saved yet')
  })

  it('the outgoing project’s pending change is kept by leaving it (files.ts’s leave), not lost', () => {
    vi.useFakeTimers()
    render(<App />)
    edit()
    const edited = useApp.getState().project
    act(() => startProject('industrial'))
    expect(library.read(edited.id)!.project).toEqual(edited)
  })

  it('forgetting what is kept forgets its time: a project never kept has no "last at"', () => {
    render(<App />)
    expect(keep()).toBe(true)
    expect(useSaving.getState().savedAt).not.toBeNull()
    act(() => useApp.getState().open(newProject('blank', 'Fresh')))
    expect(useSaving.getState().savedAt).toBeNull()
    expect(indicator()!.getAttribute('title')).not.toMatch(/last at/)
  })
})

describe('the question before leaving says why', () => {
  it('autosave off: it says so; autosave on but the keep failed: it says the browser could not keep it', () => {
    render(<App />)
    useSaving.getState().setAutosave(false)
    edit()
    act(() => startProject('industrial'))
    expect(useToast.getState().confirmation?.text).toMatch(/\(autosave is off\)/)
    useToast.setState({ confirmation: null })
    useSaving.setState({ autosave: true })
    storageFull()
    act(() => startProject('industrial'))
    const text = useToast.getState().confirmation?.text
    expect(text).toMatch(/could not keep it/)
    expect(text).not.toMatch(/autosave is off/)
  })
})
