// The typed dimension (D.1 task 4; spec *The typed dimension*): every drag shows its number beside the handle, and digits
// typed during the drag, or right after it, go into that number; Enter applies the exact value. AutoCAD's grips and
// SketchUp's Measurements box, for every handle of the site's plan and of the block editor's.
//   - A caller starts a typed drag when a handle is pressed (`startTyped`), tells it the live number as the pointer moves
//     (`moveTyped`), and `useDrag.finish` ends it (`endTyped`). The caller owns what the number means: `apply(v)` gives the
//     exact edit as `(project, told) => project | null`, and `measure` says what `v` is:
//       distance  how far the handle moves along its own axis (a wall, a face): a number, signed by the drag's way, so a
//                 bare `5` goes towards where it was dragged and `-5` the other way
//       value     the value itself (a court's depth, a chamfer's end, a radius): a number
//       angle     degrees (the rotation handle): a number
//       point     where a corner goes, or where a mass's centre goes (`d` along the drag, `@x,y`, `d<a`, `#x,y`): a point
//   - Typed during the drag, the value replaces it and ends it (live: the preview cancelled, then `apply`; ghost: `apply`):
//     the pointer no longer moves it (`typedEnded`, `moveTyped` says false). Typed after it: undo, then `apply`, one step;
//     a refusal puts the drag back (`redo`), says why and stays editable.
//   - Correctable until the next action: another change of the project, an undo, a new pick, a tool taken, a press on the
//     plan, or Escape with an empty field.
//   - The keys: while a typed drag stands a window listener in the capture phase takes digits, `. , - + @ # <`, Backspace,
//     Enter and Escape, never while typing in a field. The command line shows the same text (`useTypedCommand`).
// `mode`: `live` is the site's (the edit previews through the store and commits on release), `ghost` the block editor's
// (a dashed result, applied on release). The field of each viewport shows the drags of its own mode.
import { create } from 'zustand'
import type { Point, Project } from '../../../model/schema.ts'
import { useApp } from '../../../state/store.ts'
import { parseCommand } from '../../plan/command/command.ts'
import { useCommand } from '../../plan/command/commandState.ts'
import { useSnapSettings } from '../../plan/snap/settings.ts'
import { typingIn } from '../../plan/tools/common.tsx'
import { useHand } from '../../tools/hand.ts'

export type TypedMeasure = 'distance' | 'value' | 'point' | 'angle'
/** What a typed text means: a number (distance, value, angle) or a point. */
export type TypedValue = number | Point
/** What an edit says besides its result: `note` (said even when it worked: "held to 200 m"), `why` (the reason when it did not), `shift` (the block editor's frame moved when its box grew at a low wall: how far what stays still went, m). */
export interface Told {
  note?: string
  why?: string
  shift?: Point
}
/** The exact edit of a typed value: a pure `Project → Project`, null or the same project when refused. */
export type TypedEdit = (p: Project, told: Told) => Project | null

export interface TypedStart {
  /** The command line's tool name: "Move", "Move wall", "Move corner", "Rotate", "Court depth"… */
  what: string
  /** What it is: the command line's prompt ("Warehouse 2 · wall 4"). */
  name: string
  measure: TypedMeasure
  /** The live number as it is shown ("12.5 m", "30°"); empty until there is one. */
  shown: string
  /** Where the field stands, beside the handle: the viewport's frame (y up). */
  at: Point
  /** Where a point is measured from (the corner, the mass's centre). */
  base?: Point
  /** The way the drag went: its offset since the press (a point measure), its signed distance (a distance measure). */
  way?: Point | number
  /** What a number is in, as it is written after it (" m", "°"): appended to what is typed once applied. */
  unit?: string
  /** What can be typed, short (the command line's help). */
  help?: string
  apply(v: TypedValue): TypedEdit
  mode: 'live' | 'ghost'
  /** The project the drag began in (default: the project now). */
  from?: Project
  /** Escape with nothing typed, during a ghost drag that has no `useDrag` of its own (a court's pill): the caller drops its ghost. A drag `useDrag` holds (live or ghost) has no `cancel`: its own Escape cancels it, and the key is not taken here. */
  cancel?(): void
  /** How an edit reaches the project (default: `apply` of the store, one undo step): a caller that tells what it did besides (the block editor's "2 copies keep their own courts") puts it through its own door. */
  commit?(f: (p: Project) => Project): void
  /** An edit that moved the viewport's frame (`Told.shift`, the block editor's): called with how far, once it is applied, for the camera. */
  shifted?(d: Point): void
}

