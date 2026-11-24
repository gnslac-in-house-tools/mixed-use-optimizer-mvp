// The mockup's sample scene (docs/mockup, option 9) as host objects, so the panel runs without Rhino.
import type { GeomObj, Ring, Role } from './protocol.ts'

const sq = (x0: number, y0: number, x1: number, y1: number): Ring => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
export const FP_A: Ring = [[0, 0], [42, 0], [42, 18], [20, 18], [20, 40], [0, 40]]
export const FP_B = sq(58, 4, 82, 28)
export const FP_C = sq(60, 38, 76, 54)
export const CORE_A1 = sq(7, 24, 14, 32)
export const CORE_A2 = sq(28, 5, 35, 11)
export const CORE_B = sq(67, 13, 73, 19)
export const CORE_C = sq(65, 43, 71, 49)
export const PK_A = sq(-10, -4, 50, 46)
export const PK_B = sq(54, 0, 88, 33)
export const SITE = sq(-13, -8, 95, 62)
export const STATION = sq(-6, -34, 78, -20)
export const NB1 = sq(102, 6, 120, 30)
export const NB2 = sq(102, 38, 122, 58)
export const MASS_A: Ring = (() => {
  const p: Ring = []
  for (let i = 0; i < 28; i++) {
    const t = (i / 28) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t)
    p.push([21 + 21 * Math.sign(c) * Math.abs(c) ** 0.7, 20 + 19 * Math.sign(s) * Math.abs(s) ** 0.7])
  }
  return p
})()
export const MASS_H = 90

function bbox(rings: Ring[], z0: number, z1: number): GeomObj['bbox'] {
  const xs = rings.flat().map((p) => p[0]), ys = rings.flat().map((p) => p[1])
  return [Math.min(...xs), Math.min(...ys), z0, Math.max(...xs), Math.max(...ys), z1]
}
export function curve(id: string, name: string, ring: Ring, layer = 'Default'): GeomObj {
  return { id, kind: 'curve', name, layer, closed: true, planar: true, z: 0, rings: [ring], bbox: bbox([ring], 0, 0) }
}
export function brep(id: string, name: string, ring: Ring, h: number, layer = 'Default'): GeomObj {
  return { id, kind: 'brep', name, layer, closed: true, planar: false, z: 0, rings: [ring], bbox: bbox([ring], 0, h) }
}

/** What each Pick role offers, in order. */
export function samplePool(): Record<Role, GeomObj[]> {
  return {
    footprint: [curve('fp_a', 'Footprint A', FP_A), curve('fp_b', 'Footprint B', FP_B), curve('fp_c', 'Footprint C', FP_C)],
    core: [curve('core_a1', 'Core A1', CORE_A1), curve('core_a2', 'Core A2', CORE_A2), curve('core_b', 'Core B', CORE_B), curve('core_c', 'Core C', CORE_C)],
    parking: [curve('pk_a', 'Parking A', PK_A), curve('pk_b', 'Parking B', PK_B)],
    mass: [brep('mass_a', 'Mass A', MASS_A, MASS_H)],
    setback: [],
    site: [curve('site', 'Site', SITE)],
    ctx: [brep('ctx_station', 'Metro station', STATION, 9), brep('ctx_nb1', 'Office tower (existing)', NB1, 48), brep('ctx_nb2', 'Neighbour block', NB2, 21)],
  }
}
