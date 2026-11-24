// GFit's MCP server (Decision "MCP server", Phase 8.2), for Claude Desktop or any MCP client: it lists the app's tools
// (src/api/tools/) and the plugins' (Decision "Plugin tools": plugins.ts) and runs each call in GFit's open tab,
// through the bridge (bridge.ts). Node runs it as it is (TypeScript, no build):
// `node mcp/server.ts`. Setup: docs/mcp.md.
//   stdin / stdout   MCP (JSON-RPC, one message per line); stdout carries nothing else
//   stderr           what happens, for Claude Desktop's log
//   GFIT_MCP_PORT    the bridge's port (default 4590), the one the Agent tab connects to
import readline from 'node:readline'
import { handle, mcpTools, type McpServer } from '../src/api/mcp/protocol.ts'
import { AGENT_GUIDE, toolSchemas } from '../src/api/tools/index.ts'
import { pluginTools } from './plugins.ts'
import type { CallAnswer } from '../src/api/mcp/protocol.ts'
import { DEFAULT_PORT, NOT_OPEN, RECONNECT_WAIT, relayCall, startBridge, type Bridge } from './bridge.ts'

const log = (s: string) => process.stderr.write(`[gfit-mcp] ${s}\n`)
const port = Number(process.env.GFIT_MCP_PORT ?? DEFAULT_PORT)
// ms a call waits for a tab that dropped to come back (the tests make it short)
const reconnect = Number(process.env.GFIT_MCP_RECONNECT_MS ?? RECONNECT_WAIT)

let bridge: Bridge | null = null
/** Opens the bridge; null when another server holds the port (Claude Desktop starts two). */
async function own(): Promise<Bridge | null> {
  try {
    bridge = await startBridge(port, log, reconnect)
    log(`bridge on http://127.0.0.1:${bridge.port}`)
  } catch (e) {
    log(`port ${port} taken (${e instanceof Error ? e.message : String(e)}): calls go through the server that has it`)
  }
  return bridge
}
await own()

/** Through this server's bridge, or the one that holds the port; if that one has gone, this one takes the port. */
async function call(name: string, input: unknown): Promise<CallAnswer> {
  if (bridge) return bridge.call(name, input)
  const relayed = await relayCall(port, name, input)
  if (relayed) return relayed
  const mine = await own()
  if (mine) return mine.call(name, input)
  return { ok: false, error: `${NOT_OPEN} (Port ${port} could not be opened.)` }
}

const plugins = await pluginTools()
for (const f of plugins.failed) process.stderr.write(`gfit: a plugin's tools could not be read (${f})\n`)

const server: McpServer = {
  name: 'gfit',
  version: '0.8.7',
  instructions: `These tools drive GFit, open in the designer's browser: each call reads or changes the project they see. ${[AGENT_GUIDE, plugins.guide].filter(Boolean).join('\n')}`,
  tools: mcpTools([...toolSchemas(), ...plugins.schemas]),
  call,
}

const lines = readline.createInterface({ input: process.stdin })
lines.on('line', (line) => {
  if (!line.trim()) return
  let message: unknown
  try {
    message = JSON.parse(line)
  } catch {
    process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })}\n`)
    return
  }
  void handle(message, server).then((answer) => {
    if (answer) process.stdout.write(`${JSON.stringify(answer)}\n`)
  })
})
// the client closed: so does the server
lines.on('close', () => {
  if (bridge) void bridge.close().then(() => process.exit(0))
  else process.exit(0)
})
