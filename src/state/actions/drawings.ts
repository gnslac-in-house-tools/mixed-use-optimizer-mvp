// Imported drawings moved, turned and locked (Phase DM.1, Decision "Drawings move"): a site file's reference layers
// (`Site.drawings`) and its parcels (`Site.parcels`), baked into their points like every other edit. The boundary, the
// ground and the existing roads never move with a drawing: the site is placed with *Place*.
import { isLayerLocked, parcelsLocked } from '../../model/drawings.ts'
import { LOCKED, type DrawingPart } from '../../model/picked.ts'
import type { Contour, Parcel, Point, Project, SiteDrawing } from '../../model/schema.ts'
import { rotate } from '../../engine/geom/footprint.ts'

/** What a press on a locked layer says (shared with the plan's pick: `model/picked.ts`). */
export { LOCKED }

/** What a whole drawing's move says when `n` of its layers (its parcels too) stayed where they were. */
export const stayedLocked = (n: number): string => `${n} layer${n === 1 ? '' : 's'} stayed: locked`

export interface Carried {
  project: Project
  /** What did not move, and why, for the view to say. */
  skipped: string[]
}

/** The locks' rules, one source with the plan's pick (`model/drawings.ts`). */
export { isLayerLocked, parcelsLocked }

const moveContour = (c: Contour, f: (q: Point) => Point): Contour => ({ ...c, vertices: c.vertices.map((v) => ({ ...v, ...f(v) })) })

/**
 * The parts carried by `f` (a rigid motion: the arcs of a contour keep their bulge). A part that is a whole file moves
 * its unlocked layers and its unlocked parcels, and counts the ones that stayed; a part that is a layer or the parcels
 * and is locked does not move and says to unlock it. A layer inside a whole file moves once.
 */
function carry(p: Project, parts: DrawingPart[], f: (q: Point) => Point): Carried {
  const drawings = p.site.drawings ?? []
  const whole = new Set(parts.filter((x) => x.layer === undefined && !x.parcels).map((x) => x.file))
  const layers = new Map<string, Set<string>>()
  const parcelFiles = new Set<string>()
  let stayed = 0
  let refused = false
  const take = (file: string, name: string) => layers.set(file, (layers.get(file) ?? new Set()).add(name))
  for (const file of whole) {
    for (const l of drawings.find((d) => d.file === file)?.layers ?? []) {
      if (isLayerLocked(l)) stayed++
      else take(file, l.name)
    }
    if (!(p.site.parcels ?? []).some((x) => x.file === file)) continue
    if (parcelsLocked(p.site, file)) stayed++
    else parcelFiles.add(file)
  }
  for (const part of parts) {
    if (whole.has(part.file)) continue
    if (part.layer !== undefined) {
      const l = drawings.find((d) => d.file === part.file)?.layers.find((x) => x.name === part.layer)
      if (!l) continue
      if (isLayerLocked(l)) refused = true
      else take(part.file, l.name)
    } else if (part.parcels && (p.site.parcels ?? []).some((x) => x.file === part.file)) {
      if (parcelsLocked(p.site, part.file)) refused = true
      else parcelFiles.add(part.file)
    }
  }
  const skipped = [...(stayed > 0 ? [stayedLocked(stayed)] : []), ...(refused ? [LOCKED] : [])]
  if (layers.size === 0 && parcelFiles.size === 0) return { project: p, skipped }

  const site = { ...p.site }
  if (layers.size > 0) {
    site.drawings = drawings.map((d): SiteDrawing => {
      const names = layers.get(d.file)
      if (!names) return d
      return {
        ...d,
        layers: d.layers.map((l) =>
          names.has(l.name) ? { ...l, lines: l.lines.map((ln) => ({ ...ln, points: ln.points.map(f) })) } : l,
        ),
      }
    })
  }
  if (parcelFiles.size > 0) {
    site.parcels = (p.site.parcels ?? []).map((x): Parcel => (x.file !== undefined && parcelFiles.has(x.file) && x.unlocked ? { ...x, contour: moveContour(x.contour, f) } : x))
  }
  return { project: { ...p, site }, skipped }
}

/** The parts of imported drawings moved by `d` (m): one undo step. */
export function moveDrawings(p: Project, parts: DrawingPart[], d: Point): Carried {
  // by nothing (or by what is no number) the project stays as it was
  if (!Number.isFinite(d.x) || !Number.isFinite(d.y) || (d.x === 0 && d.y === 0)) return { project: p, skipped: [] }
  return carry(p, parts, (q) => ({ x: q.x + d.x, y: q.y + d.y }))
}

/** The parts of imported drawings turned by `degrees` (counter-clockwise) about `pivot`: one undo step. */
export function turnDrawings(p: Project, parts: DrawingPart[], pivot: Point, degrees: number): Carried {
  if (!Number.isFinite(degrees) || !Number.isFinite(pivot.x) || !Number.isFinite(pivot.y) || degrees === 0) return { project: p, skipped: [] }
  return carry(p, parts, (q) => rotate(q, pivot, degrees))
}

/** A layer locked (it is not picked and does not move) or unlocked; unlocked is kept as absent. */
export function setDrawingLayerLocked(p: Project, file: string, layer: string, locked: boolean): Project {
  const d = p.site.drawings?.find((x) => x.file === file)
  const l = d?.layers.find((x) => x.name === layer)
  if (!d || !l || isLayerLocked(l) === locked) return p
  const next = (({ locked: _l, ...rest }) => (locked ? { ...rest, locked: true } : rest))(l)
  return withDrawing(p, { ...d, layers: d.layers.map((x) => (x === l ? next : x)) })
}

/** A file's parcels locked (they start so) or unlocked, all together; unlocked is written on each, locked takes it off. */
export function setParcelsLocked(p: Project, file: string, locked: boolean): Project {
  if (!(p.site.parcels ?? []).some((x) => x.file === file) || parcelsLocked(p.site, file) === locked) return p
  const parcels = p.site.parcels!.map((x): Parcel => {
    if (x.file !== file) return x
    const { unlocked: _u, ...rest } = x
    return locked ? rest : { ...rest, unlocked: true }
  })
  return { ...p, site: { ...p.site, parcels } }
}

/** A drawing's layers separated (each picked and moved on its own) or joined (one piece); joined is kept as absent. */
export function setDrawingSplit(p: Project, file: string, split: boolean): Project {
  const d = p.site.drawings?.find((x) => x.file === file)
  if (!d || (d.split === true) === split) return p
  const { split: _s, ...rest } = d
  return withDrawing(p, split ? { ...rest, split: true } : rest)
}

const withDrawing = (p: Project, d: SiteDrawing): Project => ({ ...p, site: { ...p.site, drawings: p.site.drawings!.map((x) => (x.file === d.file ? d : x)) } })
