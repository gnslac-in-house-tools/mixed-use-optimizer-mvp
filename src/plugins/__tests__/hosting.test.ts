// The public link (Decision "Public link"): built with VITE_STATIC_HOST=true, GFit has no server behind it, so what lives
// in that server is not offered: the providers that lend a key. Each module reads the flag when it
// loads, so each case sets it and loads them again.
import { afterEach, describe, expect, it, vi } from 'vitest'

async function loaded(staticHost: boolean) {
  vi.resetModules()
  vi.stubEnv('VITE_STATIC_HOST', staticHost ? 'true' : 'false')
  const [{ PLUGINS }, { PROVIDERS }, { useAgentSettings }] = await Promise.all([
    import('../registry.ts'),
    import('../agent/providers.ts'),
    import('../agent/settings.ts'),
  ])
  return { plugins: PLUGINS.map((p) => p.id), providers: PROVIDERS.map((p) => p.id), provider: useAgentSettings.getState().provider }
}

describe('a static host', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    localStorage.clear()
  })

  it('offers no provider that goes through GFit’s server; the agent starts on a key of the visitor', async () => {
    const s = await loaded(true)
    expect(s.plugins).toEqual(['optimizer', 'agent'])
    expect(s.providers).toEqual(['lmstudio', 'anthropic', 'openai', 'google'])
    expect(s.provider).toBe('anthropic')
  })

  it('GFit’s own server (dev, preview, dev:lan) offers all of it, the shared Gemini first', async () => {
    const s = await loaded(false)
    expect(s.plugins).toEqual(['optimizer', 'agent'])
    expect(s.providers).toEqual(['lmstudio', 'shared', 'shared-openai', 'shared-google', 'anthropic', 'openai', 'google'])
    expect(s.provider).toBe('shared-google')
  })
})
