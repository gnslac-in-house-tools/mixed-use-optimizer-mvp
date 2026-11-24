// Create new (Decision "Home libraries"; the user: "a pop-up, project or block, with symbols, its project type or its
// block type by program, and a Start blank apart"): on top of Home's sidebar, and behind the table's *New project*,
// the Blocks' *New block* and a terrain's *New project here*. Two big cards ask what: a **Project** (then its type:
// each typology but Blank, the first picked; then its terrain: none, or one of the terrain library's; *Create
// project*) or a **Block** (its type: the library's blocks under their hall's program, a new block that starts as one
// of them, never linked to it). *Start blank* stands apart on each: a Blank project with no site, or a block with
// nothing chosen yet.
import { useEffect, useId, useMemo, useRef, type ReactNode } from 'react'
import { create } from 'zustand'
import type { Id, LibraryTerrain } from '../../model/schema.ts'
import { BlockPlan } from '../../modules/warehouse/views/BlocksPanel.tsx'
import { libraryBlocks, useBlockLibrary, type LibraryBlock } from '../../modules/warehouse/views/blockLibrary.ts'
import { TYPOLOGIES } from '../../typologies/index.ts'
import { trapTab } from '../controls/focus.ts'
import { Icon } from '../controls/Icon.tsx'
import { startProject } from '../layout/files.ts'
import { openBlockEditor } from './blockEditor.ts'
import { programOf } from './BlockLibraryView.tsx'
import { HOME_ICONS } from './icons.ts'
import { libraryTerrain, libraryTerrains, loadGfitTerrains, useTerrainLibrary } from './terrainLibrary.ts'
import { terrainThumb } from './thumb.ts'
import { t as tr } from '../../i18n/idioma.ts' // mixed-use-mvp

export type CreateKind = 'project' | 'block'

/** The project types offered: the typologies but Blank (that one is *Start blank*). */
export const PROJECT_TYPES = TYPOLOGIES.filter((t) => t.id !== 'blank')

interface CreateNewState {
  open: boolean
  kind: CreateKind | null
  /** A project's type (a typology's id), and its terrain (a library terrain's id; null: none). */
  type: string
  terrain: Id | null
}

export const useCreateNew = create<CreateNewState>()(() => ({ open: false, kind: null, type: PROJECT_TYPES[0].id, terrain: null }))

/** Opens Create new, asking what (`kind` absent) or on a project (on `terrain`, when given) or a block. */
export function openCreateNew(kind: CreateKind | null = null, terrain: Id | null = null): void {
  useCreateNew.setState({ open: true, kind, type: PROJECT_TYPES[0].id, terrain })
}
const close = () => useCreateNew.setState({ open: false })

/** A typology's symbol (the industrial one: a factory's roof). */
const TYPE_ICONS: Record<string, string> = { industrial: HOME_ICONS.industrial }

export function CreateNewDialog() {
  const open = useCreateNew((s) => s.open)
  return open ? <Dialog /> : null
}

const PICKED = 'bg-fill shadow-[inset_0_0_0_2px_var(--ink)]'

function KindCard({ kind, icon, title, text }: { kind: CreateKind; icon: string; title: string; text: string }) {
  const on = useCreateNew((s) => s.kind === kind)
  return (
    <button
      type="button"
      aria-pressed={on}
      data-tour={`create-${kind}`}
      onClick={() => useCreateNew.setState({ kind })}
      className={`pressable flex items-center gap-3 rounded-[0.875rem] p-3.5 text-left shadow-[inset_0_0_0_1px_var(--separator)] hover:bg-hover ${on ? PICKED : ''}`}
    >
      <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-[0.75rem] bg-ink text-on-ink">
        <Icon path={icon} className="h-6 w-6" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-body font-semibold text-ink">{title}</span>
        <span className="text-caption text-ink-secondary">{text}</span>
      </span>
    </button>
  )
}

/** A choice to start from: its symbol (or plan) above its name; `pressed`: one that stays picked. */
function TypeCard({ label, title, text, pressed, onClick, children, tour }: { label: string; title: string; text?: string; pressed?: boolean; onClick: () => void; children: ReactNode; tour?: string }) {
  return (
    <li>
      <button
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        data-tour={tour}
        onClick={onClick}
        className={`pressable flex w-full flex-col gap-2 rounded-[0.75rem] p-2.5 text-left shadow-[inset_0_0_0_1px_var(--separator)] hover:bg-hover ${pressed ? PICKED : ''}`}
      >
        {children}
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-label font-semibold text-ink">{title}</span>
          {text && <span className="text-caption text-ink-tertiary">{text}</span>}
        </span>
      </button>
    </li>
  )
}

function ProjectTypes() {
  const type = useCreateNew((s) => s.type)
  return (
    <ul aria-label="Project types" className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-2.5">
      {PROJECT_TYPES.map((t) => (
        <TypeCard key={t.id} tour={`create-${t.id}`} label={t.name} title={t.name} text={t.description} pressed={type === t.id} onClick={() => useCreateNew.setState({ type: t.id })}>
          <span aria-hidden className="grid h-16 place-items-center rounded-[0.5rem] bg-grid-soft text-grid-line">
            <Icon path={TYPE_ICONS[t.id] ?? HOME_ICONS.project} className="h-8 w-8" />
          </span>
        </TypeCard>
      ))}
    </ul>
  )
}

