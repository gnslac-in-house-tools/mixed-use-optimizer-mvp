// A row of the Layers tree (Phase AS.3, Decision "Layers"), left to right: its indentation, a fold arrow when it has
// something under it, its swatch where it has a colour, its name (the click area: it picks the row; a building's name
// renames on a double-click; a building's or a level's name is also edited in place when Rename asks for it: F2, Edit › Rename, the right-click menu), its count and a
// quiet word (a gate's width, a lot's wall and rows, a level's elevation), the marks of a
// building (🔗 linked to other options, ⓒ context), then a ＋ where the row makes something (Buildings, Drawings),
// *On top* where it holds drawing layers or parcels, the padlock where its kind has one (a mass, a building, a level, a gate, a lot, a street, the rows that hold them, the
// drawings) and the eye (a mass has its own). The eye, the padlock, the ＋ and the arrow do not pick.
//   treeitem   `aria-level`, `aria-expanded` (only with children), `aria-selected` (picked), `aria-current` (the building
//              or level the plan is on), `data-tour="layer-<row id>"`
//   the eye    pressed = shown; "mixed" (dimmed) when only some of what is under the row is; a hidden row's name is dimmed; the
//              three that run a switch (Grid, Terrain, Program graph) are titled by what they run (`eyeTitle`)
//   on top     pressed = drawn over the model (a layer, a file's parcels, a file, Drawings); "mixed" (dimmed) when only some are: a press then
//              puts all on top
//   the lock   pressed = locked; mixed (dimmed) when only some of what the row holds is: a press then locks all
// The keys on the tree (↑ ↓ → ← Home End; Enter picks) are LayersTab's.
// 28 px tall (44 px on a phone), text-body, tokens only. It is memoised: its props are plain values and handlers that do not
// change, so the plan's pointer moving, or another row picked, redraws no row but the ones concerned.
import { memo, type DragEvent, type MouseEvent } from 'react'
import { Icon } from '../controls/Icon.tsx'
import { NameField } from '../controls/NameField.tsx'
import type { EyeState, LayerRow } from './tree.ts'

/** Whether what a row holds is drawn over the model: on, off, or some of each. */
export type TopState = 'on' | 'off' | 'mixed'

/** What a drag over a row shows: a ring (it lands in it) or a line on top (it lands before it). */
export type OverMark = 'into' | 'before' | null

/** A ＋ a row carries (New building, Add drawing…). */
export interface AddAction {
  label: string
  title: string
  run(): void
}

/** What a row calls: one object for the whole tree, never rebuilt, so the rows stay as they were. */
export interface RowHandlers {
  pick(row: LayerRow, e: MouseEvent): void
  fold(row: LayerRow): void
  eye(row: LayerRow): void
  top(row: LayerRow): void
  lock(row: LayerRow): void
  menu(row: LayerRow, e: MouseEvent): void
  startRename(row: LayerRow): void
  rename(row: LayerRow, name: string | null): void
  dragStart(row: LayerRow, e: DragEvent): void
  dragEnd(): void
  dragOver(row: LayerRow, e: DragEvent): void
  dragLeave(row: LayerRow): void
  drop(row: LayerRow, e: DragEvent): void
}

export interface RowProps {
  row: LayerRow
  /** 0 for a branch. */
  depth: number
  /** Open or folded; undefined when the row has nothing under it. */
  open: boolean | undefined
  eye: EyeState | null
  /** The eye's title where it is not just Show / Hide <row>: an eye that runs a switch says which. */
  eyeTitle?: string
  /** Null where the row has nothing that can be drawn on top. */
  top: TopState | null
  picked: boolean
  /** The building or the level the plan is on. */
  current: boolean
  /** Its name reads dimmed: its eye hides it, or its building's does. */
  dim: boolean
  /** Its name is a field. */
  editing: boolean
  draggable: boolean
  over: OverMark
  add: AddAction | null
  h: RowHandlers
}

const iconButton =
  'pressable grid h-6 w-6 shrink-0 place-items-center rounded-control text-ink-segment hover:bg-hover hover:text-ink phone:h-11 phone:w-11'
const INTO = 'ring-2 ring-inset ring-ink'
const BEFORE = 'shadow-[inset_0_2px_0_0_var(--ink)]'

/** The nicest reading of a row's kind, for its tooltip. */
const hint = (row: LayerRow): string =>
  row.kind === 'building'
    ? 'Go to it (Shift: a run, Ctrl: one more); drag it onto another to move it, onto a mass to assign it; double-click to rename'
    : row.kind === 'mass'
      ? 'Pick it, a locked one too (Shift: a run, Ctrl: one more); drag it onto a building to assign it (Alt: a copy)'
      : 'Pick it (Shift: a run, Ctrl: one more)'

