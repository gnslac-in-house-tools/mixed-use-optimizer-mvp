// The Existing road tool draws by the side chosen (Left · Centre · Right), like the Street tool (Phase PE.1): its title does not say "centreline".
import { describe, expect, it } from 'vitest'
import { ACCESS_TOOLS } from '../accessState.ts'

describe('the access tools’ titles', () => {
  it('the Existing road tool says it is drawn by its chosen side, not by its centreline', () => {
    const title = ACCESS_TOOLS.find((t) => t.key === 'existing')!.title
    expect(title).not.toMatch(/centreline/)
    expect(title).toMatch(/side/)
  })
})
