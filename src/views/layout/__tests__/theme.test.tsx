// Light or dark (Decision "Dark mode"): System follows the operating system; View › Theme (the top menu) and the ☾ of
// Home's welcome choose; the choice is the `data-theme` of <html> and is remembered with the layout.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../App.tsx'
import { derive } from '../../../engine/derive.ts'
import { demoProject } from '../../../state/demo.ts'
import { emptyHistory } from '../../../state/history.ts'
import { useApp } from '../../../state/store.ts'
import { pickMenu, openMenu, rowOf } from '../../__tests__/pickMenu.ts'
import { useScreen } from '../../home/screen.ts'
import { token } from '../../scene/colors.ts'
import { applyTheme, resolveTheme } from '../theme.ts'
import { readSaved, STORAGE_KEY, useUi } from '../ui.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

/** A system that prefers dark (or not), with listeners the test can fire. */
function systemPrefers(dark: boolean) {
  const listeners = new Set<() => void>()
  const media = {
    matches: dark,
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
  }
  vi.stubGlobal('matchMedia', (q: string) => (q === media.media ? media : { matches: false, addEventListener() {}, removeEventListener() {} }))
  return {
    set(next: boolean) {
      media.matches = next
      listeners.forEach((cb) => cb())
    },
  }
}

const html = () => document.documentElement

beforeEach(() => {
  localStorage.clear()
  delete html().dataset.theme
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: { massId: null, vertex: null, massIds: [] } })
  useUi.setState({ dialog: null, view: 'plan', panels: { left: true, right: true }, sheet: null, theme: 'system' })
  useScreen.setState({ home: false })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('theme', () => {
  it('System shows what the system prefers; Light and Dark show themselves', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('a choice is the data-theme of <html>; System leaves none, so the media query decides', () => {
    applyTheme('dark')
    expect(html().dataset.theme).toBe('dark')
    applyTheme('system')
    expect(html().dataset.theme).toBeUndefined()
  })

  it('remembered with the layout; nothing saved, or garbage, is System', () => {
    useUi.getState().setTheme('dark')
    expect(html().dataset.theme).toBe('dark')
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).theme).toBe('dark')
    expect(readSaved().theme).toBe('dark')
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: 'sepia' }))
    expect(readSaved().theme).toBe('system')
    localStorage.clear()
    expect(readSaved().theme).toBe('system')
  })

  it('Default layout keeps the theme: it is not part of the frame', () => {
    useUi.getState().setTheme('dark')
    useUi.getState().resetLayout()
    expect(useUi.getState().theme).toBe('dark')
  })

  it('the View menu: Theme ▸ System · Light · Dark, one checked, then Full screen and Default layout', () => {
    systemPrefers(false)
    render(<App />)
    fireEvent.click(screen.getByRole('menuitem', { name: 'View' }))
    const menu = openMenu()!
    const names = Array.from(menu.querySelectorAll('[data-menu-key]')).map((b) => b.querySelector('span')!.textContent)
    expect(names.slice(-4)).toEqual(['Theme', 'Language', 'Full screen', 'Default layout']) // mixed-use-mvp: Language
    fireEvent.click(rowOf(menu, 'Theme'))
    const sub = openMenu()!
    expect(Array.from(sub.querySelectorAll('[data-menu-key]')).map((b) => b.querySelector('span')!.textContent)).toEqual(['System', 'Light', 'Dark'])
    expect(within(sub).getByRole('menuitemcheckbox', { name: 'System' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(within(sub).getByRole('menuitemcheckbox', { name: 'Dark' }))
    expect(useUi.getState().theme).toBe('dark')
    expect(html().dataset.theme).toBe('dark')
    pickMenu('View', 'Theme', 'Light')
    expect(useUi.getState().theme).toBe('light')
  })

  it('the ☾ of Home’s welcome switches to the other theme and names it (the top bar has none: View › Theme is the menu’s)', () => {
    systemPrefers(false)
    act(() => useScreen.setState({ home: true }))
    render(<App />)
    const toggle = screen.getByRole('button', { name: 'Dark mode' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(toggle)
    expect(useUi.getState().theme).toBe('dark')
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(toggle).toHaveAttribute('title', 'Light mode')
    fireEvent.click(toggle)
    expect(useUi.getState().theme).toBe('light')
  })

  it('on System, the ☾ follows the system when it changes', () => {
    const system = systemPrefers(false)
    act(() => useScreen.setState({ home: true }))
    render(<App />)
    const toggle = screen.getByRole('button', { name: 'Dark mode' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    act(() => system.set(true))
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    // from a dark system, one press is Light
    fireEvent.click(toggle)
    expect(useUi.getState().theme).toBe('light')
  })

  it('without matchMedia (old browsers, jsdom) System is light and nothing throws', () => {
    vi.stubGlobal('matchMedia', undefined)
    expect(resolveTheme('system')).toBe('light')
    expect(() => render(<App />)).not.toThrow()
  })

  it('the scene reads a token as a colour three.js understands; without a stylesheet, a neutral grey', () => {
    expect(token('--scene-bg')).toBe('grey')
  })
})
