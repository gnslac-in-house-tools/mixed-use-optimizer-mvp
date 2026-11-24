// The MCP server's protocol (Decision "MCP server", Phase 8.2): JSON-RPC 2.0, one message per line, as Claude Desktop
// speaks it over stdio. Pure: a message in, the answer out (null for a notification); where a tool runs is the
// caller's (`call`: the bridge to GFit's open tab, mcp/server.ts).
//   initialize   the server's name, its tools capability and how to use them (AGENT_GUIDE)
//   tools/list   the app's tools with their JSON Schemas
//   tools/call   one call, its answer as text (JSON), or why it could not run (isError)
//   ping         {}
import type { ToolSchema } from '../tools/index.ts'

/** The protocol versions it speaks, newest first: an older client gets its own back. */
export const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05']

export type CallAnswer = { ok: true; output: unknown } | { ok: false; error: string }

export interface McpServer {
  name: string
  version: string
  instructions: string
  tools: ToolSchema[]
  call(name: string, input: unknown): Promise<CallAnswer>
}

type Id = string | number

interface Request {
  jsonrpc: '2.0'
  id?: Id
  method: string
  params?: Record<string, unknown>
}

export type Answer = { jsonrpc: '2.0'; id: Id | null } & ({ result: unknown } | { error: { code: number; message: string } })

const ok = (id: Id, result: unknown): Answer => ({ jsonrpc: '2.0', id, result })
const fail = (id: Id | null, code: number, message: string): Answer => ({ jsonrpc: '2.0', id, error: { code, message } })

const isRequest = (m: unknown): m is Request =>
  typeof m === 'object' && m !== null && (m as Request).jsonrpc === '2.0' && typeof (m as Request).method === 'string'

/** The answer to one message; null when it needs none (a notification, an answer to us). */
export async function handle(message: unknown, server: McpServer): Promise<Answer | null> {
  if (!isRequest(message)) {
    const id = typeof message === 'object' && message !== null && 'id' in message ? ((message as { id: Id }).id ?? null) : null
    // an answer to a request of ours (we send none) or garbage with no id: nothing to say
    return id === null || 'result' in (message as object) || 'error' in (message as object) ? null : fail(id, -32600, 'Invalid request')
  }
  const { id, method, params = {} } = message
  if (id === undefined) return null // a notification (initialized, cancelled…)
  switch (method) {
    case 'initialize': {
      const asked = typeof params.protocolVersion === 'string' ? params.protocolVersion : ''
      return ok(id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: server.name, version: server.version },
        instructions: server.instructions,
      })
    }
    case 'ping':
      return ok(id, {})
    case 'tools/list':
      return ok(id, { tools: server.tools })
    case 'tools/call': {
      const name = typeof params.name === 'string' ? params.name : ''
      if (!server.tools.some((t) => t.name === name)) return fail(id, -32602, `Unknown tool: ${name || '(none)'}`)
      const r = await server.call(name, params.arguments ?? {})
      return ok(id, r.ok ? { content: [{ type: 'text', text: JSON.stringify(r.output) }] } : { content: [{ type: 'text', text: r.error }], isError: true })
    }
    default:
      return fail(id, -32601, `Method not found: ${method}`)
  }
}

/** The tools as MCP lists them: without their schema's `$schema`. */
export const mcpTools = (tools: ToolSchema[]): ToolSchema[] =>
  tools.map((t) => ({ ...t, inputSchema: Object.fromEntries(Object.entries(t.inputSchema).filter(([k]) => k !== '$schema')) }))
