// The plugins' tools for this server (Decision "Plugin tools"): each plugin folder's `tools/index.ts` (its `tools` and
// `guide`), the same list its manifest gives the app (src/plugins/__tests__/tools.test.ts checks it). Found by folder
// and imported by a path made at run time, so neither Node nor this folder's typecheck loads anything else of a plugin
// (its manifest loads its views); a tool's code is loaded only in the tab, at its first call.
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { z, type ZodType } from 'zod'
import type { ToolSchema } from '../src/api/tools/index.ts'

/** What this server reads of a plugin's tool (src/plugins/types.ts `PluginTool`). */
interface Listed {
  name: string
  description: string
  input: ZodType
}

export interface PluginTools {
  schemas: ToolSchema[]
  guide: string
  /** The plugins whose tools could not be read, with why: the server goes on without them. */
  failed: string[]
}

/** `dir`: the plugins' folder (src/plugins/, next to this one's). */
export async function pluginTools(dir = fileURLToPath(new URL('../src/plugins/', import.meta.url))): Promise<PluginTools> {
  const out: PluginTools = { schemas: [], guide: '', failed: [] }
  const guides: string[] = []
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, d.name, 'tools', 'index.ts')
    if (!d.isDirectory() || !existsSync(file)) continue
    try {
      const m = (await import(pathToFileURL(file).href)) as { tools?: Listed[]; guide?: string }
      for (const t of m.tools ?? [])
        out.schemas.push({ name: t.name, description: t.description, inputSchema: z.toJSONSchema(t.input, { io: 'input' }) as Record<string, unknown> })
      if (m.guide) guides.push(m.guide)
    } catch (e) {
      out.failed.push(`${d.name}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  out.guide = guides.join('\n')
  return out
}
