// Qué masas de uso mixto no llevan la etiqueta de GIM (nombre y área) en la planta: con Programs encendido, las que el
// módulo dibuja por dentro (la vivienda con sus departamentos, los departamentos y pasillos dibujados y los núcleos con
// su detalle); la etiqueta caía encima de lo que dibujan (el núcleo, los recintos).
import type { Id, Project } from '../../../model/schema.ts'
import { usoDe } from './useDerivado.ts'

const POR_DENTRO = new Set(['vivienda', 'depto', 'circulacion', 'nucleo'])

export function etiquetaOculta(p: Project, massId: Id, programas: boolean): boolean {
  if (!programas || !p.residential) return false
  return POR_DENTRO.has(usoDe(p, massId) ?? '')
}
