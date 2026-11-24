// A plugin's own data in the project (Decision "Optimizer plugin"): one verb, so a plugin's settings are undone and
// traced like any edit. The core never looks inside: the plugin checks what it reads with its own schema.
import type { Project } from '../../model/schema.ts'

/** Sets a plugin's data (`undefined` removes it); the same data returns the same project (no empty undo step). */
export function setPluginData(p: Project, pluginId: string, data: unknown): Project {
  const now = p.plugins?.[pluginId]
  if (JSON.stringify(now) === JSON.stringify(data)) return p
  const { [pluginId]: _, ...rest } = p.plugins ?? {}
  const plugins = data === undefined ? rest : { ...rest, [pluginId]: structuredClone(data) }
  if (Object.keys(plugins).length === 0) {
    const { plugins: _gone, ...without } = p
    return without
  }
  return { ...p, plugins }
}
