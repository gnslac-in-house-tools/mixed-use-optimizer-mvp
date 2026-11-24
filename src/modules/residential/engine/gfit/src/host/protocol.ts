import type { SharePackage } from '../share/types.ts'
// Bridge protocol v1 (spec §5.1). C# mirrors these shapes in plugin/Bridge.cs; change both together.
export type Pt = [number, number]
export type Ring = Pt[]

export interface GeomObj {
  id: string
  kind: 'curve' | 'brep' | 'other'
  name: string
  layer: string
  closed: boolean
  planar: boolean
  z: number
  /** curves: one ring; breps: outline at min z (context use) */
  rings: Ring[]
  bbox: [number, number, number, number, number, number]
}

export type Role = 'footprint' | 'core' | 'parking' | 'mass' | 'setback' | 'ctx' | 'site'

/** how the Rhino preview draws the scene (the 3D bar above Inputs) */
export type View3D = 'solid' | 'ghost' | 'detail' | 'off'
export const VIEWS: View3D[] = ['solid', 'ghost', 'detail', 'off']
/** one plate. `hot`: the level Detail draws in full (preview only); `prog`: its program's name (the Bake sublayer); `name`: its level, e.g. L01 */
export interface SceneLevel { z: number; h: number; rings: Ring[]; color: string; hot?: boolean; prog?: string; name?: string }
export interface SceneBuilding {
  id: string
  name: string
  color: string
  levels: SceneLevel[]
  cores: { rings: Ring[]; z0: number; z1: number }[]
  /** `arrows`: flow arrows on the aisles (closed rings), drawn and baked with the stalls */
  basements: { z: number; h: number; rings: Ring[]; stalls: Ring[]; arrows?: Ring[] }[]
}
/** one unit's plan; `type` is the unit type's name (its Bake sublayer), `name` reads "L02 · 1BR · 58 m²" */
/** `h`: the level's height, so the preview can draw the unit as a block */
export interface SceneUnit { b: string; z: number; rings: Ring[]; color: string; type: string; name: string; h?: number }
/** one room's outline, named "L02-03 Living" (Bake, and the Detail level of the preview) */
export interface SceneRoom { b: string; z: number; rings: Ring[]; name: string }
export interface Scene { buildings: SceneBuilding[]; units?: SceneUnit[]; rooms?: SceneRoom[]; view?: View3D }

export type HostMsg =
  | { t: 'hello'; version: string; rhino: string; dark: boolean; units: string; docName: string }
  /** doc: Rhino's runtime serial of the document the state belongs to */
  | { t: 'state'; json: string | null; doc?: number }
  | { t: 'geom'; objs: GeomObj[] }
  | { t: 'gone'; ids: string[] }
  | { t: 'picked'; req: string; objs: GeomObj[] }
  | { t: 'picked'; req: string; cancel: true; reason?: string }
  | { t: 'sections'; req: string; plates: { z: number; rings: Ring[] }[] }
  | { t: 'theme'; dark: boolean }
  | { t: 'update'; version: string; notes: string }
  | { t: 'relay'; from: string; msg: unknown }
  | { t: 'toast'; text: string }
  /** answer to publish: the encrypted files are on the gfit-viewer datos branch */
  | { t: 'published'; req: string; ok: boolean; error?: string }

export type PanelMsg =
  | { t: 'ready' }
  | { t: 'watch'; ids: string[] }
  | { t: 'pick'; req: string; role: Role; multiple: boolean }
  | { t: 'select'; ids: string[] }
  /** select every closed solid in the document whose id is not in `exclude` (Select solids not in <Option>) */
  | { t: 'selectSolids'; exclude: string[] }
  | { t: 'preview'; scene: Scene; doc?: number }
  | { t: 'slice'; req: string; id: string; elevations: number[] }
  | { t: 'bake'; scene: Scene; option: string }
  /** doc: echoed from the last state; the host drops messages for a document that is no longer open */
  | { t: 'save'; json: string; doc?: number }
  | { t: 'openWindow'; view: string; title: string; w: number; h: number }
  | { t: 'broadcast'; msg: unknown }
  | { t: 'relay'; msg: unknown }
  | { t: 'saveFile'; name: string; content: string }
  | { t: 'openUrl'; url: string }
  | { t: 'update'; action: 'install' | 'later' }
  /** encrypted share files only; the key stays in the panel */
  | { t: 'publish'; req: string; files: { path: string; b64: string }[] }
  /** the package for the Preview window (not published) */
  | { t: 'viewer'; pkg: SharePackage }
