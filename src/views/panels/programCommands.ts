// What the Brief's rows, the Program window and the plan's menu do to a program (Decisions "Brief steppers" and "Program menu"). Each goes
// through store.apply (one undo step) with a verb of the actions.
//   deleteProgram the program, its rules and, after a confirmation, its masses
//   copyProgram   Alt+drag of a Brief row or a Rules bubble (Decision "Alt+drag copies"): a program like it
//   setKind       the Brief's Kind (Decision "Program rule set"): a Warehouse program that stops being one loses its
//                 warehouse type, after a confirmation when it has one
//   editProgram   the Brief's Edit…: the Program window on it
//   assignProgramToSelection   the plan menu's *Program ▸*: every picked mass takes a program (a locked one keeps its own)
//   PROGRAM_MIME, isProgramDrag, droppedProgram   the block editor's Programs list, dragged onto a zone of its plan (a program is
//                 no longer dragged onto a mass of the site: the palette went with the Brief tab, Phase AS.3)
import type { DragEvent } from 'react'
import type { Id, Program, ProgramKind } from '../../model/schema.ts'
import { definitionOf } from '../../engine/programs.ts'
import { actions } from '../../state/actions/index.ts'
import { useApp } from '../../state/store.ts'
import { lockedAmong, tellKept } from '../layers/locks.ts'
import { useToast } from '../layout/toast.ts'
import { useUi } from '../layout/ui.ts'
import { useWarehouse } from '../../modules/warehouse/views/warehouseState.ts'

export const KIND_LABELS: Record<ProgramKind, string> = { warehouse: 'Warehouse', office: 'Office', free: 'Free' }

/** What it is; a warehouse type it loses goes after a confirmation (its copies stay, unlinked). */
export function setKind(g: Program, kind: ProgramKind) {
  const run = () => useApp.getState().apply((p) => actions.setProgramKind(p, g.id, kind))
  const p = useApp.getState().project
  const t = kind !== 'warehouse' ? definitionOf(p, g.id) : undefined
  if (!t) return run()
  const n = p.buildings.filter((b) => b.warehouse?.type === t.id).length
  const copies = n === 0 ? '' : ` Its ${n === 1 ? 'copy stays' : `${n} copies stay`} on the site as masses, unlinked.`
  useToast.getState().confirm(`${g.name} as ${KIND_LABELS[kind]}: its warehouse type ${t.name} goes.${copies}`, run)
}

/** The Program window on it (Decision "Program rule set layout"), the Brief closed. */
export function editProgram(g: Program) {
  useWarehouse.getState().pickProgram(g.id)
  useUi.getState().openDialog('program')
}

/** A copy of the program at `to` in the brief (absent: after it); a notice says what came with it. Returns its id. */
export function copyProgram(id: Id, to?: number): Id | null {
  const made: { id: Id | null } = { id: null }
  useApp.getState().apply((p) => {
    const r = actions.copyProgram(p, id, to)
    made.id = r?.id ?? null
    return r?.project ?? p
  })
  const g = useApp.getState().project.programs.find((x) => x.id === made.id)
  if (g) useToast.getState().show('info', `${g.name}: the same brief, without masses or rules yet.`)
  return g?.id ?? null
}

/** How many masses of every option use it. */
export const massesOf = (g: Program) => useApp.getState().project.masses.filter((m) => m.programId === g.id).length

export function deleteProgram(g: Program) {
  const n = massesOf(g)
  const run = () => useApp.getState().apply((p) => actions.removeProgram(p, g.id, true))
  if (n === 0) return run()
  useToast.getState().confirm(`Delete ${g.name} and its ${n === 1 ? 'mass' : `${n} masses`}? Its rules go too.`, run)
}

/** The drag's data type of a program: the block editor's plan accepts it when dropped on a zone. */
export const PROGRAM_MIME = 'application/x-gfit-program'

/**
 * Gives every selected mass a program (null: none; the plan menu's *Program ▸*): one undo step; they stay selected. The locked
 * ones keep theirs (a notice says how many); with only locked ones picked nothing changes, and the notice says why.
 */
export function assignProgramToSelection(programId: string | null): void {
  const s = useApp.getState()
  const ids = s.selection.massIds
  const locked = lockedAmong(ids)
  s.apply((p) => actions.updateMasses(p, ids, { programId }))
  tellKept(locked, 'program', ids.length - locked.length)
}

/** Is it a program drag? (While dragging, browsers show only the types, not the data.) */
export const isProgramDrag = (e: DragEvent): boolean => Array.from(e.dataTransfer?.types ?? []).includes(PROGRAM_MIME)

/** The program id a dropped program drag carries. */
export const droppedProgram = (e: DragEvent): string | null => (isProgramDrag(e) ? e.dataTransfer.getData(PROGRAM_MIME) || null : null)