export interface TypedState extends TypedStart {
  /** `dragging`: the pointer holds it; `kept`: released, correctable. */
  phase: 'dragging' | 'kept'
  text: string
  error: string | null
  note: string | null
  /** A typed value ended the drag: the pointer no longer moves it. */
  ended: boolean
  from: Project
  /** The project the drag (or the last typed value) left. */
  after: Project | null
}

export const useTyped = create<{ cur: TypedState | null }>()(() => ({ cur: null }))

const get = () => useTyped.getState().cur
const set = (cur: TypedState | null) => useTyped.setState({ cur })
const patch = (p: Partial<TypedState>) => {
  const c = get()
  if (c) set({ ...c, ...p })
}

/** A drag starts (the `start` functions of `plan/editing.ts` and the other handles call this on press). */
export function startTyped(s: TypedStart): void {
  set({ ...s, phase: 'dragging', text: '', error: null, note: null, ended: false, from: s.from ?? useApp.getState().project, after: null })
}

/** The pointer moved: the live number, which way, where the field stands. False: a typed value already ended the drag (ignore the pointer). */
export function moveTyped(shown: string, way?: Point | number, at?: Point): boolean {
  const c = get()
  if (c?.ended) return false
  if (c && c.phase === 'dragging') set({ ...c, shown, way: way ?? c.way, at: at ?? c.at })
  return true
}

/** Did a typed value end the drag? (The movers ask first.) */
export const typedEnded = (): boolean => get()?.ended === true

/** The drag ended (`useDrag.finish`, or a ghost drag's release): kept, it can be corrected by typing; cancelled, or a click that moved nothing, it is forgotten. A typed value had ended it already. */
export function endTyped(cancelled: boolean): void {
  const c = get()
  if (!c || c.phase === 'kept') return
  const p = useApp.getState().project
  set(cancelled || p === c.from ? null : { ...c, phase: 'kept', after: p })
}

/** Forgets the typed dimension (a test; the things that end the correction). */
export function resetTyped(): void {
  set(null)
}

/** Types `text` at the end of what is typed. */
export function typeInto(text: string): void {
  const c = get()
  if (c) set({ ...c, text: c.text + text, error: null })
}

/** Puts `text` as what is typed (the command line's field). */
export function setTyped(text: string): void {
  const c = get()
  if (c) set({ ...c, text, error: null })
}

/** Backspace. */
export function eraseTyped(): void {
  const c = get()
  if (c) set({ ...c, text: c.text.slice(0, -1), error: null })
}

/** Escape: the text goes; with none, after the release, it lets go. False: not taken (nothing typed during the drag: the drag's own Escape cancels it, `useDrag`'s, which a taken key would never reach). */
export function escapeTyped(): boolean {
  const c = get()
  if (!c) return false
  if (c.text !== '') {
    set({ ...c, text: '', error: null })
    return true
  }
  if (c.phase === 'kept') {
    set(null)
    return true
  }
  if (c.mode === 'ghost' && c.cancel) {
    c.cancel()
    set(null)
    return true
  }
  return false
}

const NUMBER = /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)$/
const sign = (way: Point | number | undefined): number => (typeof way === 'number' ? Math.sign(way) || 1 : 1)

/** What the typed text means for this measure: the value, or what is wrong with it. */
function read(c: TypedState): { v: TypedValue } | { error: string } | { fixed: number } {
  const t = c.text.trim()
  if (c.measure === 'point') {
    const way = typeof c.way === 'object' ? c.way : null
    // with Ortho (F8) a bare distance goes along the axis the drag mostly followed, as in AutoCAD
    const d = way && useSnapSettings.getState().settings.ortho ? (Math.abs(way.x) >= Math.abs(way.y) ? { x: way.x, y: 0 } : { x: 0, y: way.y }) : way
    const cursor = c.base && d ? { x: c.base.x + d.x, y: c.base.y + d.y } : null
    const cmd = parseCommand(t, { first: false, base: c.base ?? null, cursor, rectangle: false, angle: useCommand.getState().angle })
    if (cmd.kind === 'point') return { v: cmd.point }
    if (cmd.kind === 'angle') return { fixed: cmd.degrees }
    return { error: cmd.kind === 'error' ? cmd.reason : 'Type a distance, @x,y, d<a or #x,y' }
  }
  if (!NUMBER.test(t)) return { error: c.measure === 'angle' ? 'Type the angle in degrees: 30' : c.measure === 'distance' ? 'Type how far, in metres: 5' : 'Type a number: 35' }
  const n = Number(t)
  return { v: c.measure === 'distance' ? n * sign(c.way) : n }
}

/** What is typed, as it reads once applied. */
const said = (c: TypedState): string => `${c.text.trim()}${c.measure === 'point' ? '' : (c.unit ?? '')}`

