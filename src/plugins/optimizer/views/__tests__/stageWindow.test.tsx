// A stage's window (Decisions "Stages layout", "Stage window by area"; Phase Q): What may change lists the kinds the
// stage moves, grouped under their area; the other kinds are offered by one select. jsdom has no Worker: nothing runs.
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../../App.tsx'
import { derive } from '../../../../engine/derive.ts'
import { demoProject } from '../../../../state/demo.ts'
import { emptyHistory } from '../../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../../state/store.ts'
import { useToast } from '../../../../views/layout/toast.ts'
import { useUi } from '../../../../views/layout/ui.ts'
import { useLook } from '../../../../views/viewport/look.ts'
import { usePluginModes } from '../../../settings.ts'
import { useWidePane } from '../../../slots.tsx'
import { activeOf, OptimizerDataSchema, planIn, savePlan, turnOn, type OptimizerData } from '../../data.ts'
import { oneStagePlan } from '../../engine/stages.ts'
import { useRun } from '../../run/store.ts'
import { useStages } from '../stage/commands.ts'
import { useSpecimenView } from '../specimens/viewState.ts'

vi.mock('../../../../views/scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

beforeEach(() => {
  localStorage.clear()
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p, 'o1'), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', summaryTab: 'brief', panels: { left: true, right: false }, sheet: null, help: false })
  usePluginModes.setState({ modes: {} })
  useWidePane.setState({ tab: null, folded: false })
  useToast.setState({ toast: null, confirmation: null })
  useRun.getState().clear()
  useLook.setState({ look: null })
  useStages.setState({ picked: null, editing: null })
  useSpecimenView.setState({ follow: 'none' })
})

/** The Masses stage of the industrial demo (a plan of one stage from the active template), its window open. */
async function massesWindow(tweak: (d: OptimizerData) => OptimizerData = (d) => d) {
  const p = useApp.getState().project
  const d = tweak(turnOn(p.typology, null))
  useApp.setState({ project: { ...p, plugins: { optimizer: savePlan(d, oneStagePlan('o1', activeOf(d))) } } })
  render(<App />)
  fireEvent.click(await screen.findByRole('tab', { name: 'Optimize' }, { timeout: 5000 }))
  const panel = within(await screen.findByRole('tabpanel', { name: 'Stages' }, { timeout: 5000 }))
  fireEvent.click(await panel.findByRole('button', { name: 'Edit…' }, { timeout: 5000 }))
  const win = within(await screen.findByRole('dialog', { name: 'Stage' }, { timeout: 5000 }))
  await win.findByRole('textbox', { name: 'Stage name' }, { timeout: 5000 })
  return win
}
const headings = (region: HTMLElement) => within(region).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)

describe('What may change, by area', () => {
  it('lists only the stage’s own kinds, under their area', async () => {
    const win = await massesWindow()
    const region = win.getByRole('region', { name: 'What may change' })
    const may = within(region)
    expect(headings(region)).toEqual(['Massing'])
    expect(may.getAllByRole('checkbox').map((c) => c.closest('label')?.textContent)).toEqual(['Position', 'Rotation'])
    expect(may.queryByRole('checkbox', { name: 'Grid angle' })).toBeNull()
  })

  it('unticking a kind keeps its row, so it can be ticked back', async () => {
    const win = await massesWindow()
    const may = within(win.getByRole('region', { name: 'What may change' }))
    fireEvent.click(may.getByRole('checkbox', { name: 'Rotation' }))
    expect(may.getByRole('checkbox', { name: 'Rotation' })).not.toBeChecked()
    fireEvent.click(may.getByRole('checkbox', { name: 'Rotation' }))
    expect(may.getByRole('checkbox', { name: 'Rotation' })).toBeChecked()
  })

  it('the other kinds are offered by area; choosing one ticks it under its heading, in the rail’s order', async () => {
    const win = await massesWindow()
    const region = win.getByRole('region', { name: 'What may change' })
    const may = within(region)
    const add = may.getByRole('combobox', { name: 'Add what may change' })
    const site = within(add).getByRole('group', { name: 'Site' })
    expect(within(site).getByRole('option', { name: 'Grid angle' })).toBeInTheDocument()
    // what the stage lists is not offered again
    expect(within(add).queryByRole('option', { name: 'Rotation' })).toBeNull()
    fireEvent.change(add, { target: { value: 'grid.angle' } })
    expect(may.getByRole('checkbox', { name: 'Grid angle' })).toBeChecked()
    expect(headings(region)).toEqual(['Site', 'Massing'])
    // its row is kept when it is unticked
    fireEvent.click(may.getByRole('checkbox', { name: 'Grid angle' }))
    expect(may.getByRole('checkbox', { name: 'Grid angle' })).not.toBeChecked()
    expect(within(add).queryByRole('option', { name: 'Grid angle' })).toBeNull()
  })
})

