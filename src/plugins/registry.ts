// The plugins (Decision "Optimizer plugin"): the only list, as typologies/index.ts is for typologies. A new plugin is
// a folder with its manifest (`plugin.ts`) and one line here; a test fails if a folder is left out.
import { agent } from './agent/plugin.ts'
import { optimizer } from './optimizer/plugin.ts'
import type { Plugin } from './types.ts'

// the plugins held back as "coming soon" (Decision "Coming soon"): the one list, in comingSoon.ts
export { COMING_SOON } from './comingSoon.ts'

// the Revit bridge was taken out (the user, 2026-11-04; Decision "No Revit bridge")
export const PLUGINS: Plugin[] = [optimizer, agent]
