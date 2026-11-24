// What a store call changed, cheaply: actions never mutate, so an untouched part is the SAME object (===) and is
// skipped without looking inside. Only the changed branches are walked, three levels deep at most:
//   masses.m1.footprint · site.rules.setback · masses.m3 (added)
import type { Issue, IssueCode } from '../../engine/types.ts'
import type { Id, Project } from '../../model/schema.ts'

export interface Change {
  kind: 'added' | 'removed' | 'changed'
  /** Dotted path; items of an array with ids are named by id (masses.m1). */
  path: string
}

const DEPTH = 3

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null
const withIds = (v: unknown): v is { id: Id }[] => Array.isArray(v) && v.every((x) => isObj(x) && typeof x.id === 'string')

function walk(a: unknown, b: unknown, path: string, depth: number, out: Change[]) {
  if (a === b) return
  if (depth === 0 || !isObj(a) || !isObj(b) || Array.isArray(a) !== Array.isArray(b)) {
    out.push({ kind: 'changed', path })
    return
  }
  if (withIds(a) && withIds(b)) {
    const before = new Map(a.map((x) => [x.id, x]))
    const after = new Map(b.map((x) => [x.id, x]))
    for (const [id, x] of before) {
      if (!after.has(id)) out.push({ kind: 'removed', path: `${path}.${id}` })
      else walk(x, after.get(id), `${path}.${id}`, depth - 1, out)
    }
    for (const id of after.keys()) if (!before.has(id)) out.push({ kind: 'added', path: `${path}.${id}` })
    return
  }
  if (Array.isArray(a)) {
    out.push({ kind: 'changed', path }) // a plain list (vertices…): one change, not one per item
    return
  }
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[k], b[k], path ? `${path}.${k}` : k, depth - 1, out)
}

export function diffProject(a: Project, b: Project): Change[] {
  const out: Change[] = []
  walk(a, b, '', DEPTH, out)
  return out
}

/** An issue without its message: enough to name it. */
export interface IssueRef {
  code: IssueCode
  severity: Issue['severity']
  massIds: Id[]
}

const ref = ({ code, severity, massIds }: Issue): IssueRef => ({ code, severity, massIds })
const key = (i: Issue) => `${i.code}:${i.massIds.join(',')}`

/** Issues that appeared and issues that were resolved; the same code on the same masses is the same issue. */
export function diffIssues(a: Issue[], b: Issue[]): { added: IssueRef[]; resolved: IssueRef[]; total: number } {
  const before = new Set(a.map(key))
  const after = new Set(b.map(key))
  return {
    added: b.filter((i) => !before.has(key(i))).map(ref),
    resolved: a.filter((i) => !after.has(key(i))).map(ref),
    total: b.length,
  }
}
