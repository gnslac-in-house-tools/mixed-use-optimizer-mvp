// mixed-use-mvp: lo residencial de un edificio para las exportaciones (exportModel.ts lo junta, export3dm.ts lo escribe):
// lo que el módulo residencial calcula con GFit (derivar.ts), en las mismas coordenadas que las masas, en metros.
//   plantas    cada planta de GFit, de abajo arriba: su contorno, sus núcleos y sus departamentos (tipo por nombre,
//              área y recámaras), a su altura más la base del edificio
//   sotanos    un sótano por cada uno, bajo la planta más baja (cada 3.3 m): el contorno, los cajones y la huella de su
//              rampa; todos con el acomodo del sótano tipo, como los dibuja el 3D
import type { Id, Point, Project } from '../model/schema.ts'
import { derivar, ENTREPISO_SOTANO } from '../modules/residential/engine/derivar.ts'
import type { Ring, Shape } from '../modules/residential/engine/gfit/src/model/geom.ts'

export interface ModelUnidad {
  id: string
  /** el nombre de su tipo (Estudio, 1 recámara…), o su id si el proyecto no lo trae */
  tipo: string
  tipoId: string
  /** m² */
  area: number
  contorno: Point[][]
  recamaras: { nombre: string; contorno: Point[][] }[]
}

export interface ModelPlanta {
  nombre: string
  /** 'res' vivienda, 'ret' comercio */
  uso: string
  /** m: su piso */
  z: number
  /** m: de piso a piso */
  h: number
  contorno: Point[][]
  nucleos: Point[][]
  unidades: ModelUnidad[]
}

export interface ModelSotano {
  /** m: su piso */
  z: number
  contorno: Point[][]
  cajones: Point[][]
  rampa: Point[] | null
}

export interface ModelResidencial {
  buildingId: Id
  plantas: ModelPlanta[]
  sotanos: ModelSotano[]
}

const anillo = (r: Ring): Point[] => r.map(([x, y]) => ({ x, y }))
const forma = (s: Shape): Point[][] => s.filter((r) => r.length >= 3).map(anillo)

/** Lo residencial de un edificio en una opción, `base` m arriba de donde lo calcula GFit; null si no tiene. */
export function residencialDe(p: Project, buildingId: Id, optionId: Id | null | undefined, base: number): ModelResidencial | null {
  const d = derivar(p, buildingId, optionId)
  if (!d) return null
  const nombres = new Map((p.residential?.tipos ?? []).map((t) => [t.id, t.name]))
  const plantas: ModelPlanta[] = d.niveles.map((l) => ({
    nombre: l.name,
    uso: l.prog,
    z: base + l.z,
    h: l.h,
    contorno: forma(l.shape),
    nucleos: forma(l.cores),
    unidades: (l.layout?.units ?? []).map((u) => ({
      id: u.id,
      tipo: nombres.get(u.type) ?? u.type,
      tipoId: u.type,
      area: u.area,
      contorno: forma(u.shape),
      recamaras: u.rooms.map((r) => ({ nombre: r.name, contorno: forma(r.shape) })),
    })),
  }))
  const e = d.estacionamiento
  const z0 = base + (d.niveles.length ? Math.min(...d.niveles.map((l) => l.z)) : 0)
  const sotanos: ModelSotano[] = Array.from({ length: e.sotanos }, (_, k) => ({
    z: z0 - ENTREPISO_SOTANO * (k + 1),
    contorno: forma(e.plano.contorno),
    cajones: e.plano.cajones.filter((r) => r.length >= 3).map(anillo),
    rampa: e.plano.rampa ? anillo(e.plano.rampa.huella) : null,
  }))
  return { buildingId, plantas, sotanos }
}
