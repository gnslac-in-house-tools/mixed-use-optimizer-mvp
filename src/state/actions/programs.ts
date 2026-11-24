// The programs' verbs (Decision "Brief"): the Brief workspace adds, renames, reorders (Decision "Program order") and
// removes programs, and sets their target and the size a new mass of them starts with; *Update brief* makes the
// brief's counts the design's (Decision "Brief sync"). Pure, Project → Project, like every action. A program is a
// rule set (Decision "Program rule set"): a Warehouse program's warehouse type comes with it when it is copied or
// removed, and goes when it stops being a warehouse (setProgramKind).
import type { Id, Program, ProgramKind, ProgramTarget, Project, WarehouseType } from '../../model/schema.ts'
import { BUILDING_COLORS, freeColor } from '../../model/buildingColors.ts'
import { whyKeepProgram } from '../../engine/brief.ts'
import { derive } from '../../engine/derive.ts'
import { definitionOf, kindOf } from '../../engine/programs.ts'
import { copyName, newId } from './masses.ts'
import { copyWarehouseType, removeWarehouseType, setWarehouseFigures } from '../../modules/warehouse/actions.ts'

/** Changes some fields of a program (not its id). */
export function updateProgram(p: Project, id: Id, patch: Partial<Omit<Program, 'id'>>): Project {
  if (!p.programs.some((g) => g.id === id)) return p
  return { ...p, programs: p.programs.map((g) => (g.id === id ? { ...g, ...patch } : g)) }
}

/**
 * Moves a program to position `to` in the brief (the Brief's rows, the Summary and the legends follow its
 * order). Out of range or where it is: nothing changes.
 */
export function moveProgram(p: Project, id: Id, to: number): Project {
  const from = p.programs.findIndex((g) => g.id === id)
  if (from < 0 || to < 0 || to >= p.programs.length || from === to) return p
  const programs = p.programs.slice()
  const [g] = programs.splice(from, 1)
  programs.splice(to, 0, g)
  return { ...p, programs }
}

/** Sets part of a program's target; with neither an area nor a count left, it has none. */
export function setProgramTarget(p: Project, id: Id, patch: Partial<ProgramTarget>): Project {
  const g = p.programs.find((x) => x.id === id)
  if (!g) return p
  const target: ProgramTarget = { area: null, count: null, ...g.target, ...patch }
  if (target.area === (g.target?.area ?? null) && target.count === (g.target?.count ?? null)) return p
  const next: Program = { ...g, target }
  if (target.area === null && target.count === null) delete next.target
  return { ...p, programs: p.programs.map((x) => (x.id === id ? next : x)) }
}

/** Adds a program, built, named "Program <n>", in the first palette colour no other program has. Returns its id. */
export function addProgram(p: Project, init: { name?: string; built?: boolean } = {}): { project: Project; id: Id } {
  const id = newId('p', p.programs.map((g) => g.id))
  const names = new Set(p.programs.map((g) => g.name))
  let n = 1
  while (names.has(`Program ${n}`)) n++
  const color = freeColor(p.programs, BUILDING_COLORS[p.programs.length % BUILDING_COLORS.length])
  const program: Program = { id, name: init.name ?? `Program ${n}`, color, built: init.built ?? true }
  return { project: { ...p, programs: [...p.programs, program] }, id }
}

/**
 * A copy of a program (Decision "Alt+drag copies": a Brief row or a Rules bubble Alt+dragged): its target, docks, size
 * and the rest, named "<program> copy", in the first palette colour no other program has; at `to` in the brief (absent:
 * just after it); a Warehouse program's warehouse type copied onto it. Neither its masses nor its rules come with it.
 * Null when it is not there.
 */
export function copyProgram(p: Project, id: Id, to?: number): { project: Project; id: Id } | null {
  const from = p.programs.findIndex((g) => g.id === id)
  if (from < 0) return null
  const source = p.programs[from]
  const nid = newId('p', p.programs.map((g) => g.id))
  const copy: Program = { ...structuredClone(source), id: nid, name: copyName(p.programs.map((g) => g.name), source.name), color: freeColor(p.programs, source.color) }
  const programs = p.programs.slice()
  programs.splice(Math.max(0, Math.min(to ?? from + 1, programs.length)), 0, copy)
  const q: Project = { ...p, programs }
  const t = definitionOf(p, id)
  return { project: t ? (copyWarehouseType(q, t.id, nid)?.project ?? q) : q, id: nid }
}

/**
 * Removes a program and the brief's rules about it. One that masses use stays (nothing changes), unless `withMasses`
 * (Decision "Program menu": after a confirmation): then its masses go too, in every option. Its warehouse type goes
 * with it (its copies' other masses stay, unlinked).
 */
export function removeProgram(p: Project, id: Id, withMasses = false): Project {
  if (!p.programs.some((g) => g.id === id) || (!withMasses && whyKeepProgram(p, id) !== null)) return p
  const t = definitionOf(p, id)
  const q = t ? removeWarehouseType(p, t.id) : p
  const next: Project = { ...q, programs: q.programs.filter((g) => g.id !== id), masses: q.masses.filter((m) => m.programId !== id) }
  if (p.rules) {
    const rules = p.rules.filter((r) => r.a !== id && r.b !== id)
    if (rules.length) next.rules = rules
    else delete next.rules
  }
  return next
}

