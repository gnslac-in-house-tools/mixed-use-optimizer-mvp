// What is hidden, in one store, per project (Phase AS.3, task 1): the open project's hidden keys, the ones on top and
// the branches folded, kept in this browser under `gfit.layers` by project id, reloaded when the open project
// changes; the block editor's and the terrain editor's pseudo-projects are kept in memory only; the entry of a
// project that left the library is dropped at load; the old keys of storage (a flag in each of five stores) are
// removed once. Hidden is not project data: no undo step, nothing in the .gft.
import { renderHook, act } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { demoProject } from '../../../state/demo.ts'
import { useApp } from '../../../state/store.ts'
import { BLOCK_EDITOR_ID, TERRAIN_EDITOR_ID } from '../../home/editorId.ts'
import { INDEX_KEY } from '../../../io/library.ts'
import { building, drawingLayer, LABELS, MAP, parcel } from '../keys.ts'
import { LAYERS_KEY, isHidden, useHidden, useLayerView } from '../layerView.ts'

const open = (id: string) => useApp.getState().open({ ...demoProject(), id })
const stored = () => JSON.parse(localStorage.getItem(LAYERS_KEY) ?? 'null') as Record<string, { hidden: string[]; onTop: string[]; folded: string[] }> | null
const hide = (...keys: string[]) => useLayerView.getState().setHidden(keys, true)

/** These projects are in the library (a project that is not has its entry dropped when the store loads). */
const inLibrary = (...ids: string[]) =>
  localStorage.setItem(INDEX_KEY, JSON.stringify(ids.map((id) => ({ id, name: id, typology: 'industrial', savedAt: 1, options: 1 }))))

/** A second copy of the store, as a reload makes it: it reads what is in storage now. */
async function reload() {
  vi.resetModules()
  const layerView = await import('../layerView.ts')
  const store = await import('../../../state/store.ts')
  return { ...layerView, useApp: store.useApp }
}

beforeEach(() => {
  localStorage.clear()
  open('a')
})

describe('the keys', () => {
  it('one maker per kind, the same strings as the drawing layers had', () => {
    expect(drawingLayer('civil.dwg', 'A-SITE')).toBe('civil.dwg/A-SITE')
    expect(parcel('P1')).toBe('parcel:P1')
    expect(parcel('P1', 'a.dxf')).toBe('parcel:a.dxf/P1')
    expect(building('b1')).not.toBe('b1')
    expect(new Set([MAP, LABELS, building('map'), drawingLayer('a', 'b'), parcel('a', 'b')]).size).toBe(5)
  })
})

describe('hidden, per project', () => {
  it('everything shows until hidden; setHidden hides and shows keys together', () => {
    expect(useLayerView.getState().hidden).toEqual([])
    expect(isHidden(MAP)).toBe(false)
    hide(MAP, LABELS)
    expect(isHidden(MAP) && isHidden(LABELS)).toBe(true)
    useLayerView.getState().setHidden([MAP], false)
    expect(isHidden(MAP)).toBe(false)
    expect(isHidden(LABELS)).toBe(true)
    hide(LABELS)
    expect(useLayerView.getState().hidden).toEqual([LABELS])
  })

  it('what is hidden in one project is not in another, and is there when it is opened again', () => {
    hide(drawingLayer('civil.dwg', 'A-SITE'))
    open('b')
    expect(isHidden(drawingLayer('civil.dwg', 'A-SITE'))).toBe(false)
    hide(MAP)
    open('a')
    expect(useLayerView.getState().hidden).toEqual([drawingLayer('civil.dwg', 'A-SITE')])
    open('b')
    expect(useLayerView.getState().hidden).toEqual([MAP])
  })

  it('is kept in this browser under gfit.layers, by project id; an empty entry is not kept', () => {
    hide(MAP)
    expect(stored()).toEqual({ a: { hidden: [MAP], onTop: [], folded: [] } })
    useLayerView.getState().setHidden([MAP], false)
    expect(stored()?.a).toBeUndefined()
  })

  it('a reload reads the open project’s entry', async () => {
    inLibrary('a', 'b')
    hide(MAP, building('b1'))
    open('b')
    hide(LABELS)
    const fresh = await reload()
    fresh.useApp.getState().open({ ...demoProject(), id: 'a' })
    expect(fresh.useLayerView.getState().hidden).toEqual([MAP, building('b1')])
    fresh.useApp.getState().open({ ...demoProject(), id: 'b' })
    expect(fresh.useLayerView.getState().hidden).toEqual([LABELS])
  })

  it('a project with no entry shows everything', () => {
    hide(MAP)
    open('never-seen')
    expect(useLayerView.getState().hidden).toEqual([])
  })

  it('useHidden follows its key and re-renders its caller only when that key changes', () => {
    let renders = 0
    const { result } = renderHook(() => {
      renders++
      return useHidden(MAP)
    })
    expect(result.current).toBe(false)
    const before = renders
    act(() => hide(LABELS))
    expect(renders).toBe(before)
    act(() => hide(MAP))
    expect(result.current).toBe(true)
    act(() => open('b'))
    expect(result.current).toBe(false)
  })

  it('is not an undo step and is not in the project', () => {
    const { project, history } = useApp.getState()
    hide(MAP, building('b1'))
    expect(useApp.getState().project).toBe(project)
    expect(useApp.getState().history).toBe(history)
    expect(JSON.stringify(useApp.getState().project)).not.toContain(MAP)
  })
})

