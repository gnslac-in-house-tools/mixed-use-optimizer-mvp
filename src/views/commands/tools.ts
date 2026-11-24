// The Tools menu's commands (Project C, AS.1): Select, Move, Copy, Rotate, Mirror, Array, Align (AS.5); then the strip's groups as sub-menus:
// Massing (Draw, Hole, Corner, Chamfer, Split, Union), Elements (Dock, Door, Pattern, Court: the warehouse module's), Streets (Street,
// Gate, Existing road, Connect), Parking (Lot: the parking module's) and Annotations (Dimension, Ruler, Reference line, Note).
// A tool carries `tool: { group, icon, hint }` (the Tools strip, tools/ToolStrip.tsx, draws it; `hint` is the sentence its
// button's title says, read from where that sentence is written once: `TOOLS`, `ACCESS_TOOLS`, `CONNECT_HINT`) and a `checked()`
// that says it is in hand; Union (Edit's Merge, moved) and Connect do something once: their `tool` says `once` and they have
// no `checked()`, so they stand in the strip and are never in hand.
// Each `run` takes the tool through the hand (`tools/hand.ts`: `take`, `toggle`, `letGo`), as the strip's buttons do, and
// each `checked` is `inHand`. A tool works whatever panel tab is open and taking one never changes what the panel shows, so no
// `run` opens an area. The `enabled` reasons are the buttons': "Pick something first" for Move, Copy, Rotate, Mirror, Array and Align, "The plan is
// not on screen" in the 3D alone, "Close Compare first" while Compare is open (the plan's drawing tools), "The site needs
// a boundary first" for the access tools. The modules' tools come from their `views/commands.ts` and stand in the menu
// only while the typology offers the module (views/commands/index.ts hands their lists over).
// Keys (spec "Shortcuts"): Select V, Move M, Copy C, Rotate R, Mirror I, Array A, Align Shift+A, Draw B, Hole H, Corner F, Chamfer Shift+F, Split S, Union U, Street W, Gate G, Dimension
// D, Ruler T, Reference line L, Note Shift+T (the modules' Dock K, Door J, Pattern N, Court Y and Lot P are in theirs); Existing road and Connect
// have none.
import { useApp } from '../../state/store.ts'
import { useUi } from '../layout/ui.ts'
import { ACCESS_TOOLS, type AccessTool } from '../plan/access/accessState.ts'
import { CONNECT_HINT, connect } from '../plan/circulation/connectCommand.ts'
import { mergeSelection, unionGreyed } from '../plan/massCommands.ts'
import { nothingPicked } from '../plan/mix.ts'
import { RULER_HINT, TOOLS as PLAN_TOOLS, type GeneralTool, type Tool } from '../plan/tools/toolState.ts'
import { inHand, letGo, toggle } from '../tools/hand.ts'
import { PLAN_OFF, planToolsRefusal } from '../tools/pickTool.ts'
import { register, registerList } from './registry.ts'
import type { Command } from './types.ts'

const TOOLS = ['Tools']
const MASSING = ['Tools', 'Massing']
const STREETS = ['Tools', 'Streets']
const ANNOTATIONS = ['Tools', 'Annotations']

const planOn = (): boolean => useUi.getState().view !== '3d'
const NO_SITE = 'The site needs a boundary first'
const siteRefusal = (): true | string => (useApp.getState().derived.site.polygon === null ? NO_SITE : true)
/** The sentence a plan tool's button says, as plain text: written once, in `TOOLS`. */
const planHint = (tool: Tool): string => PLAN_TOOLS.find((t) => t.key === tool)!.hint
/** The same for an access tool: written once, in `ACCESS_TOOLS`. */
const accessHint = (tool: AccessTool): string => ACCESS_TOOLS.find((t) => t.key === tool)!.title

/** The first of two refusals that is a reason: the plan's tools rest first, then what the tool itself needs. */
const first = (...refusals: (() => true | string)[]) => (): true | string => {
  for (const r of refusals) {
    const why = r()
    if (why !== true) return why
  }
  return true
}

