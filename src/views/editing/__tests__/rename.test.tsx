// Rename (Phase AS.4, Decision "One menu"): F2, Edit › Rename and the right-click menu's Rename open the Properties tab on the mass and its name field takes the
// focus with its text selected; F2 does nothing while a field is being typed in; a locked mass or several are greyed with their reason.
// Demo masses: m1 x 40…200 y 70…150 and m2 x 250…390 y 70…150 (warehouses); m3 x 100…140 y 190…210 (office).
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../App.tsx'
import { derive } from '../../../engine/derive.ts'
import { actions } from '../../../state/actions/index.ts'
import { demoProject } from '../../../state/demo.ts'
import { emptyHistory } from '../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../state/store.ts'
import { commandOf } from '../../commands/index.ts'
import { useToast } from '../../layout/toast.ts'
import { useUi } from '../../layout/ui.ts'
import { menuFor } from '../menu/build.ts'
import { leaf } from '../menu/__tests__/helpers.ts'
import { useRename } from '../rename.ts'
import { letGo } from '../../tools/hand.ts'
import { letGoAll } from '../../plan/mix.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const s = () => useApp.getState()
const name = () => screen.getByRole('textbox', { name: /^Name/ }) as HTMLInputElement

beforeEach(() => {
  localStorage.clear()
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false })
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null })
  useRename.setState({ asked: null })
  letGo()
  letGoAll()
  useToast.setState({ toast: null, confirmation: null })
})

describe('Rename of a mass', () => {
  it('F2 opens Properties and the name field takes the focus, its text selected', async () => {
    render(<App />)
    act(() => s().select('m3'))
    expect(screen.queryByRole('textbox', { name: /^Name/ })).toBeNull()
    fireEvent.keyDown(window, { key: 'F2' })
    expect(useUi.getState().rail).toBe('properties')
    const field = name()
    expect(field).toHaveFocus()
    expect(field.value).toBe('Office 1')
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, 'Office 1'.length])
    // typing replaces the name, Enter commits it: one undo step
    fireEvent.change(field, { target: { value: 'Front office' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(s().project.masses.find((m) => m.id === 'm3')!.name).toBe('Front office')
    // the request was taken: it does not focus the field again
    expect(useRename.getState().asked).toBeNull()
  })

  it('with Properties open already, F2 focuses the field again', () => {
    render(<App />)
    act(() => useUi.setState({ rail: 'properties' }))
    act(() => s().select('m1'))
    act(() => screen.getByRole('button', { name: 'Clear selection' }).focus())
    act(() => s().select('m1'))
    fireEvent.keyDown(window, { key: 'F2' })
    expect(name()).toHaveFocus()
  })

  it('does nothing while a field is being typed in', () => {
    render(<App />)
    act(() => s().select('m3'))
    act(() => useUi.setState({ rail: 'properties' }))
    const field = name()
    act(() => field.focus())
    const other = document.createElement('input')
    document.body.append(other)
    other.focus()
    fireEvent.keyDown(other, { key: 'F2' })
    expect(useRename.getState().asked).toBeNull()
    expect(field).not.toHaveFocus()
    other.remove()
  })

  it('is greyed with a reason: nothing picked, several, a locked mass', () => {
    const c = commandOf('edit.rename')!
    expect(c.key).toBe('F2')
    expect(c.enabled!()).toBe('Pick something first')
    act(() => s().selectMany(['m1', 'm2']))
    expect(c.enabled!()).toBe('Rename one thing at a time')
    act(() => s().apply((p) => actions.lockMasses(p, ['m3'], true)))
    act(() => s().selectMany(['m3']))
    expect(c.enabled!()).toBe('Locked: unlock it to change it')
    act(() => s().selectMany(['m1']))
    expect(c.enabled!()).toBe(true)
  })

  it('the right-click menu’s Rename row is the command', () => {
    render(<App />)
    act(() => s().select('m2'))
    const row = leaf(menuFor([{ kind: 'mass', id: 'm2' }], 'plan', null), 'rename')
    expect(row).toMatchObject({ label: 'Rename', detail: 'F2', disabled: false })
    act(() => row.onSelect())
    expect(name()).toHaveFocus()
    expect(name().value).toBe('Warehouse 2')
  })
})
