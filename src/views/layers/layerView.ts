// What the viewer hides, in one store, per project (Phase AS.3, Decision "Layers"): the keys (keys.ts) the eyes hide,
// the ones drawn on top and the branches of the tree folded. It is view state: kept per project in this browser
// (`gfit.layers`: { [projectId]: { hidden, onTop, folded } }, with try/catch: there may be no storage, and it then
// lasts as long as the tab), never in the .gft and never an undo step. It follows the open project: when `useApp`'s
// project id changes it loads that project's entry (empty when it has none), so what one project hides another one
// shows. The block editor's and the terrain editor's pseudo-projects are kept in memory only. What a project's entry holds
// of an object that is gone (a building, a gate, a lot, an existing road, a drawing's layer or parcel, and their
// folded rows) is dropped when the project's objects change, by a subscription to the store (gone.ts says what is alive: an
// object in any option stands): ids come back, and the next building must not be born hidden. Nothing is dropped during a
// drag's preview or when another project opens (its entry is loaded first, and kept as it was). At load the entries of
// projects no longer in the library are dropped, never the open project's nor the sample's (it is in the library only once
// edited). Everything shows until hidden. Whatever draws, picks or snaps asks it: `useHidden(key)` in a view, `isHidden(key)` outside React, and a
// view of many keys asks a Set (`useHiddenSet()` in a view, `hiddenNow()` outside), with `isObjectHidden` (keys.ts) for
// a gate, an existing road or a lot. `showLayers` shows kinds again (what a tool that draws one does). `onTop` is
// what the drawing layers and parcels drawn over the model are (`useOnTopSet`, `toggleOnTop`): it never hides.
//
// The flags it replaced (a drawing's eyes, the map's, the labels', the dimensions', the issue chips' and the rules'
// arcs) lived in five stores and as many keys of storage; those keys are read no more and are removed at load.
import { useMemo } from 'react'
import { create } from 'zustand'
import { library } from '../../io/library.ts'
import type { Project } from '../../model/schema.ts'
import { SAMPLE_ID } from '../../state/sample.ts'
import { useApp } from '../../state/store.ts'
import { BLOCK_EDITOR_ID, TERRAIN_EDITOR_ID } from '../home/editorId.ts'
import { aliveIn, isObjectKey, isObjectRow, keysAlive, rowsAlive } from './gone.ts'

export const LAYERS_KEY = 'gfit.layers'

/** The storage keys of the flags that moved in here, and the fields of `gfit.graph` (its other fields stay). */
const OLD_KEYS = ['gfit.drawings.hidden', 'gfit.labels', 'gfit.dims', 'gfit.map.visible']
const GRAPH_KEY = 'gfit.graph'
const OLD_GRAPH_FIELDS = ['arcs', 'markers', 'overlay']

interface Entry {
  hidden: string[]
  onTop: string[]
  /** The tree's rows whose fold the viewer changed from what it is at first (`foldedByDefault`, tree.ts: every row with
   *  something under it is folded but Buildings): a row listed here is open if it starts folded, and folded if not. */
  folded: string[]
}

interface LayerView extends Entry {
  /** Hide (or show) these keys together: a file's layers at once, a branch's rows. */
  setHidden(keys: string[], hidden: boolean): void
  /** Draw these keys over the model (or put them back). */
  setOnTop(keys: string[], on: boolean): void
  /** Mark a row of the tree as changed from its first fold, or put it back (the tree says it in its own terms: LayersTab). */
  setFolded(key: string, folded: boolean): void
}

const EMPTY: Entry = { hidden: [], onTop: [], folded: [] }
const isEmpty = (e: Entry) => !e.hidden.length && !e.onTop.length && !e.folded.length
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

/** What is kept, by project id; nothing when there is no storage or it is broken. */
function readAll(): Record<string, Entry> {
  try {
    const raw = JSON.parse(localStorage.getItem(LAYERS_KEY) ?? 'null') as unknown
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
    const out: Record<string, Entry> = {}
    for (const [id, e] of Object.entries(raw as Record<string, Partial<Record<keyof Entry, unknown>> | null>)) {
      if (e && typeof e === 'object') out[id] = { hidden: strings(e.hidden), onTop: strings(e.onTop), folded: strings(e.folded) }
    }
    return out
  } catch {
    return {}
  }
}

function writeAll(all: Record<string, Entry>): void {
  try {
    localStorage.setItem(LAYERS_KEY, JSON.stringify(all))
  } catch {
    // it lasts as long as the tab
  }
}

/** The block editor's and the terrain editor's projects are not the user's: nothing of theirs is kept. */
const isPseudo = (id: string) => id === BLOCK_EDITOR_ID || id === TERRAIN_EDITOR_ID

/** The project whose entry the store holds. */
let current = useApp.getState().project.id

function keep(entry: Entry): void {
  if (isPseudo(current)) return
  const all = readAll()
  if (isEmpty(entry)) delete all[current]
  else all[current] = entry
  writeAll(all)
}

