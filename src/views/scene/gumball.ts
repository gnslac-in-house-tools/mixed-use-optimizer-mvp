// The 3D gumball (Decision "Gumball"; the user: "a gumball in 3D that moves x, y, z with the grid and the snaps"; since
// Decision "Levels follow the masses" a new height no longer asks for a level), pure: where it stands, how a drag
// snaps, and what the drag does when it ends. Along the plan: whole modules of the option's grid, along its axes (on none, whole metres);
// up and down: half metres, to the level of the building at that height (a level's floor: the same rule a level chip
// moves by). Its state while a drag lasts (the offset the masses are drawn with) is the view's, never the project's.
import { create } from 'zustand'
import type { Grid, Id, Point, Project } from '../../model/schema.ts'
import { bounds } from '../../engine/geom/polygon.ts'
import { axesOf, moduleOf } from '../../engine/grid/index.ts'
import { levelOf, massHeight } from '../../engine/levels.ts'
import type { Derived } from '../../engine/types.ts'

/** m: the step up and down. */
export const Z_STEP = 0.5

/** A move (the plan's x, y; z up) snapped: on the grid by whole modules along its axes, else by whole metres; z by Z_STEP. */
export function snapMove(d: { x: number; y: number; z: number }, grid: Grid | null): { x: number; y: number; z: number } {
  const z = Math.round(d.z / Z_STEP) * Z_STEP
  if (!grid) return { x: Math.round(d.x), y: Math.round(d.y), z }
  const { u, v } = axesOf(grid)
  const m = moduleOf(grid)
  const a = Math.round((d.x * u.x + d.y * u.y) / m.x) * m.x
  const b = Math.round((d.x * v.x + d.y * v.y) / m.y) * m.y
  return { x: u.x * a + v.x * b, y: u.y * a + v.y * b, z }
}

/** Where the gumball stands: the middle of the masses' box, on top of the tallest (the scene's lift not counted). */
export function gumballAt(p: Project, d: Pick<Derived, 'masses'>, ids: Id[]): { at: Point; top: number } | null {
  const masses = p.masses.filter((m) => ids.includes(m.id) && (d.masses[m.id]?.polygon.length ?? 0) >= 3)
  if (masses.length === 0) return null
  const b = bounds(masses.flatMap((m) => d.masses[m.id].polygon))
  const top = Math.max(...masses.map((m) => levelOf(p, m).elevation + massHeight(p, m)))
  return { at: { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }, top }
}

/** The floor a move up or down takes the masses to: their first's level's, plus the move. */
export function targetElevation(p: Project, ids: Id[], dz: number): number | null {
  const m = p.masses.find((x) => ids.includes(x.id))
  return m ? Math.round((levelOf(p, m).elevation + dz) * 1000) / 1000 : null
}

/** While a drag lasts: the masses it moves and by how much (the plan's x, y; z up), snapped. */
export const useGumball = create<{ ids: Id[]; offset: { x: number; y: number; z: number } | null; set(ids: Id[], offset: { x: number; y: number; z: number } | null): void }>()(
  (set) => ({
    ids: [],
    offset: null,
    set: (ids, offset) => set({ ids, offset }),
  }),
)
