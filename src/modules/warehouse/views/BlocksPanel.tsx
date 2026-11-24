// The Blocks panel (Phase B.1, Decision "Smart blocks"; the user: "a panel of their own for these blocks, to see them as
// in a menu and drag them into the viewport; an icon of their own, and there too to create or edit them"): the
// warehouse types as smart blocks, opened by the *Blocks* tab of the left panel. A card per block: its plan (the
// type's parts, the hall dark, its bumps lighter), its name and how many copies stand on the site. Dragged onto the plan
// or the 3D, a copy stands where it drops. ✎ opens the block in the Program window (its rule set: grid, columns, envelope,
// morphology), *+ New block* begins one there. A copy is a variant: it keeps its block's rules (Decision "Warehouse type").
// The library's blocks beside the project's (Phase BL.2, Decision "Block library"): a filter, *This project · Library ·
// All* (All by default: the project's and the library's it has not brought yet), and *Program ▾* (by the program of a
// block's hall). A library block dragged or placed (its menu's *Place*) comes into the project, linked, and a copy of it
// stands there (one undo step); its card says whose it is (GFit's, or this browser's: Mine).
// A block is picked (Phase AS.4 task 6, Decision "One menu"; the user: "a block is picked with a click, and has the menu too"):
// a click picks it (Shift a run, Ctrl one more: `blockPick.ts`) and places nothing, where it used to place a copy in the middle
// of the site (that is the menu's *Place* now, or a drag); a double-click and Enter edit it in the Program window (a library
// block, which has no type yet, is placed); while the list has the focus the commands' own keys for Delete (Delete and Backspace), Rename (F2) and Duplicate
// (Ctrl+D) are the list's: they act on what is picked, or say why they cannot, and never reach the site's commands (not while a name is typed); Escape lets go; the right-click opens the one menu, from the kind `block-type` (`blockMenu.ts`).
// The list is a `listbox` with `aria-multiselectable`, each card an `option` with `aria-selected`; a block's name is edited in
// its card (F2, the menu's Rename). The block tools (Dock · Door · Pattern · Court) are the Tools strip's, not chips here.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { create } from 'zustand'
import type { WarehouseType } from '../../../model/schema.ts'
import { bounds } from '../../../engine/geom/polygon.ts'
import { useApp } from '../../../state/store.ts'
import { Button } from '../../../views/controls/fields.tsx'
import { Icon } from '../../../views/controls/Icon.tsx'
import { chordOf } from '../../../views/commands/keys.ts'
import { keysOf } from '../../../views/commands/shortcuts.ts'
import { Note } from '../../../views/layout/Note.tsx'
import { useToast } from '../../../views/layout/toast.ts'
import { useModule } from '../../../views/modules.ts'
import { Segmented } from '../../../views/controls/Segmented.tsx'
import { pickForMenu, rangePick } from '../../../views/controls/rangeSelect.ts'
import { openMenu } from '../../../views/editing/menu/open.tsx'
import { blockDrag, libraryBlocks, useBlockLibrary, type Shelf } from './blockLibrary.ts'
import { projectIds, useBlockPick } from './blockPick.ts'
import { generate } from '../engine/generate.ts'
import { duplicateTypes, newType, openProgram, openType, placeCopy, removeTypes, renameType } from './commands.ts'
import { TYPE_MIME } from './TypePalette.tsx'
import { t as tr } from '../../../i18n/idioma.ts' // mixed-use-mvp

export const BLOCK_SHOWS = [
  { key: 'project', label: 'This project', title: 'The blocks of this project' },
  { key: 'library', label: 'Library', title: 'The block library: GFit’s blocks and those saved in this browser' },
  { key: 'all', label: 'All', title: 'This project’s blocks and the library’s it has not brought yet' },
] as const
export type BlockShow = (typeof BLOCK_SHOWS)[number]['key']

/** The panel's filter: which blocks, of which program (null: every program); the viewer's, for the session. */
export const useBlocksFilter = create<{ show: BlockShow; program: string | null; set(patch: Partial<{ show: BlockShow; program: string | null }>): void }>()((set) => ({
  show: 'all',
  program: null,
  set: (patch) => set(patch),
}))

const SHELF_NAMES: Record<Shelf, string> = { gfit: 'GFit', browser: 'Mine' }

/** A card of the panel: a type of the project's, or a block of the library's. */
type Item =
  | { kind: 'project'; key: string; type: WarehouseType; program: string; copies: number; shelf: Shelf | null }
  | { kind: 'library'; key: string; type: WarehouseType; program: string; id: string; shelf: Shelf; brought: boolean }

/** What a card does when it is picked and Enter or a double-click asks: a project's block opens in the Program window, a library's is placed. */
function openCard(key: string) {
  if (projectIds([key]).length > 0) openType(key)
  else placeCopy(key)
}

