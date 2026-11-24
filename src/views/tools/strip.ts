// The Tools strip's groups (Project C, AS.2; spec "The Tools strip"): the registry's commands that carry `tool`, by group. The
// strip defines no tool: it draws these, and a tool added to the registry with a `tool` stands in its group (a new tool is one
// command). A group with no command is left out: a typology without the warehouse or the parking module has no Elements or
// Parking.
import { commands } from '../commands/registry.ts'
import type { Command, ToolGroup } from '../commands/types.ts'

/** The six groups, in the strip's order, each with its name (the group's label and the Tools menu's sub-menu). */
export const TOOL_GROUPS: { key: ToolGroup; label: string }[] = [
  { key: 'general', label: 'General' },
  { key: 'massing', label: 'Massing' },
  { key: 'elements', label: 'Elements' },
  { key: 'streets', label: 'Streets' },
  { key: 'parking', label: 'Parking' },
  { key: 'annotations', label: 'Annotations' },
]

/** The registry's commands that carry `tool`, by group: the Tools menu's own first, in its order, then the others (Group, whose
 *  menu is Edit, ends General). A group with none is left out. */
export function stripGroups(): { key: ToolGroup; label: string; commands: Command[] }[] {
  const all = commands().filter((c) => c.tool)
  const ownMenu = (c: Command) => c.menu[0] === 'Tools'
  return TOOL_GROUPS.map((g) => {
    const mine = all.filter((c) => c.tool!.group === g.key)
    return { ...g, commands: [...mine.filter(ownMenu), ...mine.filter((c) => !ownMenu(c))] }
  }).filter((g) => g.commands.length > 0)
}
