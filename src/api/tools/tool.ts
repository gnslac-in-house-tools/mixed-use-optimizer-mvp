// What a tool is (Decision "Agent tools"): a verb of the app, or a reading of the project, an agent can call, in the
// app (8.1) or through MCP (8.2). Pure: a project in, a project (one undo step, applied by the caller) and an answer
// out. Its input is a zod schema, so the agent gets its JSON Schema and a call is checked before it runs.
import type { ZodType } from 'zod'
import type { Id, Project } from '../../model/schema.ts'

/** Where a call stands when its input does not say: the option and the level in view (MCP: the first option's ground). */
export interface ToolContext {
  option: Id
  level: Id
}

/** A run's answer: the project after it (an edit; the same one, nothing changed) and what to tell the agent. */
export interface ToolOutcome {
  project: Project
  output: unknown
}

export interface Tool<I = unknown> {
  /** The verb's name for an edit (the decision log names it), get… for a reading. */
  name: string
  /** For the agent: what it does and what it needs, in one or two sentences. */
  description: string
  /** read: answers, changes nothing; edit: one undo step. */
  kind: 'read' | 'edit'
  /** The verbs of `actions` it calls (the coverage test checks every verb is a tool's or left out on purpose). */
  verbs: string[]
  input: ZodType<I>
  run(p: Project, input: I, ctx: ToolContext): ToolOutcome
}

/** A call that cannot be made (an id that is not there, a shape a verb does not take): the agent is told why. */
export class ToolError extends Error {}

/** Each tool keeps its own input type; the list holds them all. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const tool = <I>(t: Tool<I>): Tool<any> => t

/**
 * The item of a list by id, or by its name when no id is it (a model often says "Warehouse 1"), or a ToolError that
 * names what was asked for and what there is.
 */
export function need<T extends { id: Id; name?: string }>(list: T[] | undefined, id: Id, what: string): T {
  const named = (x: T) => x.name !== undefined && x.name.trim().toLowerCase() === id.trim().toLowerCase()
  const found = list?.find((x) => x.id === id) ?? list?.find(named)
  if (!found) throw new ToolError(`No ${what} "${id}". There are: ${(list ?? []).map((x) => (x.name ? `${x.id} (${x.name})` : x.id)).join(', ') || 'none'}.`)
  return found
}
