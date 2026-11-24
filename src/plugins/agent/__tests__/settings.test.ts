// The agent's settings by default (Decision "Agent default"): the shared Gemini of GFit's server, its first model.
import { beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
})

describe('the agent’s settings', () => {
  it('a browser that never chose runs on Gemini (GFit’s server), gemini-3.8-flash', async () => {
    const { useAgentSettings } = await import('../settings.ts')
    const { providerOf } = await import('../providers.ts')
    expect(useAgentSettings.getState().provider).toBe('shared-google')
    expect(providerOf('shared-google').models?.[0]).toBe('gemini-3.8-flash')
  })

  it('a choice saved before is kept', async () => {
    localStorage.setItem('gfit.agent', JSON.stringify({ provider: 'lmstudio' }))
    const { useAgentSettings } = await import('../settings.ts')
    expect(useAgentSettings.getState().provider).toBe('lmstudio')
  })
})
