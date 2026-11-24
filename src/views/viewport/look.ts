// What the viewport shows when it is not the design (Decision "Specimen preview"): a project to look at, read only (a
// plugin's: an optimizer's specimen). The plan, the 3D and the KPI strip draw it (`useShown`), the plan with the design
// dashed over it; the store, the history, the panels and the saving keep the design, which never changes for it. A
// bar over the viewport names it, steps through its owner's list (‹ ›), gives its owner's actions (Keep as option) and
// goes back to the design (Escape too).
// It ends by itself when the design is edited (an edit shows what it edits; a plugin's own data aside), when another
// option or project comes, when a drawing tool is picked, or in a step whose viewport draws no masses (the Brief's
// table, the Rules' diagram; a look started there opens Massing): to edit what it shows, its owner keeps it first.
// A quiet look (a run followed as it goes) never moves the designer: in such a step it does not show, and going to
// one ends it without telling its owner, who shows it again when the viewport draws masses.
import { createContext, useContext } from 'react'
import { create } from 'zustand'
import * as engine from '../../engine/derive.ts'
import type { Derived } from '../../engine/types.ts'
import type { Id, Project } from '../../model/schema.ts'
import { useApp } from '../../state/store.ts'
import { useUi } from '../layout/ui.ts'
import { useTool } from '../plan/tools/toolState.ts'
import { letGo } from '../tools/hand.ts'

export interface Look {
  /** Who shows it: a plugin's id. */
  owner: string
  /** The bar's name for it ("Specimen #23 · 1 of 57"). */
  title: string
  project: Project
  /** The option it shows: the app goes to it. */
  option: Id
  /** The KPIs its owner knows the better way of (an objective's): their ▲▼ say better or worse. */
  better?: Record<string, 'min' | 'max'>
  prev?(): void
  next?(): void
  /** Its owner's buttons on the bar, before *Back to my design* (Decision "Keep a specimen": *Keep as option*). */
  actions?: LookAction[]
  /** Told when it ends some other way than its owner's (the bar, an edit, another option). */
  onEnd?(): void
  /** Only where the viewport draws masses, never opening Massing for it (a run followed: it comes every moment). */
  quiet?: boolean
}

export interface LookAction {
  label: string
  title?: string
  disabled?: boolean
  onSelect(): void
}

/** What the views draw: the design, or the look. */
export interface Shown {
  project: Project
  derived: Derived
}

export const useLook = create<{ look: (Look & { derived: Derived }) | null }>()(() => ({ look: null }))

/** Shows a project in the viewport, read only. The same project again only changes the bar (no new derive). */
export function showLook(l: Look) {
  const was = useLook.getState().look
  // Brief and Rules, windows over the viewport, hide it: a run's quiet look waits there (every step draws the plan,
  // Decision "Site with the viewport")
  if (l.quiet && useUi.getState().dialog) {
    if (was?.owner === l.owner) useLook.setState({ look: null })
    return
  }
  const derived = was?.project === l.project && was.option === l.option ? was.derived : engine.derive(l.project, l.option)
  const app = useApp.getState()
  if (app.option !== l.option) app.setOption(l.option)
  // nothing selected: a key (Delete, the arrows) would edit the design under it
  if (app.selection.massIds.length) app.select(null)
  if (useTool.getState().tool !== 'select') letGo()
  useUi.getState().closeDialog()
  useLook.setState({ look: { ...l, derived } })
}

/** Back to the design: its owner's (`owner` given: only its own look) or the bar's (its owner is told). */
export function endLook(owner?: string) {
  const look = useLook.getState().look
  if (!look || (owner !== undefined && look.owner !== owner)) return
  useLook.setState({ look: null })
  if (owner === undefined) look.onEnd?.()
}

/** The design or the look, picked from as the store is: `useShown((s) => s.derived.masses)`. */
/**
 * A project drawn in one place only (Phase S.3: a Compare pane draws its option with the plan's own layers): the layers
 * under it read it instead of the design or the look.
 */
const ShownHere = createContext<Shown | null>(null)
export const ShownProvider = ShownHere.Provider

export function useShown<T>(pick: (s: Shown) => T): T {
  const here = useContext(ShownHere)
  const look = useLook((s) => s.look)
  const design = useApp((s) => pick(s))
  return here ? pick(here) : look ? pick(look) : design
}

export const useLooking = () => useLook((s) => s.look !== null)

/** Only a plugin's own data changed (and the decision log, which says so): the design did not. */
function onlyPlugins(a: Project, b: Project): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const k of keys) if (k !== 'plugins' && k !== 'log' && a[k as keyof Project] !== b[k as keyof Project]) return false
  return true
}

// an edit, another option, another project: back to the design
useApp.subscribe((s, before) => {
  if (!useLook.getState().look) return
  if (s.option !== before.option || s.opened !== before.opened || (s.project !== before.project && !onlyPlugins(before.project, s.project))) endLook()
})
// a drawing tool: it draws on the design; a step whose viewport draws no masses
useTool.subscribe((s) => {
  if (useLook.getState().look && s.tool !== 'select') endLook()
})
useUi.subscribe((s, before) => {
  const look = useLook.getState().look
  if (!look || s.dialog === null || before.dialog !== null) return
  if (look.quiet) useLook.setState({ look: null })
  else endLook()
})
