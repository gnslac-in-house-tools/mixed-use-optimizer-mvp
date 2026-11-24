// The app's version and the versions before it (Decision "Release versions"), read from git as Vite starts
// (vite.config.ts's `define`: `__GFIT_BUILD__`). A version is a release tag (`v0.14.0`), made by semantic-release on
// each merge to main (.releaserc.json). The build being released has no tag yet: semantic-release gives it its
// version (`GFIT_VERSION`, in its prepareCmd). A build past its last tag is that version with SemVer's build metadata:
// `0.14.0+2.abc1234`, two commits after it, at abc1234. What each version brought: the titles of the pull requests
// merged into main since the version before (GitHub writes each in its merge's message); a version with none (the
// first), its tag's own message.
import { execFileSync } from 'node:child_process'

export interface Version {
  version: string
  /** The day of its commit (YYYY-MM-DD). */
  date: string
  /** What it brought: its pull requests' titles, without their Conventional Commits type. */
  changes: string[]
}

export interface Build {
  /** This build's version; '' outside a git checkout or before the first tag. */
  version: string
  /** The commit built and its day. */
  commit: string
  date: string
  /** Every version, newest first: this one too while it is being released. */
  versions: Version[]
}

/** `git describe --tags --long` ("v0.13.0-2-gabc1234") as a version: "0.13.0" on the tag, "0.13.0+2.abc1234" past it. */
export function versionOf(describe: string): string | null {
  const m = /^v(\d+\.\d+\.\d+)-(\d+)-g([0-9a-f]+)$/.exec(describe.trim())
  if (!m) return null
  return m[2] === '0' ? m[1] : `${m[1]}+${m[2]}.${m[3]}`
}

/** A pull request's title as a change: its Conventional Commits type gone, its first letter up ("fix(home): a …" → "A …"). */
export function changeOf(title: string): string {
  const t = title.replace(/^[a-z]+(\([^)]*\))?!?:\s*/, '').trim()
  return t.charAt(0).toUpperCase() + t.slice(1)
}

const RS = '\x1e'
const FS = '\x1f'
/** What versionsOf reads, from `git log --first-parent --decorate-refs=refs/tags/`: each commit's tags, day, subject, body. */
export const LOG_FORMAT = '%x1e%D%x1f%cs%x1f%s%x1f%b'

/**
 * The versions in main's own line (a first-parent log in LOG_FORMAT, newest first): each version tag starts one that
 * holds its commit and the older ones down to the next tag. `annotations`: an annotated tag's message, for a version
 * no pull request made. `head`: the version being released, for the commits above the newest tag (else left out).
 */
export function versionsOf(log: string, annotations: Record<string, string> = {}, head: string | null = null): Version[] {
  const out: { tag: string | null; version: Version }[] = []
  for (const record of log.split(RS).slice(1)) {
    const [refs = '', date = '', subject = '', body = ''] = record.split(FS)
    const tag = /(?:^|, )tag: (v(\d+\.\d+\.\d+))(?=,|$)/.exec(refs.trim())
    if (tag) out.push({ tag: tag[1], version: { version: tag[2], date, changes: [] } })
    else if (!out.length && head) out.push({ tag: null, version: { version: head, date, changes: [] } })
    const current = out.at(-1)
    if (!current || !/^Merge pull request #\d+/.test(subject)) continue
    const title = body.trim().split('\n')[0].trim()
    if (title) current.version.changes.push(changeOf(title))
  }
  for (const { tag, version } of out) if (!version.changes.length && tag && annotations[tag]) version.changes.push(annotations[tag])
  return out.map((x) => x.version)
}

/** This build: its version (the release's, or from its last tag), its commit and the versions. Read from git. */
export function buildOf(env: Record<string, string | undefined> = process.env): Build {
  const git = (...args: string[]) => execFileSync('git', args, { stdio: ['ignore', 'pipe', 'ignore'] }).toString()
  const released = env.GFIT_VERSION?.trim() || null
  let commit = ''
  let date = ''
  try {
    commit = git('rev-parse', '--short', 'HEAD').trim()
    date = git('log', '-1', '--format=%cs').trim()
  } catch {
    return { version: released ?? '', commit, date, versions: [] }
  }
  let described: string | null = null
  try {
    described = versionOf(git('describe', '--tags', '--long', '--match', 'v[0-9]*'))
  } catch {
    // no tag yet (or a shallow clone without them)
  }
  let versions: Version[] = []
  try {
    const annotations: Record<string, string> = {}
    for (const line of git('for-each-ref', '--format=%(refname:short)%09%(objecttype)%09%(contents:subject)', 'refs/tags/v*').split('\n')) {
      const [tag, type, subject] = line.split('\t')
      if (type === 'tag' && subject) annotations[tag] = subject
    }
    versions = versionsOf(git('log', '--first-parent', '--decorate-refs=refs/tags/', `--format=${LOG_FORMAT}`), annotations, released)
  } catch {
    // no history to read: no versions listed
  }
  return { version: released ?? described ?? '', commit, date, versions }
}
