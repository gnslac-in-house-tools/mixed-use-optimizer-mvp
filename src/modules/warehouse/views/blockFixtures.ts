// A placed block's level doors and patterns in the 3D (Decision "Blocks on the site"; the user, 2026-11-10: "I don't see
// the patterns or doors in 3D"): what the site's Door and Pattern put on a copy, read as it stands on the plan
// (`copyOnPlan`), its type with its own overrides generated. Each level door a panel just out of its wall from its hall's
// floor, as tall as a level door (the block editor's); each pattern, a downpipe, a thin post on its wall as tall as its
// hall. Its docks are the docks' fixtures (Fixtures.tsx), drawn there. Pure: the scene draws what this returns.
import type { Id, Point, Project } from '../../../model/schema.ts'
import { buildingOf, optionBuildings, optionOf } from '../../../engine/buildings.ts'
import type { DerivedMass } from '../../../engine/types.ts'
import { copyGenerated, copyOnPlan, onPlace } from '../engine/copies.ts'
import { outwardOf } from '../engine/shape.ts'

/** m: a level door's height (the block editor's 3D), and how thick its panel is and how far off its wall it stands. */
export const LEVEL_DOOR_HEIGHT = 4.5
export const PANEL = { thick: 0.1, off: 0.08 }
/** m: a pattern's post (a downpipe), its side, its middle this far out of the wall's face. */
export const POST_SIDE = 0.3

/** A piece on a wall: its middle on the plan, the way out of its wall, how wide (along the wall), how tall, from where. */
export interface WallPiece {
  massId: Id
  kind: 'door' | 'pattern'
  at: Point
  out: Point
  width: number
  height: number
  z0: number
}

/**
 * The level doors and the patterns of every placed block of an option, on its hall (each hall's floor lifted by
 * `lift`, its platform's).
 */
export function blockFixturesOf(project: Project, masses: Record<Id, DerivedMass>, option: Id, lift: (massId: Id) => number): { doors: WallPiece[]; marks: WallPiece[] } {
  const inOption = new Set(optionBuildings(project, optionOf(project, option)).map((b) => b.id))
  const doors: WallPiece[] = []
  const marks: WallPiece[] = []
  for (const m of project.masses) {
    if (m.part !== 'hall') continue
    const building = buildingOf(project, m)
    const copy = building.warehouse
    const t = copy && project.warehouseTypes?.find((x) => x.id === copy.type)
    const d = masses[m.id]
    if (!copy || !t || !inOption.has(building.id) || !d) continue
    const w = copyOnPlan(t, copy, m.footprint)
    const g = copyGenerated(t, w)
    const z0 = d.span[0] + lift(m.id)
    const tall = d.span[1] - d.span[0]
    for (const el of g.doors) {
      if (el.kind === 'dock') continue
      const n = outwardOf(el.side)
      const at = onPlace(w.place, el.at)
      const tip = onPlace(w.place, { x: el.at.x + n.x, y: el.at.y + n.y })
      const out = { x: tip.x - at.x, y: tip.y - at.y }
      if (el.kind === 'door') doors.push({ massId: m.id, kind: 'door', at, out, width: el.width, height: LEVEL_DOOR_HEIGHT, z0 })
      else marks.push({ massId: m.id, kind: 'pattern', at, out, width: POST_SIDE, height: tall, z0 })
    }
  }
  return { doors, marks }
}
