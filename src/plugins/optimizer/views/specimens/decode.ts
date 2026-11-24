// A specimen's project: its genome written into the project as it was at ▶ Run, on this thread (a few ms; the engine
// loads with the first one). The preview and Keep share it, so a specimen shown is not written again.
import type { Project } from '../../../../model/schema.ts'
import type { Genome } from '../../engine/genes.ts'
import type { Run } from '../../run/store.ts'

/** The run's decoder, and the last specimen written: shown again (another title), it is not written again. */
let decoder: { run: number; decode(genome: Genome): Project | null } | null = null
let last: { run: number; id: number; project: Project } | null = null

/** A genome's project; `id` null (the one being tried, not yet a specimen): not kept. */
export async function projectOf(run: Run, id: number | null, genome: Genome): Promise<Project | null> {
  if (id !== null && last?.run === run.id && last.id === id) return last.project
  if (decoder?.run !== run.id) {
    const { decoderOf } = await import('../../engine/problem.ts')
    decoder = { run: run.id, decode: decoderOf(run.base, run.optionId, run.template) }
  }
  const project = decoder.decode(genome)
  if (project && id !== null) last = { run: run.id, id, project }
  return project
}
