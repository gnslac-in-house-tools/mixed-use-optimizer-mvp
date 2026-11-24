// The agent plugin's manifest (Decision "Agent"): a chat in the left panel, and Agent as an action at the left rail's
// end after Optimize, which opens it (Decision "Areas rail"), in every area. Its tools are
// the app's (api/tools/, through the host); the model runs where the designer chooses (providers.ts).
import type { Plugin } from '../types.ts'

export const agent: Plugin = {
  id: 'agent',
  name: 'Agent',
  description: 'A chat that works the app’s own buttons: ask it, or give it steps to follow, with the model you choose',
  tabs: [
    {
      id: 'chat',
      side: 'left',
      label: 'Agent',
      // a speech bubble
      icon: 'M2.75 3.25h10.5v7.5h-6l-3 2.5v-2.5h-1.5ZM5.5 7h.01M8 7h.01M10.5 7h.01',
      load: () => import('./views/AgentTab.tsx'),
    },
  ],
  actions: [
    {
      id: 'agent',
      label: 'Agent',
      title: 'The agent: a chat on the left that works the app’s buttons (again: back to your tabs)',
      opens: { left: 'chat' },
      // the chat's speech bubble
      icon: 'M2.75 3.25h10.5v7.5h-6l-3 2.5v-2.5h-1.5ZM5.5 7h.01M8 7h.01M10.5 7h.01',
      // a dot while Claude Desktop is connected; it starts the MCP bridge with the frame
      badge: () => import('./views/AgentBadge.tsx'),
    },
  ],
}
