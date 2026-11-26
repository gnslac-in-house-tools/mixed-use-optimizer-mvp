// El proyecto de referencia (spec 2026-11-26-blocks-residenciales, fase 6): el plano del compañero armado con las tres
// tipologías, piso por piso. Lo primero que abre la app (main.tsx). Se arma en código, así que siempre sale igual y no
// necesita archivo. Medidas del plano a 16.4 px/m; las barras toman el largo de sus tipologías (112.38 m).
//
//   Piso 1     comercio bajo las dos barras
//   Piso 2-3   dos barras (105·105·105·85·85·85·105·105·105) y cuatro alas de 85 en el patio
//   Piso 4     barras de 105·105·105·150 | núcleo | 150·105·105·105, sus alas y los pasillos que las ligan
//   Piso 5     dos U: barras de 105·105·85 y sus alas
//
// En planta: x a lo largo de las barras (de poniente a oriente), y hacia el norte; la barra sur va de y = 0 a 7.9, la
// norte de 22.1 a 30, y las alas en el patio entre ellas. Cada barra mira hacia afuera (su fachada); sus departamentos
// entran por el patio. Puro.
import type { Contour, Id, Project } from '../../../model/schema.ts'
import { addLevel, updateLevel } from '../../../state/actions/levels.ts'
import { addMass, updateMass } from '../../../state/actions/masses.ts'
import { newProject } from '../../../typologies/index.ts'
import type { PlanCatalogo } from './catalogo.ts'
import { CIRCULACION, colocarDepto, conProgramasDepto } from './deptos.ts'
import type { ElementoNucleo } from './nucleoDetalle.ts'
import { agregarTipologias } from './tipologias.ts'

export const REFERENCIA_ID = 'referencia'
export const REFERENCIA_NOMBRE = 'Referencia · Barras de departamentos'

/** m: el fondo de una barra, el patio entre las dos, dónde empieza la norte */
const FONDO = 7.9
const PATIO = 14.2
const NORTE = FONDO + PATIO
const TOPE = NORTE + FONDO
/** m: el fondo de un pasillo del piso 4 */
const PASILLO = 1.6

const rect = (x0: number, y0: number, x1: number, y1: number): Contour => ({
  vertices: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }].map((q) => ({ ...q, r: 0 })),
})

type Pieza = { plan: string; espejo?: boolean }

/**
 * El núcleo del plano en su marco (W a lo largo de la barra, D a lo hondo; y = 0 la fachada): la escalera contra la
 * fachada, dos elevadores contra el otro muro con la puerta al vestíbulo (girados 270°), el ducto tras ellos y el
 * vestíbulo entre escalera y elevadores, que sale al patio a todo lo ancho.
 */
export function nucleoReferencia(W: number, D: number): ElementoNucleo[] {
  const r3 = (n: number) => Math.round(n * 1000) / 1000
  const el = (id: string, kind: ElementoNucleo['kind'], x0: number, y0: number, x1: number, y1: number, rot: ElementoNucleo['rot'] = 0): ElementoNucleo =>
    ({ id, kind, x: r3((x0 + x1) / 2), y: r3((y0 + y1) / 2), w: r3(x1 - x0), d: r3(y1 - y0), rot })
  const esc = 2.6, hondo = Math.min(5.6, D - 1.8), lado = 2.2
  const xe = W - lado
  return [
    el('escalera', 'escalera', 0, 0, esc, hondo),
    el('elevador1', 'elevador', xe, 0, W, lado, 270),
    el('elevador2', 'elevador', xe, lado, W, 2 * lado, 270),
    el('ducto', 'ducto', xe, 2 * lado, W, hondo),
    el('vestibulo', 'vestibulo', esc, 0, xe, hondo),
    el('vestibulo2', 'vestibulo', 0, hondo, W, D),
  ]
}

