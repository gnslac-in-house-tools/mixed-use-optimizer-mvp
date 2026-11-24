// The commands (Project C, AS.1; spec "Architecture"): importing this file registers every command of the app, once.
// `registerAll()` is the only door: it empties the registry and registers each definition file's commands in the menu's
// order, so evaluating it again (Vite's hot reload re-runs it when a definition changes; a test calls it) rebuilds the
// registry instead of throwing on its own ids. The definition files are plain data and register nothing by themselves.
// The menus register in their order (File, Edit, View, Site, Design, Tools, Help). A module's commands come from its
// `views/commands.ts` and stand in the menu only while the typology offers the module (`offered`: the catalog's
// question, read whenever the registry is read, so a project of another typology lists none).
import { isOffered } from '../../modules/catalog.ts'
import { COMMANDS as PARKING_TOOLS } from '../../modules/parking/views/commands.ts'
import { BLOCK_EDITOR_COMMANDS, COMMANDS as WAREHOUSE_TOOLS } from '../../modules/warehouse/views/commands.ts'
import { useApp } from '../../state/store.ts'
import { registerDesign } from './design.ts'
import { registerEdit } from './edit.ts'
import { registerFile } from './file.ts'
import { registerHelp } from './help.ts'
import { resetRegistry } from './registry.ts'
import { registerRules } from './rules.ts'
import { registerSite } from './site.ts'
import { registerTools, SPLIT_COMMANDS } from './tools.ts'
import type { ModuleList } from './tools.ts'
import type { Command } from './types.ts'
import { registerView } from './view.ts'

/** A module's commands while the open project's typology offers the module; none otherwise (the keys see them all). */
const offered = (module: string, list: Command[]): ModuleList => ({
  list: () => (isOffered(useApp.getState().project, module) ? list : []),
  every: () => list,
})

/** The warehouse's element tools: Dock and Court (a wall's docks and truck court) only while the typology offers the docks too; Door and Pattern with the warehouse alone. */
const DOCK_TOOLS = new Set(['tool.dock', 'tool.court'])
const elements = (list: Command[]): ModuleList => ({
  list: () => {
    const p = useApp.getState().project
    return isOffered(p, 'warehouse') ? (isOffered(p, 'docks') ? list : list.filter((c) => !DOCK_TOOLS.has(c.id))) : []
  },
  every: () => list,
})

export function registerAll(): void {
  resetRegistry()
  registerFile()
  registerEdit()
  registerView()
  registerSite()
  registerDesign()
  registerRules()
  registerTools({ elements: elements(WAREHOUSE_TOOLS), split: offered('docks', SPLIT_COMMANDS), parking: offered('parking', PARKING_TOOLS), blockEditor: offered('warehouse', BLOCK_EDITOR_COMMANDS) })
  registerHelp()
}

registerAll()

export { commandOf, commands, MENUS, menuEntries, menusFor, runCommand } from './registry.ts'
export type { Command, Place } from './types.ts'
