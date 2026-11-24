// What a plugin may use of the app (Decision "Optimizer plugin"): read the project and what derive() made of it, and
// change the project only through the actions, in one undo step each (`apply`), so the history, the state graph and
// the checks see a plugin's edit as any other. A plugin imports this file, never the store or a view (its UI kit is
// views/controls/ and views/format.ts); a test checks it.
import { z, type ZodType } from 'zod'
import { AGENT_GUIDE as CORE_GUIDE, toolSchemas as coreSchemas, callTool as runTool, TOOLS, type ToolCall, type ToolSchema } from '../api/tools/index.ts'
import { ToolError } from '../api/tools/tool.ts'
import type { Id, LogBy, Project } from '../model/schema.ts'
import { actions } from '../state/actions/index.ts'
import { useApp } from '../state/store.ts'
import { TYPOLOGIES } from '../typologies/index.ts'
import { useToast } from '../views/layout/toast.ts'
import { endLook, showLook, useLook, type Look } from '../views/viewport/look.ts'
import { heldBack, modeOf, usePluginModes } from './settings.ts'
import { pluginGuide, pluginTools, schemaOf, type OwnedTool } from './tools.ts'

export { actions }
export type { Id, LogBy, Project }
export type { Derived } from '../engine/types.ts'

/**
 * Shows a project in the viewport, read only (Decision "Specimen preview": a specimen): the plan and the 3D draw it,
 * the design dashed over it, the KPI strip gives its figures against the design's, a bar names it (‹ › its `prev` /
 * `next`) and goes back. The design and its history never change for it; an edit of the design ends it (`onEnd`).
 */
export type Preview = Omit<Look, 'owner'>
export type { LookAction as PreviewAction } from '../views/viewport/look.ts'
export const showPreview = (pluginId: string, preview: Preview) => showLook({ ...preview, owner: pluginId })
/** The plugin's own preview ends (`onEnd` is not told: the plugin knows). */
export const endPreview = (pluginId: string) => endLook(pluginId)
/** Whether the viewport shows the plugin's preview now (a quiet one goes in a step that draws no masses). */
export const isPreviewing = (pluginId: string) => useLook.getState().look?.owner === pluginId

/** Opens the plugin's tabs, by side (a run opens Specimens). */
export { openPluginTabs as showTabs } from './slots.tsx'
/** Whether the screen is wide (the side panels beside the viewport, a tab under it), as the frame lays itself out. */
export { useWide as useWideScreen } from '../views/layout/media.ts'
/** Opens one of the plugin's windows over the app (Decision "Stages layout"), or closes the plugin's window open. */
export { closePluginWindow as closeWindow, openPluginWindow as showWindow } from './slots.tsx'
export type { PluginActionProps } from './types.ts'

/** The start of a drag a plugin's handle makes: call it in the handle's `onPointerDown` where the drag starts (it keeps the browser from selecting text, captures the pointer, settles the focus). */
export { beginDrag } from '../views/controls/beginDrag.ts'

export const useProject = () => useApp((s) => s.project)
/** The project now, outside a view (a button's handler). */
export const currentProject = () => useApp.getState().project
/** Told each time the project changes (an edit, another one opened: its `id` says which). */
export const subscribeProject = (listener: (p: Project, before: Project) => void) =>
  useApp.subscribe((s, before) => {
    if (s.project !== before.project) listener(s.project, before.project)
  })
export const useDerived = () => useApp((s) => s.derived)
export const useActiveOption = () => useApp((s) => s.option)
/** The option in view now, outside a view (a tool's run). */
export const currentOption = () => useApp.getState().option
/** Goes to an option (one a plugin made: a kept specimen), as the options' list does. */
export const setActiveOption = (id: Id) => useApp.getState().setOption(id)

/** Asks before going on (Cancel / Continue, in the toast's place), as the app's own questions do. */
export const confirm = (text: string, onContinue: () => void, label?: string) => useToast.getState().confirm(text, onContinue, label)
/** Says something in the toast's place, as the app's own notices do. */
export const notify = (kind: 'info' | 'error', text: string) => useToast.getState().show(kind, text)
/** Who the decision log names now: the name set once in this browser, else "Designer". */
export { authorNow } from '../state/author.ts'

/**
 * One undo step: a pure edit made of actions, as the views do (`apply((p) => actions.x(p, …))`). `by`: who decided it,
 * for the decision log (the optimizer's kept specimen); absent, the designer.
 */
export const apply = (edit: (p: Project) => Project, by?: LogBy) => useApp.getState().apply(edit, by)

export type ToolAnswer = { ok: true; changed: boolean; output: unknown } | { ok: false; error: string }