/** Removes what the flags that moved in here left in storage (idempotent). */
function forgetOldKeys(): void {
  try {
    for (const k of OLD_KEYS) localStorage.removeItem(k)
    const raw = localStorage.getItem(GRAPH_KEY)
    if (raw === null) return
    const prefs = JSON.parse(raw) as Record<string, unknown> | null
    if (!prefs || typeof prefs !== 'object') return
    if (!OLD_GRAPH_FIELDS.some((f) => f in prefs)) return
    for (const f of OLD_GRAPH_FIELDS) delete prefs[f]
    localStorage.setItem(GRAPH_KEY, JSON.stringify(prefs))
  } catch {
    // nothing to remove, or no storage
  }
}

/** Drops the entries of the projects that are no longer in the library; the open project's stays, and the sample's (not in the library until edited). */
export function forgetGoneProjects(): void {
  const all = readAll()
  const listed = new Set(library.list().map((e) => e.id))
  const gone = Object.keys(all).filter((id) => id !== current && id !== SAMPLE_ID && !listed.has(id))
  if (!gone.length) return
  for (const id of gone) delete all[id]
  writeAll(all)
}

/** The list with these keys in (or out); the same list when nothing changes, so nothing re-renders for nothing. */
const toggled = (list: string[], keys: string[], on: boolean) => {
  const now = new Set(list)
  for (const k of keys) {
    if (on) now.add(k)
    else now.delete(k)
  }
  return now.size === list.length && list.every((k) => now.has(k)) ? list : [...now]
}

export const useLayerView = create<LayerView>()((set, get) => {
  const change = (patch: Partial<Entry>) => {
    if (Object.entries(patch).every(([k, v]) => get()[k as keyof Entry] === v)) return
    set(patch)
    const { hidden, onTop, folded } = get()
    keep({ hidden, onTop, folded })
  }
  return {
    ...(isPseudo(current) ? EMPTY : (readAll()[current] ?? EMPTY)),
    setHidden: (keys, hidden) => change({ hidden: toggled(get().hidden, keys, hidden) }),
    setOnTop: (keys, on) => change({ onTop: toggled(get().onTop, keys, on) }),
    setFolded: (key, folded) => change({ folded: toggled(get().folded, [key], folded) }),
  }
})

forgetOldKeys()
forgetGoneProjects()

/** Drops what the open project's entry holds of objects that are no longer in the project (ids come back: a new building must not inherit it). */
function forgetGoneObjects(p: Project): void {
  const { hidden, onTop, folded } = useLayerView.getState()
  // most entries hold no object at all (a kind's key, a branch's fold): nothing to measure then
  if (!hidden.some(isObjectKey) && !onTop.some(isObjectKey) && !folded.some(isObjectRow)) return
  const alive = aliveIn(p)
  const next = { hidden: keysAlive(hidden, alive), onTop: keysAlive(onTop, alive), folded: rowsAlive(folded, alive) }
  if (next.hidden === hidden && next.onTop === onTop && next.folded === folded) return
  useLayerView.setState(next)
  keep(next)
}

// It follows the open project: another one's entry is loaded first (and kept as it was), and while the same project is open
// what its edits leave out is dropped, but not during a drag's preview (the project is the drag's, not yet the viewer's).
useApp.subscribe((s, before) => {
  if (s.project.id !== current) {
    current = s.project.id
    useLayerView.setState(isPseudo(current) ? EMPTY : (readAll()[current] ?? EMPTY))
    return
  }
  if (s.project === before.project || s.dragStart !== null || isPseudo(current)) return
  forgetGoneObjects(s.project)
})

/** Is this key hidden? For what is not a view (a pick, a snap, a command). */
export const isHidden = (key: string): boolean => useLayerView.getState().hidden.includes(key)

/** Is this key hidden? In a view: it re-renders its caller only when this key's state changes. */
export const useHidden = (key: string): boolean => useLayerView((s) => s.hidden.includes(key))

/** Hides this key, or shows it when it is hidden: what a chip, a command and an eye of one key do. */
export const toggleLayer = (key: string): void => useLayerView.getState().setHidden([key], !isHidden(key))

/** The hidden keys as a Set, for what asks about many (every gate, every lot): in a view, rebuilt only when they change. */
export const useHiddenSet = (): ReadonlySet<string> => {
  const hidden = useLayerView((s) => s.hidden)
  return useMemo(() => new Set(hidden), [hidden])
}

/** The hidden keys as a Set, for what is not a view (a pick, a snap). */
export const hiddenNow = (): ReadonlySet<string> => new Set(useLayerView.getState().hidden)

/** Shows these kinds again: what a tool that draws one does (a street drawn while Streets is hidden shows the streets). */
export const showLayers = (...keys: string[]): void => useLayerView.getState().setHidden(keys, false)

/** The keys drawn on top as a Set, in a view: rebuilt only when they change. */
export const useOnTopSet = (): ReadonlySet<string> => {
  const onTop = useLayerView((s) => s.onTop)
  return useMemo(() => new Set(onTop), [onTop])
}

/** Puts these keys on top, or back when all of them already are: what a row's *On top* does (a press on a mixed one puts all on top). */
export const toggleOnTop = (keys: readonly string[]): void => {
  if (keys.length === 0) return
  const now = useLayerView.getState()
  now.setOnTop([...keys], !keys.every((k) => now.onTop.includes(k)))
}
