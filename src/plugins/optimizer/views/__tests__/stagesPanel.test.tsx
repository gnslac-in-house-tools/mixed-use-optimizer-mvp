// The optimizer in stages (Decisions "Stages layout", "Stage plan"; P.1b): Optimize opens Stages in the left panel and
// Specimens in the right one (⤢ stands it wide under the viewport), and gives back what was open; the panel says what the optimizer does until a project
// turns it on, then shows the active option's plan (the typology's to start with; its head's drop-down starts it over
// from another plan template, + saves it as one); a stage's
// parameters are edited in a window, a draft until Save; ▶ Run starts the stage's attempt; Approve keeps the picked
// specimen as the plan's option and opens the next stage; by hand, a copy to edit; Reopen takes an approval back.
// jsdom has no Worker: a run goes on this thread (a small budget), or is made up (fixtures.ts).
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../../App.tsx'
import { derive } from '../../../../engine/derive.ts'
import { actions } from '../../../../state/actions/index.ts'
import { demoProject } from '../../../../state/demo.ts'
import { emptyHistory } from '../../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../../state/store.ts'
import { useToast } from '../../../../views/layout/toast.ts'
import { useUi } from '../../../../views/layout/ui.ts'
import { useLook } from '../../../../views/viewport/look.ts'
import { usePluginModes } from '../../../settings.ts'
import { useWidePane } from '../../../slots.tsx'
import { activeOf, OptimizerDataSchema, planIn, savePlan, turnOn, type OptimizerData } from '../../data.ts'
import { approve, moveStage, oneStagePlan, startAttempt, statusOf, typologyPlan } from '../../engine/stages.ts'
import { stagesFor } from '../../data.ts'
import { useRun } from '../../run/store.ts'
import { useStages } from '../stage/commands.ts'
import { useSpecimenView } from '../specimens/viewState.ts'
import { runOnDesign } from './fixtures.ts'

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

const data = () => OptimizerDataSchema.parse(useApp.getState().project.plugins?.optimizer)
const plan = () => planIn(data(), useApp.getState().option, useApp.getState().project)
/** A plan of one stage from the active template (Masses, a single run), stored. */
const masses = (d: OptimizerData) => savePlan(d, oneStagePlan('o1', activeOf(d)))
const button = () => screen.findByRole('tab', { name: 'Optimize' }, { timeout: 5000 })
const type = (field: HTMLElement, v: string) => {
  fireEvent.change(field, { target: { value: v } })
  fireEvent.blur(field)
}

async function openPanel() {
  render(<App />)
  fireEvent.click(await button())
  return within(await screen.findByRole('tabpanel', { name: 'Stages' }, { timeout: 5000 }))
}
async function turnedOn() {
  const panel = await openPanel()
  fireEvent.click(await panel.findByRole('button', { name: 'Turn on for this project' }, { timeout: 5000 }))
  return panel
}
/** The project turned on, its plan stored as given. */
function withData(f: (d: ReturnType<typeof turnOn>) => ReturnType<typeof turnOn>) {
  const p = useApp.getState().project
  useApp.setState({ project: { ...p, plugins: { optimizer: f(turnOn(p.typology, null)) } } })
}
/** The stage's window, its view loaded (a lazy chunk). */
async function stageWindow() {
  const win = within(await screen.findByRole('dialog', { name: 'Stage' }, { timeout: 5000 }))
  await win.findByRole('textbox', { name: 'Stage name' }, { timeout: 5000 })
  return win
}