export function BlocksPanel() {
  const types = useApp((s) => s.project.warehouseTypes)
  const programs = useApp((s) => s.project.programs)
  const counts = useApp((s) => s.project.buildings.map((b) => b.warehouse?.type).join('|'))
  const copies = (id: string) => counts.split('|').filter((x) => x === id).length
  const { show, program, set } = useBlocksFilter()
  const changed = useBlockLibrary((s) => s.count)
  const picked = useBlockPick((s) => s.ids)
  const renaming = useBlockPick((s) => s.renaming)
  // read again at each save (the count)
  const library = useMemo(() => libraryBlocks(), [changed])
  // a block placed is a warehouse: the panel is there where the typology offers one (Decision "What is not there is not shown")
  const { offered } = useModule('warehouse')

  const linked = new Set((types ?? []).flatMap((t) => (t.library ? [t.library.id] : [])))
  const shelfOf = (id: string) => library.find((e) => e.block.id === id)?.shelf ?? null
  const own: Item[] = (types ?? []).map((t) => ({
    kind: 'project',
    key: t.id,
    type: t,
    program: programs.find((g) => g.id === t.program)?.name ?? 'No program',
    copies: copies(t.id),
    shelf: t.library ? shelfOf(t.library.id) : null,
  }))
  const shelf: Item[] = library.map((e) => ({
    kind: 'library',
    key: blockDrag(e.block.id),
    type: e.block.type,
    program: e.block.programs.find((g) => g.id === e.block.type.program)?.name ?? 'No program',
    id: e.block.id,
    shelf: e.shelf,
    brought: linked.has(e.block.id),
  }))
  const shown = show === 'project' ? own : show === 'library' ? shelf : [...own, ...shelf.filter((x) => x.kind === 'library' && !x.brought)]
  const names = [...new Set([...own, ...shelf].map((x) => x.program))].sort()
  const items = program ? shown.filter((x) => x.program === program) : shown
  const order = items.map((x) => x.key)

  // the cards shown are what can be picked: one that goes (deleted, filtered out) leaves the pick, and Select all blocks reads the order
  const orderKey = order.join('|')
  useEffect(() => {
    useBlockPick.getState().setOrder(order)
    useBlockPick.getState().keep(order)
  }, [orderKey]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!offered) return null

  /** A click: that card alone; Shift the run from the anchor to it; Ctrl (⌘) one more or one less. */
  const choose = (key: string, e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => {
    const now = useBlockPick.getState()
    const next = rangePick(order, { ids: now.ids, anchor: now.anchor }, key, e)
    now.set(next.ids, next.anchor)
  }
  /** A right-click: a card not picked is picked alone first; the menu is of what is picked. */
  const menuOn = (key: string, e: MouseEvent<HTMLElement>) => {
    e.preventDefault()
    const now = useBlockPick.getState()
    const next = pickForMenu({ ids: now.ids, anchor: now.anchor }, key)
    now.set(next.ids, next.anchor)
    openMenu(e, next.ids.map((id) => ({ kind: 'block-type', id })), 'blocks')
  }
  /**
   * The keys of the list: Delete, Backspace, F2 and Ctrl+D (the commands' own keys: Edit › Delete, Rename, Duplicate, as the user has them) are the list's while it has the
   * focus: they act on what is picked, or say why they cannot, and never reach the site's commands (which would delete or duplicate a mass). Escape lets go; a name being
   * typed keeps its keys.
   */
  const onKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]')) return
    const now = useBlockPick.getState()
    const mine = projectIds(now.ids)
    const handled = () => {
      e.preventDefault()
      e.stopPropagation()
    }
    const say = (why: string) => useToast.getState().show('info', why)
    const chord = chordOf(e.nativeEvent)
    const is = (command: string) => chord !== null && keysOf(command).includes(chord)
    if (e.key === 'Escape' && now.ids.length > 0) {
      handled()
      now.clear()
    } else if (is('edit.delete')) {
      handled()
      if (mine.length > 0) {
        removeTypes(mine)
        now.clear()
      } else if (now.ids.length > 0) say('A library block is not in the project: its menu removes it from the library')
    } else if (is('edit.rename')) {
      handled()
      if (mine.length === 1 && now.ids.length === 1) now.rename(mine[0])
      else if (now.ids.length > 1) say('Rename one block at a time')
      else if (now.ids.length === 1) say('Only a block of the project has a name to edit: place the library block first')
    } else if (is('edit.duplicate')) {
      handled()
      if (mine.length > 0 && mine.length === now.ids.length) {
        const made = duplicateTypes(mine)
        if (made.length > 0) now.set(made)
      } else if (now.ids.length > 0) say('Only blocks of the project are duplicated: place a library block first')
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      // the arrows walk the cards; Space or Enter on one picks or opens it
      const options = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="option"]'))
      const at = options.indexOf((e.target as HTMLElement).closest<HTMLElement>('[role="option"]')!)
      if (at < 0) return
      handled()
      options[Math.max(0, Math.min(options.length - 1, at + (e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1)))]?.focus()
    }
  }

  return (
    <section aria-label="Blocks" className="flex flex-col gap-3">
      <Note className="text-caption text-ink-tertiary">
        Smart blocks: each keeps its rules (grid, columns, envelope, bumps). Drag one onto the plan or the 3D, or right-click it and choose Place for one in
        the middle of the site.
      </Note>
      <Segmented kind="toggle" label="Blocks shown" stretch options={[...BLOCK_SHOWS]} value={show} onChange={(k) => set({ show: k as BlockShow })} />
      <label className="flex items-center justify-between gap-2 text-label text-ink-secondary">
        {tr("Program")}
        <select
          aria-label="Program"
          value={program ?? ''}
          onChange={(e) => set({ program: e.target.value || null })}
          className="h-[1.75rem] min-w-0 max-w-[11rem] truncate rounded-control bg-panel px-1.5 text-label text-ink shadow-control outline-none"
        >
          <option value="">{tr("All programs")}</option>
          {names.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      {items.length ? (
        <ul role="listbox" aria-label="Blocks" aria-multiselectable="true" onKeyDown={onKeyDown} className="grid grid-cols-2 gap-2">
          {items.map((x) => {
            const on = picked.includes(x.key)
            // one card is the list's tab stop: the first one picked, else the first
            const stop = x.key === (order.find((k) => picked.includes(k)) ?? order[0])
            return x.kind === 'project' ? (
              <BlockCard key={x.key} type={x.type} copies={x.copies} shelf={x.shelf} on={on} stop={stop} renaming={renaming === x.key} choose={choose} menuOn={menuOn} />
            ) : (
              <LibraryCard key={x.key} item={x} on={on} stop={stop} choose={choose} menuOn={menuOn} />
            )
          })}
        </ul>
      ) : (
        <Note className="text-caption text-ink-tertiary">
          {show === 'project' && !types?.length ? 'No block yet: begin one, step by step, in the Program window, or bring one from the Library.' : 'No block here: try All, or another program.'}
        </Note>
      )}
      <Button
        tour="new-block"
        title="A new block: its rule set designed step by step in the Program window"
        onClick={() => {
          newType()
          openProgram()
        }}
      >
        + New block
      </Button>
    </section>
  )
}

