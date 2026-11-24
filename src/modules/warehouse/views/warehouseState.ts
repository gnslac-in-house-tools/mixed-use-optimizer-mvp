// The Program window's own state (Decisions "Warehouse layout", "Program rule set layout"), per browser, never in the
// Project: the program picked (or a type picked, its program; absent or gone: the first program with a warehouse type,
// else the brief's first), the step shown under its row (absent: the open one), the plan's tool and what is picked on
// it (Decision "Warehouse by hand"; several since BE.9, Decision "Multi-selection").
import { useMemo } from 'react'
import { create } from 'zustand'
import type { Id, Program, Project, WarehouseStep, WarehouseType } from '../../../model/schema.ts'
import { definitionOf } from '../../../engine/programs.ts'
import { generate, type Generated } from '../engine/generate.ts'
import { openStep } from '../engine/steps.ts'
import { useApp } from '../../../state/store.ts'

/** The plan's tools (Decisions "Warehouse by hand", "Block shape"): pick and drag; split a zone; draw a hole; put or
 *  take an element on a wall's module (or a bay's, pressed outside); a wall's truck court (BE.4). */
export type WarehouseTool = 'select' | 'split' | 'hole' | 'dock' | 'door' | 'pattern' | 'court'

/**
 * What is picked on the plan: a zone, an edge of the outline (its row lit in Shape), a hole, an element (its row lit in
 * Elements, slid along its wall), a truck court (by its edge's id); or a stretch of an edge (a double click on it: the
 * bay pressed, from module line `from` to `to` along it), to pull out or push in; or a column line by its bubble
 * (Decision "Grid by line": `line` along `axis`, 0 the first; `id` the two together), to move or delete. Several at
 * once (Decision "Multi-selection", BE.9): a window, a crossing, Shift + click.
 */
export type Picked =
  | { kind: 'zone' | 'edge' | 'hole' | 'element' | 'court'; id: Id }
  | { kind: 'stretch'; id: Id; from: number; to: number }
  | { kind: 'line'; id: string; axis: 'x' | 'y'; line: number }

/** The same thing picked: its kind and its id. */
export const samePick = (a: Picked, b: Picked): boolean => a.kind === b.kind && a.id === b.id

/** `list` with `p` added, or taken away when it was there (Shift + click). */
export const toggled = (list: readonly Picked[], p: Picked): Picked[] => (list.some((x) => samePick(x, p)) ? list.filter((x) => !samePick(x, p)) : [...list, p])

/** `list` and those of `more` not in it (Shift + a window). */
export const joined = (list: readonly Picked[], more: readonly Picked[]): Picked[] => [...list, ...more.filter((p) => !list.some((x) => samePick(x, p)))]

interface WarehouseView {
  programId: Id | null
  typeId: Id | null
  /** The step whose fields show; null: the open one. */
  shown: WarehouseStep | null
  tool: WarehouseTool
  /** What is picked on the plan, in the order picked; none: []. */
  picked: Picked[]
  /** A warehouse type, the window on its program. */
  pick(typeId: Id | null): void
  pickProgram(programId: Id | null): void
  show(step: WarehouseStep | null): void
  setTool(tool: WarehouseTool): void
  setPicked(picked: Picked[]): void
  /** One added, or taken away when it was picked (Shift + click). */
  togglePicked(picked: Picked): void
}

export const useWarehouse = create<WarehouseView>()((set) => ({
  programId: null,
  typeId: null,
  shown: null,
  tool: 'select',
  picked: [],
  pick: (typeId) => set({ typeId, programId: null, shown: null, picked: [] }),
  pickProgram: (programId) => set({ programId, typeId: null, shown: null, picked: [], tool: 'select' }),
  show: (shown) => set({ shown }),
  setTool: (tool) => set({ tool }),
  setPicked: (picked) => set({ picked }),
  togglePicked: (p) => set((s) => ({ picked: toggled(s.picked, p) })),
}))

/** The program the window shows: the one picked, else the picked type's, else the first with a type, else the first. */
export function currentProgram(p: Project, s: Pick<WarehouseView, 'programId' | 'typeId'>): Program | null {
  const find = (id: Id | null | undefined) => (id ? p.programs.find((g) => g.id === id) : undefined)
  const types = p.warehouseTypes ?? []
  return find(s.programId) ?? find(types.find((t) => t.id === s.typeId)?.program) ?? find(types.find((t) => find(t.program))?.program) ?? p.programs[0] ?? null
}

export function useCurrentProgram(): Program | null {
  const programId = useWarehouse((s) => s.programId)
  const typeId = useWarehouse((s) => s.typeId)
  return useApp((s) => currentProgram(s.project, { programId, typeId }))
}

/** The type the window shows: the one picked (even on no program), else its program's; null with none. */
export function currentType(p: Project, s: Pick<WarehouseView, 'programId' | 'typeId'>): WarehouseType | null {
  const picked = s.programId === null ? p.warehouseTypes?.find((t) => t.id === s.typeId) : undefined
  if (picked) return picked
  const g = currentProgram(p, s)
  // a type on no program (none of its program's left): the first, while no program is picked
  return (g && definitionOf(p, g.id)) ?? (s.programId === null ? p.warehouseTypes?.find((t) => t.program === null) : undefined) ?? null
}

export function useCurrentType(): WarehouseType | null {
  const programId = useWarehouse((s) => s.programId)
  const typeId = useWarehouse((s) => s.typeId)
  return useApp((s) => currentType(s.project, { programId, typeId }))
}

/** The step whose fields show: the one picked, else the open one (all locked: the last). */
export function useShownStep(t: WarehouseType | null): WarehouseStep | null {
  const shown = useWarehouse((s) => s.shown)
  if (!t) return null
  return shown ?? openStep(t) ?? 'elements'
}

/** What the type makes, made again only when it changes. */
export function useGenerated(t: WarehouseType | null): Generated | null {
  return useMemo(() => (t ? generate(t) : null), [t])
}