describe('Optimize opens the stages', () => {
  /** A run to show (⤢ is on its line), Optimize pressed, then ⤢ in the right panel's Specimens. */
  async function wideSpecimens() {
    useRun.setState({ run: runOnDesign(useApp.getState().project, 10) })
    render(<App />)
    fireEvent.click(await button())
    const summary = within(screen.getByRole('complementary', { name: 'Summary' }))
    fireEvent.click(await summary.findByRole('button', { name: 'Wide, under the viewport' }, { timeout: 5000 }))
    return within(await screen.findByRole('region', { name: 'Specimens, wide' }, { timeout: 5000 }))
  }

  it('Stages on the left, Specimens on the right; pressed again, what was open comes back', async () => {
    render(<App />)
    fireEvent.click(await button())
    expect(useUi.getState()).toMatchObject({ rail: 'plugin:optimizer/stages', summaryTab: 'plugin:optimizer/specimens', panels: { left: true, right: true } })
    expect(useWidePane.getState().tab).toBeNull()
    expect(await within(screen.getByRole('complementary', { name: 'Layers and properties' })).findByRole('tabpanel', { name: 'Stages' }, { timeout: 5000 })).toBeInTheDocument()
    expect(within(screen.getByRole('complementary', { name: 'Summary' })).getByRole('tabpanel', { name: 'Specimens' })).toBeInTheDocument()
    expect(await button()).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(await button())
    expect(useUi.getState()).toMatchObject({ rail: 'layers', summaryTab: 'brief', panels: { left: true, right: false } })
  })

  it('⤢ stands Specimens wide under the viewport, the panel’s tab says so; pressed again, Optimize takes it back too', async () => {
    await wideSpecimens()
    expect(useWidePane.getState().tab).toBe('plugin:optimizer/specimens')
    expect(within(screen.getByRole('complementary', { name: 'Summary' })).getByText('The specimens stand under the viewport, wide.')).toBeInTheDocument()
    fireEvent.click(await button())
    expect(useUi.getState()).toMatchObject({ rail: 'layers', summaryTab: 'brief', panels: { left: true, right: false } })
    expect(useWidePane.getState().tab).toBeNull()
    expect(screen.queryByRole('region', { name: 'Specimens, wide' })).toBeNull()
  })

  it('folded, Specimens keeps its first line and the viewport takes the height', async () => {
    const pane = await wideSpecimens()
    fireEvent.click(await pane.findByRole('button', { name: 'Fold the specimens' }, { timeout: 5000 }))
    expect(useWidePane.getState().folded).toBe(true)
    expect(screen.queryByRole('separator', { name: /Divider between the viewport/ })).toBeNull()
    fireEvent.click(within(screen.getByRole('region', { name: 'Specimens, wide' })).getByRole('button', { name: 'Unfold the specimens' }))
    expect(useWidePane.getState().folded).toBe(false)
  })

  it('on a narrow screen: the Stages sheet, its Specimens button the Summary’s sheet on Specimens, and back', async () => {
    vi.stubGlobal('matchMedia', (media: string) => ({ media, matches: false, addEventListener: () => {}, removeEventListener: () => {} }))
    try {
      withData((d) => d)
      const panel = await openPanel()
      expect(useUi.getState()).toMatchObject({ sheet: 'left', rail: 'plugin:optimizer/stages', summaryTab: 'plugin:optimizer/specimens' })
      expect(useWidePane.getState().tab).toBeNull()
      fireEvent.click(await panel.findByRole('button', { name: 'Specimens' }, { timeout: 5000 }))
      expect(useUi.getState()).toMatchObject({ sheet: 'right', summaryTab: 'plugin:optimizer/specimens' })
      const specimens = await screen.findByRole('tabpanel', { name: 'Specimens' }, { timeout: 5000 })
      fireEvent.click(await within(specimens).findByRole('button', { name: '‹ Stages' }, { timeout: 5000 }))
      expect(useUi.getState()).toMatchObject({ sheet: 'left', rail: 'plugin:optimizer/stages' })
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('the Stages panel', () => {
  it('says what it does until the project turns it on (one undo step); then the typology’s plan, its drop-down on it', async () => {
    const panel = await openPanel()
    expect(await panel.findByText(/each specimen you keep becomes a new option/, undefined, { timeout: 5000 })).toBeInTheDocument()
    fireEvent.click(panel.getByRole('button', { name: 'Turn on for this project' }))
    expect(data()).toMatchObject({ on: true, active: 'masses' })
    const list = within(panel.getByRole('list', { name: 'The plan' }))
    expect(list.getAllByRole('button', { name: /^[①-⑤]/ }).map((b) => b.getAttribute('aria-label'))).toEqual([
      '① Grid, to do',
      '② Buildings, to do',
      '③ Docks, to do',
      '④ Streets, to do',
      '⑤ Parking, to do',
    ])
    expect(panel.getByRole('combobox', { name: 'Plan template' })).toHaveValue('typology')
    // the header has no ⋯ any more: the stage's own is the only one
    expect(panel.getAllByRole('button', { name: 'More actions' })).toHaveLength(1)
    expect(panel.queryByRole('button', { name: 'Remove plan template' })).toBeNull()
    // not stored until it changes
    expect(data().plans).toBeUndefined()
    act(() => useApp.getState().undo())
    expect(useApp.getState().project.plugins).toBeUndefined()
  })

  it('the typology’s plan by default: Grid → Buildings → Docks → Streets → Parking; a stage runs before the one before is approved (Decision "Free steps")', async () => {
    const panel = await turnedOn()
    expect(plan().stages.map((s) => s.name)).toEqual(['Grid', 'Buildings', 'Docks', 'Streets', 'Parking'])
    fireEvent.click(panel.getByRole('button', { name: '② Buildings, to do' }))
    expect(panel.getByText(/Runs on .+: ① Grid is not approved yet/)).toBeInTheDocument()
    expect(panel.getByRole('button', { name: /Run/ })).toBeEnabled()
    // + Stage from a template, at the end
    fireEvent.change(panel.getByRole('combobox', { name: 'Add a stage' }), { target: { value: 'masses-circulation' } })
    expect(plan().stages.map((s) => s.name)).toEqual(['Grid', 'Buildings', 'Docks', 'Streets', 'Parking', 'Masses + Circulation'])
  })

  it('+ saves the plan as a template (its stages, nothing run), the drop-down on it; another chosen starts over from it; × removes a saved one', async () => {
    // reordered: Docks first (still from the typology's)
    withData((d) => savePlan(d, moveStage(typologyPlan('o1', stagesFor(demoProject())), 'stage-3', 0)))
    const panel = await openPanel()
    const select = () => panel.getByRole('combobox', { name: 'Plan template' })
    const choose = (id: string) => fireEvent.change(select(), { target: { value: id } })
    expect(plan().stages.map((s) => s.name)).toEqual(['Docks', 'Grid', 'Buildings', 'Streets', 'Parking'])
    expect(await panel.findByRole('combobox', { name: 'Plan template' }, { timeout: 5000 })).toHaveValue('typology')
    fireEvent.click(panel.getByRole('button', { name: 'Save plan as template' }))
    expect(data().planTemplates).toEqual([expect.objectContaining({ id: 'plan-template-1', name: 'Docks → Grid → Buildings → Streets → Parking', from: 'user' })])
    // the plan now comes from it, one undo step
    expect(plan().from).toBe('plan-template-1')
    expect(select()).toHaveValue('plan-template-1')
    expect(within(select()).getAllByRole('option').map((o) => o.textContent)).toEqual(['The typology’s plan', 'Docks → Grid → Buildings → Streets → Parking'])
    // the typology's again, then the one saved
    choose('typology')
    expect(plan().stages.map((s) => s.name)).toEqual(['Grid', 'Buildings', 'Docks', 'Streets', 'Parking'])
    expect(select()).toHaveValue('typology')
    expect(panel.queryByRole('button', { name: 'Remove plan template' })).toBeNull()
    choose('plan-template-1')
    expect(plan().stages.map((s) => s.name)).toEqual(['Docks', 'Grid', 'Buildings', 'Streets', 'Parking'])
    // a stage ran: asks first
    act(() => useApp.setState({ project: { ...useApp.getState().project, plugins: { optimizer: savePlan(data(), startAttempt(plan(), 'stage-1')!) } } }))
    choose('typology')
    expect(useToast.getState().confirmation?.text).toMatch(/^Start over with the typology’s plan\?/)
    expect(plan().stages.map((s) => s.name)).toEqual(['Docks', 'Grid', 'Buildings', 'Streets', 'Parking'])
    act(() => useToast.getState().confirmation!.onContinue())
    expect(plan().stages.map((s) => s.name)).toEqual(['Grid', 'Buildings', 'Docks', 'Streets', 'Parking'])
    // × beside a saved one removes it; the plan stays, of its own
    choose('plan-template-1')
    fireEvent.click(panel.getByRole('button', { name: 'Remove plan template' }))
    expect(data().planTemplates).toEqual([])
    expect(plan().stages.map((s) => s.name)).toEqual(['Docks', 'Grid', 'Buildings', 'Streets', 'Parking'])
    expect(select()).toHaveValue('')
    expect(within(select()).getByRole('option', { name: 'A plan of its own' })).toBeDisabled()
  })

  it('a stage dragged onto another takes its place', async () => {
    withData((d) => savePlan(d, typologyPlan('o1', stagesFor(demoProject()))))
    const panel = await openPanel()
    const row = async (name: string) => (await panel.findByRole('button', { name }, { timeout: 5000 })).closest('li')!
    const docks = await row('③ Docks, to do')
    const grid = await row('① Grid, to do')
    fireEvent.dragStart(docks, { dataTransfer: { effectAllowed: '' } })
    fireEvent.dragOver(grid)
    fireEvent.drop(grid)
    expect(plan().stages.map((s) => s.name)).toEqual(['Docks', 'Grid', 'Buildings', 'Streets', 'Parking'])
  })

  it('a stage’s menu duplicates it, moves it, removes it', async () => {
    withData((d) => savePlan(d, typologyPlan('o1', stagesFor(demoProject()))))
    const panel = await openPanel()
    fireEvent.click(await panel.findByRole('button', { name: '① Grid, to do' }, { timeout: 5000 }))
    const menu = () => {
      const all = panel.getAllByRole('button', { name: 'More actions' })
      fireEvent.click(all.at(-1)!)
    }
    menu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move down' }))
    expect(plan().stages.map((s) => s.name)).toEqual(['Buildings', 'Grid', 'Docks', 'Streets', 'Parking'])
    menu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Duplicate' }))
    expect(plan().stages.map((s) => s.name)).toEqual(['Buildings', 'Grid', 'Grid copy', 'Docks', 'Streets', 'Parking'])
    menu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove' }))
    expect(plan().stages.map((s) => s.name)).toEqual(['Buildings', 'Grid copy', 'Docks', 'Streets', 'Parking'])
  })
})

describe('a stage’s window', () => {
  it('a draft of its parameters: Cancel lets it go, Save keeps it (one undo step); the first stage has no margin', async () => {
    withData(masses)
    const before = data().plans
    const panel = await openPanel()
    fireEvent.click(await panel.findByRole('button', { name: 'Edit…' }, { timeout: 5000 }))
    expect(useUi.getState().dialog).toBe('plugin:optimizer/stage')
    let win = await stageWindow()
    fireEvent.click(win.getByRole('button', { name: 'More' }))
    expect(win.getByText('The first stage: nothing earlier to keep.')).toBeInTheDocument()
    fireEvent.click(win.getByRole('button', { name: 'More' }))
    const may = within(win.getByRole('region', { name: 'What may change' }))
    expect(may.getByText('9 genes · 3 masses')).toBeInTheDocument()
    fireEvent.click(may.getByRole('checkbox', { name: 'Rotation' }))
    expect(may.getByText('6 genes · 3 masses')).toBeInTheDocument()
    // the circulation's choices (7.3): a gate's vehicles, the parking, the option's side. The stage does not
    // list them: the select offers them (Decision "Stage window by area")
    expect(may.queryByRole('checkbox', { name: 'Parking' })).toBeNull()
    fireEvent.change(may.getByRole('combobox', { name: 'Add what may change' }), { target: { value: 'parking.side' } })
    expect(may.getByRole('checkbox', { name: 'Parking' })).toBeChecked()
    expect(may.getByText('7 genes · 3 masses')).toBeInTheDocument()
    expect(may.queryByRole('checkbox', { name: 'Gates’ vehicles' })).toBeNull()
    // Cancel waits under ⋯
    fireEvent.click(win.getByRole('button', { name: 'More' }))
    fireEvent.click(win.getByRole('button', { name: 'Cancel' }))
    expect(useUi.getState().dialog).toBeNull()
    expect(data().plans).toEqual(before)

    fireEvent.click(panel.getByRole('button', { name: 'Edit…' }))
    win = await stageWindow()
    fireEvent.click(within(win.getByRole('region', { name: 'What may change' })).getByRole('checkbox', { name: 'Rotation' }))
    fireEvent.click(win.getByRole('button', { name: 'More' }))
    type(within(win.getByRole('region', { name: 'Budget' })).getByRole('textbox', { name: 'Seed' }), '7')
    type(win.getByRole('textbox', { name: 'Stage name' }), 'Footprints')
    fireEvent.click(win.getByRole('button', { name: 'Save' }))
    expect(plan().stages[0]).toMatchObject({ name: 'Footprints', template: { budget: { seed: 7 } } })
    expect(plan().stages[0].template.variables.map((v) => v.kind)).toEqual(['mass.position', 'warehouse.hall'])
    // its own copy: the project's template is as it was
    expect(data().templates[0].variables).toHaveLength(3)
    act(() => useApp.getState().undo())
    expect(data().plans).toEqual(before)
  })

  it('a warehouse type’s stage: its box and its courts may change, ticked, their range and step edited', async () => {
    const made = actions.addWarehouseType(useApp.getState().project)
    const placed = actions.placeWarehouse(made.project, made.id, { x: 200, y: 150 }, 0, 'o1')!
    act(() => useApp.getState().open(placed.project))
    const panel = await turnedOn()
    // the typology's plan, by default, starts from the type
    expect(plan().stages.map((x) => x.name)).toEqual(['Warehouse type', 'Placement', 'Streets', 'Parking'])
    fireEvent.click(panel.getAllByRole('button', { name: 'Edit…' })[0])
    const win = await stageWindow()
    const may = within(win.getByRole('region', { name: 'What may change' }))
    expect(may.getByRole('checkbox', { name: 'Warehouse box' })).toBeChecked()
    expect(may.getByRole('checkbox', { name: 'Court depth' })).toBeChecked()
    // the docks are the designer's (BE.3): no elements kind
    expect(may.queryByRole('checkbox', { name: 'Warehouse elements' })).toBeNull()
    // the masses' kinds are not this stage's: offered, not listed
    expect(may.queryByRole('checkbox', { name: 'Position' })).toBeNull()
    expect(within(may.getByRole('combobox', { name: 'Add what may change' })).getByRole('option', { name: 'Position' })).toBeInTheDocument()
    // the hall: ± 2 bays (without the type's range) by a module
    expect(may.getByRole('textbox', { name: 'Warehouse box range' })).toHaveValue('2')
    type(may.getByRole('textbox', { name: 'Warehouse box step' }), '2')
    fireEvent.click(win.getByRole('button', { name: 'Save' }))
    expect(plan().stages[0].template.variables).toEqual([
      { kind: 'warehouse.hall', step: 2 },
      { kind: 'court.depth', step: 1 },
    ])
  })

  it('a later stage’s margin: each kind an earlier stage varied, ± its steps', async () => {
    withData((d) => savePlan(d, typologyPlan('o1', stagesFor(demoProject()))))
    useStages.setState({ editing: { plan: 'plan-o1', option: 'o1', stage: 'stage-2' } })
    useUi.setState({ dialog: 'plugin:optimizer/stage' })
    render(<App />)
    const win = await stageWindow()
    fireEvent.click(win.getByRole('button', { name: 'More' }))
    const margin = within(win.getByRole('region', { name: 'Margin over earlier stages' }))
    expect(margin.getByText('Grid origin')).toBeInTheDocument()
    type(margin.getByRole('textbox', { name: 'Grid angle margin' }), '0')
    expect(margin.getByText('frozen')).toBeInTheDocument()
    fireEvent.click(win.getByRole('button', { name: 'Save' }))
    expect(plan().stages[1].margin).toEqual({ 'grid.angle': 0 })
  })
})

describe('a copy past its range (Decision "Past the range by hand", RB.2)', () => {
  it('▶ Run asks first, naming it: Cancel runs nothing; Run brings it back to its range and runs, one undo step', async () => {
    const made = actions.addWarehouseType(useApp.getState().project)
    const placed = actions.placeWarehouse(made.project, made.id, { x: 200, y: 150 }, 0, 'o1')!
    // grown by hand 60 m past the block's 200 m (its range without one: 176–224 m)
    const grown = actions.stretchWarehouseHall(placed.project, placed.id, { axis: 'length', end: 1 }, 60).project
    act(() => useApp.getState().open(grown))
    const length = () => useApp.getState().project.buildings.find((b) => b.id === placed.id)!.warehouse!.overrides?.hall?.length
    expect(length()).toBe(260)
    const panel = await turnedOn()
    expect(plan().stages[0].name).toBe('Warehouse type')
    fireEvent.click(panel.getAllByRole('button', { name: /Run/ })[0])
    const ask = within(await screen.findByRole('alertdialog', { name: 'Confirm' }))
    expect(ask.getByText(/1 copy is past its range: the optimizer brings it back to it \(.*260 m long, its range 176–224 m\)/)).toBeInTheDocument()
    expect(useRun.getState().run).toBeNull()
    fireEvent.click(ask.getByRole('button', { name: 'Cancel' }))
    expect(plan().stages[0].attempts).toHaveLength(0)
    expect(length()).toBe(260)
    // again, and Run
    fireEvent.click(panel.getAllByRole('button', { name: /Run/ })[0])
    fireEvent.click(within(await screen.findByRole('alertdialog', { name: 'Confirm' })).getByRole('button', { name: 'Run' }))
    expect(length()).toBe(224)
    expect(plan().stages[0].attempts).toHaveLength(1)
    expect(useRun.getState().run?.stage).toMatchObject({ stage: plan().stages[0].id, attempt: 0 })
    fireEvent.click(panel.getByRole('button', { name: /Stop/ }))
    // the run and the way back, one step
    act(() => useApp.getState().undo())
    expect(length()).toBe(260)
    expect(plan().stages[0].attempts).toHaveLength(0)
  })
})

describe('running and approving', () => {
  it('▶ Run: a new attempt on the stage’s input, its run with the stage, Specimens in the right panel', async () => {
    withData(masses)
    const panel = await openPanel()
    await panel.findByRole('button', { name: '① Masses, to do' }, { timeout: 5000 })
    act(() => useUi.getState().setSummaryTab('overview'))
    fireEvent.click(panel.getByRole('button', { name: /Run/ }))
    const run = useRun.getState().run!
    expect(run.stage).toEqual({ plan: 'plan-o1', stage: 'stage-1', attempt: 0 })
    expect(run.optionId).toBe('o1')
    expect(plan().stages[0].attempts).toHaveLength(1)
    expect(await panel.findByRole('button', { name: '① Masses, running' }, { timeout: 5000 })).toBeInTheDocument()
    expect(useUi.getState().summaryTab).toBe('plugin:optimizer/specimens')
    expect(useWidePane.getState().tab).toBeNull()
    fireEvent.click(panel.getByRole('button', { name: /Stop/ }))
    expect(await panel.findByRole('button', { name: '① Masses, to review' }, { timeout: 5000 })).toBeInTheDocument()
  })

  it('Approve #2: the specimen kept as the plan’s option, the app goes to it, one undo step; Reopen takes it back', async () => {
    const p = useApp.getState().project
    withData((d) => savePlan(d, startAttempt(oneStagePlan('o1', activeOf(d)), 'stage-1')!))
    useRun.setState({ run: { ...runOnDesign(p, 10), stage: { plan: 'plan-o1', stage: 'stage-1', attempt: 0 } } })
    const panel = await openPanel()
    expect(await panel.findByText(/Pick one in Specimens to approve it/, undefined, { timeout: 5000 })).toBeInTheDocument()
    expect(panel.getByRole('button', { name: 'Approve' })).toBeDisabled()
    act(() => useSpecimenView.getState().set({ picked: 2 }))
    // its review: the pick against the stage's input, its objectives first, what did not change folded
    const review = within(await panel.findByRole('region', { name: 'Review' }, { timeout: 5000 }))
    expect(review.getByText('#2 against Option 1')).toBeInTheDocument()
    expect(review.getAllByText('↓').length).toBeGreaterThan(0)
    const unchanged = review.getByRole('button', { name: /unchanged/ })
    expect(unchanged).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(unchanged)
    expect(unchanged).toHaveAttribute('aria-expanded', 'true')
    // the first stage has no earlier ones to move
    expect(review.queryByRole('region', { name: 'What moved of earlier stages' })).toBeNull()
    fireEvent.click(panel.getByRole('button', { name: 'Approve #2' }))
    await waitFor(() => expect(useApp.getState().project.options.map((o) => o.name)).toContain('① Masses · #2'))
    const made = useApp.getState().project.options.find((o) => o.name === '① Masses · #2')!
    expect(useApp.getState().option).toBe(made.id)
    // folded under the option the plan started from (Decision "Stage options")
    expect(made.group).toEqual({ under: 'o1', name: 'Stages' })
    // the same plan, found by the option it approved
    expect(plan().stages[0].approved).toEqual({ attempt: 0, option: made.id, specimen: 2 })
    expect(statusOf(plan(), 'stage-1')).toBe('approved')
    expect(await panel.findByText('Approved as ① Masses · #2.', undefined, { timeout: 5000 })).toBeInTheDocument()
    // approved: its option against its input
    expect(panel.getByText('① Masses · #2 against Option 1')).toBeInTheDocument()

    fireEvent.click(panel.getByRole('button', { name: 'Reopen' }))
    expect(useApp.getState().option).toBe('o1')
    expect(statusOf(plan(), 'stage-1')).toBe('review')
    act(() => useApp.getState().undo())
    act(() => useApp.getState().undo())
    expect(useApp.getState().project.options.map((o) => o.name)).not.toContain('① Masses · #2')
  })

  it('the way back to Massing (7.5): a stage of the circulation lists what only the masses can fix, and reopens the stage that moved them', async () => {
    // Warehouse 2 over Warehouse 1: an overlap no road or parking settles
    const p = actions.moveMasses(useApp.getState().project, ['m2'], { x: -150, y: 0 })
    useApp.setState({ project: p, derived: derive(p, 'o1') })
    let all = typologyPlan('o1', stagesFor(demoProject()))
    for (const s of all.stages) all = approve(all, s.id, 'o1')
    withData((d) => savePlan(d, all))
    const panel = await openPanel()
    fireEvent.click(await panel.findByRole('button', { name: '⑤ Parking, approved' }, { timeout: 5000 }))
    const masses = within(await panel.findByRole('region', { name: 'Only the masses can fix' }, { timeout: 5000 }))
    expect(masses.getByText(/Warehouse 1 and Warehouse 2 overlap/)).toBeInTheDocument()
    fireEvent.click(masses.getByRole('button', { name: '← Reopen ② Buildings' }))
    expect(plan().stages.map((s) => statusOf(plan(), s.id))).toEqual(['approved', 'todo', 'again', 'again', 'again'])
    // a stage that moves the masses says nothing of it
    fireEvent.click(panel.getByRole('button', { name: /^① Grid/ }))
    expect(panel.queryByRole('region', { name: 'Only the masses can fix' })).toBeNull()
  })

  it('the plan’s options fold under its option in the switch, unfolded while one of them is active (the tree of options went with the Brief tab: Phase AS.3)', async () => {
    let p = useApp.getState().project
    for (const name of ['① Masses · #2', '① Masses · by hand']) {
      const r = actions.addOption(p, { name })
      p = actions.setOptionGroup(r.project, r.id, { under: 'o1', name: 'Stages' })
    }
    useApp.setState({ project: p })
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Design option: Option 1' }))
    const menu = within(screen.getByRole('menu', { name: 'Design options' }))
    const group = menu.getByRole('menuitem', { name: /Stages \(Option 1\)/ })
    expect(group).toHaveAttribute('aria-expanded', 'false')
    expect(menu.queryByRole('menuitemradio', { name: /① Masses · #2/ })).toBeNull()
    fireEvent.click(group)
    // the latest first
    expect(menu.getAllByRole('menuitemradio').map((b) => b.querySelector('.flex-1')?.textContent)).toEqual(['Option 1', '① Masses · by hand', '① Masses · #2'])
  })

  it('by hand: a copy of the input to edit, then Approve takes it as it is', async () => {
    withData(masses)
    const panel = await openPanel()
    fireEvent.click(await panel.findByRole('button', { name: 'Edit…' }, { timeout: 5000 }))
    const win = await stageWindow()
    fireEvent.change(win.getByRole('combobox', { name: 'Who works it' }), { target: { value: 'hand' } })
    fireEvent.click(win.getByRole('button', { name: 'Start by hand' }))
    const copy = useApp.getState().project.options.find((o) => o.name === '① Masses · by hand')!
    expect(useApp.getState().option).toBe(copy.id)
    expect(plan().stages[0]).toMatchObject({ by: 'hand', attempts: [{ input: 'o1', worked: copy.id }] })
    // not linked: its buildings are copies
    expect(copy.buildingIds.some((id) => useApp.getState().project.options[0].buildingIds.includes(id))).toBe(false)
    expect(await panel.findByText(`You work on ${copy.name}: approve it as it is when it is ready.`, undefined, { timeout: 5000 })).toBeInTheDocument()
    fireEvent.click(panel.getByRole('button', { name: 'Approve' }))
    expect(plan().stages[0].approved?.option).toBe(copy.id)
  })

  it('Ask the agent: saved, and the stage’s request written in the Agent tab’s message, to send', async () => {
    // the agent's side listens once its button's module loads with the frame
    await import('../../../agent/ask.ts')
    withData(masses)
    const panel = await openPanel()
    fireEvent.click(await panel.findByRole('button', { name: 'Edit…' }, { timeout: 5000 }))
    const win = await stageWindow()
    fireEvent.change(win.getByRole('combobox', { name: 'Who works it' }), { target: { value: 'agent' } })
    fireEvent.change(win.getByRole('textbox', { name: 'The agent’s aim' }), { target: { value: 'Close the brief' } })
    fireEvent.click(win.getByRole('button', { name: 'Ask the agent' }))
    expect(plan().stages[0]).toMatchObject({ by: 'agent', aim: 'Close the brief' })
    expect(useUi.getState().rail).toBe('plugin:agent/chat')
    const message = await screen.findByRole('textbox', { name: 'Message' }, { timeout: 5000 })
    await waitFor(() => expect((message as HTMLTextAreaElement).value).toMatch(/^Work stage ① Masses \(stage-1\) of the plan on Option 1\. Its aim: Close the brief\. Read it with getStages/))
  })
})
