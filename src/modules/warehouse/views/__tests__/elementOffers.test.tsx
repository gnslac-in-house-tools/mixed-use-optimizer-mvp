// D.2 task 6 (*What is not there is not shown*): a typology that offers the warehouse and not the docks draws its blocks without Dock and
// Court (a wall's docks and its truck court); Door and Pattern stay. Both viewports: the block editor's bar, the Tools strip's Elements group.
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { commands } from '../../../../views/commands/index.ts'
import { industrial } from '../../../../typologies/industrial.ts'
import { TYPOLOGIES } from '../../../../typologies/index.ts'
import { demoProject } from '../../../../state/demo.ts'
import { useApp } from '../../../../state/store.ts'
import { derive } from '../../../../engine/derive.ts'
import { WarehouseTools } from '../WarehouseTools.tsx'

const NO_DOCKS = { ...industrial, id: 'no-docks-test', modules: ['warehouse', 'terrain', 'parking'] }

const open = (typology: string) => {
  const p = { ...demoProject(), typology }
  useApp.setState({ project: p, derived: derive(p) })
}

beforeEach(() => {
  TYPOLOGIES.push(NO_DOCKS)
})
afterEach(() => {
  TYPOLOGIES.splice(TYPOLOGIES.indexOf(NO_DOCKS), 1)
})

const names = () => screen.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)

describe('the block editor’s Elements', () => {
  it('a typology with docks offers Dock, Door, Pattern and Court', () => {
    open('industrial')
    render(<WarehouseTools />)
    for (const n of ['Dock', 'Door', 'Pattern', 'Court']) expect(screen.getByRole('button', { name: new RegExp(`^${n}$`) })).toBeInTheDocument()
  })

  it('one without them offers Door and Pattern only', () => {
    open(NO_DOCKS.id)
    render(<WarehouseTools />)
    expect(screen.queryByRole('button', { name: /^Dock$/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Court$/ })).toBeNull()
    expect(screen.getByRole('button', { name: /^Door$/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Pattern$/ })).toBeInTheDocument()
    expect(names().length).toBeGreaterThan(0)
  })
})

describe('the Tools strip’s Elements', () => {
  const ids = () => commands().filter((c) => c.id.startsWith('tool.') && ['dock', 'door', 'pattern', 'court'].includes(c.id.slice(5))).map((c) => c.id)

  it('with docks: the four', () => {
    open('industrial')
    expect(ids().sort()).toEqual(['tool.dock', 'tool.court', 'tool.door', 'tool.pattern'].sort())
  })

  it('without docks: Dock and Court are not there, Door and Pattern are', () => {
    open(NO_DOCKS.id)
    expect(ids().sort()).toEqual(['tool.door', 'tool.pattern'])
  })
})