/** Applies the typed text. False: it could not (the text stays, the reason is said) or there is nothing to apply. */
let busy = false
export function enterTyped(): boolean {
  const c = get()
  if (!c || c.text.trim() === '') return false
  const r = read(c)
  if ('error' in r) {
    patch({ error: r.error })
    return false
  }
  if ('fixed' in r) {
    // "<a": the next segment's angle, as the command line says it
    useCommand.getState().fixAngle(r.fixed)
    patch({ text: '', error: null })
    return true
  }
  const edit = c.apply(r.v)
  const s = useApp.getState()
  const none = 'It changes nothing'
  const put = (f: (p: Project) => Project) => (c.commit ? c.commit(f) : useApp.getState().apply(f))
  busy = true
  try {
    if (c.phase === 'dragging') {
      // typed during the drag: it replaces the drag and ends it. A value the edit refuses leaves the drag going.
      const base = s.dragStart ?? s.project
      const probe: Told = {}
      const next = edit(base, probe)
      if (next === null || next === base) {
        patch({ error: probe.why ?? none })
        return false
      }
      if (c.mode === 'live') s.cancel()
      const told: Told = {}
      put((p) => edit(p, told) ?? p)
      const after = useApp.getState().project
      if (after === base) {
        // the project took nothing (a lock, the shape's rules): it says so, and the drag goes on
        patch({ error: told.why ?? probe.why ?? 'It could not be applied: something holds it' })
        return false
      }
      c.shifted?.(told.shift ?? { x: 0, y: 0 })
      set({ ...c, phase: 'kept', ended: true, after, text: '', error: null, note: told.note ?? probe.note ?? null, shown: said(c) })
      return true
    }
    // typed after it: the drag (or the last value) is undone and the exact edit applied: one undo step. What a refusal
    // would say is known from the project the drag began in, before anything is undone (no step is made and unmade).
    const probe: Told = {}
    const next = edit(c.from, probe)
    if (next === null || next === c.from) {
      patch({ error: probe.why ?? none })
      return false
    }
    s.undo()
    const before = useApp.getState().project
    const told: Told = {}
    put((p) => edit(p, told) ?? p)
    const after = useApp.getState().project
    if (after === before) {
      // refused: the drag stays, and can still be corrected
      useApp.getState().redo()
      patch({ error: told.why ?? none })
      return false
    }
    // the camera goes where this edit's frame is: back, when the drag's moved it and this one does not
    c.shifted?.(told.shift ?? { x: 0, y: 0 })
    set({ ...c, ended: true, after, text: '', error: null, note: told.note ?? null, shown: said(c) })
    return true
  } finally {
    busy = false
  }
}

// The keys of a typed drag (never in a field: that key is the field's). The block editor is a modal window, and its drags are typed too: no check for one.
const STARTS = /^[0-9#@<.\-+,]$/
function onKey(e: KeyboardEvent): void {
  const c = get()
  if (!c || typingIn(e.target)) return
  // AltGr (how @ is typed on a Spanish keyboard) arrives as Ctrl+Alt on Windows
  const altGr = typeof e.getModifierState === 'function' && e.getModifierState('AltGraph')
  if ((e.ctrlKey || e.metaKey || e.altKey) && !altGr) return
  const take = () => {
    e.preventDefault()
    e.stopImmediatePropagation()
  }
  if (STARTS.test(e.key)) {
    take()
    typeInto(e.key)
  } else if (e.key === 'Backspace') {
    // with nothing typed too: a correction standing is not the app's Delete of the picked object
    take()
    eraseTyped()
  } else if (e.key === 'Enter' && c.text.trim() !== '') {
    take()
    enterTyped()
  } else if (e.key === 'Escape' && escapeTyped()) take()
}

// What ends a correction: the project changed by anything else (an edit, an undo), a new pick, a tool taken, a press on the plan.
const pickOf = (s: ReturnType<typeof useApp.getState>) => `${s.selection.massId}|${s.selection.vertex}|${s.selection.massIds.join(',')}`
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', onKey, true)
  window.addEventListener(
    'pointerdown',
    (e) => {
      const el = e.target
      if (get()?.phase !== 'kept' || !(el instanceof Element)) return
      if (el.closest('[data-dimension-field]') || !el.closest('svg[role="img"][aria-label$="plan"]')) return
      resetTyped()
    },
    true,
  )
}
useApp.subscribe((s, before) => {
  const c = get()
  if (!c || c.phase !== 'kept' || busy || s.dragStart) return
  if ((s.project !== before.project && s.project !== c.after) || pickOf(s) !== pickOf(before)) resetTyped()
})
useHand.subscribe((s, before) => {
  if (s.tool !== before.tool && get()?.phase === 'kept') resetTyped()
})
