// The block library (Decision "Block library"): two shelves put together. **GFit's** ship with the app, so the public
// link gives them to the whole team: the sample's blocks (state/sample.ts), read-only, at version 1, and the block files
// published in the repository (`src/state/blocks/*.gfb`, Phase BL.5: one of an id already there, at a higher
// version, takes its place). **This
// browser's** (io/blocks.ts) are the blocks saved here; one saved over a GFit block (its id) shadows it in this browser.
// The views follow `useBlockLibrary`'s count: each save bumps it, and `libraryBlocks` reads the shelves again.
import { create } from 'zustand'
import type { Block, Id, Project } from '../../../model/schema.ts'
import { browserBlocks, newBlockId, readBlockFile } from '../../../io/blocks.ts'
import { actions } from '../../../state/actions/index.ts'
import { sampleProject } from '../../../state/sample.ts'
import { blockOf } from '../engine/library.ts'

export type Shelf = 'gfit' | 'browser'

export interface LibraryBlock {
  block: Block
  shelf: Shelf
}

/** A GFit block's id: `gfit-` and its name, lower case (Cross-dock → gfit-cross-dock). */
export const gfitId = (name: string) => `gfit-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`

/** The block files published in the repository: GFit's too. */
const PUBLISHED = import.meta.glob<string>('/src/state/blocks/*.gfb', { query: '?raw', import: 'default', eager: true })

let gfit: Block[] | null = null

/**
 * GFit's blocks: the sample's warehouse blocks (a program of the warehouse kind) and the published files (the highest version of each id), made once.
 * The sample's Guard house and Outdoor storage are blocks of the sample alone (the user's call, 2026-11-17): the shelf keeps the warehouse blocks it had.
 */
export function gfitBlocks(): Block[] {
  if (!gfit) {
    const p = sampleProject()
    const warehouses = (p.warehouseTypes ?? []).filter((t) => p.programs.find((g) => g.id === t.program)?.kind === 'warehouse')
    const sample = warehouses.flatMap((t) => blockOf(p, t.id, gfitId(t.name), 1, 0) ?? [])
    const published = Object.values(PUBLISHED).flatMap((text) => {
      const r = readBlockFile(text)
      return r.ok ? [r.block] : []
    })
    const byId = new Map<Id, Block>()
    for (const b of [...sample, ...published]) if ((byId.get(b.id)?.version ?? 0) < b.version) byId.set(b.id, b)
    gfit = [...byId.values()]
  }
  return gfit
}

/** Every block at hand: this browser's, then GFit's it does not shadow; by name. */
export function libraryBlocks(): LibraryBlock[] {
  const mine = browserBlocks.list()
  const own = new Set(mine.map((b) => b.id))
  return [
    ...mine.map((block): LibraryBlock => ({ block, shelf: 'browser' })),
    ...gfitBlocks()
      .filter((b) => !own.has(b.id))
      .map((block): LibraryBlock => ({ block, shelf: 'gfit' })),
  ].sort((a, b) => a.block.type.name.localeCompare(b.block.type.name))
}

/** The block of `id` at hand, or undefined. */
export const libraryBlock = (id: Id) => libraryBlocks().find((e) => e.block.id === id)

/** Bumped by every save and removal, so the views read the shelves again. */
export const useBlockLibrary = create<{ count: number; changed(): void }>()((set) => ({
  count: 0,
  changed: () => set((s) => ({ count: s.count + 1 })),
}))

/** Saves `b` on this browser's shelf; false when the storage is full or blocked. */
export function saveBlock(b: Block): boolean {
  const ok = browserBlocks.save(b)
  if (ok) useBlockLibrary.getState().changed()
  return ok
}

/** Forgets a block of this browser's (a GFit block it shadowed shows again). */
export function removeBlock(id: Id): void {
  browserBlocks.remove(id)
  useBlockLibrary.getState().changed()
}

/** What a library block's drag (or click) carries in place of a type's id: `block:` and its id. */
const DRAG = 'block:'
export const blockDrag = (id: Id) => `${DRAG}${id}`
/** The library block a drag carries, or null (a type's id). */
export const draggedBlock = (data: string): Id | null => (data.startsWith(DRAG) ? data.slice(DRAG.length) : null)

/** "<name> copy", or "<name> copy <n>" with the first n no block has (as a copied program is named). */
function copyName(taken: string[], name: string): string {
  if (!taken.includes(`${name} copy`)) return `${name} copy`
  let n = 2
  while (taken.includes(`${name} copy ${n}`)) n++
  return `${name} copy ${n}`
}

/** A copy's name: "<name> copy" (or "copy <n>"), one no block of the library has. */
export const libraryCopyName = (name: string): string => copyName(libraryBlocks().map((e) => e.block.type.name), name)

/** How a type is saved to the library: over its block (a new version of it) or as a block of its own. */
export type SaveMode = 'overwrite' | 'copy'

/**
 * A project's type saved to this browser's shelf: over the block it is linked to (`overwrite`: that block's next
 * version) or as a new block (`copy`, or a type not linked yet: version 1; a copy named after it). The block, or null
 * when the type is not there or the storage is full.
 */
export function saveType(p: Project, typeId: Id, mode: SaveMode): Block | null {
  const t = p.warehouseTypes?.find((x) => x.id === typeId)
  if (!t) return null
  const over = mode === 'overwrite' && t.library ? t.library : null
  const at = over ? libraryBlock(over.id)?.block : undefined
  const b = over ? blockOf(p, typeId, over.id, Math.max(over.version, at?.version ?? 0) + 1, Date.now()) : blockOf(p, typeId, newBlockId(), 1, Date.now())
  if (!b) return null
  if (!over && t.library) b.type.name = libraryCopyName(t.name)
  return saveBlock(b) ? b : null
}

/**
 * A project's type as the block its file holds (Download .gfb in the Blocks tab): the block it is linked to (its id and version) or, not linked, a block of
 * its own, version 1. Null without that type or a program of it.
 */
export function fileOf(p: Project, typeId: Id): Block | null {
  const t = p.warehouseTypes?.find((x) => x.id === typeId)
  if (!t) return null
  return t.library ? blockOf(p, typeId, t.library.id, t.library.version, Date.now()) : blockOf(p, typeId, newBlockId(), 1, Date.now())
}

/** The project with each linked type brought up to its block's newest (Decision "Block library"), and their names. */
export function upToDate(p: Project): { project: Project; names: string[] } {
  if (!p.warehouseTypes?.some((t) => t.library)) return { project: p, names: [] }
  const r = actions.updateFromLibrary(p, libraryBlocks().map((e) => e.block))
  return { project: r.project, names: r.updated.map((id) => r.project.warehouseTypes!.find((t) => t.id === id)!.name) }
}