/**
 * An agent's tool call (Decision "Agent tools"), on the option and level in view: a reading answers; an edit is one
 * undo step, logged as the agent's. A call that cannot run changes nothing and says why. A plugin's tool (Decision
 * "Plugin tools") runs as its plugin says, if the plugin is not off in this browser.
 */
export async function callTool(name: string, input: unknown): Promise<ToolAnswer> {
  const owned = pluginTools().find((x) => x.tool.name === name)
  if (owned) return callPluginTool(owned, input)
  const { project, option, level } = useApp.getState()
  const ctx = { option, level }
  let call: ToolCall = { ok: false, error: 'not run' }
  // an edit runs inside apply (one undo step; the decision log names its verbs), a reading on the project as it is
  if (TOOLS.find((x) => x.name === name)?.kind === 'edit') apply((p) => ((call = runTool(p, name, input, ctx)).ok ? call.project : p), 'agent')
  else call = runTool(project, name, input, ctx)
  return call.ok ? { ok: true, changed: call.changed, output: call.output } : call
}

/** Off in this browser (View → Plugins): its tools are not offered, and a call is refused. */
const isOff = (pluginId: string) => modeOf(usePluginModes.getState().modes, pluginId) === 'off'

async function callPluginTool({ plugin, tool }: OwnedTool, input: unknown): Promise<ToolAnswer> {
  if (isOff(plugin.id)) return { ok: false, error: `${tool.name}: the ${plugin.name} is off in this browser (View → Plugins turns it on).` }
  const held = heldBack(usePluginModes.getState(), plugin.id)
  if (held) return { ok: false, error: `${tool.name}: ${held}` }
  const parsed = tool.input.safeParse(input ?? {})
  if (!parsed.success) return { ok: false, error: `${tool.name}: ${z.prettifyError(parsed.error)}` }
  const before = currentProject()
  try {
    const output = await tool.run(parsed.data)
    return { ok: true, changed: currentProject() !== before, output }
  } catch (e) {
    if (e instanceof ToolError) return { ok: false, error: e.message }
    return { ok: false, error: `${tool.name} failed: ${e instanceof Error ? e.message : String(e)}` }
  }
}

/** A call that cannot be made, for a plugin's tool to throw: the agent is told why. */
export { ToolError }

/** What an agent is given: the core's tools, then those of the plugins not off in this browser. */
export const toolSchemas = (): ToolSchema[] => [
  ...coreSchemas(),
  ...pluginTools()
    .filter((x) => !isOff(x.plugin.id))
    .map((x) => schemaOf(x.tool)),
]

/** How an agent should use the tools: the core's guide, then the plugins' lines. */
export const AGENT_GUIDE = [CORE_GUIDE, pluginGuide()].filter(Boolean).join('\n')

/**
 * A message for the agent (Decision "Stage tools"): a plugin asks (the optimizer's *Ask the agent*); the plugin that
 * talks to the agent listens (`onAskAgent`, while it is not off in this browser) and puts it in its chat for the
 * designer to read and send. Whether one took it.
 */
const askers = new Map<string, (text: string) => void>()
export function askAgent(text: string): boolean {
  const on = [...askers].filter(([id]) => !isOff(id) && !heldBack(usePluginModes.getState(), id))
  for (const [, listener] of on) listener(text)
  return on.length > 0
}
export function onAskAgent(pluginId: string, listener: (text: string) => void): () => void {
  askers.set(pluginId, listener)
  return () => {
    if (askers.get(pluginId) === listener) askers.delete(pluginId)
  }
}

/** A plugin's data in a project, checked by its own schema; absent or not valid: null (the core keeps it as it is). */
export function pluginData<T>(project: Project, pluginId: string, schema: ZodType<T>): T | null {
  const raw = project.plugins?.[pluginId]
  if (raw === undefined) return null
  const parsed = schema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

export const usePluginData = <T>(pluginId: string, schema: ZodType<T>): T | null =>
  pluginData(useProject(), pluginId, schema)

/** A plugin's defaults for a typology (`Typology.plugins`: the optimizer's templates and stage plans), opaque to the
 *  core: the plugin reads them with its own schema. None (a typology without them, or one this code does not know): null. */
export const typologyData = (pluginId: string, typologyId: string): unknown =>
  TYPOLOGIES.find((t) => t.id === typologyId)?.plugins?.[pluginId] ?? null

/** Sets a plugin's data, one undo step (`undefined` removes it). */
export const setPluginData = (pluginId: string, data: unknown) => apply((p) => actions.setPluginData(p, pluginId, data))
