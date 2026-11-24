// Uso mixto (MVP de uso mixto, pieza 1): vivienda sobre un podio de comercio, con sus núcleos. El módulo residencial
// deriva de sus masas los niveles, las plantas tipo y los departamentos con el motor de GFit.
import { RESIDENTIAL0 } from '../modules/residential/engine/defaults.ts'
import type { Typology } from './types.ts'

const VIVIENDA = 'vivienda'
const COMERCIO = 'comercio'
const NUCLEO = 'nucleo'

export const mixedUse: Typology = {
  id: 'mixed-use',
  name: 'Uso mixto',
  description: 'Vivienda y comercio: niveles, plantas tipo y departamentos sobre la retícula.',
  // colores: PROGRAM_COLORS de mixed-use-optimizer (ui/marca.ts); una masa nueva cae en crujías y módulos de la retícula
  programs: [
    { id: VIVIENDA, name: 'Vivienda', color: '#B5DBB6', built: true, size: { width: 32.4, depth: 16.2 } },
    { id: COMERCIO, name: 'Comercio', color: '#B9A3DC', built: true, size: { width: 32.4, depth: 16.2 } },
    { id: NUCLEO, name: 'Núcleo', color: '#8C8C8C', built: true, size: { width: 8.1, depth: 5.4 } },
  ],
  // PROVISIONAL: la ocupación del proyecto demo de mixed-use-optimizer (cov 60 %). Su índice (5) y su altura (100 m) no
  // caben en las reglas de sitio de GIM
  siteRules: { setback: 0, maxCoverage: 0.6 },
  // los KPIs del módulo residencial (modules/residential/kpis.ts)
  kpis: ['res-gfa', 'res-vendible', 'res-unidades', 'res-cajones', 'res-margen'],
  levelHeight: 3.0,
  modules: ['residential'],
  // crujías de 8.1 m en 3 módulos de 2.7 m: el ancho de un cajón
  grid: { x: 8.1, y: 8.1, modules: 3 },
  // el optimizador queda fuera de esta pieza: sin plantillas ni etapas
  plugins: { optimizer: { templates: [], stages: [] } },
  extra: () => ({ residential: RESIDENTIAL0({ vivienda: VIVIENDA, comercio: COMERCIO, nucleo: NUCLEO }) }),
}
