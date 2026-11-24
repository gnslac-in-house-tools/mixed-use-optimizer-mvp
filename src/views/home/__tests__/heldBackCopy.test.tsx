// Copy that promised the held-back plugins (Decision "Coming soon") or the old Save: true in both states, held back and
// not. Home's three ways to model, About, the Brief's road-width ranges, and the sample tour's chapter and numbering.
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../App.tsx'
import { demoProject } from '../../../state/demo.ts'
import { derive } from '../../../engine/derive.ts'
import { emptyHistory } from '../../../state/history.ts'
import { useApp } from '../../../state/store.ts'
import { COMING_SOON, usePluginModes } from '../../../plugins/index.ts'
import { chapters, stepsOf } from '../../tour/tour.ts'
import { STEPS } from '../../tour/steps.ts'
import { AboutView } from '../AboutView.tsx'
import { useUi } from '../../layout/ui.ts'
import { useScreen } from '../screen.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

beforeEach(() => {
  localStorage.clear()
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory() })
  useScreen.setState({ home: true, homeView: 'projects' })
  usePluginModes.setState({ soon: {}, locks: {} })
})
afterEach(() => {
  cleanup()
  usePluginModes.setState({ soon: {}, locks: {} })
})

const ways = () => within(screen.getByRole('list', { name: 'Three ways to model' }))
const card = (name: string) => ways().getByText(name).closest('li')!

describe('Home’s three ways to model', () => {
  it('offers the optimizer while it is available, and says "Coming soon" on both cards while they are held back', () => {
    render(<App />)
    expect(within(card('Optimizer')).queryByText('Coming soon')).toBeNull()
    expect(within(card('Agent')).getByText('Not in this demo')).toBeInTheDocument()
    cleanup()
    usePluginModes.setState({ soon: COMING_SOON })
    render(<App />)
    expect(within(card('Optimizer')).getByText('Coming soon')).toBeInTheDocument()
    expect(within(card('Agent')).getByText('Coming soon')).toBeInTheDocument()
    expect(within(card('Agent')).queryByText('Not in this demo')).toBeNull()
  })
})

describe('About', () => {
  it('a .gft is the project with its options (the undo history is not in it), and the work is kept as you go, not "until a file is saved"', () => {
    render(<AboutView />)
    const about = screen.getByRole('region', { name: 'About' })
    expect(about).not.toHaveTextContent(/options and history/)
    expect(about).not.toHaveTextContent(/until a file is saved/)
    expect(about).toHaveTextContent(/saved as you work/)
  })

  it('the Optimizer and Agent rows say coming soon only while they are held back; the server line names the agent only when it is there', () => {
    render(<AboutView />)
    const section = () => screen.getByRole('region', { name: 'Three ways to model' })
    expect(section()).not.toHaveTextContent(/coming soon/i)
    expect(screen.getByRole('region', { name: 'Where the work is kept' })).toHaveTextContent('ask the agent')
    cleanup()
    usePluginModes.setState({ soon: COMING_SOON })
    render(<AboutView />)
    expect(section()).toHaveTextContent(/Optimizer.*coming soon/i)
    expect(section()).toHaveTextContent(/Agent.*coming soon/i)
    expect(screen.getByRole('region', { name: 'Where the work is kept' })).not.toHaveTextContent('agent')
  })
})

describe('the sample tour’s chapter on the ways to model', () => {
  it('nothing held back: Three ways to model, 1 · By hand, 2 · With the optimizer, 3 · With an agent, and the Welcome step', () => {
    expect(chapters('tour')).toContain('Three ways to model')
    const titles = stepsOf('tour').filter((s) => s.chapter === 'Three ways to model').map((s) => s.title)
    expect(titles).toEqual(['1 · By hand', 'Walls, corners and chamfers', 'Buildings first, then the streets', '2 · With the optimizer', 'Run, then keep what you like', '3 · With an agent'])
    expect(stepsOf('tour').some((s) => s.id === 'three-ways' && s.title === 'Three ways to model')).toBe(true)
    expect(STEPS.map((s) => s.id)).toEqual(stepsOf('tour').map((s) => s.id))
  })

  it('both held back: the chapter is not "Three ways", and By hand is not numbered 1 of nothing', () => {
    usePluginModes.setState({ soon: COMING_SOON })
    expect(chapters('tour')).not.toContain('Three ways to model')
    expect(chapters('tour')).toContain('Modeling by hand')
    const byHand = stepsOf('tour').find((s) => s.id === 'by-hand')!
    expect(byHand.title).toBe('By hand')
    expect(stepsOf('tour').some((s) => s.title === 'Three ways to model')).toBe(false)
  })

  it('only the optimizer held back: two ways, the agent is 2', () => {
    usePluginModes.setState({ soon: { optimizer: COMING_SOON.optimizer } })
    expect(chapters('tour')).toContain('Two ways to model')
    const titles = stepsOf('tour').filter((s) => s.chapter === 'Two ways to model').map((s) => s.title)
    expect(titles[0]).toBe('1 · By hand')
    expect(titles.at(-1)).toBe('2 · With an agent')
  })
})

describe('the Brief’s road-width ranges', () => {
  it('say "Search range", not "Optimizer searches": true while the optimizer is held back too', () => {
    for (const soon of [{}, COMING_SOON]) {
      usePluginModes.setState({ soon })
      useScreen.setState({ home: false })
      useUi.setState({ dialog: 'brief', briefTab: 'circulation' })
      render(<App />)
      const section = screen.getByRole('region', { name: 'Circulation standards' })
      expect(section).not.toHaveTextContent('Optimizer searches')
      expect(within(section).getAllByText('Search range').length).toBeGreaterThan(0)
      cleanup()
    }
  })
})
