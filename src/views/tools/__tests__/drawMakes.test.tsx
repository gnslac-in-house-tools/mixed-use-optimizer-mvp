// *Draw makes* shows what Draw draws (Massing ▾, tools/MassProgram.tsx; Decisions "Mass with its program", "Draw makes a block"): a
// block of a program's type, the stroke its outer face, drawn free. With nothing picked yet it is the brief's first program (▦ before it
// when it has its type); once anything is picked (a program, No program) the pick rules. There is no type to pick: the type is the program's.
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Project } from '../../../model/schema.ts'
import { derive } from '../../../engine/derive.ts'
import { actions } from '../../../state/actions/index.ts'
import { demoProject } from '../../../state/demo.ts'
import { emptyHistory } from '../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../state/store.ts'
import { newMassProgram, useMassProgram } from '../../plan/tools/toolState.ts'
import { App } from '../../../App.tsx'
import { letGo, take } from '../hand.ts'
import { MassProgram } from '../MassProgram.tsx'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const open = (p: Project) => useApp.setState({ project: p, derived: derive(p, 'o1'), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
const select = () => screen.getByRole('combobox', { name: 'New block’s program' }) as HTMLSelectElement
const shown = () => select().selectedOptions[0]

/** The demo with a block type defining its first program. */
const withType = () => {
  const p = demoProject()
  const first = p.programs[0].id
  const made = actions.addWarehouseType(p, { program: first })
  return { p: made.project, first, type: made.id }
}

beforeEach(() => {
  useMassProgram.setState({ programId: undefined })
  letGo()
  open(demoProject())
})

describe('Draw makes', () => {
  it('(a) nothing picked: the brief’s first program, ▦ before it when it has its type', () => {
    const { p, first } = withType()
    open(p)
    render(<MassProgram />)
    expect(newMassProgram(p)).toBe(first)
    expect(select().value).toBe(first)
    expect(shown().textContent).toMatch(/^▦ /)
    expect(screen.getByRole('option', { name: 'No program' })).not.toHaveProperty('selected', true)
  })

  it('(b) the first program with no type: the program, plain, no ▦', () => {
    const p = demoProject()
    open(p)
    render(<MassProgram />)
    expect(newMassProgram(p)).toBe(p.programs[0].id)
    expect(select().value).toBe(p.programs[0].id)
    expect(shown().textContent).not.toMatch(/^▦ /)
  })

  it('(c) after picking No program: Draw makes a block of none, and the select says so', () => {
    const { p } = withType()
    open(p)
    render(<MassProgram />)
    fireEvent.change(select(), { target: { value: '' } })
    expect(useMassProgram.getState()).toMatchObject({ programId: null })
    expect(newMassProgram(useApp.getState().project)).toBeNull()
    expect(select().value).toBe('')
    expect(shown().textContent).toBe('No program')
  })

  it('(d) after picking another program: that program', () => {
    const { p } = withType()
    open(p)
    render(<MassProgram />)
    const other = p.programs.find((g) => g.id !== p.programs[0].id)!
    fireEvent.change(select(), { target: { value: other.id } })
    expect(newMassProgram(useApp.getState().project)).toBe(other.id)
    expect(select().value).toBe(other.id)
  })

  it('a type added later shows its ▦ with no reload', () => {
    const p = demoProject()
    open(p)
    render(<MassProgram />)
    expect(shown().textContent).not.toMatch(/^▦ /)
    const made = withType()
    act(() => open(made.p))
    expect(shown().textContent).toMatch(/^▦ /)
  })

  it('the program picked is removed from the brief: Draw and the select agree on what is left', () => {
    const p = demoProject()
    open(p)
    render(<MassProgram />)
    const other = 'guardhouse'
    fireEvent.change(select(), { target: { value: other } })
    act(() => open(actions.removeProgram(useApp.getState().project, other)))
    const now = useApp.getState().project
    // the pick is no longer in the brief: the brief's first
    expect(newMassProgram(now)).toBe(now.programs[0].id)
    expect(select().value).toBe(now.programs[0].id)
  })

  it('the Draw tool on the plan is the one tool, with or without a type: no drag in whole modules', () => {
    const { p } = withType()
    open(p)
    render(<App />)
    act(() => void take('mass'))
    expect(document.querySelector('[data-tool="warehouse"]')).toBeNull()
    expect(document.querySelector('[data-tool="mass"]')).not.toBeNull()
    act(() => useMassProgram.getState().setProgram(null))
    expect(document.querySelector('[data-tool="mass"]')).not.toBeNull()
  })
})
