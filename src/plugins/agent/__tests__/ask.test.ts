// What another plugin asks the agent for (Decision "Stage tools"): through the host, the agent's side takes it into
// the chat's message and opens the Agent tab; with the agent off in this browser, no one takes it and the asker knows.
import { beforeEach, describe, expect, it } from 'vitest'
import { useUi } from '../../../views/layout/ui.ts'
import { askAgent } from '../../host.ts'
import { usePluginModes } from '../../settings.ts'
import { useAsked } from '../ask.ts'

beforeEach(() => {
  usePluginModes.setState({ modes: {} })
  useAsked.setState({ text: null })
  useUi.setState({ rail: 'layers' })
})

describe('asking the agent', () => {
  it('the message waits for the chat, and the Agent tab opens', () => {
    expect(askAgent('Work stage ②')).toBe(true)
    expect(useAsked.getState().text).toBe('Work stage ②')
    expect(useUi.getState().rail).toBe('plugin:agent/chat')
  })

  it('the agent off in this browser: no one takes it', () => {
    usePluginModes.setState({ modes: { agent: 'off' } })
    expect(askAgent('Work stage ②')).toBe(false)
    expect(useAsked.getState().text).toBeNull()
  })
})
