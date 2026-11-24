// A smart block in the library (Decision "Block library"), pure: a project's type as a block, the programs a type
// names, and a type's programs renamed by a map (what bringing one into another project does with them).
import { BLOCK_FORMAT, BLOCK_VERSION, type Block, type Id, type Project, type WarehouseType } from '../../../model/schema.ts'

/** The programs a type names, each once: its own first, then its zones'. */
export function programIdsOf(t: WarehouseType): Id[] {
  const ids = [t.program, ...(t.morphology.zones ?? []).map((z) => z.program)]
  return [...new Set(ids.filter((id): id is Id => typeof id === 'string'))]
}

/** The type with each program it names renamed by `map` (one not in it stays as it is). */
export function withPrograms(t: WarehouseType, map: ReadonlyMap<Id, Id>): WarehouseType {
  const to = <T extends Id | null | undefined>(id: T): T => (typeof id === 'string' ? ((map.get(id) ?? id) as T) : id)
  return {
    ...t,
    program: to(t.program),
    morphology: {
      ...t.morphology,
      ...(t.morphology.zones ? { zones: t.morphology.zones.map((z) => (z.program === undefined ? z : { ...z, program: to(z.program) })) } : {}),
    },
  }
}

/**
 * A project's type as a block `id` at `version`: the type as it is (not its link) and the programs it names, as the
 * project has them, without their targets (what a client asks stays with the project). Null without that type.
 */
export function blockOf(p: Project, typeId: Id, id: Id, version: number, savedAt: number): Block | null {
  const t = p.warehouseTypes?.find((x) => x.id === typeId)
  if (!t) return null
  const programs = programIdsOf(t).flatMap((pid) => {
    const g = p.programs.find((x) => x.id === pid)
    if (!g) return []
    const { target: _, ...rest } = g
    return [structuredClone(rest)]
  })
  if (!programs.length) return null
  const { library: _, ...type } = structuredClone(t)
  return { format: BLOCK_FORMAT, formatVersion: BLOCK_VERSION, id, version, savedAt, type, programs }
}

/** Whether `b` is newer than the version of it `t` is. */
export const isNewer = (t: WarehouseType, b: Block) => t.library?.id === b.id && b.version > t.library.version
