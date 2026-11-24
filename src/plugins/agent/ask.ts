// What another plugin asks the agent for (Decision "Stage tools": the optimizer's *Ask the agent*): it goes in the
// chat's message, for the designer to read, change and send (running on Claude Desktop: to copy there), and the Agent
// tab opens. Loaded with the frame while the plugin is on (its button imports it), so it listens with the tab closed.
import { create } from 'zustand'
import { onAskAgent, showTabs } from '../host.ts'

/** The message asked for, until the tab takes it. */
export const useAsked = create<{ text: string | null }>(() => ({ text: null }))

onAskAgent('agent', (text) => {
  useAsked.setState({ text })
  showTabs('agent', { left: 'chat' })
})
