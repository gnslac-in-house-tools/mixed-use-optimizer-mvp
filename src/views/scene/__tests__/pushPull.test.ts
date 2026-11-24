import { describe, expect, it } from 'vitest'
import { pushPullHeight } from '../pushPull.ts'

describe('pushPullHeight (mixed-use-mvp: the height handle in 3D)', () => {
  it('a drag adds or removes whole storeys of the level height', () => {
    expect(pushPullHeight(30, 4.2, 3)).toBe(33)
    expect(pushPullHeight(30, 7.4, 3)).toBe(36)
    expect(pushPullHeight(30, -6.1, 3)).toBe(24)
  })
  it('a height off the storeys lands on the nearest one', () => {
    expect(pushPullHeight(31, 0.2, 3)).toBe(30)
  })
  it('never below one storey', () => {
    expect(pushPullHeight(9, -40, 3)).toBe(3)
  })
})