const type = (field: HTMLElement, v: string) => {
  fireEvent.change(field, { target: { value: v } })
  fireEvent.blur(field)
}
const saved = () => {
  const { project, option } = useApp.getState()
  return planIn(OptimizerDataSchema.parse(project.plugins?.optimizer), option, project).stages[0].template
}

describe('Objectives, by area', () => {
  it('+ Objective offers by area (an empty one left out), the stage’s own area first, and never what is not an objective', async () => {
    const win = await massesWindow()
    const add = within(win.getByRole('region', { name: 'Objectives' })).getByRole('combobox', { name: 'Add an objective' })
    expect(within(add).getAllByRole('group').map((g) => g.getAttribute('label'))).toEqual(['Massing', 'Flow'])
    for (const label of ['Site area', 'Buildings', 'Brief Δ', 'Free ground', 'Overlap']) expect(within(add).queryByRole('option', { name: label })).toBeNull()
    expect(within(within(add).getByRole('group', { name: 'Massing' })).getByRole('option', { name: 'Built footprint' })).toBeInTheDocument()
  })

  it('a typology’s objective that is never offered is marked, kept, and gone for good once removed', async () => {
    const win = await massesWindow()
    const objectives = within(win.getByRole('region', { name: 'Objectives' }))
    expect(objectives.getAllByText('Brief Δ')).toHaveLength(1)
    const row = objectives.getByText('Brief Δ').closest('div') as HTMLElement
    expect(within(row).getByText('from the typology')).toBeInTheDocument()
    expect(within(row).getByRole('combobox', { name: 'Brief Δ: minimize or maximize' })).toBeInTheDocument()
    fireEvent.click(objectives.getByRole('button', { name: 'Remove Brief Δ' }))
    expect(objectives.queryByText('Brief Δ')).toBeNull()
    expect(within(objectives.getByRole('combobox', { name: 'Add an objective' })).queryByRole('option', { name: 'Brief Δ' })).toBeNull()
  })
})

