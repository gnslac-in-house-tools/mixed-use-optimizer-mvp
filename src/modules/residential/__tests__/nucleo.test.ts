import { describe, expect, it } from 'vitest'
import type { Grid, Mass, Point, Project } from '../../../model/schema.ts'
import { derive } from '../../../engine/derive.ts'
import { newProject } from '../../../typologies/index.ts'

const G0: Grid = { x: 8.1, y: 8.1, modules: 3, origin: { x: 0, y: 0 }, angle: 0 }
const rect = (x0: number, y0: number, x1: number, y1: number): Point[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]
const masa = (id: string, programId: string, pts: Point[]): Mass => ({
  id, name: id, levelId: 'l1', programId, height: 30, footprint: { kind: 'contour', contour: { vertices: pts.map((q) => ({ ...q, r: 0 })) } },
})
const traslapes = (p: Project) => derive(p).issues.filter((i) => i.code === 'overlap')

describe('el Núcleo dentro de la Vivienda', () => {
  it('no es un traslape: el Núcleo puede ir dentro de otra masa de su edificio', () => {
    const p: Project = { ...newProject('mixed-use'), grid: G0, masses: [masa('v', 'vivienda', rect(0, 0, 32.4, 16.2)), masa('n', 'nucleo', rect(12.15, 5.4, 20.25, 10.8))] }
    expect(traslapes(p)).toEqual([])
  })
  it('dos masas de Vivienda encimadas siguen siendo un traslape', () => {
    const p: Project = { ...newProject('mixed-use'), grid: G0, masses: [masa('v', 'vivienda', rect(0, 0, 32.4, 16.2)), masa('w', 'vivienda', rect(10, 0, 40, 16.2))] }
    expect(traslapes(p)).toHaveLength(1)
  })
})
