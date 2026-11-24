// No source names the frontage (Phase PE.2 task 8): a frontage became an existing street (plan Decision 12), so no object, field, verb,
// key or engine function of it is left. What the test scans: every file of `src/` that is not a test (`.ts`, `.tsx`, `.css`, `.md`), as
// text, comments left out. Rule: none names `frontage`, in any case, but the files named below, each with its reason: the step that reads
// an old file, and the layers' list of stored keys an older session may hold.
import { describe, expect, it } from 'vitest'

const sources = import.meta.glob<string>(['/src/**/*.{ts,tsx,css,md}', '!**/__tests__/**', '!**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

/** The files that may name it, each with its reason. */
const EXCEPTIONS: Record<string, string> = {
  '/src/model/migrate.ts': 'the step that reads an old file: each saved frontage becomes an existing street',
  '/src/views/layers/gone.ts': 'a `frontage:` key an older session stored is let go (nothing holds it)',
}

const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

/** The files that name it. */
const namers = (files: Record<string, string>) =>
  Object.entries(files)
    .filter(([path, src]) => /frontage/i.test(path.endsWith('.md') ? src : code(src)))
    .map(([path]) => path)
    .sort()

describe('no frontage in the sources', () => {
  it('finds the sources', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(300)
    expect(Object.keys(sources).some((p) => p.startsWith('/src/engine/circulation/'))).toBe(true)
    expect(Object.keys(sources).some((p) => p.endsWith('.css'))).toBe(true)
  })

  it('none names it but the files that read an old file', () => {
    expect(namers(sources)).toEqual(Object.keys(EXCEPTIONS).sort())
  })

  it('a source that names it is caught (a spoiled copy, in memory: the repository is never touched)', () => {
    const index = '/src/engine/circulation/index.ts'
    const spoiled = { ...sources, [index]: `${sources[index]}\nexport const frontage = []\n` }
    expect(namers(spoiled)).toContain(index)
    const types = '/src/engine/types.ts'
    expect(namers({ ...sources, [types]: `${sources[types]}\nexport interface DerivedFrontage { id: string }\n` })).toContain(types)
    const schema = '/src/model/schema.ts'
    expect(namers({ ...sources, [schema]: `${sources[schema]}\nexport const FrontageSchema = z.object({})\n` })).toContain(schema)
  })

  it('a comment that names it is not a use', () => {
    expect(namers({ '/src/x.ts': '// the frontage was an existing street\n/* a Frontage */\nconst a = 1\n' })).toEqual([])
  })

  it('the exceptions are still needed (a stale one is dropped)', () => {
    for (const path of Object.keys(EXCEPTIONS)) expect(namers({ [path]: sources[path] }), path).toEqual([path])
  })
})