describe('Must hold, readable', () => {
  it('the fixed rules are one locked line and no constraint is added by hand', async () => {
    const win = await massesWindow()
    const must = within(win.getByRole('region', { name: 'Must hold' }))
    const always = within(must.getByRole('group', { name: 'Always held' }))
    expect(always.getByText('Inside the buildable area · No overlaps · Required rules')).toBeInTheDocument()
    expect(always.queryByRole('textbox')).toBeNull()
    expect(always.queryByRole('checkbox')).toBeNull()
    expect(must.queryByRole('combobox', { name: 'Add a constraint' })).toBeNull()
    // the fixed rules and the COS are not lines of their own
    for (const label of ['Overlap', 'Outside the buildable area', 'Required rules gap', 'Coverage over the maximum']) expect(must.queryByText(label)).toBeNull()
  })

  it('the typology’s other constraints are lines marked from the typology, each with its value and a way out', async () => {
    const win = await massesWindow()
    const must = within(win.getByRole('region', { name: 'Must hold' }))
    const row = must.getByText('Courts blocked').closest('div') as HTMLElement
    expect(within(row).getByText('from the typology')).toBeInTheDocument()
    expect(within(row).getByRole('textbox', { name: 'Courts blocked: at most' })).toHaveValue('0')
    fireEvent.click(must.getByRole('button', { name: 'Remove Courts blocked' }))
    expect(must.queryByText('Courts blocked')).toBeNull()
  })

  it('the COS is strict, or allows some points over, stored as a share of the site', async () => {
    const win = await massesWindow()
    const site = useApp.getState().derived.metrics.siteArea
    expect(site).toBeGreaterThan(0)
    const coverage = within(win.getByRole('group', { name: 'Coverage' }))
    expect(coverage.getByRole('button', { name: 'Strict' })).toHaveAttribute('aria-pressed', 'true')
    expect(coverage.queryByRole('textbox', { name: 'points' })).toBeNull()
    fireEvent.click(coverage.getByRole('button', { name: 'Allow +' }))
    expect(coverage.getByRole('button', { name: 'Allow +' })).toHaveAttribute('aria-pressed', 'true')
    expect(coverage.getByRole('textbox', { name: 'points' })).toHaveValue('10')
    type(coverage.getByRole('textbox', { name: 'points' }), '15')
    fireEvent.click(win.getByRole('button', { name: 'Save' }))
    const max = saved().constraints.find((c) => c.measure === 'coverage-over')!.max
    expect(Math.abs(max - 0.15 * site)).toBeLessThan(1)
    // the other constraints and the fixed rules stay as they were
    expect(saved().constraints.map((c) => c.measure)).toEqual(['outside-buildable', 'overlap', 'required-gap', 'coverage-over', 'court-clash'])

    // reopened, it reads back as points; Strict writes 0
    const panel = within(await screen.findByRole('tabpanel', { name: 'Stages' }))
    fireEvent.click(await panel.findByRole('button', { name: 'Edit…' }))
    const again = within(await screen.findByRole('dialog', { name: 'Stage' }))
    const back = within(await again.findByRole('group', { name: 'Coverage' }))
    expect(back.getByRole('textbox', { name: 'points' })).toHaveValue('15')
    fireEvent.click(back.getByRole('button', { name: 'Strict' }))
    fireEvent.click(again.getByRole('button', { name: 'Save' }))
    expect(saved().constraints.find((c) => c.measure === 'coverage-over')!.max).toBe(0)
  })

  it('the COS reads back as stored: one point says "point", under half a point shows a decimal, never clamped to 1', async () => {
    const site = useApp.getState().derived.metrics.siteArea
    // a stage that allows 0.4 points over (stored as a share of the site)
    const win = await massesWindow((d) => ({
      ...d,
      templates: d.templates.map((t, i) => (i === 0 ? { ...t, constraints: t.constraints.map((c) => (c.measure === 'coverage-over' ? { ...c, max: 0.004 * site } : c)) } : t)),
    }))
    const coverage = within(win.getByRole('group', { name: 'Coverage' }))
    expect(coverage.getByRole('button', { name: 'Allow +' })).toHaveAttribute('aria-pressed', 'true')
    expect(coverage.getByRole('textbox', { name: 'points' })).toHaveValue('0.4')
    expect(coverage.getByText('points')).toBeInTheDocument()
    // typing 1 reads back as 1 point, singular
    type(coverage.getByRole('textbox', { name: 'points' }), '1')
    expect(coverage.getByRole('textbox', { name: 'points' })).toHaveValue('1')
    expect(coverage.getByText('point')).toBeInTheDocument()
    expect(coverage.queryByText('points')).toBeNull()
    // the field still takes whole points of 1 or more only
    type(coverage.getByRole('textbox', { name: 'points' }), '0')
    expect(coverage.getByRole('textbox', { name: 'points' })).toHaveValue('1')
  })

  it('without a boundary the COS is shown off, saying why', async () => {
    const p = useApp.getState().project
    const bare = { ...p, site: { ...p.site, boundary: null } }
    useApp.setState({ project: bare, derived: derive(bare, 'o1') })
    const win = await massesWindow()
    const coverage = win.getByRole('group', { name: 'Coverage' })
    expect(coverage).toHaveAttribute('title', "COS needs the site's boundary")
    expect(within(coverage).getByRole('button', { name: 'Strict' })).toBeDisabled()
    expect(within(coverage).getByRole('button', { name: 'Allow +' })).toBeDisabled()
  })
})

