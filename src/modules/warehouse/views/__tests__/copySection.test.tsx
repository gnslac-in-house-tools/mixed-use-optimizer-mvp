// A copy with its own docks in Properties (GT.7, Decision "Blocks on the site"): never silent, its note says so beside
// Back to type, which takes its own docks, its courts and its hall's court depths away.
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { derive } from '../../../../engine/derive.ts'
import type { Project } from '../../../../model/schema.ts'
import { actions } from '../../../../state/actions/index.ts'
import { demoProject } from '../../../../state/demo.ts'
import { emptyHistory } from '../../../../state/history.ts'
import { useApp } from '../../../../state/store.ts'
import { CopySection } from '../CopySection.tsx'

let copy = ''
const load = (p: Project) => useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), option: p.options[0].id })
const hall = () => {
  const p = useApp.getState().project
  const levels = new Set(p.buildings.find((b) => b.id === copy)!.levels.map((l) => l.id))
  return p.masses.find((m) => levels.has(m.levelId) && m.part === 'hall')!
}

beforeEach(() => {
  const { project, id } = actions.addWarehouseType(demoProject())
  const r = actions.placeWarehouse(project, id, { x: 0, y: 0 }, 0, project.options[0].id)!
  copy = r.id
  load(r.project)
})

describe('a copy’s own docks in Properties', () => {
  it('Properties of a copy with its own docks says so', () => {
    load(actions.putCopyElements(useApp.getState().project, copy, 'dock', 'e1', [0], true))
    render(<CopySection buildingId={copy} />)
    expect(screen.getByText("Own docks: doesn't follow its type")).toBeInTheDocument()
    // its shape and courts came with them (one bundle): said too, never silent
    expect(screen.getByText('Its outline, holes, zones and courts stay as they are too, until Back to type')).toBeInTheDocument()
    expect(screen.queryByText('Own courts')).toBeNull()
    // its outline is the one its own docks came with: no inner wall moved
    expect(screen.queryByText(/its inner walls moved/)).toBeNull()
    // no figure of its own: no empty paragraph
    for (const p of document.querySelectorAll('[data-copy] ~ p')) expect(p.textContent).not.toBe('')
    fireEvent.click(screen.getByRole('button', { name: 'Back to type' }))
    expect(useApp.getState().project.buildings.find((b) => b.id === copy)!.warehouse!.overrides).toBeUndefined()
    expect(screen.queryByText("Own docks: doesn't follow its type")).toBeNull()
  })

  it('a copy with only its own courts says Own courts, Back to type on', () => {
    load(actions.setCopyEdgeCourt(useApp.getState().project, copy, 'e3', {}))
    render(<CopySection buildingId={copy} />)
    expect(screen.getByText('Own courts')).toBeInTheDocument()
    expect(screen.queryByText("Own docks: doesn't follow its type")).toBeNull()
    expect(screen.getByRole('button', { name: 'Back to type' })).toBeEnabled()
  })

  it('a copy whose own outline is not its type’s still says its inner walls moved', () => {
    const outline = [
      { id: 'e1', x: 0, y: 0 },
      { id: 'e2', x: 66, y: 0 },
      { id: 'e3', x: 66, y: 16 },
      { id: 'e5', x: 40, y: 16 },
      { id: 'e6', x: 40, y: 32 },
      { id: 'e4', x: 0, y: 32 },
    ]
    load(actions.setWarehouseOverrides(useApp.getState().project, copy, { morphology: { outline } }))
    render(<CopySection buildingId={copy} />)
    expect(screen.getByText(/its inner walls moved/)).toBeInTheDocument()
  })

  it('a copy as its type: no note; Back to type off, on with only its hall’s court depths, which it clears', () => {
    render(<CopySection buildingId={copy} />)
    expect(screen.queryByText("Own docks: doesn't follow its type")).toBeNull()
    expect(screen.getByRole('button', { name: 'Back to type' })).toBeDisabled()
    act(() => load(actions.setCourtDepth(useApp.getState().project, hall().id, 0.1, 40)))
    expect(screen.getByRole('button', { name: 'Back to type' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Back to type' }))
    expect(hall().courts).toBeUndefined()
  })
})
