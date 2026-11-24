// The client viewer's data (spec §9 Share). Built by the panel, gzipped and AES-GCM encrypted in the browser,
// uploaded by the plugin, decrypted by the viewer with the key in the link's #fragment. Meters, Rhino XY, z up.
import type { Ring } from '../host/protocol.ts'

export interface ShareLevel {
  name: string
  z: number
  h: number
  /** program id, e.g. 'res', 'ret', 'lobby' */
  prog: string
  color: string
  rings: Ring[]
  plateA: number
  sell: number
  units: number
}
export interface ShareType { id: string; name: string; color: string }
/** `t` indexes SharePackage.types; `name` reads "L02 · 1BR · 58 m²" */
export interface ShareUnit { z: number; rings: Ring[]; color: string; t: number; name: string }
/** a room outline on a residential level, e.g. "L02-03 Living" */
export interface ShareRoom { z: number; rings: Ring[]; name: string }
export interface ShareBuilding {
  id: string
  name: string
  color: string
  height: number
  levels: ShareLevel[]
  cores: { rings: Ring[]; z0: number; z1: number }[]
  /** `arrows`: flow arrows on the aisles (closed rings); packages shared before Layout and Flow have none */
  basements: { z: number; h: number; rings: Ring[]; stalls: Ring[]; arrows?: Ring[] }[]
  units: ShareUnit[]
  rooms: ShareRoom[]
}
export interface ShareTotals {
  gfa: number
  sellable: number
  circulation: number
  units: number
  /** per unit type, aligned with SharePackage.types */
  counts: number[]
  revenue: number
  cost: number
  /** (revenue − cost) / revenue, 0–1 */
  margin: number
  stallsRequired: number
  stallsProvided: number
  far: number | null
  coverage: number | null
  height: number
  floors: number
}
export interface ShareCheck { k: string; v: string; lim: string; ok: boolean }
export interface ShareOption { id: string; name: string; totals: ShareTotals; checks: ShareCheck[]; buildings: ShareBuilding[] }
export interface ShareContext { name: string; layer: string; rings: Ring[]; z: number; h: number }
/** v2 (GFit 0.2): unit types listed, units by type index, rooms. The viewer still opens v1 (three fixed types). */
export interface SharePackage {
  v: 2
  types: ShareType[]
  title: string
  created: string
  currency: 'USD'
  programs: { id: string; name: string; color: string }[]
  site: Ring | null
  context: ShareContext[]
  options: ShareOption[]
}