/**
 * What a program is (Decision "Program rule set"): a warehouse, an office or free. One that stops being a warehouse
 * loses its warehouse type (its copies stay as the masses they are, unlinked); one that becomes a warehouse gets its
 * type when the Program editor first opens it (modules/warehouse/actions.ts addWarehouseType).
 */
export function setProgramKind(p: Project, id: Id, kind: ProgramKind): Project {
  const g = p.programs.find((x) => x.id === id)
  if (!g || kindOf(g) === kind) return p
  const t = kind !== 'warehouse' ? definitionOf(p, id) : undefined
  const q = t ? removeWarehouseType(p, t.id) : p
  return { ...q, programs: q.programs.map((x) => (x.id === id ? { ...x, kind } : x)) }
}

/** A range of two sides, low to high (null: none). */
type Ranges = { width?: [number, number]; depth?: [number, number] }

/** Drops a field set to undefined (an emptied grid or range). */
function withField<K extends 'grid' | 'range' | 'demand'>(g: Program, key: K, value: Program[K] | undefined): Program {
  const next = { ...g, [key]: value }
  if (value === undefined) delete next[key]
  return next
}

/**
 * A program's grid (Decision "Program rule set"): a Warehouse program's is its type's (its Grid step, reopened if it
 * was locked), any other's its own; null: none (a type's always has one).
 */
export function setProgramGrid(p: Project, id: Id, grid: WarehouseType['grid'] | null): Project {
  const g = p.programs.find((x) => x.id === id)
  const ok = (n: number, int = false) => Number.isFinite(n) && n > 0 && (!int || Number.isInteger(n))
  if (!g || (grid && !(ok(grid.x) && ok(grid.y) && ok(grid.modules, true)))) return p
  const t = definitionOf(p, id)
  if (t) return grid ? setWarehouseFigures(p, t.id, 'grid', grid) : p
  if (JSON.stringify(g.grid ?? null) === JSON.stringify(grid)) return p
  return { ...p, programs: p.programs.map((x) => (x.id === id ? withField(x, 'grid', grid ?? undefined) : x)) }
}

/**
 * The sizes its masses may take, width (the long side) and depth, each low to high: a Warehouse program's are its
 * type's hall's length and width (its Hall step), any other's its own; a side left out has none.
 */
export function setProgramRange(p: Project, id: Id, range: Ranges | null): Project {
  const g = p.programs.find((x) => x.id === id)
  if (!g) return p
  const sides = (['width', 'depth'] as const).filter((k) => range?.[k] && range[k]![0] > 0 && range[k]![1] >= range[k]![0])
  const clean: Ranges | undefined = sides.length ? Object.fromEntries(sides.map((k) => [k, range![k]])) : undefined
  const t = definitionOf(p, id)
  if (t) {
    const hall = clean && { ...(clean.width && { length: clean.width }), ...(clean.depth && { width: clean.depth }) }
    return setWarehouseFigures(p, t.id, 'hall', { range: hall })
  }
  if (JSON.stringify(g.range ?? null) === JSON.stringify(clean ?? null)) return p
  return { ...p, programs: p.programs.map((x) => (x.id === id ? withField(x, 'range', clean) : x)) }
}

/** A Warehouse program's hall, its length and width in m (its type's Hall step); a program without a type: none. */
export function setProgramHall(p: Project, id: Id, size: { length?: number; width?: number }): Project {
  const t = definitionOf(p, id)
  if (!t || Object.values(size).some((v) => !(Number.isFinite(v) && v! > 0))) return p
  return setWarehouseFigures(p, t.id, 'hall', size)
}

/**
 * What it asks of the parking (Phase K.4, the Brief's Circulation tab): a car stall per so many m² of its floor, so many
 * trailer stalls per dock door of its masses. A null or a figure not over 0 clears that one.
 */
export function setProgramDemand(p: Project, id: Id, patch: { carStalls?: number | null; trailerStalls?: number | null }): Project {
  const g = p.programs.find((x) => x.id === id)
  if (!g) return p
  const next: NonNullable<Program['demand']> = { ...g.demand }
  for (const k of ['carStalls', 'trailerStalls'] as const) {
    if (!(k in patch)) continue
    const v = patch[k]
    if (v !== null && v !== undefined && Number.isFinite(v) && v > 0) next[k] = v
    else delete next[k]
  }
  if (JSON.stringify(g.demand ?? {}) === JSON.stringify(next)) return p
  return { ...p, programs: p.programs.map((x) => (x.id === id ? withField(x, 'demand', Object.keys(next).length ? next : undefined) : x)) }
}

/**
 * *Update brief* (Decision "Brief sync"): the brief follows the design. Each program asks for as many masses as the
 * option has (a program drawn freely joins the count; one with none left stops being counted); target areas and sizes
 * stay. One undo step; the same project when they already agree. `programId`: that program's alone (an issue's
 * *Update brief*, Decision "Issues, one list").
 */
export function updateBriefFromDesign(p: Project, optionId: Id, programId?: Id): Project {
  const counts = derive(p, optionId).metrics.massesByProgram
  return p.programs.reduce((q, g) => {
    if (programId !== undefined && g.id !== programId) return q
    const has = counts[g.id] ?? 0
    const asks = g.target?.count ?? null
    if (asks === null ? has === 0 : asks === has) return q
    return setProgramTarget(q, g.id, { count: has > 0 ? has : null })
  }, p)
}