describe('The footer', () => {
  const footerOf = (win: ReturnType<typeof within>) => within(win.getByRole('contentinfo'))

  it('is Save, the stage’s action and ⋯, and nothing else', async () => {
    const win = await massesWindow()
    expect(footerOf(win).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent?.replace('▶', '').trim())).toEqual(['More', 'Save', 'Run'])
  })

  it('the Margin and Budget sections and Save as template wait under ⋯, closed whenever the window opens', async () => {
    const win = await massesWindow()
    const more = win.getByRole('button', { name: 'More' })
    expect(more).toHaveAttribute('aria-expanded', 'false')
    expect(win.queryByRole('region', { name: 'Budget' })).toBeNull()
    expect(win.queryByRole('region', { name: 'Margin over earlier stages' })).toBeNull()
    expect(win.queryByRole('button', { name: 'Save as template' })).toBeNull()
    expect(win.queryByRole('button', { name: 'Cancel' })).toBeNull()
    fireEvent.click(more)
    expect(more).toHaveAttribute('aria-expanded', 'true')
    const budget = within(win.getByRole('region', { name: 'Budget' }))
    for (const f of ['Population', 'Generations', 'Seed']) expect(budget.getByRole('textbox', { name: f })).toBeInTheDocument()
    expect(win.getByRole('region', { name: 'Margin over earlier stages' })).toBeInTheDocument()
    expect(win.getByRole('button', { name: 'Save as template' })).toBeInTheDocument()
    expect(win.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    // the footer itself did not grow
    expect(footerOf(win).getAllByRole('button')).toHaveLength(3)
    // folded again
    fireEvent.click(more)
    expect(win.queryByRole('region', { name: 'Budget' })).toBeNull()
  })

  it('what is edited under ⋯ is kept by Save, and Cancel lets the draft go', async () => {
    const win = await massesWindow()
    fireEvent.click(win.getByRole('button', { name: 'More' }))
    type(within(win.getByRole('region', { name: 'Budget' })).getByRole('textbox', { name: 'Seed' }), '7')
    fireEvent.click(win.getByRole('button', { name: 'Save' }))
    expect(saved().budget.seed).toBe(7)
  })

  it('Cancel, under ⋯, closes the window without saving', async () => {
    const win = await massesWindow()
    fireEvent.click(win.getByRole('button', { name: 'More' }))
    type(within(win.getByRole('region', { name: 'Budget' })).getByRole('textbox', { name: 'Seed' }), '7')
    fireEvent.click(win.getByRole('button', { name: 'Cancel' }))
    expect(useUi.getState().dialog).toBeNull()
    expect(useApp.getState().project.plugins?.optimizer && saved().budget.seed).not.toBe(7)
  })

  it('Save as template, under ⋯, stores the parameters as a template of the project', async () => {
    const win = await massesWindow()
    const before = OptimizerDataSchema.parse(useApp.getState().project.plugins?.optimizer).templates.length
    fireEvent.click(win.getByRole('button', { name: 'More' }))
    fireEvent.click(win.getByRole('button', { name: 'Save as template' }))
    expect(OptimizerDataSchema.parse(useApp.getState().project.plugins?.optimizer).templates.length).toBe(before + 1)
  })
})
