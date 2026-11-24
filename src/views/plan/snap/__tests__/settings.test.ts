// Ported from Plaza-Practiko `vistas/planta/iman/__tests__/ajustes.test.ts`: the settings are remembered in this
// browser and toggled with F3 and F9.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { handleKey } from '../../../useShortcuts.ts'
import { DEFAULT_SNAP } from '../kinds.ts'
import { readSaved, STORAGE_KEY, useSnapSettings } from '../settings.ts'

const current = () => useSnapSettings.getState().settings

beforeEach(() => {
  localStorage.clear()
  useSnapSettings.setState({ settings: DEFAULT_SNAP })
})

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('snap settings', () => {
  it('a toggle is saved and read back', () => {
    useSnapSettings.getState().toggle('align')
    useSnapSettings.getState().toggleKind('midpoint')
    expect(current().align).toBe(false)
    const saved = readSaved()
    expect(saved.align).toBe(false)
    expect(saved.kinds.midpoint).toBe(false)
    expect(saved.kinds.endpoint).toBe(true)
  })

  it('a broken JSON gives the defaults; an old one is merged with them', () => {
    localStorage.setItem(STORAGE_KEY, '{broken')
    expect(readSaved()).toEqual(DEFAULT_SNAP)
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ on: false, kinds: { center: false } }))
    const saved = readSaved()
    expect(saved.on).toBe(false)
    expect(saved.kinds.center).toBe(false)
    expect(saved.kinds.endpoint).toBe(true)
    expect(saved.grid).toBe(true)
  })

  it('if localStorage refuses to write, the setting still changes', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full')
    })
    useSnapSettings.getState().toggle('grid')
    expect(current().grid).toBe(false)
  })
})

describe('keys', () => {
  const press = (key: string, target?: EventTarget) => {
    const e = new KeyboardEvent('keydown', { key, cancelable: true })
    if (target) Object.defineProperty(e, 'target', { value: target })
    handleKey(e)
    return e
  }

  it("F3 snap, F8 ortho and F9 grid, without the browser's find", () => {
    const e = press('F3')
    expect(e.defaultPrevented).toBe(true)
    expect(current().on).toBe(false)
    press('F8')
    expect(current().ortho).toBe(true)
    press('F9')
    expect(current().grid).toBe(false)
  })

  it('typing in a field they do nothing', () => {
    press('F9', document.createElement('input'))
    expect(current().grid).toBe(true)
  })
})
