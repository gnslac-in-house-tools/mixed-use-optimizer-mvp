// The Margin over earlier stages (late review of BE.3): a stored plan or template may still name a kind the catalog no
// longer has (`warehouse.elements`, retired in BE.3); the Margin view leaves it out, as the rest of the optimizer reads
// it ("missing"), instead of showing its raw id with a margin that does nothing.
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { paramKind } from '../../../../modules/catalog.ts'
import { Margin } from '../stage/sections.tsx'

describe('Margin', () => {
  it('a kind the catalog no longer has is left out; a known one shows its label', () => {
    expect(paramKind('warehouse.elements')).toBeUndefined()
    const known = paramKind('warehouse.hall')!
    render(
      <Margin
        margins={[
          { kind: 'warehouse.elements', step: 1, margin: 1 },
          { kind: 'warehouse.hall', step: 6, margin: 2 },
        ]}
        set={vi.fn()}
      />,
    )
    const region = screen.getByRole('region', { name: 'Margin over earlier stages' })
    expect(region.textContent).not.toContain('warehouse.elements')
    expect(region.textContent).toContain(known.label)
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
  })
})
