// Where the agent runs (Decision "Agent"): a provider with candidates offers only those it lists, the first to start
// with; with none of them listed, or no candidates of its own, all it lists.
import { describe, expect, it } from 'vitest'
import { providerOf, shortlist } from '../providers.ts'

const listed = ['gemini-2.5-pro', 'gemini-3.8-flash', 'gemini-4-argon', 'gemini-3.5-flash-lite', 'gemini-embedding']

describe('the models a provider offers', () => {
  it('Gemini, here or through GFit’s server: its candidates, 3.8 Flash first', () => {
    for (const id of ['google', 'shared-google'] as const)
      expect(shortlist(providerOf(id), listed)).toEqual(['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-4-argon'])
  })

  it('the candidates Google lists, in their order; none listed, all', () => {
    expect(shortlist(providerOf('google'), ['gemini-4-argon', 'gemini-2.5-pro'])).toEqual(['gemini-4-argon'])
    expect(shortlist(providerOf('google'), ['gemini-9-x', 'gemini-9-y'])).toEqual(['gemini-9-x', 'gemini-9-y'])
  })

  it('GPT and Claude, here or through GFit’s server: theirs, the balanced one first', () => {
    for (const id of ['openai', 'shared-openai'] as const)
      expect(shortlist(providerOf(id), ['gpt-6-astra', 'gpt-5.4-mini', 'gpt-6-luna', 'gpt-6.1-sol'])).toEqual(['gpt-6.1-sol', 'gpt-6-luna', 'gpt-6-astra'])
    for (const id of ['anthropic', 'shared'] as const)
      expect(shortlist(providerOf(id), ['claude-opus-5-5', 'claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-x'])).toEqual([
        'claude-sonnet-5-5',
        'claude-haiku-5-5',
        'claude-opus-5-5',
      ])
  })

  it('a provider without candidates: all it lists', () => {
    expect(shortlist(providerOf('lmstudio'), ['qwen-a', 'qwen-b'])).toEqual(['qwen-a', 'qwen-b'])
  })
})
