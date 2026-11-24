// What a block is not offered (Phase D.2 review): Properties' Copy up and Copy down and the plan menu's Split at a grid line are greyed for a
// block's hall, with the reason (a block is a building of its own: it is Duplicated, and cut in its block editor); a plain mass keeps them.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../App.tsx'
import { derive } from '../../../engine/derive.ts'
import { gridOf } from '../../../engine/grid/index.ts'
import type { Project } from '../../../model/schema.ts'
import { actions } from '../../../state/actions/index.ts'
import { demoProject } from '../../../state/demo.ts'
import { emptyHistory } from '../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../state/store.ts'
import { useUi } from '../../layout/ui.ts'
import { splitItems } from '../gridCommands.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

function load(p: Project) {
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
  useUi.setState({ dialog: null, view: 'plan', rail: 'properties', panels: { left: true, right: true }, sheet: null })
}

/** A block on the grid's lines (48 × 24 m, its middle on a line), and the same rectangle as a plain mass. */
function blockAndPlain() {
  const p = demoProject()
  const o = gridOf(p, 'o1')!.origin
  const footprint = { kind: 'rect' as const, center: { x: o.x + 60, y: o.y + 60 }, width: 48, depth: 24, rotation: 0 }
  const block = actions.drawBlock(p, { programId: 'office', footprint, optionId: 'o1' })!
  const plain = actions.addMass(block.project, { programId: 'office', footprint: { ...footprint, center: { x: o.x + 180, y: o.y + 60 } }, levelId: 'l1' })
  return { project: plain.project, block: block.id, plain: plain.id }
}

beforeEach(() => {
  localStorage.clear()
})

describe('Properties of a block’s hall', () => {
  it('Copy up and Copy down are greyed, with the reason; Duplicate stays', () => {
    const w = blockAndPlain()
    load(w.project)
    render(<App />)
    act(() => useApp.getState().select(w.block))
    const props = screen.getByRole('region', { name: 'Properties' })
    for (const name of ['Copy up', 'Copy down']) {
      const b = within(props).getByRole('button', { name })
      expect(b).toBeDisabled()
      expect(b).toHaveAttribute('title', 'A block is a building of its own: Duplicate makes another block; its levels are its building’s')
    }
    expect(within(props).getByRole('button', { name: 'Duplicate' })).toBeEnabled()
    const before = useApp.getState().project
    fireEvent.click(within(props).getByRole('button', { name: 'Copy up' }))
    expect(useApp.getState().project).toBe(before)
  })

  it('a plain mass keeps Copy up', () => {
    const w = blockAndPlain()
    load(w.project)
    render(<App />)
    act(() => useApp.getState().select(w.plain))
    expect(within(screen.getByRole('region', { name: 'Properties' })).getByRole('button', { name: 'Copy up' })).toBeEnabled()
  })

  it('the text under its buttons says what its shape is: the type’s or its own', () => {
    const w = blockAndPlain()
    load(w.project)
    render(<App />)
    act(() => useApp.getState().select(w.block))
    const props = screen.getByRole('region', { name: 'Properties' })
    expect(within(props).queryByText('A warehouse copy: its shape is its type’s.')).toBeNull()
    expect(within(props).getByText('A block: its walls and grid are its type’s until you reshape it here; then it is a variant.')).toBeInTheDocument()
  })
})

describe('Split at a grid line on a block', () => {
  it('is greyed with the reason for a block’s hall; a plain rectangle on the grid is offered the split', () => {
    const w = blockAndPlain()
    load(w.project)
    const block = splitItems([w.block], null)
    expect(block).toHaveLength(1)
    expect(block[0]).toMatchObject({ disabled: true, title: 'A block is not split: reshape it in its block editor' })
    const plain = splitItems([w.plain], null)
    expect(plain[0]).not.toMatchObject({ disabled: true })
  })
})
