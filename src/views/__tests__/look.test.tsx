// A look in the viewport (Decision "Specimen preview"; viewport/look.ts): the plan draws it read only (no handles, the
// masses deaf to the pointer) with the design's masses dashed over it, the KPI strip gives its figures against the
// design's (▲▼, green or red only where its owner knows the better way), a bar names it, steps ‹ › and goes back;
// an edit of the design, a drawing tool, the Brief end it (a plugin's own data does not); Escape too. The design, its
// history and the saved copy never change for it.
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../App.tsx'
import { derive } from '../../engine/derive.ts'
import type { Project } from '../../model/schema.ts'
import { actions } from '../../state/actions/index.ts'
import { demoProject } from '../../state/demo.ts'
import { emptyHistory } from '../../state/history.ts'
import { NO_SELECTION, useApp } from '../../state/store.ts'
import { useUi } from '../layout/ui.ts'
import { endLook, showLook, useLook, type Look } from '../viewport/look.ts'
import { letGo, take } from '../tools/hand.ts'

vi.mock('../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

beforeEach(() => {
  localStorage.clear()
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p, 'o1'), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', summaryTab: 'overview', panels: { left: true, right: true }, sheet: null, help: false })
  letGo()
  useLook.setState({ look: null })
})

const design = () => useApp.getState().project
const first = () => design().masses[0].id
const mass = (id: string) => document.querySelector(`[data-mass="${id}"]`)!
/** The design with its first mass 30 m east. */
const moved = (): Project => actions.moveMass(design(), first(), { x: 30, y: 0 })
const look = (p: Project, more: Partial<Look> = {}) => act(() => showLook({ owner: 'test', title: 'Look 1', project: p, option: 'o1', ...more }))

describe('a look in the viewport', () => {
  it('the plan draws it, read only, the design dashed over it; the design, its history and its copy stay', async () => {
    render(<App />)
    const before = design()
    const at = mass(first()).getAttribute('d')
    act(() => useApp.getState().select(first()))
    // the selection opened Properties, remembered with the layout (Decision "Compact panel"); the look writes nothing
    localStorage.clear()
    look(moved())
    expect(screen.getByRole('toolbar', { name: 'Preview' })).toHaveTextContent('Look 1')
    expect(mass(first()).getAttribute('d')).not.toBe(at)
    expect(mass(first())).toHaveAttribute('pointer-events', 'none')
    // the design where it is, dashed: one outline a mass of the level
    const ghosts = document.querySelectorAll('[data-design-ghost] path')
    expect(ghosts).toHaveLength(before.masses.filter((m) => m.levelId === 'l1').length)
    expect([...ghosts].map((g) => g.getAttribute('d'))).toContain(at)
    // nothing selected, so no handles, no key edits the design under it
    expect(useApp.getState().selection.massIds).toEqual([])
    expect(document.querySelector('[data-handle]')).toBeNull()
    expect(screen.queryByRole('button', { name: /issues?$/ })).toBeNull()
    expect(design()).toBe(before)
    expect(useApp.getState().history.past).toHaveLength(0)
    expect(localStorage.length).toBe(0)
  })

  it('the KPI strip gives its figures against the design: green or red where its owner knows the better way', () => {
    const p = { ...design(), kpis: ['built-footprint', 'coverage', 'site-area'] }
    useApp.setState({ project: p, derived: derive(p, 'o1') })
    render(<App />)
    // a mass fewer: less footprint, less coverage, the same site
    look({ ...p, masses: p.masses.filter((m) => m.id !== first()) }, { better: { 'built-footprint': 'max' } })
    const vs = (id: string) => document.querySelector(`[data-against="${id}"]`)!
    expect(vs('built-footprint').textContent).toMatch(/^▼ [\d,]+ m² vs yours$/)
    expect(vs('built-footprint')).toHaveClass('text-status-over')
    expect(vs('coverage').textContent).toMatch(/^▼ /)
    expect(vs('coverage')).toHaveClass('text-ink-secondary')
    expect(vs('site-area').textContent).toBe('= yours')
    act(() => endLook())
    expect(document.querySelector('[data-against]')).toBeNull()
  })

  it('the bar steps through its owner’s list; Back to my design and Escape end it and tell its owner', () => {
    render(<App />)
    const next = vi.fn()
    const onEnd = vi.fn()
    look(moved(), { next, onEnd })
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(next).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Back to my design' }))
    expect(useLook.getState().look).toBeNull()
    expect(onEnd).toHaveBeenCalledOnce()
    expect(screen.queryByRole('toolbar', { name: 'Preview' })).toBeNull()
    look(moved(), { onEnd })
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(useLook.getState().look).toBeNull()
    expect(onEnd).toHaveBeenCalledTimes(2)
    // its owner ends it: nobody else can, and it is not told
    look(moved(), { onEnd })
    act(() => endLook('another'))
    expect(useLook.getState().look).not.toBeNull()
    act(() => endLook('test'))
    expect(useLook.getState().look).toBeNull()
    expect(onEnd).toHaveBeenCalledTimes(2)
  })

  it('an edit of the design ends it, a plugin’s own data does not; a drawing tool and the Brief end it too', () => {
    render(<App />)
    look(moved())
    act(() => useApp.getState().apply((p) => actions.setPluginData(p, 'test', { a: 1 })))
    expect(useLook.getState().look).not.toBeNull()
    act(() => useApp.getState().apply((p) => actions.moveMass(p, first(), { x: 0, y: 5 })))
    expect(useLook.getState().look).toBeNull()
    look(moved())
    act(() => take('mass'))
    expect(useLook.getState().look).toBeNull()
    act(() => letGo())
    look(moved())
    act(() => useUi.getState().openDialog('brief'))
    expect(useLook.getState().look).toBeNull()
  })

  it('started with the Brief window open, the Preview shows', () => {
    useUi.setState({ dialog: 'brief' })
    render(<App />)
    look(moved())
    expect(screen.getByRole('toolbar', { name: 'Preview' })).toBeInTheDocument()
  })
})