describe('on top and folded', () => {
  it('are kept the same way, per project', async () => {
    useLayerView.getState().setOnTop([drawingLayer('a.dxf', 'Walls'), parcel('P1')], true)
    useLayerView.getState().setFolded('buildings', true)
    useLayerView.getState().setFolded('site', true)
    useLayerView.getState().setFolded('buildings', false)
    useLayerView.getState().setOnTop([parcel('P1')], false)
    inLibrary('a')
    expect(useLayerView.getState()).toMatchObject({ hidden: [], onTop: [drawingLayer('a.dxf', 'Walls')], folded: ['site'] })
    expect(stored()?.a).toEqual({ hidden: [], onTop: [drawingLayer('a.dxf', 'Walls')], folded: ['site'] })
    open('b')
    expect(useLayerView.getState()).toMatchObject({ hidden: [], onTop: [], folded: [] })
    const fresh = await reload()
    fresh.useApp.getState().open({ ...demoProject(), id: 'a' })
    expect(fresh.useLayerView.getState()).toMatchObject({ onTop: [drawingLayer('a.dxf', 'Walls')], folded: ['site'] })
  })
})

describe('the pseudo-projects', () => {
  it.each([BLOCK_EDITOR_ID, TERRAIN_EDITOR_ID])('%s is kept in memory only: nothing is written, and it is empty when the next is opened', (id) => {
    hide(MAP)
    const before = localStorage.getItem(LAYERS_KEY)
    open(id)
    expect(useLayerView.getState().hidden).toEqual([])
    hide(LABELS)
    useLayerView.getState().setOnTop(['x'], true)
    useLayerView.getState().setFolded('y', true)
    expect(isHidden(LABELS)).toBe(true)
    expect(localStorage.getItem(LAYERS_KEY)).toBe(before)
    open('a')
    expect(useLayerView.getState().hidden).toEqual([MAP])
    expect(stored()?.[id]).toBeUndefined()
  })
})

describe('the library', () => {
  const entry = (hidden: string[]) => ({ hidden, onTop: [], folded: [] })

  it('drops at load the entry of a project that left it', async () => {
    localStorage.setItem(INDEX_KEY, JSON.stringify([{ id: 'kept', name: 'Kept', typology: 'industrial', savedAt: 1, options: 1 }]))
    localStorage.setItem(LAYERS_KEY, JSON.stringify({ kept: entry([MAP]), gone: entry([LABELS]) }))
    const fresh = await reload()
    expect(Object.keys(stored() ?? {})).toEqual(['kept'])
    fresh.useApp.getState().open({ ...demoProject(), id: 'kept' })
    expect(fresh.useLayerView.getState().hidden).toEqual([MAP])
  })

  it('never drops the open project’s entry, listed in the library or not', async () => {
    const fresh = await reload()
    const id = fresh.useApp.getState().project.id
    localStorage.setItem(LAYERS_KEY, JSON.stringify({ [id]: entry([MAP]), gone: entry([LABELS]) }))
    fresh.forgetGoneProjects()
    expect(Object.keys(stored() ?? {})).toEqual([id])
  })
})

describe('storage that fails', () => {
  it('lasts as long as the tab when it throws, and a broken entry reads as nothing hidden', async () => {
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full')
    })
    try {
      hide(MAP)
      expect(isHidden(MAP)).toBe(true)
      open('b')
      open('a')
      // nothing was kept: a project opened again reads its entry from storage, which has none
      expect(isHidden(MAP)).toBe(false)
    } finally {
      set.mockRestore()
    }
    localStorage.setItem(LAYERS_KEY, '{not json')
    const fresh = await reload()
    expect(fresh.useLayerView.getState().hidden).toEqual([])
    inLibrary('z')
    localStorage.setItem(LAYERS_KEY, JSON.stringify({ z: { hidden: [1, 'ok'], onTop: 'no' } }))
    const again = await reload()
    again.useApp.getState().open({ ...demoProject(), id: 'z' })
    expect(again.useLayerView.getState()).toMatchObject({ hidden: ['ok'], onTop: [], folded: [] })
  })

  it('a store with no localStorage at all still works', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    try {
      hide(MAP)
      expect(isHidden(MAP)).toBe(true)
    } finally {
      get.mockRestore()
    }
  })
})

describe('the old keys of storage', () => {
  it('are not read, and are removed once at load; the rest of gfit.graph stays', async () => {
    localStorage.setItem('gfit.drawings.hidden', JSON.stringify(['civil.dwg/A-SITE']))
    localStorage.setItem('gfit.labels', 'off')
    localStorage.setItem('gfit.dims', 'hidden')
    localStorage.setItem('gfit.map.visible', 'no')
    localStorage.setItem('gfit.map.opacity', '0.5')
    localStorage.setItem('gfit.graph', JSON.stringify({ lines: 'straight', arcs: 'off', markers: false, overlay: false, share: 0.5 }))
    const fresh = await reload()
    for (const k of ['gfit.drawings.hidden', 'gfit.labels', 'gfit.dims', 'gfit.map.visible']) expect(localStorage.getItem(k)).toBeNull()
    expect(localStorage.getItem('gfit.map.opacity')).toBe('0.5')
    expect(JSON.parse(localStorage.getItem('gfit.graph')!)).toEqual({ lines: 'straight', share: 0.5 })
    // nothing carried over: everything shows until hidden in each project
    expect(fresh.useLayerView.getState().hidden).toEqual([])
  })
})
