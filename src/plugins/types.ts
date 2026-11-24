// What a plugin is (Decision "Optimizer plugin"): a manifest the frame reads, never code the core calls by name.
// It adds tabs at the end of a side panel's rail (left: inputs, right: outputs), a tab may stand wide under the
// viewport (⤢), actions that are tabs at the end of the left panel's row (Decision "Panel tabs"), tools for an
// agent (Decision "Plugin tools") and, through host.ts, a read-only project in the viewport (a preview); each
// slot arrives with the first plugin that uses it. Its views load lazily, only once one of its tabs is opened, so a
// plugin that is off is never downloaded.
import type { ComponentType } from 'react'
import type { ZodType } from 'zod'
import type { Side } from '../views/layout/ui.ts'

/** A plugin tab's key in the panels' state: `plugin:<plugin id>/<tab id>`. */
export type PluginTabKey = `plugin:${string}`

export interface PluginTab {
  /** Unique in its plugin. */
  id: string
  side: Side
  label: string
  /** An SVG path on the 16 × 16 grid, drawn as the core's icons (1.5 px stroke, round ends). */
  icon: string
  /** The tab's view, loaded the first time it is opened. */
  load: () => Promise<{ default: ComponentType<PluginTabProps> }>
  /** It may stand wide under the viewport (⤢), as the Rules list does, the viewport above: on a wide screen only. */
  wide?: boolean
}

/** What a plugin tab's view is given: where it stands, and a way to stand wide and back. */
export interface PluginTabProps {
  /** Drawn wide, under the viewport; else in its panel. */
  wide: boolean
  /** In its panel while it stands wide under the viewport: the panel only says where it went. */
  away: boolean
  /** Under the viewport (true) or back in its panel: a tab that may stand wide, on a wide screen. */
  setWide?(on: boolean): void
  /** Under the viewport, folded to its first line: the viewport takes the height. */
  folded?: boolean
  /** Folds it or unfolds it, while it stands under the viewport. */
  setFolded?(on: boolean): void
}

/**
 * A plugin's window over the app (Decision "Stages layout"), as the Brief and Rules: the app darkened round it, ✕,
 * Escape or a click outside closes it. Opened by the plugin through the host (`showWindow`); what it shows is the
 * plugin's own state.
 */
export interface PluginWindow {
  /** Unique in its plugin. */
  id: string
  /** Its name, for the window's label. */
  label: string
  load: () => Promise<{ default: ComponentType }>
}

/** A plugin window's key, as the frame's open window: `plugin:<plugin id>/<window id>`. */
export type PluginWindowKey = `plugin:${string}`

/** What a plugin's action's badge is given: whether its tabs are open, and how to open them or go back. */
export interface PluginActionProps {
  label: string
  open: boolean
  toggle(): void
}

/**
 * A plugin's action, a tab at the end of the left panel's row (Decisions "Optimizer button", "Panel tabs"): an icon alone, its label the tab's name for assistive tech and its tooltip, drawn
 * by the frame. Picked, it opens the plugin's tabs on both sides at once; picked again, the tabs that were open come
 * back. A badge of the plugin's own (a run's progress, a connection's
 * dot) may sit on it, loaded with the frame while the plugin is on.
 */
export interface PluginAction {
  /** Unique in its plugin. */
  id: string
  label: string
  title: string
  /** Its icon on the rail: a path on the 16 × 16 grid, as a tab's. */
  icon: string
  /** The plugin's tab each side opens, by its id; `below`: a tab that stands under the viewport while the action is
   *  open (on a wide screen; on a narrow one it is reached from the tab it opens). */
  opens: Partial<Record<Side | 'below', string>>
  /** The rail's group it stands in (Decision "Ribbon groups"): the design's tools (Optimize, Agent; by default) or
   *  the documentation's (Sheets, when it is built), set apart by a line. */
  section?: 'design' | 'documentation'
  /** Its badge on the category (nothing drawn: null). */
  badge?: () => Promise<{ default: ComponentType<PluginActionProps> }>
}

/**
 * A plugin's tool for an agent (Decision "Plugin tools"), beside the core's (api/tools/): the Agent tab and MCP list it
 * with them. Unlike a core tool it runs in the tab, may take time (a run of the optimizer) and does its own edits through
 * host.ts (`apply` with `'agent'`: one undo step each). The manifest holds what the MCP server lists (name, description,
 * input), so the code that runs it is loaded at its first call, never by the server.
 */
export interface PluginTool<I = unknown> {
  /** Unique among every tool, the core's too. */
  name: string
  description: string
  /** read: answers, changes nothing; edit: may change the project. */
  kind: 'read' | 'edit'
  input: ZodType<I>
  /** Its answer for the agent; a thrown ToolError (host.ts) says why it could not. */
  run(input: I): Promise<unknown>
}

/** Each tool keeps its own input type; the list holds them all. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const pluginTool = <I>(t: PluginTool<I>): PluginTool<any> => t

export interface Plugin {
  /** Its folder's name and its key in `Project.plugins`. */
  id: string
  name: string
  description: string
  tabs: PluginTab[]
  actions?: PluginAction[]
  /** Its windows over the app. */
  windows?: PluginWindow[]
  /** Its tools for an agent. */
  tools?: PluginTool[]
  /** How an agent should use them: lines added to the agent's guide (api/tools/guide.ts). */
  guide?: string
}

/** On: its tabs show. Hidden: they do not, and it may keep working. Off: nothing of it loads; its data stays. */
export type PluginMode = 'on' | 'hidden' | 'off'
