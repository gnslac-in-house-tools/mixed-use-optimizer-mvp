// The Rules step and the graph (Decisions "Graph mode", "Rules", "Steps"): the diagram of programs and the rules under
// it, drawing a rule, Properties of a rule, Solve all (in the Summary's Issues; then Massing), the lines' style, the
// guide, the 3D, the rules on the Massing plan and its issue markers (Decision "Issues, one list"). The demo's industrial rules: Office
// must be adjacent to Warehouse (rule1: its office is 40 m away, broken), Outdoor storage within 40 m of Warehouse
// (rule2) and Guard house at least 30 m from Warehouse (rule3), neither with masses yet.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../App.tsx'
import { overlayOn, toggleOverlay } from './overlays.ts'
import { derive } from '../../engine/derive.ts'
import { actions } from '../../state/actions/index.ts'
import { demoProject } from '../../state/demo.ts'
import { emptyHistory } from '../../state/history.ts'
import { NO_SELECTION, useApp } from '../../state/store.ts'
import { runCommand } from '../commands/index.ts'
import { useGraph } from '../graph/graphState.ts'
import { ISSUES, RULES } from '../layers/keys.ts'
import { isHidden, LAYERS_KEY } from '../layers/layerView.ts'
import { useIssueFocus } from '../plan/issueMarkers.ts'
import { useToast } from '../layout/toast.ts'
import { useUi } from '../layout/ui.ts'
import { useTool } from '../plan/tools/toolState.ts'
import { pickMenu } from './pickMenu.ts'
import { letGo } from '../tools/hand.ts'

vi.mock('../scene/Scene.tsx', () => ({ Scene: (props: { graph?: boolean }) => <div data-testid="scene" data-graph={String(props.graph === true)} /> }))

beforeEach(() => {
  localStorage.clear()
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p, 'o1'), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
  useUi.setState({ dialog: 'rules', view: 'plan', rail: 'properties', panels: { left: true, right: true }, sheet: null, help: false })
  useGraph.setState({ tool: 'select', kind: 'adjacent', rule: null, relation: null, lines: 'curved', share: 0.62, graph: false, pinned: {} })
  letGo()
  useToast.setState({ toast: null, confirmation: null })
  useIssueFocus.setState({ key: null, n: 0, highlight: false })
})

const s = () => useApp.getState()
const bubble = (id: string) => document.querySelector<SVGGElement>(`[data-bubble="${id}"]`)!
const line = (id: string) => document.querySelector<SVGGElement>(`[data-line="${id}"]`)! as unknown as HTMLElement
/** The top bar (Phase Q.8: the ribbon went), the drafting bar with the view switch, and the left panel. */
const bar = () => screen.getByRole('banner', { name: 'Top bar' })
const toolsBar = () => screen.getByRole('region', { name: 'Drafting' })
const leftPanel = () => screen.getByRole('complementary', { name: 'Layers and properties' })
/** The Rules window (Decision "Brief and Rules as windows"). */
const win = () => screen.getByRole('dialog', { name: 'Rules' })
/** The Summary's Issues tab, opened. */
const issuesTab = () => {
  fireEvent.click(within(screen.getByRole('tablist', { name: 'Summary' })).getByRole('tab', { name: /^Issues/ }))
  return screen.getByRole('region', { name: 'Issues' })
}
const type = (field: HTMLElement, v: string) => {
  fireEvent.change(field, { target: { value: v } })
  fireEvent.blur(field)
}

