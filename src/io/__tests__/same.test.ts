// sameData (io/same.ts): what the read-back check of Save compares with.
import { describe, expect, it } from 'vitest'
import { sameData } from '../same.ts'

describe('sameData', () => {
  it('equal data is the same whatever the order of its keys; -0 is 0; an undefined key is none', () => {
    expect(sameData({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toBe(true)
    expect(sameData({ x: -0 }, { x: 0 })).toBe(true)
    expect(sameData({ a: 1, b: undefined }, { a: 1 })).toBe(true)
  })

  it('anything that differs is not: a number, a missing or extra key, a shorter list, a type', () => {
    expect(sameData({ a: 1 }, { a: 1.0000001 })).toBe(false)
    expect(sameData({ a: 1 }, { a: 1, b: 2 })).toBe(false)
    expect(sameData({ a: 1, b: 2 }, { a: 1 })).toBe(false)
    expect(sameData([1, 2], [1, 2, 3])).toBe(false)
    expect(sameData([1], { 0: 1 })).toBe(false)
    expect(sameData({ a: null }, { a: 0 })).toBe(false)
    expect(sameData({ a: 'x' }, { a: undefined })).toBe(false)
  })
})
