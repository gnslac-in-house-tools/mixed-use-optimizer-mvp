// Home's rows (Decision "Home"): the projects this browser keeps, newest first, with the sample pinned on top whether
// it was kept or not. The sample as it comes is measured once (its summary is not in the library until it is kept);
// a project kept before summaries were is measured once, the first time Home lists it, and its summary kept.
import type { Id } from '../../model/schema.ts'
import { derive } from '../../engine/derive.ts'
import { library, type Summary } from '../../io/library.ts'
import { SAMPLE_ID, SAMPLE_NAME, sampleProject } from '../../state/sample.ts'
import { summarize } from './summary.ts'

export interface Row {
  id: Id
  name: string
  sample: boolean
  typology: string
  /** When this browser last kept it; null: the sample, never opened. */
  savedAt: number | null
  options: number
  /** The option it was left in. */
  option?: Id
  thumb?: string
  /** None for a project kept before summaries were. */
  summary?: Summary
}

/** The sample's name on Home: what it is, the badge says it is the sample. */
export const SAMPLE_TITLE = SAMPLE_NAME.replace(/^Sample · /, '')

let fresh: { summary: Summary; blocks: number; option: Id } | null = null

/** The sample as it comes: measured the first time Home asks. */
export function freshSample(): { summary: Summary; blocks: number; option: Id } {
  if (!fresh) {
    const p = sampleProject()
    const option = p.options[0].id
    fresh = { summary: summarize(p, derive(p, option)), blocks: p.warehouseTypes?.length ?? 0, option }
  }
  return fresh
}

/** Measures a kept project that has no summary yet and keeps it beside it; false when it does not read. */
function measureKept(id: Id): boolean {
  const c = library.read(id)
  const e = library.list().find((x) => x.id === id)
  if (!c || !e) return false
  const option = c.option ?? c.project.options[0].id
  return library.write(c.project, option, e.savedAt, e.thumb, summarize(c.project, derive(c.project, option)))
}

export function homeRows(): Row[] {
  for (const e of library.list()) if (!e.summary) measureKept(e.id)
  const list = library.list()
  const kept = list.find((e) => e.id === SAMPLE_ID)
  const s = freshSample()
  const sample: Row = {
    id: SAMPLE_ID,
    name: SAMPLE_TITLE,
    sample: true,
    typology: 'industrial',
    savedAt: kept?.savedAt ?? null,
    options: kept?.options ?? s.summary.options.length,
    option: kept?.option ?? s.option,
    thumb: kept?.thumb ?? s.summary.options[0]?.thumb,
    summary: kept?.summary ?? (kept ? undefined : s.summary),
  }
  const rest = list.filter((e) => e.id !== SAMPLE_ID).map((e): Row => ({ ...e, sample: false }))
  return [sample, ...rest]
}
