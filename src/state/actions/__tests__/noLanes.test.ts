// A kind that is a path with no lanes (`path.lanes: false`, as a reference line would be) refuses every lane op, the same project and why
// (Phase PE.2, task 2). The registry has no such kind yet, so the street's own is switched for the test and put back after it.
import { afterEach, describe, expect, it } from 'vitest'
import type { Project } from '../../../model/schema.ts'
import type { PathOp } from '../../../engine/path/types.ts'
import { CORE_KINDS } from '../../../kinds/core.ts'
import { demoProject } from '../../demo.ts'
import { editPath } from '../path.ts'

const street = CORE_KINDS.find((k) => k.id === 'street')!
const original = street.path
afterEach(() => {
  street.path = original
})

const p: Project = (() => {
  const d = demoProject({ streets: false })
  const streets = { nodes: [{ id: 'n1', x: 0, y: 0 }, { id: 'n2', x: 50, y: 0 }], segments: [{ id: 's1', a: 'n1', b: 'n2', type: 'trucks', left: 0, right: 7 }] }
  return { ...d, options: d.options.map((o) => (o.id === 'o1' ? { ...o, streets } : o)) }
})()
const ref = { kind: 'street', id: 'street:s1' }

describe('a path with no lanes', () => {
  it('refuses each lane op: "A Street has no lanes", the same project', () => {
    street.path = { width: 'free', lanes: false }
    const ops: PathOp[] = [
      { op: 'lanes', k: 0, by: 1 },
      { op: 'line', k: 0, line: 0, by: 1 },
      { op: 'lane', k: 0, line: 0, side: 'right', to: 3 },
      { op: 'equal-lanes', k: 0 },
      { op: 'lane-widths', k: 0, widths: [3, 4] },
    ]
    for (const op of ops) {
      const r = editPath(p, ref, op, 'o1')
      expect(r.project, op.op).toBe(p)
      expect(r.reason, op.op).toBe('A Street has no lanes')
    }
    // the ops that are not lanes still run
    expect(editPath(p, ref, { op: 'side', k: 0, side: 'right', by: 1 }, 'o1').reason).toBeUndefined()
  })

  it('a kind with lanes takes them', () => {
    expect(editPath(p, ref, { op: 'lanes', k: 0, by: 1 }, 'o1').reason).toBeUndefined()
  })
})
