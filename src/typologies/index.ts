// The typology registry. Adding a typology (retail, residential…) = adding a file and listing it here.
import { buildingColor } from '../model/buildingColors.ts'
import { DEFAULT_GRID_SIZE, withGrid } from '../engine/grid/index.ts'
import { PROJECT_VERSION, type Project } from '../model/schema.ts'
import { uuid } from '../model/uuid.ts'
import { blank } from './blank.ts'
import { industrial } from './industrial.ts'
import { mixedUse } from './mixedUse.ts'
import type { Typology } from './types.ts'

export type { Typology } from './types.ts'

export const TYPOLOGIES: Typology[] = [industrial, mixedUse, blank]

/** A new structural grid's bays and modules for a project's typology (Decision "Structural grid"). */
export function gridSizeOf(typologyId: string): { x: number; y: number; modules: number } {
  return TYPOLOGIES.find((t) => t.id === typologyId)?.grid ?? DEFAULT_GRID_SIZE
}

/**
 * The project with its structural grid (Decision "Grid always": every project has one): a project without one gets
 * one of its typology's size fitted to its site. Where a project comes into the app: `newProject` (the demo too) and
 * every file read (io/gft.ts: a .gft, the browser's copy); no verb takes it away (`setGrid` takes a grid). Here, where
 * the typology's size is known (the engine reads no typology).
 */
export const ensureGrid = (p: Project): Project => withGrid(p, gridSizeOf(p.typology))

/** A new project's id (Decision "Project id"): made once, never derived from what it holds. */
export const newProjectId = () => `p-${uuid()}`

/**
 * A new, empty project from a typology template. Programs and rules are copied, so editing them never touches the
 * template. It starts with *Building 1* (one level, L1) inside *Option 1* (Decision "Buildings and options"), and with
 * its typology's grid at the plan's origin (Decision "Grid always"; a site fits it: `setBoundary`).
 */
export function newProject(typologyId: string, name = 'Untitled'): Project {
  const t = TYPOLOGIES.find((x) => x.id === typologyId)
  if (!t) throw new Error(`Unknown typology: ${typologyId}`)
  return ensureGrid({
    version: PROJECT_VERSION,
    id: newProjectId(),
    name,
    typology: t.id,
    site: { boundary: null, rules: structuredClone(t.siteRules) },
    programs: structuredClone(t.programs),
    buildings: [
      {
        id: 'b1',
        name: 'Building 1',
        color: buildingColor(0),
        levelHeight: t.levelHeight,
        levels: [{ id: 'l1', name: 'L1', elevation: 0, height: t.levelHeight, repeat: 1 }],
      },
    ],
    options: [{ id: 'o1', name: 'Option 1', buildingIds: ['b1'] }],
    masses: [],
    kpis: [...t.kpis],
    ...(t.rules?.length ? { rules: structuredClone(t.rules) } : {}),
    ...(t.standards ? { standards: structuredClone(t.standards) } : {}),
    ...(t.extra ? t.extra(t.programs) : {}), // mixed-use-mvp
  })
}
