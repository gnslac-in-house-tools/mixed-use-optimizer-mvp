// The `.gft` file (Decision "Name + file"): the Project as JSON text, with a `format: 'gfit'` header next to its
// `version`. Pure, like the engine: no DOM, no store, so MCP or a batch script can read and write projects too.
//   write → { "format": "gfit", "version": 2, "name": …, "site": …, … }
//   read  → JSON? → the header says gfit? → an older version migrated → zod says it is a Project? → the Project
//           (never Derived: it is recomputed)
// The extension is only a hint: the header and zod are the real check.
import { tidyLevels } from '../engine/levels.ts'
import { migrated } from '../model/migrate.ts'
import { PROJECT_VERSION, ProjectSchema, type Project } from '../model/schema.ts'
import { ensureGrid } from '../typologies/index.ts'
import { withoutEmptyBuildings } from '../state/actions/buildings.ts'

export const GFT_FORMAT = 'gfit'
export const GFT_EXTENSION = 'gft'

/**
 * What reading gives: the project, and `notes` (Phase D.2: what migrating an older file did, sentence by sentence, for example that its masses
 * are blocks now; absent when there is nothing to say), or why it cannot be read.
 */
export type ReadResult = { ok: true; project: Project; notes?: string[] } | { ok: false; error: string }

/** What opening a file or a kept project says: its name, and the report of what migrating did to it when it did something. */
export function openedNotice(name: string, notes: readonly string[] | undefined): string {
  return notes?.length ? `Opened “${name}” from an older GFit: ${notes.join(' ')}` : `Opened “${name}”.`
}

export function writeGft(p: Project): string {
  return JSON.stringify({ format: GFT_FORMAT, ...p }, null, 2)
}

export function readGft(text: string): ReadResult {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, error: 'the file is not JSON text.' }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, error: 'the file is not a GFit project.' }
  const { format, ...rest } = data as Record<string, unknown>
  if (format !== GFT_FORMAT) return { ok: false, error: 'the file is not a GFit project (it has no "format": "gfit" header).' }
  if (typeof rest.version === 'number' && rest.version > PROJECT_VERSION)
    return { ok: false, error: `it was saved by a newer GFit (project version ${rest.version}).` }
  const { data: migratedData, notes } = migrated(rest)
  const r = ProjectSchema.safeParse(migratedData)
  if (!r.success) {
    const issue = r.error.issues[0]
    const where = issue.path.length ? issue.path.join('.') : 'the project'
    return { ok: false, error: `${where}: ${issue.message}` }
  }
  // the levels its masses make (Decision "Levels follow the masses"): an older file's empty or twin levels go; and a
  // grid (Decision "Grid always"): a file without one gets its typology's, fitted to its site; and no building left
  // without masses (Decision "No empty buildings")
  return { ok: true, project: normalised(r.data), ...(notes.length ? { notes } : {}) }
}

/**
 * What reading does to a project besides the schema (the levels its masses make, a grid, no empty building): pure, and
 * the schema is not in it. A project passed through JSON and this is what a faithful copy of it reads back as: a key the
 * schema drops is still there, so a check against it sees the loss.
 */
export function normalised(p: Project): Project {
  return ensureGrid(tidyLevels(withoutEmptyBuildings(p)))
}

/** Each part of a file name up to this length: the whole name stays far under the 255 limit. */
const PART_LENGTH = 60

/**
 * A safe piece of a file name: no accents, dashes for whatever is not a letter or digit (in any alphabet) and at most
 * 60 characters. Port of Plaza-Practiko `vistas/paneles/nombresArchivo.ts` (`segmento`).
 */
export function fileSegment(text: string): string {
  return [
    ...text
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/[^\p{L}\p{N}-]+/gu, '-')
      .replace(/^-+|-+$/g, ''),
  ]
    .slice(0, PART_LENGTH)
    .join('')
    .replace(/-+$/, '')
}

/** YYYY-MM-DD in local time. */
export function fileDate(d: Date): string {
  const two = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`
}

/** `<project>_<YYYY-MM-DD>.<ext>`: "Planta Querétaro" on 14 October → `Planta-Queretaro_2026-10-14.gft`. */
export function fileName(projectName: string, extension = GFT_EXTENSION, date = new Date()): string {
  return `${fileSegment(projectName) || 'project'}_${fileDate(date)}.${extension}`
}
