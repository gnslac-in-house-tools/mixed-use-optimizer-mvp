// Cuántos pisos tiene un edificio de cada uso, leído del resultado de GFit: pisos distintos (por su cota), no uno por
// masa (dos masas de comercio en el mismo piso son un nivel de comercio). Puro.
import type { Derivado } from './derivar.ts'

export function nivelesPorUso(d: Pick<Derivado, 'niveles'>): { vivienda: number; lobby: number; comercio: number } {
  const pisos = (f: (l: Derivado['niveles'][number]) => boolean) => new Set(d.niveles.filter(f).map((l) => Math.round(l.z * 100))).size
  return {
    vivienda: pisos((l) => l.prog === 'res' && !l.lobby),
    lobby: pisos((l) => !!l.lobby),
    comercio: pisos((l) => l.prog === 'ret'),
  }
}