/** What both cards share: a click picks, a double-click or Enter opens, a right-click opens the menu, Space picks. */
interface CardProps {
  on: boolean
  stop: boolean
  choose(key: string, e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }): void
  menuOn(key: string, e: MouseEvent<HTMLElement>): void
}

const CARD = 'pressable relative flex cursor-grab flex-col gap-1 rounded-control border p-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ink-tertiary active:cursor-grabbing'
const cardLook = (on: boolean, dashed: boolean) => `${CARD} ${dashed ? 'border-dashed' : ''} ${on ? 'border-ink bg-fill' : 'border-separator hover:bg-hover'}`

/** A library block: dragged or placed, it comes into the project (linked) and a copy of it stands there. */
function LibraryCard({ item, on, stop, choose, menuOn }: { item: Extract<Item, { kind: 'library' }> } & CardProps) {
  const t = item.type
  return (
    <li
      role="option"
      aria-selected={on}
      aria-label={t.name}
      tabIndex={stop ? 0 : -1}
      data-library-block={item.id}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(TYPE_MIME, blockDrag(item.id))
        e.dataTransfer.setData('text/plain', t.name)
        e.dataTransfer.effectAllowed = 'copy'
      }}
      title={`${SHELF_NAMES[item.shelf]}’s block “${t.name}”: drag it onto the plan or the 3D, or right-click it and choose Place, and it comes into the project with a copy of it${item.brought ? ' (it is in the project already)' : ''}`}
      onClick={(e) => choose(item.key, e)}
      onDoubleClick={() => openCard(item.key)}
      onContextMenu={(e) => menuOn(item.key, e)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter') openCard(item.key)
        else if (e.key === ' ') {
          e.preventDefault()
          choose(item.key, e)
        }
      }}
      className={cardLook(on, true)}
    >
      <BlockPlan type={t} />
      <span className="flex items-baseline justify-between gap-1">
        <span className="truncate text-label font-medium text-ink">{t.name}</span>
        <span className="shrink-0 text-caption text-ink-tertiary">{item.brought ? 'In project' : SHELF_NAMES[item.shelf]}</span>
      </span>
    </li>
  )
}