/** Move, Copy, Rotate, Mirror, Array and Align: over what is picked, on the plan. */
const general = (tool: GeneralTool, label: string, key: string, icon: 'move' | 'duplicate' | 'rotate' | 'mirror' | 'array' | 'align'): Command => ({
  id: `tool.${tool}`,
  label,
  menu: TOOLS,
  key,
  tool: { group: 'general', icon, hint: planHint(tool) },
  run: () => toggle(tool),
  enabled: () => (nothingPicked() ? 'Pick something first' : planOn() ? true : PLAN_OFF),
  checked: () => inHand(tool) && planOn(),
})

/** A drawing tool (Draw, Hole, Corner, Street): taken, or let go if in hand. */
const drawing = (id: string, tool: Tool, label: string, key: string, group: 'massing' | 'streets', icon: 'mass' | 'hole' | 'corner' | 'chamfer' | 'split' | 'road'): Command => ({
  id: `tool.${id}`,
  label,
  menu: group === 'massing' ? MASSING : STREETS,
  key,
  tool: { group, icon, hint: planHint(tool) },
  run: () => toggle(tool),
  enabled: planToolsRefusal,
  checked: () => inHand(tool),
})

/** Existing road: the site's access tool. */
const access = (id: string, tool: AccessTool, label: string, icon: 'existingRoad'): Command => ({
  id: `tool.${id}`,
  label,
  menu: STREETS,
  tool: { group: 'streets', icon, hint: accessHint(tool) },
  run: () => toggle(tool),
  enabled: siteRefusal,
  checked: () => inHand(tool),
})

export const TOOL_COMMANDS: Command[] = [
  {
    id: 'tool.select',
    label: 'Select',
    menu: TOOLS,
    key: 'V',
    tool: { group: 'general', icon: 'cursor', hint: planHint('select') },
    run: letGo,
    checked: () => inHand('select'),
  },
  general('move', 'Move', 'M', 'move'),
  general('copy', 'Copy', 'C', 'duplicate'),
  general('rotate', 'Rotate', 'R', 'rotate'),
  general('mirror', 'Mirror', 'I', 'mirror'),
  general('array', 'Array', 'A', 'array'),
  // Shift+A: the snap's switch *Align* (View › Align, `view.align`) is another command, with no key
  general('align', 'Align', 'Shift+A', 'align'),
]

/** Split (D.3): a line across a truck court cuts it. The docks module's tool: it stands after Chamfer while the typology offers the docks (review S7); the block editor's S is `block.split`. */
export const SPLIT_COMMANDS: Command[] = [drawing('split', 'split', 'Split', 'S', 'massing', 'split')]

export const MASSING_COMMANDS: Command[] = [
  drawing('mass', 'mass', 'Draw', 'B', 'massing', 'mass'),
  drawing('hole', 'hole', 'Hole', 'H', 'massing', 'hole'),
  drawing('corner', 'corner', 'Corner', 'F', 'massing', 'corner'),
  drawing('chamfer', 'chamfer', 'Chamfer', 'Shift+F', 'massing', 'chamfer'),
  // Edit's Merge, moved: it joins masses that touch (blocks of one type, into the first's own outline); in the strip, but not a tool in hand (`once`)
  {
    id: 'tool.union',
    label: 'Union',
    menu: MASSING,
    key: 'U',
    tool: { group: 'massing', icon: 'union', hint: 'Join the blocks picked that touch into one (blocks of one type)', once: true },
    run: () => void mergeSelection(),
    enabled: unionGreyed,
  },
]

