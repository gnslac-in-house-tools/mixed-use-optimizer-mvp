// The projects kept in this browser (Decision "Library"; a first slice of Phase 9.1): an index of what Home lists, and
// one key per project, each kept as a .gft is (readGft migrates and checks it). localStorage, synchronous like the one
// copy it replaces (io/browserCopy.ts reads and writes through it), behind `Library` so Phase 9.1 can put IndexedDB
// in its place. Nothing here touches React or the store.
import type { KpiUnit } from '../engine/kpis.ts'
import type { Id, Project } from '../model/schema.ts'
import { GFT_FORMAT, readGft } from './gft.ts'

export const INDEX_KEY = 'gfit.projects'
export const projectKey = (id: Id) => `gfit.project:${id}`

/** What Home shows of a project without reading it whole. */
export interface Entry {
  id: Id
  name: string
  typology: string
  /** When it was last kept (ms since 1970). */
  savedAt: number
  /** How many design options it has. */
  options: number
  /** A small plan of it (SVG markup), drawn when it was kept; none when it has no site yet. */
  thumb?: string
  /** The option in view when it was kept. */
  option?: Id
  /** What Home's summary shows of it, measured when it was kept (views/home/summary.ts); none from before. */
  summary?: Summary
}

/** A figure of an option, as it read when the project was kept. */
export interface SummaryFigure {
  id: string
  label: string
  unit: KpiUnit
  value: number
  limit: number | null
}

/** An option, as Home's summary shows it. */
export interface OptionSummary {
  id: Id
  name: string
  /** Its plan (SVG markup); none without a site. */
  thumb?: string
  figures: SummaryFigure[]
  errors: number
  warnings: number
  /** The first few issues' messages. */
  issues: string[]
}

/** A project's site and options, measured when it was kept. */
export interface Summary {
  /** The site's area (ha) and its ground's fall (m); null without a site, or a ground. */
  hectares: number | null
  fall: number | null
  /** The ground's height along the site's long axis (m), from one end to the other; empty without a ground. */
  profile: number[]
  options: OptionSummary[]
}

/** A project as kept: the project, and the option that was in view. */
export interface Kept {
  project: Project
  /** The option in view when it was kept (null: the project's first). */
  option: Id | null
  savedAt: number
  /** What migrating an older copy did (its masses are blocks now…): the report its opening says; absent: nothing. */
  notes?: string[]
}

export interface Library {
  list(): Entry[]
  read(id: Id): Kept | null
  /** false when the browser would not keep it (full, or blocked). */
  write(p: Project, option: Id, savedAt: number, thumb?: string, summary?: Summary): boolean
  remove(id: Id): void
}

function readIndex(): Entry[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY)
    const list = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(list) ? (list as Entry[]).filter((e) => e && typeof e.id === 'string') : []
  } catch {
    return []
  }
}

function writeIndex(list: Entry[]): void {
  localStorage.setItem(INDEX_KEY, JSON.stringify(list))
}

/** A kept copy, as a .gft is read: null when it is missing, broken or not GFit's. */
export function readKept(raw: string | null): Kept | null {
  if (!raw) return null
  try {
    const c = JSON.parse(raw) as { project?: unknown; option?: unknown; savedAt?: unknown }
    const r = readGft(JSON.stringify(c.project ?? null))
    if (!r.ok) return null
    return { project: r.project, option: typeof c.option === 'string' ? c.option : null, savedAt: typeof c.savedAt === 'number' ? c.savedAt : 0, ...(r.notes ? { notes: r.notes } : {}) }
  } catch {
    return null
  }
}

export const library: Library = {
  /** Newest first. */
  list: () => readIndex().sort((a, b) => b.savedAt - a.savedAt),

  read(id) {
    try {
      return readKept(localStorage.getItem(projectKey(id)))
    } catch {
      return null
    }
  },

  write(p, option, savedAt, thumb, summary) {
    try {
      localStorage.setItem(projectKey(p.id), JSON.stringify({ savedAt, option, project: { format: GFT_FORMAT, ...p } }))
      const entry: Entry = { id: p.id, name: p.name, typology: p.typology, savedAt, options: p.options.length, option, ...(thumb ? { thumb } : {}), ...(summary ? { summary } : {}) }
      writeIndex([entry, ...readIndex().filter((e) => e.id !== p.id)])
      return true
    } catch {
      return false
    }
  },

  remove(id) {
    try {
      localStorage.removeItem(projectKey(id))
      writeIndex(readIndex().filter((e) => e.id !== id))
    } catch {
      // blocked: nothing was kept to remove
    }
  },
}
