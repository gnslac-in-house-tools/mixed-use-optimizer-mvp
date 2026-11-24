// Home's Blocks (Phase BL.4, Decision "Block library"): the block library in place of the projects' table, as cards —
// each block's plan, its name, its hall's program, whose it is (GFit's, or Mine: this browser's) and its version.
// Search and *Program ▾* narrow it; *+ New block* asks how it starts (Create new), a card's *Open* opens the block editor (blockEditor.ts); *Remove*
// forgets one of this browser's (asked first; a GFit block it was saved over shows again). A block is shared by its
// file (Phase BL.5): *.gfb* downloads it, *Upload…* brings one into this browser's shelf (the terrains' words,
// Decision "Home libraries"); one put in
// `src/state/blocks/` and merged to main is GFit's, on the public link for everyone.
import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import { blockFileName, readBlockFile, writeBlockFile } from '../../io/blocks.ts'
import type { Block } from '../../model/schema.ts'
import { BlockPlan } from '../../modules/warehouse/views/BlocksPanel.tsx'
import { libraryBlock, libraryBlocks, removeBlock, saveBlock, useBlockLibrary, type LibraryBlock } from '../../modules/warehouse/views/blockLibrary.ts'
import { download, readText } from '../layout/browserIo.ts'
import { Icon } from '../controls/Icon.tsx'
import { useToast } from '../layout/toast.ts'
import { openBlockEditor } from './blockEditor.ts'
import { openCreateNew } from './CreateNew.tsx'
import { HOME_ICONS } from './icons.ts'

/** A library block's hall program's name. */
export const programOf = (e: LibraryBlock) => e.block.programs.find((g) => g.id === e.block.type.program)?.name ?? 'No program'
const SHELF = { gfit: 'GFit', browser: 'Mine' } as const

/** A block's file brought into this browser's shelf, unless the library has it at that version or later. */
export async function importBlock(f: File): Promise<void> {
  const { show } = useToast.getState()
  const r = readBlockFile(await readText(f))
  if (!r.ok) return show('error', `Could not upload ${f.name}: ${r.error}.`)
  const b: Block = r.block
  const there = libraryBlock(b.id)
  if (there && there.block.version >= b.version) return show('info', `“${b.type.name}” is in the library already (version ${there.block.version}).`)
  if (!saveBlock(b)) return show('error', 'This browser’s storage is full or blocked: the block was not uploaded.')
  show('info', `Uploaded “${b.type.name}” (version ${b.version}) into this browser’s blocks.`)
}

