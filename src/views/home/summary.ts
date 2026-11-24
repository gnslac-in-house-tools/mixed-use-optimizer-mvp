// What Home's summary shows of a project (Decision "Home"): each option's plan, a few figures, its issues; the site's
// size and the fall of its ground. Measured when the project is kept (saving.ts keep(), io/library.ts stores it), from
// the Derived the store already has: every option's figures are in it (as the compare table reads them), so keeping
// measures nothing again and Home reads no project to list them.
import type { Id, Point, Project } from '../../model/schema.ts'
import type { Derived } from '../../engine/types.ts'
import { asOption } from '../../engine/derive.ts'
import { contourToPolygon } from '../../engine/geom/contour.ts'
import type { Summary, SummaryFigure } from '../../io/library.ts'
import { readKpi } from '../../modules/catalog.ts'
import { surfaceOf } from '../../modules/terrain/engine/surface.ts'
import { projectThumb } from './thumb.ts'

/** The figures the summary shows, in order (those a project does not have, a module off, are left out). */
export const SUMMARY_KPIS = ['built-footprint', 'coverage', 'gfa', 'dock-doors', 'cut', 'fill']

/** How many points the ground's profile has, and how many issues an option keeps. */
const PROFILE = 24
const ISSUES = 4

const round = (v: number, step: number) => Math.round(v / step) * step

/** The ground along the site's long axis, through its middle; and its fall over the boundary and that line. */
function ground(p: Project, site: Point[]): { profile: number[]; fall: number | null } {
  const surface = p.site.terrain ? surfaceOf(p.site.terrain) : null
  if (!surface) return { profile: [], fall: null }
  const xs = site.map((v) => v.x)
  const ys = site.map((v) => v.y)
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const along = x1 - x0 >= y1 - y0
  const line: Point[] = Array.from({ length: PROFILE }, (_, i) => {
    const t = 0.02 + (0.96 * i) / (PROFILE - 1)
    return along ? { x: x0 + t * (x1 - x0), y: (y0 + y1) / 2 } : { x: (x0 + x1) / 2, y: y0 + t * (y1 - y0) }
  })
  const heights = (pts: Point[]) => pts.flatMap((v) => surface.elevation(v) ?? [])
  const profile = heights(line).map((z) => round(z, 0.1))
  const all = [...heights(site), ...profile]
  return { profile, fall: all.length ? round(Math.max(...all) - Math.min(...all), 1) : null }
}

/** The summary of `p` from its Derived (any option's: it holds them all). */
export function summarize(p: Project, d: Derived): Summary {
  const site = p.site.boundary ? contourToPolygon(p.site.boundary) : null
  const area = readKpi('site-area', p, d)?.value ?? null
  const { profile, fall } = site ? ground(p, site) : { profile: [], fall: null }
  return {
    hectares: site && area !== null ? round(area / 10_000, 0.1) : null,
    fall,
    profile,
    options: p.options.map((o) => {
      const od = asOption(d, o.id)
      const figures = SUMMARY_KPIS.flatMap((id): SummaryFigure[] => {
        const k = readKpi(id, p, od)
        return k && k.value !== null ? [{ id: k.id, label: k.label, unit: k.unit, value: k.value, limit: k.limit }] : []
      })
      const thumb = projectThumb(p, o.id)
      return {
        id: o.id,
        name: o.name,
        ...(thumb ? { thumb } : {}),
        figures,
        errors: od.issues.filter((i) => i.severity === 'error').length,
        warnings: od.issues.filter((i) => i.severity === 'warning').length,
        issues: od.issues.slice(0, ISSUES).map((i) => i.message),
      }
    }),
  }
}

/** The option a summary opens on: the one in view when it was kept, else the first. */
export const optionShown = (s: Summary, option: Id | undefined) => s.options.find((o) => o.id === option) ?? s.options[0]
