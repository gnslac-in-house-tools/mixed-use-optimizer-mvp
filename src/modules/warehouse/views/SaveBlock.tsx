// *Save to library* at the Program window's foot (Phase BL.3, Decision "Block library"; the user: "I press save, it
// asks whether to overwrite or make a copy… much as Revit does"): a block linked to the library asks *Overwrite* (its
// next version: every project linked to it takes it when it opens) or *Save a copy* (a block of its own, which the
// type then follows); one not linked yet becomes a new block at once. The type is linked to what it saved. *Unlink*
// keeps a linked one as it is.
import { useEffect, useState } from 'react'
import { create } from 'zustand'
import type { Block, Id, WarehouseType } from '../../../model/schema.ts'
import { actions } from '../../../state/actions/index.ts'
import { useApp } from '../../../state/store.ts'
import { useToast } from '../../../views/layout/toast.ts'
import { libraryBlock, saveType, type SaveMode } from './blockLibrary.ts'
import { t as tr } from '../../../i18n/idioma.ts' // mixed-use-mvp

/**
 * A type whose *Save to library* question something else asks to open (Ctrl+S in the block editor: it must not choose for
 * the user what the button would ask); null: none. The button for that type opens its question and clears this.
 */
export const useSaveAsk = create<{ typeId: Id | null }>()(() => ({ typeId: null }))

/** Saves the type, links it to what it saved and says so. */
export function saveToLibrary(t: WarehouseType, mode: SaveMode): Block | null {
  const b = saveType(useApp.getState().project, t.id, mode)
  if (!b) {
    useToast.getState().show('error', 'This browser’s storage is full or blocked: the block was not saved.')
    return null
  }
  useApp.getState().apply((p) => actions.linkBlock(p, t.id, { id: b.id, version: b.version }))
  const what = mode === 'overwrite' && t.library ? `version ${b.version} of “${b.type.name}”` : `“${b.type.name}”, a new block`
  useToast.getState().show('info', `Saved ${what} to the block library. Projects linked to it take it when they open.`)
  return b
}

const BUTTON = 'pressable flex h-7 shrink-0 items-center rounded-control px-3 text-label shadow-control'

export function SaveBlock({ type: t, onSaved, unlink = true }: { type: WarehouseType; onSaved?: (b: Block) => void; unlink?: boolean }) {
  const [asking, setAsking] = useState(false)
  const linked = t.library ? libraryBlock(t.library.id) : undefined
  const asked = useSaveAsk((s) => s.typeId === t.id)
  useEffect(() => {
    if (!asked) return
    useSaveAsk.setState({ typeId: null })
    setAsking(true)
  }, [asked])
  const save = (mode: SaveMode) => {
    setAsking(false)
    const b = saveToLibrary(t, mode)
    if (b) onSaved?.(b)
  }
  if (asking)
    return (
      <div role="group" aria-label="Save to library" className="flex flex-wrap items-center gap-2">
        <span className="text-label text-ink-secondary">
          “{linked?.block.type.name ?? t.name}”{linked?.shelf === 'gfit' ? ' is GFit’s: overwrite it in this browser, or save a copy?' : ': overwrite it, or save a copy?'}
        </span>
        <button type="button" title={tr("A new version of the block: every project linked to it takes it when it opens")} onClick={() => save('overwrite')} className={`${BUTTON} bg-ink font-semibold text-on-ink hover:opacity-90`}>
          {tr("Overwrite")}
        </button>
        <button type="button" title={tr("A block of its own; this type then follows it")} onClick={() => save('copy')} className={`${BUTTON} bg-panel text-ink hover:bg-hover`}>
          {tr("Save a copy")}
        </button>
        <button type="button" onClick={() => setAsking(false)} className={`${BUTTON} text-ink-secondary shadow-none hover:bg-hover`}>
          {tr("Cancel")}
        </button>
      </div>
    )
  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        title={t.library ? 'Save this block to the library: overwrite it or save a copy' : 'Save this block to the library, for every project of this browser'}
        onClick={() => (t.library ? setAsking(true) : save('copy'))}
        className={`${BUTTON} bg-panel text-ink hover:bg-hover`}
      >
        {tr("Save to library")}
      </button>
      {t.library && unlink && (
        <button
          type="button"
          title={tr("Keep this block as it is here: the library’s changes no longer reach it (undo links it again)")}
          onClick={() => useApp.getState().apply((p) => actions.unlinkBlock(p, t.id))}
          className={`${BUTTON} text-ink-secondary shadow-none hover:bg-hover`}
        >
          {tr("Unlink")}
        </button>
      )}
    </span>
  )
}
