// What the agent has used (Decision "Agent usage"): each answer's tokens add up per provider, priced at its model's
// price; a model without a price says so; kept in this browser; Reset starts again.
import { beforeEach, describe, expect, it } from 'vitest'
import { USAGE_KEY, dollars, everyoneUsed, tokens, usageLine, useUsage } from '../usage.ts'

beforeEach(() => {
  useUsage.setState({ used: {} })
  localStorage.clear()
})

describe('the agent’s usage', () => {
  it('adds each answer’s tokens and their cost, per provider, and keeps them in this browser', () => {
    const { add } = useUsage.getState()
    add('shared-google', 'gemini-3.8-flash', { input: 15_000, output: 1_000 })
    add('shared-google', 'gemini-3.5-flash-lite', { input: 10_000, output: 2_000 })
    const u = useUsage.getState().used['shared-google']!
    expect(u).toMatchObject({ input: 25_000, output: 3_000, unpriced: false })
    // 15k × 0.75 + 1k × 3.75 + 10k × 0.30 + 2k × 2.50, per 1M
    expect(u.cost).toBeCloseTo(0.023, 6)
    expect(useUsage.getState().used.google).toBeUndefined()
    expect(JSON.parse(localStorage.getItem(USAGE_KEY)!)['shared-google'].input).toBe(25_000)
    expect(usageLine(u)).toBe('25.0k in · 3.0k out · ≈ $0.02')
  })

  it('a model without a price: its tokens count, its cost does not, and the line says so', () => {
    useUsage.getState().add('google', 'gemini-9-x', { input: 500, output: 20 })
    const u = useUsage.getState().used.google!
    expect(u.cost).toBe(0)
    expect(usageLine(u)).toBe('500 in · 20 out · ≈ $0 (some models without a price)')
  })

  it('Reset starts the provider again, the others stay', () => {
    const { add, reset } = useUsage.getState()
    add('google', 'gemini-3.8-flash', { input: 1, output: 1 })
    add('shared-google', 'gemini-3.8-flash', { input: 1, output: 1 })
    reset('google')
    expect(useUsage.getState().used.google).toBeUndefined()
    expect(useUsage.getState().used['shared-google']).toBeDefined()
    expect(usageLine(undefined)).toBe('Nothing yet')
  })

  it('everyone’s, from GFit’s server: a vendor’s models summed and priced; none counted, nothing', () => {
    const e = {
      since: '2026-10-20T00:00:00.000Z',
      vendors: { google: { 'gemini-3.8-flash': { input: 15_000, output: 1_000, answers: 2 }, 'gemini-9-x': { input: 5, output: 5, answers: 1 } } },
    }
    expect(everyoneUsed(e, 'google')).toEqual({ input: 15_005, output: 1_005, cost: 0.015, unpriced: true, since: e.since })
    expect(everyoneUsed(e, 'openai')).toBeUndefined()
  })

  it('reads short', () => {
    expect([tokens(950), tokens(41_234), tokens(1_300_000)]).toEqual(['950', '41.2k', '1.3M'])
    expect([dollars(0), dollars(0.004), dollars(1.237)]).toEqual(['$0', '< $0.01', '$1.24'])
  })
})
