// Agent's badge on its action at the left rail's end (Decisions "Agent", "MCP server", "Areas rail"): a dot while Claude Desktop
// is connected. Loaded with the frame while the plugin is on, it starts the MCP bridge if it was turned on, so Claude
// Desktop reaches GFit with the Agent tab closed, and listens for what another plugin asks the agent (ask.ts). The
// rail draws the action itself.
import '../ask.ts'
import { useMcp } from '../mcp.ts'

export default function AgentBadge() {
  const connected = useMcp((s) => s.status === 'connected')
  if (!connected) return null
  return <span role="img" aria-label="Claude Desktop connected" className="absolute right-1 top-1 h-1.5 w-1.5 rounded-pill bg-status-within" />
}
