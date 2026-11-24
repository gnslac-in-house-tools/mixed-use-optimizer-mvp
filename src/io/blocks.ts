// This browser's shelf of the block library (Decision "Block library"): the blocks saved here, under one key, each
// checked as it is read (one that does not read is left out, an older one brought to the shape this code writes); and
// a block's file (.gfb). GFit's own blocks ship with the app (the warehouse module's views/blockLibrary.ts puts both
// shelves together).
import { BlockSchema, type Block, type Id } from '../model/schema.ts'
import { migrateBlock } from '../modules/warehouse/engine/migrate.ts'

export const BLOCKS_KEY = 'gfit.blocks'

function read(): Block[] {
  try {
    const raw = JSON.parse(localStorage.getItem(BLOCKS_KEY) ?? '[]') as unknown
    if (!Array.isArray(raw)) return []
    return raw.flatMap((b) => {
      const r = BlockSchema.safeParse(migrateBlock(b))
      return r.success ? [r.data] : []
    })
  } catch {
    return []
  }
}

function write(blocks: Block[]): boolean {
  try {
    localStorage.setItem(BLOCKS_KEY, JSON.stringify(blocks))
    return true
  } catch {
    return false
  }
}

export const browserBlocks = {
  list: read,
  /** Saves `b` in place of the one of its id (or beside the others); false when the storage is full or blocked. */
  save: (b: Block): boolean => write([...read().filter((x) => x.id !== b.id), b]),
  remove: (id: Id): boolean => write(read().filter((x) => x.id !== id)),
}

/** A new block's id: no other block of this browser's has it. */
export function newBlockId(): Id {
  return `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

/** A block's file (Phase BL.5): what Export block writes and Import block reads; one put in `src/state/blocks/` is GFit's. */
export const BLOCK_EXTENSION = 'gfb'

export function writeBlockFile(b: Block): string {
  return `${JSON.stringify(b, null, 2)}\n`
}

export type BlockRead = { ok: true; block: Block } | { ok: false; error: string }

/** A block's file read and checked: the block, or why it is not one. */
export function readBlockFile(text: string): BlockRead {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: 'it is not JSON' }
  }
  // an older block's shape read into this one (Decision "Block shape")
  const r = BlockSchema.safeParse(migrateBlock(raw))
  if (!r.success) return { ok: false, error: 'it is not a GFit block' }
  return { ok: true, block: r.data }
}

/** A block's file name: its name, lower case, and `.gfb`. */
export const blockFileName = (b: Block) => `${b.type.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'block'}.${BLOCK_EXTENSION}`
