// uuid(): crypto.randomUUID where the page is a secure context, else one made from getRandomValues (GFit opened from
// another computer by its address on the network, where randomUUID does not exist).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { uuid } from '../uuid.ts'

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

afterEach(() => vi.unstubAllGlobals())

describe('uuid', () => {
  it('is a v4 UUID, a new one each time', () => {
    const a = uuid()
    expect(a).toMatch(V4)
    expect(uuid()).not.toBe(a)
  })

  it('without randomUUID (http on the network) it is made from getRandomValues', () => {
    const getRandomValues = vi.fn((b: Uint8Array) => b.fill(0xff))
    vi.stubGlobal('crypto', { getRandomValues })
    expect(uuid()).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff')
    expect(getRandomValues).toHaveBeenCalledOnce()
  })
})