export function BlockLibraryView({ onBack }: { onBack: () => void }) {
  const count = useBlockLibrary((s) => s.count)
  const all = useMemo(() => libraryBlocks(), [count])
  const [query, setQuery] = useState('')
  const [program, setProgram] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (f) void importBlock(f)
  }
  const programs = [...new Set(all.map(programOf))].sort()
  const q = query.trim().toLowerCase()
  const shown = all.filter((e) => (!program || programOf(e) === program) && (!q || e.block.type.name.toLowerCase().includes(q) || programOf(e).toLowerCase().includes(q)))

  return (
    <section aria-label="Block library" className="flex min-h-0 flex-1 flex-col gap-3 rounded-[0.875rem] bg-panel p-4 shadow-[inset_0_0_0_1px_var(--separator)]">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onBack} title="Back to your projects" className="pressable flex h-[2.125rem] items-center gap-1 rounded-[0.625rem] px-2 text-label text-ink-segment hover:bg-hover hover:text-ink">
          <Icon path={HOME_ICONS.back} className="h-4 w-4" />
          Projects
        </button>
        <h2 className="mr-auto text-headline text-ink">Blocks</h2>
        <label className="flex h-[2.125rem] items-center gap-2 rounded-[0.625rem] bg-fill px-2.5 text-label text-ink-secondary">
          <Icon path={HOME_ICONS.search} className="h-4 w-4 shrink-0" />
          <input aria-label="Search blocks" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} className="w-32 select-text bg-transparent text-ink outline-none placeholder:text-ink-tertiary" />
        </label>
        <select aria-label="Program" value={program} onChange={(e) => setProgram(e.target.value)} className="h-[2.125rem] rounded-[0.625rem] bg-fill px-2.5 text-label text-ink outline-none">
          <option value="">All programs</option>
          {programs.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <button
          type="button"
          title="A block's file (.gfb) a colleague exported: into this browser's blocks"
          onClick={() => fileInput.current?.click()}
          className="pressable flex h-[2.125rem] items-center gap-2 whitespace-nowrap rounded-[0.625rem] bg-fill px-3 text-label text-ink hover:bg-hover"
        >
          <Icon name="import" className="h-4 w-4" />
          Upload…
        </button>
        <input ref={fileInput} type="file" accept=".gfb,.json,application/json" aria-label="Upload block" className="hidden" onChange={onFile} />
        <button
          type="button"
          title="A new block: blank, or starting as one of the library's"
          onClick={() => openCreateNew('block')}
          className="pressable flex h-[2.125rem] items-center gap-2 whitespace-nowrap rounded-[0.625rem] bg-ink px-3 text-label font-semibold text-on-ink hover:opacity-90"
        >
          <Icon name="plus" className="h-4 w-4" />
          New block
        </button>
      </div>
      <p className="text-caption text-ink-tertiary">
        GFit’s blocks come with the app, for the whole team; Mine are saved in this browser (.gfb downloads one as a file to share). In a project, drag them from Blocks; a project
        linked to a block takes its new version when it opens.
      </p>
      {shown.length ? (
        <ul aria-label="Blocks" className="grid min-h-0 grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] content-start gap-3 overflow-y-auto">
          {shown.map((e) => (
            <BlockTile key={e.block.id} entry={e} />
          ))}
        </ul>
      ) : (
        <p className="text-body text-ink-secondary">{all.length ? 'No block matches: try another search or program.' : 'No block yet: + New block begins one.'}</p>
      )}
    </section>
  )
}

function BlockTile({ entry: e }: { entry: LibraryBlock }) {
  const t = e.block.type
  return (
    <li data-library-block={e.block.id} className="flex flex-col gap-2 rounded-[0.75rem] border border-separator p-2.5">
      <BlockPlan type={t} className="h-24" />
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-label font-semibold text-ink">{t.name}</span>
        <span className="truncate text-caption text-ink-tertiary">
          {programOf(e)} · {SHELF[e.shelf]} · v{e.block.version}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label={`Open ${t.name}`}
          title={`Open “${t.name}” in the block editor`}
          onClick={() => openBlockEditor(e.block.id)}
          className="pressable flex h-7 items-center rounded-control bg-fill px-2.5 text-label text-ink hover:bg-hover"
        >
          Open
        </button>
        <button
          type="button"
          aria-label={`Download ${t.name} as .gfb`}
          title="Its file (.gfb): to share it, or to publish it for the team in src/state/blocks/"
          onClick={() => download(new Blob([writeBlockFile(e.block)], { type: 'application/json' }), blockFileName(e.block))}
          className="pressable flex h-7 items-center rounded-control px-2.5 text-label text-ink-secondary hover:bg-hover hover:text-ink"
        >
          .gfb
        </button>
        {e.shelf === 'browser' && (
          <button
            type="button"
            aria-label={`Remove ${t.name}`}
            title="Forget this block in this browser (projects linked to it keep it as it is)"
            onClick={() => useToast.getState().confirm(`Remove “${t.name}” from this browser’s blocks? Projects that use it keep it as it is.`, () => removeBlock(e.block.id))}
            className="pressable flex h-7 items-center rounded-control px-2.5 text-label text-ink-secondary hover:bg-hover hover:text-ink"
          >
            Remove
          </button>
        )}
      </div>
    </li>
  )
}
