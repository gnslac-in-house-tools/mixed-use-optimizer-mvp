// The kinds' registry (Phase AS.4, Decision "Kinds"): which kinds of thing there are, what each is called, its branch of the Layers tree,
// the base verbs it takes and its own verbs' names. The core's kinds (`core.ts`) and those the modules bring, read through the catalog
// (`moduleKinds`: the warehouse's block type and the block's parts), listed while the project's typology offers the module. With no
// project, every kind of every module is there, to resolve a reference saved with a module off. Pure, like the catalog: no React, no
// store, no DOM, so the menu, MCP and the agent read the same list. A kind's verbs run elsewhere (`views/editing/menu/`).
import type { Project } from '../model/schema.ts'
import { isOffered, moduleKinds } from '../modules/catalog.ts'
import { CORE_KINDS } from './core.ts'
import type { Kind, LayerGroup, OwnVerb } from './types.ts'

export type { BaseVerb, Kind, LayerGroup, OwnVerb, Ref } from './types.ts'

/** Every kind, the core's first: those of the modules the project's typology offers (all of them with no project). */
export const kinds = (p?: Project): Kind[] => [...CORE_KINDS, ...moduleKinds(p)]

/** A kind by its id; undefined when there is none (or its module is not offered to `p`). */
export const kindOf = (id: string, p?: Project): Kind | undefined => kinds(p).find((k) => k.id === id)

/** The kinds in a branch of the Layers tree, in the registry's order. */
export const kindsOfGroup = (group: LayerGroup, p?: Project): Kind[] => kinds(p).filter((k) => k.group === group)

/** A kind's own verbs: those of a module only while the typology offers it (a mass has *Edit in the block editor* where there are blocks). */
export const ownVerbsOf = (id: string, p?: Project): OwnVerb[] =>
  (kindOf(id, p)?.own ?? []).filter((v) => v.module === undefined || p === undefined || isOffered(p, v.module))
