// Rename of a lot and an existing road (Phase AS.4 task 4, Decision "One menu"): F2, Edit › Rename and the menu's Rename open Properties on the object and its
// name field takes the focus with its text selected, as a mass's does; one at a time, a locked lot greyed with the lock's reason; a kind with no name (a street, a gate)
// has no Rename in its menu, and the command says so.
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../App.tsx'
import { commandOf } from '../../commands/index.ts'
import { useUi } from '../../layout/ui.ts'
import { pickedRefs, pickRefs } from '../../plan/mix.ts'
import { menuFor } from '../menu/build.ts'
import { leaf, rowKeyed } from '../menu/__tests__/helpers.ts'
import { useRename } from '../rename.ts'
import { type Fixture, fixture, lockLots, s, start } from './kindsFixture.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

let f: Fixture
const name = () => screen.getByRole('textbox', { name: /^Name/ }) as HTMLInputElement

beforeEach(() => {
  f = fixture()
  start(f.project)
  useRename.setState({ asked: null })
})

describe('Rename of a lot, an existing road', () => {
  it('a lot: F2 opens Properties on its name field, text selected; Enter commits it', () => {
    render(<App />)
    act(() => pickRefs([{ kind: 'lot', id: f.lots[0] }]))
    fireEvent.keyDown(window, { key: 'F2' })
    expect(useUi.getState().rail).toBe('properties')
    const field = name()
    expect(field).toHaveFocus()
    const was = s().project.options[0].lots!.find((l) => l.id === f.lots[0])!.name
    expect(field.value).toBe(was)
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, was.length])
    fireEvent.change(field, { target: { value: 'North lot' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(s().project.options[0].lots!.find((l) => l.id === f.lots[0])!.name).toBe('North lot')
    expect(useRename.getState().asked).toBeNull()
  })

  it('an existing road: the menu’s Rename row is the command and focuses its name', () => {
    render(<App />)
    act(() => pickRefs([{ kind: 'existing-road', id: f.existing[1] }]))
    const row = leaf(menuFor(pickedRefs(), 'plan', null), 'rename')
    expect(row).toMatchObject({ label: 'Rename', detail: 'F2', disabled: false })
    act(() => row.onSelect())
    expect(name()).toHaveFocus()
    expect(name().value).toBe('Existing road 3')
    fireEvent.change(name(), { target: { value: 'Ring road' } })
    fireEvent.keyDown(name(), { key: 'Enter' })
    expect(s().project.site.existingRoads!.find((r) => r.id === f.existing[1])!.name).toBe('Ring road')
  })

  it('a locked lot is greyed with the lock’s reason', () => {
    act(() => lockLots([f.lots[0]]))
    act(() => pickRefs([{ kind: 'lot', id: f.lots[0] }]))
    expect(commandOf('edit.rename')!.enabled!()).toBe('Locked: unlock it to change it')
  })

  it('several lots: one thing at a time; a street, a gate and a dimension have no name: no Rename row, and the command says so', () => {
    act(() => pickRefs([{ kind: 'lot', id: f.lots[0] }, { kind: 'lot', id: f.lots[1] }]))
    expect(commandOf('edit.rename')!.enabled!()).toBe('Rename one thing at a time')
    for (const ref of [{ kind: 'street', id: 'street:s1' }, { kind: 'gate', id: f.gates[0] }, { kind: 'dimension', id: f.dim }]) {
      act(() => pickRefs([ref]))
      expect(rowKeyed(menuFor(pickedRefs(), 'plan', null), 'rename'), ref.kind).toBeUndefined()
      expect(String(commandOf('edit.rename')!.enabled!()), ref.kind).toMatch(new RegExp(`${ref.kind === 'street' ? 'street' : ref.kind} has no name`, 'i'))
    }
  })
})
