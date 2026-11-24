// The decision log as CSV (Decision "Decision log"), one row per entry, oldest first, for a spreadsheet or the
// thesis's analysis: the project's id on each row, so logs of several projects can be put together.
import type { Project } from '../model/schema.ts'

export const LOG_COLUMNS = ['project', 'time', 'author', 'by', 'verb', 'what', 'option', 'issues_before', 'issues_after']

const cell = (v: string | number) => {
  const s = String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function logCsv(p: Project): string {
  const option = (id: string) => p.options.find((o) => o.id === id)?.name ?? id
  const rows = (p.log ?? []).map((e) => [p.id, new Date(e.at).toISOString(), e.author, e.by, e.verb, e.what, option(e.option), e.issues[0], e.issues[1]])
  return [LOG_COLUMNS, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
}
