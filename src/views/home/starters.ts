// Starter projects (Decision "Starter projects"): .gft files shipped with the app (`state/starters/`) that every
// browser keeps once, the first time it opens GFit, as projects of its own (Home lists them, measured as any kept
// project without a summary). Each is seeded once: removed or changed, it stays as the designer left it.
import { readGft } from '../../io/gft.ts'
import { library } from '../../io/library.ts'
import { projectThumb } from './thumb.ts'

/** The starters this browser was given, by id. */
export const SEEDED_KEY = 'gfit.starters'

/** Each starter's file, loaded only when a browser has not been given it yet. */
export const STARTERS: Record<string, () => Promise<{ default: string }>> = {
  // a blank industrial project on a site in Quezaltepeque, El Salvador: its boundary and contours from the survey's
  // DWG (layers C-PROP-BNDY, C-TOPO-MAJR, C-TOPO-MINR; El Salvador Lambert, georeferenced from it), contours
  // simplified to 5 cm
  'industrial-quezaltepeque-demo': () => import('../../state/starters/industrial-quezaltepeque-demo.gft?raw'),
}

function seeded(): string[] | null {
  try {
    return JSON.parse(localStorage.getItem(SEEDED_KEY) ?? '[]') as string[]
  } catch {
    return null
  }
}

/** Keeps in this browser the starters it was not given yet. */
export async function seedStarters(): Promise<void> {
  const given = seeded()
  if (!given) return
  const due = Object.entries(STARTERS).filter(([id]) => !given.includes(id))
  if (!due.length) return
  for (const [id, load] of due) {
    const r = readGft((await load()).default)
    if (!r.ok || r.project.id !== id) continue
    const option = r.project.options[0].id
    if (library.read(id) || library.write(r.project, option, Date.now(), projectThumb(r.project, option))) given.push(id)
  }
  try {
    localStorage.setItem(SEEDED_KEY, JSON.stringify(given))
  } catch {
    // blocked: offered again next time
  }
}
