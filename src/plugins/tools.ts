// The plugins' tools for an agent (Decision "Plugin tools"), as their manifests list them: host.ts adds them to the
// core's for the Agent tab and the tab's side of MCP. A plugin's tools are its `tools/index.ts` (`tools`, `guide`),
// which the MCP server (mcp/plugins.ts) reads by folder, never through the manifests (they load views); a test checks
// both give the same (`plugins/__tests__/tools.test.ts`). A tool's code comes at its first call, in the tab.
import { z } from 'zod'
import type { ToolSchema } from '../api/tools/index.ts'
import { PLUGINS } from './registry.ts'
import type { Plugin, PluginTool } from './types.ts'

export interface OwnedTool {
  plugin: Plugin
  tool: PluginTool
}

export const pluginTools = (plugins: Plugin[] = PLUGINS): OwnedTool[] =>
  plugins.flatMap((plugin) => (plugin.tools ?? []).map((tool) => ({ plugin, tool })))

/** What an agent is given of a tool, as the core's (api/tools/index.ts `toolSchemas`). */
export const schemaOf = (t: PluginTool): ToolSchema => ({
  name: t.name,
  description: t.description,
  inputSchema: z.toJSONSchema(t.input, { io: 'input' }) as Record<string, unknown>,
})

export const pluginToolSchemas = (plugins: Plugin[] = PLUGINS): ToolSchema[] => pluginTools(plugins).map((x) => schemaOf(x.tool))

/** The plugins' lines for the agent's guide, after the core's. */
export const pluginGuide = (plugins: Plugin[] = PLUGINS): string =>
  plugins
    .flatMap((p) => (p.guide ? [p.guide] : []))
    .join('\n')
