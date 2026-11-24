// The decision log as CSV (Decision "Decision log"): a header, one row per entry, the project's id on each.
import { describe, expect, it } from 'vitest'
import type { LogEntry } from '../../model/schema.ts'
import { demoProject } from '../../state/demo.ts'
import { LOG_COLUMNS, logCsv } from '../logCsv.ts'

const entry = (patch: Partial<LogEntry>): LogEntry => ({
  at: Date.UTC(2026, 9, 19, 11, 42),
  author: 'Designer',
  by: 'designer',
  verb: 'moveMass',
  what: 'Move mass: Warehouse 1',
  option: 'o1',
  issues: [3, 2],
  ...patch,
})

describe('logCsv', () => {
  it('a header and one row per entry, oldest first, the option by its name', () => {
    const p = { ...demoProject(), log: [entry({}), entry({ by: 'solve', verb: 'solve', what: 'Solve' })] }
    const lines = logCsv(p).split('\r\n')
    expect(lines[0]).toBe(LOG_COLUMNS.join(','))
    expect(lines[1]).toBe(`${p.id},2026-10-19T11:42:00.000Z,Designer,designer,moveMass,Move mass: Warehouse 1,Option 1,3,2`)
    expect(lines[2]).toContain(',solve,solve,Solve,')
    expect(lines).toHaveLength(4) // and the last line's end
  })

  it('quotes what has a comma, a quote or a line break', () => {
    const p = { ...demoProject(), log: [entry({ what: 'Solve: Office 1, Guard "A"', author: 'Ana\nB' })] }
    expect(logCsv(p).split('\r\n')[1]).toContain(',"Ana\nB",designer,moveMass,"Solve: Office 1, Guard ""A""",')
  })

  it('no log: the header only', () => {
    expect(logCsv(demoProject())).toBe(LOG_COLUMNS.join(',') + '\r\n')
  })
})