export function proyectoReferencia(): Project {
  let p: Project = { ...agregarTipologias(newProject('mixed-use', REFERENCIA_NOMBRE)), id: REFERENCIA_ID }
  p = conProgramasDepto(p)
  const plan = (id: string) => p.residential!.catalogo!.find((c) => c.id === id) as PlanCatalogo
  const ancho = (id: string) => plan(id).w
  const [W85, W105] = [ancho('ref-85'), ancho('ref-105')]
  const LARGO = 6 * W105 + 3 * W85

  // los niveles: el que trae (Piso 1, de comercio, más alto) y tres más
  p = updateLevel(p, 'l1', { name: 'Piso 1', height: 4.5 })
  const nivel = (name: string, elevation: number, repeat: number): Id => {
    const r = addLevel(p, { name, elevation, height: 3, repeat })!
    p = r.project
    return r.id
  }
  const l23 = nivel('Piso 2-3', 4.5, 2)
  const l4 = nivel('Piso 4', 10.5, 1)
  const l5 = nivel('Piso 5', 13.5, 1)

  const depto = (id: string, o: { x: number; y: number }, angulo: number, espejo: boolean, levelId: Id) => {
    p = colocarDepto(p, id, o, angulo, espejo, levelId).project
  }

  /** Una barra de piezas desde x0, al sur (mira al sur) o al norte (mira al norte). */
  const barra = (piezas: Pieza[], x0: number, lado: 'sur' | 'norte', levelId: Id) => {
    let x = x0
    for (const { plan: id, espejo = false } of piezas) {
      const w = ancho(id)
      // al sur la fachada va de poniente a oriente desde su esquina; al norte, de oriente a poniente (girada 180°)
      if (lado === 'sur') depto(id, { x, y: 0 }, 0, espejo, levelId)
      else depto(id, { x: x + w, y: TOPE }, 180, espejo, levelId)
      x += w
    }
  }

  /** Un ala de 85 en el patio, girada: su fachada al poniente (x0 es su lado de fachada) o al oriente. */
  const ala = (x0: number, mira: 'poniente' | 'oriente', levelId: Id) => {
    const d = plan('ref-85').d
    const holgura = (PATIO - W85) / 2
    if (mira === 'poniente') depto('ref-85', { x: x0, y: NORTE - holgura }, -90, false, levelId)
    else depto('ref-85', { x: x0 + d, y: FONDO + holgura }, 90, false, levelId)
  }
  const D85 = plan('ref-85').d
  /** Dónde van las alas (su orilla poniente): afuera y adentro de cada lado. */
  const ALAS: [number, 'poniente' | 'oriente'][] = [[0.4, 'poniente'], [27.3, 'oriente'], [LARGO - 27.3 - D85, 'poniente'], [LARGO - 0.4 - D85, 'oriente']]
  const alas = (levelId: Id) => ALAS.forEach(([x, mira]) => ala(x, mira, levelId))

  const P = (plan: string, espejo = false): Pieza => ({ plan, espejo })

  // Piso 1: comercio bajo las barras
  p = addMass(p, { programId: 'comercio', footprint: { kind: 'contour', contour: rect(0, 0, LARGO, FONDO) }, levelId: 'l1' }).project
  p = addMass(p, { programId: 'comercio', footprint: { kind: 'contour', contour: rect(0, NORTE, LARGO, TOPE) }, levelId: 'l1' }).project

  // Piso 2-3: barras completas (la mitad oriente en espejo) y las alas
  const completa = [P('ref-105'), P('ref-105'), P('ref-105'), P('ref-85'), P('ref-85'), P('ref-85'), P('ref-105', true), P('ref-105', true), P('ref-105', true)]
  barra(completa, 0, 'sur', l23)
  barra(completa, 0, 'norte', l23)
  alas(l23)

  // Piso 4: 105·105·105·150 | núcleo | 150·105·105·105; la 150 da su esquina al patio, del lado de las 105
  const W150 = ancho('ref-150')
  const lado4 = 3 * W105 + W150
  // al sur la 150 poniente va en espejo (su ala corta junto al núcleo); al norte, la oriente
  barra([P('ref-105'), P('ref-105'), P('ref-105'), P('ref-150', true)], 0, 'sur', l4)
  barra([P('ref-150'), P('ref-105', true), P('ref-105', true), P('ref-105', true)], LARGO - lado4, 'sur', l4)
  barra([P('ref-105'), P('ref-105'), P('ref-105'), P('ref-150')], 0, 'norte', l4)
  barra([P('ref-150', true), P('ref-105', true), P('ref-105', true), P('ref-105', true)], LARGO - lado4, 'norte', l4)
  alas(l4)
  // los núcleos entre las dos 150 de cada barra, con su detalle; su marco empieza en la fachada (al norte, girado)
  const anchoNucleo = LARGO - 2 * lado4
  for (const sur of [true, false]) {
    const [x0, x1] = [lado4, LARGO - lado4]
    const contour = sur ? rect(x0, 0, x1, FONDO) : rect(x1, TOPE, x0, NORTE)
    const r = addMass(p, { programId: 'nucleo', footprint: { kind: 'contour', contour }, levelId: l4 })
    p = updateMass(r.project, r.id, { nucleo: { elementos: nucleoReferencia(anchoNucleo, FONDO) } })
  }
  // los pasillos que ligan las alas de adentro con las barras (frente a la tercera 105 de cada lado)
  for (const [x0, x1] of [[2 * W105, 3 * W105], [LARGO - 3 * W105, LARGO - 2 * W105]])
    for (const [y0, y1] of [[FONDO, FONDO + PASILLO], [NORTE - PASILLO, NORTE]])
      p = addMass(p, { programId: CIRCULACION, footprint: { kind: 'contour', contour: rect(x0, y0, x1, y1) }, levelId: l4 }).project

  // Piso 5: dos U de 105·105·85 con sus alas
  const u = 2 * W105 + W85
  barra([P('ref-105'), P('ref-105'), P('ref-85')], 0, 'sur', l5)
  barra([P('ref-105'), P('ref-105'), P('ref-85')], 0, 'norte', l5)
  barra([P('ref-85', true), P('ref-105', true), P('ref-105', true)], LARGO - u, 'sur', l5)
  barra([P('ref-85', true), P('ref-105', true), P('ref-105', true)], LARGO - u, 'norte', l5)
  alas(l5)

  // el terreno: el edificio con 10 m alrededor
  p = { ...p, site: { ...p.site, boundary: rect(-10, -10, LARGO + 10, TOPE + 10) } }
  return p
}