export const STREET_COMMANDS: Command[] = [
  drawing('street', 'street', 'Street', 'W', 'streets', 'road'),
  {
    id: 'tool.gate',
    label: 'Gate',
    menu: STREETS,
    key: 'G',
    tool: { group: 'streets', icon: 'gate', hint: accessHint('gate') },
    run: () => toggle('gate'),
    enabled: first(planToolsRefusal, siteRefusal),
    checked: () => inHand('gate'),
  },
  access('existing-road', 'existing', 'Existing road', 'existingRoad'),
  // Connect: one click, the courts' shortest ways drawn as streets; it does something once, no tool in hand (`once`)
  {
    id: 'tool.connect',
    label: 'Connect',
    menu: STREETS,
    tool: { group: 'streets', icon: 'link', hint: CONNECT_HINT, once: true },
    run: connect,
    enabled: first(planToolsRefusal, siteRefusal),
  },
]

export const ANNOTATION_COMMANDS: Command[] = [
  {
    id: 'tool.dimension',
    label: 'Dimension',
    menu: ANNOTATIONS,
    key: 'D',
    tool: { group: 'annotations', icon: 'dimension', hint: planHint('dimension') },
    run: () => toggle('dimension'),
    enabled: () => (planOn() ? true : PLAN_OFF),
    checked: () => inHand('dimension') && planOn(),
  },
  {
    id: 'tool.ruler',
    label: 'Ruler',
    menu: ANNOTATIONS,
    key: 'T',
    tool: { group: 'annotations', icon: 'ruler', hint: RULER_HINT },
    run: () => toggle('ruler'),
    enabled: () => (planOn() ? true : PLAN_OFF),
    checked: () => inHand('ruler') && planOn(),
  },
  // a guide the other tools snap to (Phase AS.5): the project's, drawn point by point; its hint is written once, in `TOOLS`
  {
    id: 'tool.referenceLine',
    label: 'Reference line',
    menu: ANNOTATIONS,
    key: 'L',
    tool: { group: 'annotations', icon: 'referenceLine', hint: planHint('referenceLine') },
    run: () => toggle('referenceLine'),
    enabled: planToolsRefusal,
    checked: () => inHand('referenceLine') && planOn(),
  },
  // a text placed on the plan (Phase AS.5): one click, then its words in Properties; T is the Ruler's, Ctrl+Shift+T the browser's
  {
    id: 'tool.note',
    label: 'Note',
    menu: ANNOTATIONS,
    key: 'Shift+T',
    tool: { group: 'annotations', icon: 'note', hint: planHint('note') },
    run: () => toggle('note'),
    enabled: planToolsRefusal,
    checked: () => inHand('note') && planOn(),
  },
]

/** A module's commands: `list` what the open project's typology offers (none where it does not), `every` all of them,
 *  for the keys (a key given to another command meets a Dock a project with docks has). */
export interface ModuleList {
  list(): Command[]
  every(): Command[]
}

/** The modules' lists in the sub-menus they own: `elements` (the warehouse's) and `parking` (the parking module's). */
export interface ModuleTools {
  elements: ModuleList
  parking: ModuleList
  /** Split on the site (the docks module's): after Chamfer in Massing. */
  split: ModuleList
  /** The block editor's bar keys (the warehouse module's): Tools › Block editor. */
  blockEditor: ModuleList
}

/** The Tools menu in the strip's order; the groups the modules own are lists that follow the project. */
export function registerTools(modules: ModuleTools): void {
  register(TOOL_COMMANDS)
  const chamfer = MASSING_COMMANDS.findIndex((c) => c.id === 'tool.chamfer') + 1
  register(MASSING_COMMANDS.slice(0, chamfer))
  registerList(MASSING, modules.split.list, modules.split.every)
  register(MASSING_COMMANDS.slice(chamfer))
  registerList(['Tools', 'Elements'], modules.elements.list, modules.elements.every)
  register(STREET_COMMANDS)
  registerList(['Tools', 'Parking'], modules.parking.list, modules.parking.every)
  register(ANNOTATION_COMMANDS)
  registerList(['Tools', 'Block editor'], modules.blockEditor.list, modules.blockEditor.every)
}