function BlockCard({ type: t, copies, shelf, renaming, on, stop, choose, menuOn }: { type: WarehouseType; copies: number; shelf: Shelf | null; renaming: boolean } & CardProps) {
  return (
    <li
      role="option"
      aria-selected={on}
      aria-label={t.name}
      tabIndex={stop ? 0 : -1}
      data-block={t.id}
      data-tour="block-card"
      draggable={!renaming}
      onDragStart={(e) => {
        e.dataTransfer.setData(TYPE_MIME, t.id)
        e.dataTransfer.setData('text/plain', t.name)
        e.dataTransfer.effectAllowed = 'copy'
      }}
      title={`Drag “${t.name}” onto the plan or the 3D for a copy where it drops; click to pick it, double-click to edit it, right-click for its menu`}
      onClick={(e) => choose(t.id, e)}
      onDoubleClick={() => !renaming && openCard(t.id)}
      onContextMenu={(e) => menuOn(t.id, e)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter') openCard(t.id)
        else if (e.key === ' ') {
          e.preventDefault()
          choose(t.id, e)
        }
      }}
      className={cardLook(on, false)}
    >
      <BlockPlan type={t} />
      <span className="flex items-baseline justify-between gap-1 pr-6">
        {renaming ? (
          <NameField type={t} />
        ) : (
          <span className="truncate text-label font-medium text-ink" title={shelf ? `Linked to ${SHELF_NAMES[shelf]}’s block: it follows the library’s changes` : undefined}>
            {t.name}
            {shelf && <span className="font-normal text-ink-tertiary"> · {SHELF_NAMES[shelf]}</span>}
          </span>
        )}
        <span className="shrink-0 text-caption tabular-nums text-ink-tertiary" aria-label={`${copies} on the site`}>
          ×{copies}
        </span>
      </span>
      <button
        type="button"
        aria-label={`Edit ${t.name}`}
        title={`Edit ${t.name}'s rules in the Program window: every copy follows`}
        onClick={(e) => {
          e.stopPropagation()
          openType(t.id)
        }}
        onDoubleClick={(e) => e.stopPropagation()}
        className="pressable absolute bottom-1 right-1 grid h-6 w-6 place-items-center rounded-pill text-ink-segment hover:bg-hover hover:text-ink"
      >
        <Icon name="pencil" className="h-3.5 w-3.5" />
      </button>
    </li>
  )
}

/** A card's name as a field (F2, the menu's Rename): Enter or leaving it keeps the name, Escape drops the edit; its keys are its own. */
function NameField({ type: t }: { type: WarehouseType }) {
  const [text, setText] = useState(t.name)
  const field = useRef<HTMLInputElement>(null)
  const over = useRef(false)
  useEffect(() => {
    field.current?.focus()
    field.current?.select()
  }, [])
  const end = (keep: boolean) => {
    if (over.current) return
    over.current = true
    if (keep && text.trim() && text.trim() !== t.name) renameType(t.id, text)
    useBlockPick.getState().rename(null)
  }
  return (
    <input
      ref={field}
      aria-label={`Rename ${t.name}`}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => end(true)}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') end(true)
        else if (e.key === 'Escape') end(false)
      }}
      className="h-5 min-w-0 flex-1 select-text rounded-control bg-panel px-1 text-label font-medium text-ink shadow-control outline-none"
    />
  )
}

/** The block's plan: its parts' outlines, the hall's pieces dark, the bumps lighter; framed on them. */
export function BlockPlan({ type, className = 'h-16' }: { type: WarehouseType; className?: string }) {
  const parts = useMemo(() => {
    try {
      return generate(type).parts
    } catch {
      return []
    }
  }, [type])
  const b = parts.length ? bounds(parts.flatMap((p) => p.polygon)) : null
  if (!b || !(b.maxX > b.minX) || !(b.maxY > b.minY)) return <div aria-hidden className={`${className} rounded-control bg-fill`} />
  const pad = Math.max(b.maxX - b.minX, b.maxY - b.minY) * 0.06
  return (
    <svg
      aria-hidden
      viewBox={`${b.minX - pad} ${-b.maxY - pad} ${b.maxX - b.minX + 2 * pad} ${b.maxY - b.minY + 2 * pad}`}
      preserveAspectRatio="xMidYMid meet"
      className={`${className} w-full rounded-control bg-fill`}
    >
      {/* plan y up: drawn with y flipped */}
      {parts.map((p) => (
        <polygon
          key={p.part}
          points={p.polygon.map((v) => `${v.x},${-v.y}`).join(' ')}
          className={p.kind === 'hall' ? 'fill-ink-secondary' : 'fill-ink-tertiary'}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  )
}
