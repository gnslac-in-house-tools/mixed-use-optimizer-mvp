// The app's version and its history (Decision "Release versions", server/versions.ts): a build on its tag is that
// version, one past it that version with SemVer's build metadata; each version brought the pull requests merged since
// the one before, their Conventional Commits type gone; the first, its tag's message; the version being released
// takes the commits above the newest tag.
import { describe, expect, it } from 'vitest'
import { changeOf, versionOf, versionsOf } from '../../../server/versions.ts'

/** A first-parent log as `git log --format=LOG_FORMAT` writes it: each commit's tags, day, subject and body. */
const log = (commits: { tag?: string; date: string; subject: string; body?: string }[]) =>
  commits.map((c) => `\x1e${c.tag ? `tag: ${c.tag}` : ''}\x1f${c.date}\x1f${c.subject}\x1f${c.body ?? ''}\n`).join('')

const merge = (n: number, title: string, date: string, tag?: string) => ({ tag, date, subject: `Merge pull request #${n} from org/branch`, body: `${title}\n` })

const history = [
  { date: '2026-11-02', subject: 'docs: a note' },
  merge(16, 'feat(home): the version at the foot of Home', '2026-11-01', 'v0.14.0'),
  merge(15, 'fix(home): fixes from the code review of Phase HL', '2026-11-01'),
  { date: '2026-10-31', subject: 'fix(terrain): a commit inside #15' },
  merge(14, 'Phase HL: Home libraries (Create new, Terrain, About)', '2026-10-29', 'v0.13.0'),
  merge(1, 'Docs: work on branches', '2026-10-27'),
  { date: '2026-10-27', subject: 'Docs: main is the only branch', tag: 'v0.1.0' },
  { date: '2026-10-13', subject: 'Initial commit' },
]

describe('release versions', () => {
  it('a build on its tag is that version; past it, the version with build metadata; no tag, none', () => {
    expect(versionOf('v0.13.0-0-g1d737f6')).toBe('0.13.0')
    expect(versionOf('v0.13.0-2-gabc1234\n')).toBe('0.13.0+2.abc1234')
    expect(versionOf('1d737f6')).toBeNull()
  })

  it('a pull request’s title as a change: its type gone, its first letter up', () => {
    expect(changeOf('fix(home): fixes from the code review of Phase HL')).toBe('Fixes from the code review of Phase HL')
    expect(changeOf('feat!: GFit 1.0')).toBe('GFit 1.0')
    expect(changeOf('Phase HL: Home libraries')).toBe('Phase HL: Home libraries')
  })

  it('each version the pull requests merged since the one before, newest first; the first its tag’s message; above the newest tag, left out', () => {
    expect(versionsOf(log(history), { 'v0.1.0': 'Initial development' })).toEqual([
      { version: '0.14.0', date: '2026-11-01', changes: ['The version at the foot of Home', 'Fixes from the code review of Phase HL'] },
      { version: '0.13.0', date: '2026-10-29', changes: ['Phase HL: Home libraries (Create new, Terrain, About)', 'Docs: work on branches'] },
      { version: '0.1.0', date: '2026-10-27', changes: ['Initial development'] },
    ])
  })

  it('the version being released takes the commits above the newest tag', () => {
    const [released, previous] = versionsOf(log(history.slice(2)), {}, '0.14.0')
    expect(released).toEqual({ version: '0.14.0', date: '2026-11-01', changes: ['Fixes from the code review of Phase HL'] })
    expect(previous.version).toBe('0.13.0')
  })
})