/** A project's terrain: none, or one of the library's (GFit's read as they first show: a block needs none). */
function ProjectTerrains() {
  const terrain = useCreateNew((s) => s.terrain)
  const count = useTerrainLibrary((s) => s.count)
  const gfit = useTerrainLibrary((s) => s.gfit)
  const all = useMemo(() => libraryTerrains(), [count, gfit])
  useEffect(() => void loadGfitTerrains(), [])
  return (
    <ul aria-label="Terrains" className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2.5">
      <TypeCard tour="create-no-terrain" label="No terrain" title="None" text="Import or draw it in Site" pressed={terrain === null} onClick={() => useCreateNew.setState({ terrain: null })}>
        <span aria-hidden className="grid h-16 place-items-center rounded-[0.5rem] bg-fill text-ink-tertiary">
          <Icon path={HOME_ICONS.terrain} className="h-6 w-6" />
        </span>
      </TypeCard>
      {all.map((e) => (
        <TerrainChoice key={e.terrain.id} terrain={e.terrain} pressed={terrain === e.terrain.id} />
      ))}
    </ul>
  )
}

/** A terrain's card: its plan drawn once per terrain, not on each pick (a survey has thousands of contours). */
function TerrainChoice({ terrain: t, pressed }: { terrain: LibraryTerrain; pressed: boolean }) {
  const svg = useMemo(() => terrainThumb(t.site), [t])
  return (
    <TypeCard label={t.name} title={t.name} pressed={pressed} onClick={() => useCreateNew.setState({ terrain: t.id })}>
      <span aria-hidden className="block h-16 rounded-[0.5rem] bg-canvas p-1 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={svg ? { __html: svg } : undefined} />
    </TypeCard>
  )
}

function BlockTypes() {
  const count = useBlockLibrary((s) => s.count)
  const byProgram = useMemo(() => {
    const groups = new Map<string, LibraryBlock[]>()
    for (const e of libraryBlocks()) groups.set(programOf(e), [...(groups.get(programOf(e)) ?? []), e])
    return [...groups].sort(([a], [b]) => a.localeCompare(b))
  }, [count])
  if (!byProgram.length) return <p className="text-body text-ink-secondary">{tr("No block in the library yet: Start blank begins one.")}</p>
  return (
    <div className="flex flex-col gap-3">
      {byProgram.map(([program, blocks]) => (
        <section key={program} aria-label={program} className="flex flex-col gap-1.5">
          <h3 className="text-caption font-semibold uppercase tracking-wide text-ink-secondary">{program}</h3>
          <ul aria-label={`${program} blocks`} className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-2.5">
            {blocks.map((e) => (
              <TypeCard
                key={e.block.id}
                label={`New block like ${e.block.type.name}`}
                title={e.block.type.name}
                text="A new block that starts as this one"
                onClick={() => {
                  close()
                  openBlockEditor(e.block.id, { copy: true })
                }}
              >
                <BlockPlan type={e.block.type} className="h-20" />
              </TypeCard>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function Dialog() {
  const kind = useCreateNew((s) => s.kind)
  const titleId = useId()
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    root.current?.focus()
    return () => before?.focus?.()
  }, [])

  const createProject = () => {
    const { type, terrain } = useCreateNew.getState()
    close()
    startProject(type, (terrain && libraryTerrain(terrain)?.terrain) || undefined)
  }
  const blank = () => {
    close()
    if (kind === 'project') startProject('blank')
    else openBlockEditor(null)
  }

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/30 p-gutter"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div
        ref={root}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="panel flex h-[38rem] max-h-full w-full max-w-2xl select-text flex-col gap-4 overflow-hidden p-panel-pad text-ink shadow-sheet outline-none"
        onKeyDown={(e) => {
          if (e.key === 'Tab') return trapTab(e, root.current)
          if (e.key === 'Escape') close()
          e.stopPropagation()
        }}
      >
        <h2 id={titleId} className="text-headline">
          {tr("Create new")}
        </h2>
        <div className="grid grid-cols-2 gap-2.5 phone:grid-cols-1">
          <KindCard kind="project" icon={HOME_ICONS.project} title="Project" text="A site and the buildings on it, with its options" />
          <KindCard kind="block" icon={HOME_ICONS.library} title="Block" text="A building designed once, placed in projects as copies" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {kind === null ? (
            <p className="text-body text-ink-secondary">{tr("What would you like to create?")}</p>
          ) : kind === 'project' ? (
            <div className="flex flex-col gap-2">
              <span className="text-label text-ink-secondary">{tr("Its type")}</span>
              <ProjectTypes />
              <span className="mt-2 text-label text-ink-secondary">{tr("Its terrain")}</span>
              <ProjectTerrains />
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <span className="text-label text-ink-secondary">{tr("Start from a block type")}</span>
              <BlockTypes />
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-separator pt-3">
          {kind ? (
            <button
              type="button"
              onClick={blank}
              title={kind === 'project' ? 'A project with no preset programs or rules, and no site yet' : 'A block with nothing chosen yet, designed step by step'}
              className="pressable flex h-[2.125rem] items-center gap-2 rounded-[0.625rem] bg-fill px-3 text-label font-semibold text-ink hover:bg-hover"
            >
              <Icon path={HOME_ICONS.create} className="h-4 w-4" />
              {tr("Start blank")}
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={close} className="pressable flex h-[2.125rem] items-center rounded-[0.625rem] px-3 text-label text-ink-secondary hover:bg-hover hover:text-ink">
              {tr("Cancel")}
            </button>
            {kind === 'project' && (
              <button type="button" data-tour="create-start" onClick={createProject} className="pressable flex h-[2.125rem] items-center rounded-[0.625rem] bg-ink px-3 text-label font-semibold text-on-ink hover:opacity-90">
                {tr("Create project")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