describe('the diagram of programs', () => {
  it('the Rules window: no site and no rectangles, a bubble per program and a line per rule, coloured by how their masses stand; the plan stays behind it', () => {
    // Design › Rules… opens the window (the Brief tab's Rules tile went: Phase AS.3)
    useUi.setState({ rail: 'layers' })
    render(<App />)
    expect(useUi.getState().dialog).toBe('rules')
    expect(screen.getByRole('img', { name: 'Site plan' })).toBeInTheDocument()
    expect(within(win()).queryByRole('img', { name: 'Site plan' })).toBeNull()
    expect(within(win()).getByRole('img', { name: 'Graph of programs' })).toBeInTheDocument()
    expect(['warehouse', 'office', 'guardhouse', 'outdoor-storage'].every((id) => bubble(id))).toBe(true)
    expect(line('rule1')).toHaveAttribute('data-color', 'var(--status-over)') // the demo's office is not against its warehouse
    expect(line('rule1')).toHaveTextContent('adjacent · 0/1')
    expect(line('rule2')).toHaveAttribute('data-color', 'var(--ink-tertiary)') // no outdoor storage yet
    expect(screen.getByRole('group', { name: 'Legend' })).toHaveTextContent('adjacentnearapartmoves with')
  })

  it('the guide is part of the help: off at first; the top bar’s ? shows the pipeline; × hides the help; the ? key brings it back', () => {
    useUi.setState({ dialog: null })
    render(<App />)
    expect(screen.queryByRole('region', { name: 'From site to massing' })).toBeNull()
    pickMenu('Help', 'Help')
    const guide = screen.getByRole('region', { name: 'From site to massing' })
    const steps = within(guide).getAllByRole('listitem')
    expect(steps).toHaveLength(5)
    ;['Site: where it goes', 'Brief: what the client asks', 'Rules: how the programs relate', '▶ Solve makes the geometry', 'Massing: edit by hand'].forEach((t, i) =>
      expect(steps[i]).toHaveTextContent(t),
    )
    fireEvent.click(within(guide).getByRole('button', { name: 'Hide the help' }))
    expect(screen.queryByRole('region', { name: 'From site to massing' })).toBeNull()
    expect(JSON.parse(localStorage.getItem('gfit.layout')!).help).toBe(false)
    fireEvent.keyDown(window, { key: '?' })
    expect(screen.getByRole('region', { name: 'From site to massing' })).toBeInTheDocument()
    expect(within(leftPanel()).queryByRole('button', { name: 'How it works' })).toBeNull() // the tools have no ? of their own
  })

  it('Draw rule: a drag from one program to another adds a rule of the chosen kind, in the list too; Properties edits it', () => {
    render(<App />)
    fireEvent.change(within(win()).getByRole('combobox', { name: 'New rule kind' }), { target: { value: 'near' } })
    expect(useGraph.getState().tool).toBe('rule')
    fireEvent.pointerDown(bubble('guardhouse'), { button: 0 })
    fireEvent.pointerUp(bubble('office'))
    expect(s().project.rules!.at(-1)).toEqual({ id: 'rule4', kind: 'near', a: 'guardhouse', b: 'office', weight: 1, max: 50 })
    expect(useGraph.getState().rule).toBe('rule4')
    expect(document.querySelector('[data-rule="rule4"]')).toHaveAttribute('aria-current', 'true')
    const props = screen.getByRole('region', { name: 'Rule' })
    expect(props).toHaveTextContent('Guard house within 50 m of Office')
    fireEvent.change(within(props).getByRole('combobox', { name: 'Kind' }), { target: { value: 'apart' } })
    expect(s().project.rules!.at(-1)).toMatchObject({ kind: 'apart', min: 30 })
    fireEvent.click(within(props).getByRole('checkbox'))
    expect(s().project.rules!.at(-1)).toMatchObject({ required: true })
    fireEvent.keyDown(window, { key: 'Delete' })
    expect(s().project.rules!.map((r) => r.id)).toEqual(['rule1', 'rule2', 'rule3'])
  })

  it('a click on a line picks its rule; dragging a bubble moves it in the diagram only', () => {
    render(<App />)
    fireEvent.pointerDown(within(line('rule1')).getByLabelText('adjacent · 0/1'))
    expect(useGraph.getState().rule).toBe('rule1')
    expect(screen.getByRole('region', { name: 'Rule' })).toHaveTextContent('0 of 1 mass meets it')
    const before = s().project
    fireEvent.pointerDown(bubble('office'), { button: 0, clientX: 100, clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(bubble('office'), { clientX: 160, clientY: 100, pointerId: 1 })
    fireEvent.pointerUp(bubble('office'), { pointerId: 1 })
    expect(useGraph.getState().pinned.office).toBeDefined()
    expect(s().project).toBe(before)
  })

  it('the lines: curved, straight or orthogonal', () => {
    render(<App />)
    const path = () => line('rule1').querySelectorAll('path')[1].getAttribute('d')!
    expect(path()).toContain('Q')
    fireEvent.change(within(win()).getByRole('combobox', { name: 'Lines' }), { target: { value: 'orthogonal' } })
    expect(path()).toMatch(/H.*V.*H/)
    fireEvent.change(within(win()).getByRole('combobox', { name: 'Lines' }), { target: { value: 'straight' } })
    expect(path()).toMatch(/^M[\d.\- ]+L/)
  })
})

describe('the rules under the graph', () => {
  const rule = (id: string) => document.querySelector<HTMLElement>(`[data-rule="${id}"]`)!

  it('the diagram above, the rules below, a divider between them that drags and remembers', () => {
    render(<App />)
    const rules = screen.getByRole('region', { name: 'Rules' })
    expect(within(rules).getAllByRole('listitem')).toHaveLength(3)
    const divider = screen.getByRole('separator', { name: 'Divider between the graph and its rules' })
    fireEvent.keyDown(divider, { key: 'ArrowUp' })
    expect(useGraph.getState().share).toBe(0.6)
    expect(JSON.parse(localStorage.getItem('gfit.graph')!).share).toBe(0.6)
    // Escape closes the window, and the list with it
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('region', { name: 'Rules' })).toBeNull()
  })

  it('one sentence per rule, with how its masses stand', () => {
    render(<App />)
    const list = screen.getByRole('list', { name: 'Rules of the brief' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(3)
    expect(within(rule('rule1')).getByRole('combobox', { name: 'First program of rule rule1' })).toHaveValue('office')
    expect(within(rule('rule1')).getByRole('combobox', { name: 'Kind of rule rule1' })).toHaveValue('adjacent')
    expect(within(rule('rule1')).getByRole('combobox', { name: 'Second program of rule rule1' })).toHaveValue('warehouse')
    expect(rule('rule1')).toHaveTextContent('0 of 1 meet it')
    expect(rule('rule2')).toHaveTextContent('no Outdoor storage yet')
    expect(within(rule('rule2')).getByRole('textbox', { name: 'Distance of rule rule2' })).toHaveValue('40')
  })

  it('a row and its line go together: a click on either picks the rule and marks the other', () => {
    render(<App />)
    fireEvent.click(rule('rule2'))
    expect(useGraph.getState().rule).toBe('rule2')
    expect(line('rule2').querySelectorAll('path')[1].getAttribute('stroke-width')).not.toBe(line('rule1').querySelectorAll('path')[1].getAttribute('stroke-width'))
    fireEvent.pointerDown(within(line('rule1')).getByLabelText('adjacent · 0/1'))
    expect(rule('rule1')).toHaveAttribute('aria-current', 'true')
    expect(rule('rule2')).not.toHaveAttribute('aria-current')
  })

  it('kind, distance, programs, required and why are one undo step each, and the graph follows; × removes; + Rule adds', () => {
    render(<App />)
    fireEvent.change(within(rule('rule1')).getByRole('combobox', { name: 'Kind of rule rule1' }), { target: { value: 'near' } })
    expect(s().project.rules![0]).toMatchObject({ kind: 'near', max: 50 })
    expect(rule('rule1')).toHaveTextContent('1 of 1 meet it') // the office is 40 m away
    expect(line('rule1')).toHaveAttribute('data-color', 'var(--status-within)')
    type(within(rule('rule1')).getByRole('textbox', { name: 'Distance of rule rule1' }), '30')
    expect(s().project.rules![0]).toMatchObject({ max: 30 })
    expect(line('rule1')).toHaveAttribute('data-color', 'var(--status-over)')
    fireEvent.change(within(rule('rule1')).getByRole('combobox', { name: 'Second program of rule rule1' }), { target: { value: 'guardhouse' } })
    expect(s().project.rules![0]).toMatchObject({ b: 'guardhouse' })
    fireEvent.click(within(rule('rule1')).getByRole('checkbox'))
    expect(s().project.rules![0]).toMatchObject({ required: true })
    type(within(rule('rule1')).getByRole('textbox', { name: 'Why of rule rule1' }), 'Close to the gate')
    expect(s().project.rules![0]).toMatchObject({ reason: 'Close to the gate' })
    fireEvent.click(within(rule('rule3')).getByRole('button', { name: 'Remove rule rule3' }))
    expect(s().project.rules!.map((r) => r.id)).toEqual(['rule1', 'rule2'])
    expect(document.querySelector('[data-line="rule3"]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '+ Rule' }))
    expect(s().project.rules!.at(-1)).toMatchObject({ a: 'office', b: 'warehouse', kind: 'adjacent' })
    expect(useGraph.getState().rule).toBe(s().project.rules!.at(-1)!.id)
  })
})

describe('Solve and the keys', () => {
  it('each program says how many of its masses are placed; its ring is dashed while the brief asks for more', () => {
    render(<App />)
    expect(bubble('guardhouse')).toHaveTextContent('0 of 1 placed')
    expect(bubble('guardhouse')).toHaveAttribute('data-missing', 'true')
    expect(bubble('warehouse')).toHaveTextContent('2 of 2 placed')
    expect(bubble('warehouse')).not.toHaveAttribute('data-missing')
  })

  it('Solve all (Issues) places the guard house the brief asks for, brings the office to its warehouse in one undo step, and opens Massing', () => {
    render(<App />)
    // the bars have no Solve (Decision "Issues, one list")
    expect(within(bar()).queryByRole('button', { name: /Solve/ })).toBeNull()
    expect(within(leftPanel()).queryByRole('button', { name: /Solve/ })).toBeNull()
    const before = s().project.masses.find((m) => m.id === 'm1')
    fireEvent.click(within(issuesTab()).getByRole('button', { name: 'Solve all' }))
    expect(s().project.masses.filter((m) => m.programId === 'guardhouse')).toHaveLength(1)
    expect(s().derived.relations.every((r) => r.met)).toBe(true)
    expect(s().project.masses.find((m) => m.id === 'm1')).toEqual(before) // the dominant warehouse stays
    expect(useToast.getState().toast?.text).toBe('Solved: 1 mass placed from the brief · 3 of 3 relations met.')
    expect(s().history.past).toHaveLength(1)
    expect(useUi.getState().rail).toBe('properties')
    expect(screen.getByRole('img', { name: 'Site plan' })).toBeInTheDocument()
    act(() => useUi.getState().openDialog('rules'))
    expect(line('rule1')).toHaveAttribute('data-color', 'var(--status-within)')
    expect(bubble('guardhouse')).toHaveTextContent('1 of 1 placed')
    // nothing left that Solve settles
    expect(within(issuesTab()).getByRole('button', { name: 'Solve all' })).toBeDisabled()
    fireEvent.keyDown(window, { key: 's' }) // the Rules window's own S
    expect(useToast.getState().toast?.text).toBe('Nothing to solve: the brief’s masses are placed and every rule is met.')
  })

  it('no + Node: masses come from the brief', () => {
    render(<App />)
    expect(within(bar()).queryByRole('button', { name: '+ Node' })).toBeNull()
    expect(within(leftPanel()).queryByRole('button', { name: '+ Node' })).toBeNull()
  })

  it('keys: R draws rules, S solves, Escape lets go; the plan’s drawing keys do nothing', () => {
    render(<App />)
    fireEvent.keyDown(window, { key: 'r' })
    expect(useGraph.getState().tool).toBe('rule')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(useGraph.getState().tool).toBe('select')
    fireEvent.keyDown(window, { key: 'b' })
    expect(useTool.getState().tool).toBe('select')
    fireEvent.keyDown(window, { key: 's' })
    expect(s().derived.relations.every((r) => r.met)).toBe(true)
    expect(useUi.getState().rail).toBe('properties')
  })
})

describe('3D and the massing', () => {
  it('the command line names the plan’s keys, with the help on; the graph’s are the Rules window’s', () => {
    useUi.setState({ dialog: null, help: true })
    render(<App />)
    expect(screen.getByRole('group', { name: 'Command' })).toHaveTextContent('T measures · Ctrl+Enter solves')
    expect(screen.getByRole('group', { name: 'Command' })).not.toHaveTextContent('R draws a rule')
  })

  it('3D shows the graph over the masses with Massing’s Graph on; the diagram is the Rules window’s, never the viewport’s', async () => {
    useUi.setState({ dialog: null })
    useGraph.setState({ graph: true })
    render(<App />)
    fireEvent.click(within(toolsBar()).getByRole('tab', { name: '3D' }))
    expect((await screen.findByTestId('scene')).getAttribute('data-graph')).toBe('true')
    fireEvent.click(within(toolsBar()).getByRole('tab', { name: 'Split' }))
    expect(screen.queryByRole('img', { name: 'Graph of programs' })).toBeNull()
    expect(screen.getByRole('img', { name: 'Site plan' })).toBeInTheDocument()
    expect(screen.getByTestId('scene')).toBeInTheDocument()
  })

  it('Massing draws the broken rules on the plan; View › Overlays › Rules turns them on or off; a met one goes out', () => {
    useUi.setState({ dialog: null })
    render(<App />)
    const arc = () => document.querySelector('[data-rule-arc="rule1|m3|m1"]')
    expect(arc()).toHaveAttribute('data-met', 'false')
    // Rules is on or off (Decision "Bottom bar": no *all*): View › Overlays, and the Rules row of Layers
    expect(overlayOn('rules')).toBe(true)
    toggleOverlay('rules')
    expect(document.querySelector('[data-rules-layer]')).toBeNull()
    expect(isHidden(RULES)).toBe(true)
    expect(JSON.parse(localStorage.getItem(LAYERS_KEY)!)[s().project.id].hidden).toEqual([RULES])
    toggleOverlay('rules')
    expect(overlayOn('rules')).toBe(true)
    expect(isHidden(RULES)).toBe(false)
    expect(arc()).toHaveAttribute('data-met', 'false')
    act(() => s().apply((p) => actions.solve(p, 'o1', 'l1').project))
    expect(arc()).toBeNull() // met: out
  })
})

describe('the graph in Massing', () => {
  beforeEach(() => useUi.setState({ dialog: null }))

  it('View › Overlays › Graph (the Program graph row of Layers): the masses go ghost and the graph is drawn over them, where they are; again, back (Decision "Show fixed")', () => {
    render(<App />)
    expect(document.querySelector('[data-graph-layer]')).toBeNull()
    toggleOverlay('graph')
    expect(useGraph.getState().graph).toBe(true)
    expect(overlayOn('graph')).toBe(true)
    expect(['m1', 'm2', 'm3'].every((id) => document.querySelector(`[data-graph-bubble="${id}"]`))).toBe(true)
    expect(document.querySelector('[data-relation="rule1|m3|m1"]')).toHaveAttribute('data-met', 'false')
    expect(document.querySelector('[data-rules-layer]')).toBeNull() // the graph takes the arcs' place
    expect(document.querySelector('[data-mass="m1"]')).toHaveAttribute('fill-opacity', '0.14')
    toggleOverlay('graph')
    expect(document.querySelector('[data-graph-layer]')).toBeNull()
  })

  it('a line picks its relation for Properties; Edit the rule goes to step 2', () => {
    useGraph.setState({ graph: true })
    render(<App />)
    const hit = document.querySelector('[data-relation="rule1|m3|m1"]')!.querySelectorAll('path')[2]
    fireEvent.pointerDown(hit)
    expect(useGraph.getState().relation).toBe('rule1|m3|m1')
    const props = screen.getByRole('region', { name: 'Relation' })
    expect(props).toHaveTextContent('Office 1 – Warehouse 1')
    fireEvent.click(within(props).getByRole('button', { name: 'Edit the rule' }))
    expect(useUi.getState().dialog).toBe('rules')
    expect(useGraph.getState().rule).toBe('rule1')
  })

  it('no Solve in Massing’s bar; Ctrl+Enter solves all and stays in Massing; the graph has no key (G is the Gate); ? the guide', () => {
    render(<App />)
    act(() => void runCommand('view.overlay.graph'))
    expect(useGraph.getState().graph).toBe(true)
    expect(within(bar()).queryByRole('button', { name: /Solve/ })).toBeNull()
    expect(within(leftPanel()).queryByRole('button', { name: /Solve/ })).toBeNull()
    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true })
    expect(useUi.getState().rail).toBe('properties')
    expect(document.querySelector('[data-relation="rule1|m3|m1"]')).toHaveAttribute('data-met', 'true')
    // nothing left: the key says why, with Solve all's own reason (it is greyed with it)
    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true })
    expect(useToast.getState().toast?.text).toBe('Nothing here Solve can settle')
    fireEvent.keyDown(window, { key: '?' })
    expect(screen.getByRole('region', { name: 'From site to massing' })).toBeInTheDocument()
    act(() => void runCommand('view.overlay.graph'))
    expect(useGraph.getState().graph).toBe(false)
  })

  it('in 3D, the graph floats over the ghosted masses while Graph is on', async () => {
    useUi.setState({ view: '3d' })
    render(<App />)
    expect((await screen.findByTestId('scene')).getAttribute('data-graph')).toBe('false')
    toggleOverlay('graph')
    expect(screen.getByTestId('scene').getAttribute('data-graph')).toBe('true')
  })
})

describe('issues on the massing', () => {
  const marker = (key: string) => document.querySelector<SVGGElement>(`[data-issue-marker="${key}"]`)! as unknown as HTMLElement
  beforeEach(() => useUi.setState({ dialog: null }))

  it('a chip where the rule breaks, on its arc, its message in its tooltip; a click shows it picked in the Summary’s Issues', () => {
    useUi.setState({ summaryTab: 'overview' })
    render(<App />)
    const chip = marker('pair:m1|m3')
    expect(chip).toHaveAttribute('data-severity', 'warning')
    expect(chip).toHaveTextContent('!')
    const message = 'Office 1 and Warehouse 1: Office must be adjacent to Warehouse; they share 0 m of wall.'
    expect(chip.querySelector('title')).toHaveTextContent(message)
    // the measure is in the message: the arc does not repeat it under the chip
    expect(document.querySelector('[data-rules-layer]')).not.toHaveTextContent('0 m of wall')
    fireEvent.click(chip)
    // no window over the plan: the Issues tab, that issue picked
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(useUi.getState().summaryTab).toBe('issues')
    const item = document.querySelector('[data-issue-place="pair:m1|m3"]')!
    expect(item).toHaveAttribute('aria-current', 'true')
    expect(item).toHaveTextContent(message)
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    // the brief's gap has no place: never picked by a chip
    expect(within(screen.getByRole('region', { name: 'Brief and design' })).getByRole('listitem')).not.toHaveAttribute('aria-current')
  })

  it('Edit the rule (Issues) goes to it in step 2, picked in the rules list', () => {
    render(<App />)
    fireEvent.click(marker('pair:m1|m3'))
    fireEvent.click(within(screen.getByRole('region', { name: 'Rules' })).getByRole('button', { name: 'Edit the rule' }))
    expect(useUi.getState().dialog).toBe('rules')
    expect(useGraph.getState()).toMatchObject({ rule: 'rule1' })
    expect(document.querySelector('[data-rule="rule1"]')).toHaveAttribute('aria-current', 'true')
  })

  it('its message goes to it (both masses selected); its own Solve settles it alone, one undo step; the chip goes', () => {
    render(<App />)
    fireEvent.click(marker('pair:m1|m3'))
    const rules = screen.getByRole('region', { name: 'Rules' })
    fireEvent.click(within(rules).getByRole('button', { name: /Office must be adjacent/ }))
    expect([...s().selection.massIds].sort()).toEqual(['m1', 'm3'])
    const guard = s().project.masses.filter((m) => m.programId === 'guardhouse').length
    fireEvent.click(within(rules).getByRole('button', { name: 'Solve' }))
    expect(s().derived.relations.find((r) => r.rule === 'rule1')!.met).toBe(true)
    // only that: the guard house the brief asks for is still missing
    expect(s().project.masses.filter((m) => m.programId === 'guardhouse')).toHaveLength(guard)
    expect(s().history.past).toHaveLength(1)
    expect(useToast.getState().toast?.text).toBe('Solved: its masses moved, the rest stayed.')
    // its chip goes (the street the office now stands on warns of its own: Decision "Streets")
    expect(document.querySelector('[data-issue-marker="pair:m1|m3"]')).toBeNull()
    expect(screen.queryByRole('region', { name: 'Rules' })).toBeNull()
  })

  it('one chip per mass for its own issues, red when one is an error; View › Overlays › Issues hides them', () => {
    // the office outside the site: outside the buildable area is an error about it alone
    useApp.setState((st) => {
      const p = actions.moveMass(st.project, 'm3', { x: 0, y: 200 })
      return { project: p, derived: derive(p, 'o1') }
    })
    render(<App />)
    expect(marker('mass:m3')).toHaveAttribute('data-severity', 'error')
    toggleOverlay('issues')
    expect(document.querySelector('[data-issue-markers]')).toBeNull()
    expect(isHidden(ISSUES)).toBe(true)
    expect(JSON.parse(localStorage.getItem(LAYERS_KEY)!)[s().project.id].hidden).toEqual([ISSUES])
  })
})
