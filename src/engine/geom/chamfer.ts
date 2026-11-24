// The chamfer (Phase D.1, Decision "Chamfer"): a corner cut by a straight line between two ends, each set back along its own wall.
// It is kept on the corner, as the radius is: `Vertex.chamfer = [a, b]`, a m along the incoming wall and b m along the outgoing one.
// The vertex stays where the two walls meet, so a wall pushed keeps its chamfer and "its ends movable along its edges" are a and b.
// A corner has a chamfer or a radius, never both (the edits in `edit.ts` take the other away: `setChamfer`, `setCornerRadius`);
// set-backs and radii share each wall's length and shrink in proportion when they no longer fit (`effectiveSetbacks`).
// Pure: this file holds what only a chamfer reads; the edit that sets one is `setChamfer` in `edit.ts`, which checks the whole shape.
import type { Contour, Point } from '../../model/schema.ts'
import { chamferOf, cornerCut, effectiveSetbacks, freeAlong } from './contour.ts'

/** What fits at corner i along its incoming and its outgoing wall (m), next to its neighbours' radii and chamfers; [0, 0] next to an arc edge. */
export function maxChamfer(c: Contour, i: number): [number, number] {
  return freeAlong(c, ((i % c.vertices.length) + c.vertices.length) % c.vertices.length)
}

/** The two points a chamfer cuts at: on the incoming wall and on the outgoing wall, as drawn; null when the corner has no chamfer. */
export function chamferEnds(c: Contour, i: number): { p1: Point; p2: Point } | null {
  return cornerCut(c, i)
}

/**
 * Chamfers that no longer fit shrink to what does, in proportion (two corners that share a wall share its length with their
 * radii too), a note saying so, as `fitRadii` does for a radius. A chamfer reduced to nothing goes.
 */
export function fitChamfers(c: Contour): { contour: Contour; notes: string[] } {
  const { inn, out } = effectiveSetbacks(c)
  const notes: string[] = []
  const vertices = c.vertices.map((v, i) => {
    const k = chamferOf(c, i)
    if (!k || (inn[i] >= k[0] - 1e-9 && out[i] >= k[1] - 1e-9)) return v
    const { chamfer: _, ...rest } = v
    if (inn[i] <= 1e-9 && out[i] <= 1e-9) {
      notes.push(`chamfer removed at corner ${i + 1}`)
      return rest
    }
    notes.push(`chamfer reduced to ${inn[i].toFixed(2)} × ${out[i].toFixed(2)} m at corner ${i + 1}`)
    return { ...rest, chamfer: [inn[i], out[i]] as [number, number] }
  })
  return { contour: notes.length ? { ...c, vertices } : c, notes }
}
