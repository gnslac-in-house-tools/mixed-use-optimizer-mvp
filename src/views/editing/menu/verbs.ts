// The runners of the one right-click menu (Phase AS.4, Decision "One menu"): what a verb of a kind does, registered by kind and verb id, so
// `build.ts` can make the rows from the kind's registry (`src/kinds/`: which verbs a kind has, in which order, under which name) and nothing
// else lists a context menu's rows. A kind's file in `kinds/` (a module's in its `views/`, loaded by `modules.ts`) registers with
// `registerKind(kindId, { own, base })`; registering twice for a kind adds to it (the warehouse's two verbs on a mass).
//   own     a Runner for each of the kind's own verbs (`Kind.own`, by id); a verb with no runner is left out of the menu
//   base    what a kind says of a base verb in its own way (the mass's Delete and Select all, the title of its Lock); the rest of the base
//           verbs are the registry's commands (`commandRow`): label, key and, greyed, reason are the command's
//   name    what a person calls one of the kind, for the menu's name (a block's name)
// A Runner is `{ run, enabled, checked, title, label }` for a row, `items` for a sub-menu (*To building ▸*), `rows` for a verb whose rows are
// not one (the platform's, the grid's split), `command` for an own verb that is a command of the registry (Group, Union, Rotate 90°), and
// `present` to leave the verb out where it does not apply (the warehouse's two on a mass that is not a block; a base verb too: Duplicate with a
// library block among the blocks picked). `group` puts own verbs that
// share one side by side; a separator goes between two groups.
import type { BaseVerb, Ref } from '../../../kinds/types.ts'
import type { Point } from '../../../model/schema.ts'
import { commandOf, runCommand } from '../../commands/index.ts'
import { detailOf } from '../../commands/shortcuts.ts'
import type { MenuEntry } from '../../controls/Menu.tsx'

/** Where a menu was asked for: the plan, the 3D, the rows of Layers, the Blocks tab. The same thing gives the same entries in each. */
export type MenuPlace = 'plan' | '3d' | 'layers' | 'blocks'

/** A row's leaf entry. */
export type Leaf = Extract<MenuEntry, { onSelect(): void }>

export interface Runner {
  /** The verb is listed only when this says so (absent: always). */
  present?(refs: Ref[]): boolean
  /** The own verbs with the same group stand together; a separator between groups (absent: a group of its own). */
  group?: string
  /** The registry's command this verb is (Group: `edit.group`): its label, key and reason are the command's. */
  command?: string
  /** The row's label, when it is not the kind's own verb label. */
  label?(refs: Ref[]): string
  /** What the row says while it can run (greyed, its reason is shown instead). */
  title?(refs: Ref[]): string | undefined
  /** `true`, or why not, as a command's `enabled`: the row is greyed with it as its title. */
  enabled?(refs: Ref[]): true | string
  checked?(refs: Ref[]): boolean
  /** The row's quiet word at the right: its key (`Ctrl+A`) when the verb has one of its own and is no command, or what it acts on (a level's masses). */
  detail?(refs: Ref[]): string | undefined
  run?(refs: Ref[], at: Point | null): void
  /** A sub-menu: its entries (a title's row opens it). */
  items?(refs: Ref[], at: Point | null): MenuEntry[]
  /** Whole rows, when the verb is not one row (the platform's two, the grid's split, whose label says the line): none leaves it out. */
  rows?(refs: Ref[], at: Point | null): MenuEntry[]
}

export interface KindRunners {
  own?: Record<string, Runner>
  base?: Partial<Record<BaseVerb, Runner>>
  /** What a person calls one of this kind, for the menu's name (a block's name); absent or undefined: the core's way (`menuName` in `build.ts`), then the kind's label. */
  name?(ref: Ref): string | undefined
}

interface Registered {
  own: Record<string, Runner>
  base: Partial<Record<BaseVerb, Runner>>
  name?: (ref: Ref) => string | undefined
}

const registry = new Map<string, Registered>()

/** Registers the runners of a kind (adds to what it has: a module's verbs on the core's kind). */
export function registerKind(kind: string, runners: KindRunners): void {
  const had = registry.get(kind) ?? { own: {}, base: {} }
  registry.set(kind, { own: { ...had.own, ...runners.own }, base: { ...had.base, ...runners.base }, name: runners.name ?? had.name })
}

/** What the kind's module calls this one (undefined: no say of its own). */
export const nameRunner = (ref: Ref): string | undefined => registry.get(ref.kind)?.name?.(ref)

/** The runner of a kind's own verb; undefined when none is registered (the row is left out). */
export const ownRunner = (kind: string, verb: string): Runner | undefined => registry.get(kind)?.own[verb]

/** What the kind says of a base verb itself; undefined: the registry's command stands for it. */
export const baseRunner = (kind: string, verb: BaseVerb): Runner | undefined => registry.get(kind)?.base[verb]

/**
 * A row that is a command (`key` is the row's, `id` the command's): its label, its key and its reason (while it cannot run) come from the
 * registry, and picking it runs it. `title` is what the row says while it can run. `own` replaces the run, for the rows that need the
 * pointer's place (Paste here).
 */
export function commandRow(key: string, id: string, title: string, own?: () => void): Leaf {
  const c = commandOf(id)
  if (!c) throw new Error(`The menu asks for the command "${id}", which the registry does not have`)
  const why = c.enabled?.() ?? true
  return {
    key,
    label: typeof c.label === 'function' ? c.label() : c.label,
    ...detailOf(id),
    disabled: why !== true,
    title: why === true ? title : why,
    onSelect: own ?? (() => void runCommand(id)),
  }
}

/** The row (or rows) of an own verb of a kind, from its runner. */
export function rowsOf(verb: { id: string; label: string }, r: Runner, refs: Ref[], at: Point | null): MenuEntry[] {
  if (r.rows) return r.rows(refs, at)
  if (r.command) return [commandRow(verb.id, r.command, r.title?.(refs) ?? '', r.run && (() => r.run!(refs, at)))]
  const why = r.enabled?.(refs) ?? true
  const label = r.label?.(refs) ?? verb.label
  const title = why === true ? r.title?.(refs) : why
  if (r.items) return [{ key: verb.id, label, title, disabled: why !== true, items: r.items(refs, at) }]
  const detail = r.detail?.(refs)
  return [{ key: verb.id, label, ...(detail ? { detail } : {}), title, disabled: why !== true, ...(r.checked ? { checked: r.checked(refs) } : {}), onSelect: () => r.run?.(refs, at) }]
}
