// The decision log's entries (Decision "Decision log"): written by the store, one per committed change (an edit, a
// drag, an undo, a redo), never by a verb. What an entry says comes from the verb that ran and what it touched, so a
// new verb is logged without a line here:
//   moveMass on Warehouse 1   →  "Move mass: Warehouse 1"
//   solve                     →  by Solve; a plugin's edit says its own `by` (the optimizer's kept specimen)
import type { Id, LogBy, LogEntry, Project } from '../model/schema.ts'
import { diffProject } from './trace/diff.ts'

/** ▶ Solve and the design rules' verbs: what they change, Solve decided. */
const SOLVE_VERBS = new Set(['solve', 'solveIssue', 'arrange', 'addFromBrief'])

/** Who decided: what the caller says (a plugin, an agent), else Solve for its verbs, else the designer. */
export const byOf = (verb: string, by?: LogBy): LogBy => by ?? (SOLVE_VERBS.has(verb) ? 'solve' : 'designer')

/** 'moveMass' → 'Move mass'; no verb: 'Edit'. */
export function verbWords(verb: string): string {
  if (!verb) return 'Edit'
  const words = verb.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase()
  return words[0].toUpperCase() + words.slice(1)
}

const NAMED = ['masses', 'buildings', 'programs', 'options'] as const
type Named = (typeof NAMED)[number]
const PARTS: Record<string, string> = { site: 'site', rules: 'rules', kpis: 'KPIs', dimensions: 'dimensions', referenceLines: 'reference lines', notes: 'notes', standards: 'standards', name: 'project name' }

/** What a change touched, by name: its masses, buildings, programs and options, else the parts (site, rules…). */
export function touched(before: Project, after: Project): string[] {
  const out: string[] = []
  for (const c of diffProject(before, after)) {
    const [part, id] = c.path.split('.')
    let name: string | undefined
    if (NAMED.includes(part as Named) && id) {
      const find = (p: Project) => (p[part as Named] as { id: Id; name: string }[]).find((x) => x.id === id)?.name
      name = find(after) ?? find(before)
    } else if (part === 'plugins' && id) name = id
    else name = PARTS[part]
    if (name && !out.includes(name)) out.push(name)
  }
  return out
}

/** The entry's words: the verb, and up to three of what it touched. */
export function describe(verb: string, before: Project, after: Project): string {
  const names = touched(before, after)
  const shown = names.slice(0, 3).join(', ') + (names.length > 3 ? ` +${names.length - 3}` : '')
  return shown ? `${verbWords(verb)}: ${shown}` : verbWords(verb)
}

/** The project with one more entry at the end. */
export const withEntry = (p: Project, e: LogEntry): Project => ({ ...p, log: [...(p.log ?? []), e] })