function RowView({ row, depth, open, eye, eyeTitle, top, picked, current, dim, editing, draggable, over, add, h }: RowProps) {
  const hasLock = row.lock !== undefined
  const locked = row.lock === 'locked'
  return (
    <div
      role="treeitem"
      aria-level={depth + 1}
      aria-label={row.label}
      aria-expanded={open}
      aria-selected={picked}
      aria-current={current ? 'true' : undefined}
      data-tour={`layer-${row.id}`}
      data-row-id={row.id}
      draggable={draggable && !editing}
      onDragStart={(e) => h.dragStart(row, e)}
      onDragEnd={h.dragEnd}
      onDragOver={(e) => h.dragOver(row, e)}
      onDragLeave={() => h.dragLeave(row)}
      onDrop={(e) => h.drop(row, e)}
      onContextMenu={(e) => h.menu(row, e)}
      className={`flex h-row min-w-0 items-center gap-1 rounded-control phone:h-11 ${picked ? 'bg-fill' : 'hover:bg-hover'} ${picked ? 'ring-1 ring-inset ring-ink-tertiary' : ''} ${
        over === 'into' ? INTO : over === 'before' ? BEFORE : ''
      }`}
      style={{ paddingLeft: `${depth * 0.75}rem` }}
    >
      {open === undefined ? (
        <span aria-hidden className="h-6 w-6 shrink-0" />
      ) : (
        <button
          type="button"
          aria-label={`${open ? 'Fold' : 'Unfold'} ${row.label}`}
          aria-expanded={open}
          onClick={() => h.fold(row)}
          className={iconButton}
        >
          <Icon name={open ? 'chevronDown' : 'chevronRight'} className="h-3.5 w-3.5" />
        </button>
      )}
      {editing ? (
        <NameField label={`Name of ${row.label}`} value={row.name ?? row.label} onDone={(v) => h.rename(row, v)} />
      ) : (
        <button
          type="button"
          data-row-pick
          title={hint(row)}
          onClick={(e) => h.pick(row, e)}
          onDoubleClick={() => h.startRename(row)}
          className={`pressable flex h-full min-w-0 flex-1 items-center gap-2 rounded-control px-1 text-left text-body ${
            current ? 'font-semibold text-ink' : depth === 0 ? 'font-medium text-ink' : 'text-ink'
          }`}
        >
          {row.swatch !== undefined && <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-[3px] ${dim ? 'opacity-50' : ''}`} style={{ background: row.swatch }} />}
          <span className={`min-w-0 truncate ${dim ? 'opacity-50' : ''}`}>{row.label}</span>
          {row.count !== undefined && <span className="shrink-0 text-caption tabular-nums text-ink-secondary">{row.count}</span>}
          {row.detail !== undefined && <span className="shrink-0 text-caption tabular-nums text-ink-secondary">{row.detail}</span>}
          {row.marks?.map((m) => (
            <span key={m.label} title={m.title} className="shrink-0 text-ink-secondary">
              <span aria-hidden>{m.label === 'linked' ? <Icon name="link" className="h-3.5 w-3.5" /> : 'ⓒ'}</span>
              <span className="sr-only">, {m.label}</span>
            </span>
          ))}
        </button>
      )}
      {add && (
        <button type="button" aria-label={add.label} title={add.title} onClick={add.run} className={iconButton}>
          <Icon name="plus" className="h-3.5 w-3.5" />
        </button>
      )}
      {top !== null && (
        <button
          type="button"
          aria-label={`On top ${row.label}`}
          aria-pressed={top === 'mixed' ? 'mixed' : top === 'on'}
          title="On top: drawn over the model"
          onClick={() => h.top(row)}
          className={`${iconButton} ${top === 'on' ? 'bg-fill text-ink' : ''} ${top === 'mixed' ? 'opacity-50' : ''}`}
        >
          <Icon name="onTop" className="h-3.5 w-3.5" />
        </button>
      )}
      {hasLock && (
        <button
          type="button"
          aria-label={`Lock ${row.label}`}
          aria-pressed={row.lock === 'mixed' ? 'mixed' : locked}
          title={locked ? 'Unlock' : 'Lock: seen, not picked, not changed'}
          onClick={() => h.lock(row)}
          className={`${iconButton} ${row.lock === 'mixed' ? 'opacity-50' : ''}`}
        >
          <Icon name={locked ? 'lock' : 'unlock'} className="h-3.5 w-3.5" />
        </button>
      )}
      {eye !== null ? (
        <button
          type="button"
          aria-label={`Show ${row.label}`}
          aria-pressed={eye === 'mixed' ? 'mixed' : eye === 'shown'}
          title={eyeTitle ?? (eye === 'hidden' ? `Show ${row.label}` : `Hide ${row.label}`)}
          onClick={() => h.eye(row)}
          className={`${iconButton} ${eye === 'mixed' ? 'opacity-50' : ''}`}
        >
          <Icon name={eye === 'hidden' ? 'eyeOff' : 'eye'} className="h-3.5 w-3.5" />
        </button>
      ) : (
        <span aria-hidden className="h-6 w-6 shrink-0" />
      )}
    </div>
  )
}

export const Row = memo(RowView)
