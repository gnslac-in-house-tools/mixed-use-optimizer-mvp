import { describe, expect, it } from 'vitest'
import { ProjectSchema } from '../../../model/schema.ts'
import { addMass } from '../../../state/actions/masses.ts'
import { newProject } from '../../../typologies/index.ts'
import { modulesOf } from '../../catalog.ts'
import { residential } from '../module.ts'
import { paramsDe } from '../engine/defaults.ts'

const COLORES = { studio: '#F4C3C5', br1: '#5BB58C', br2: '#A99BE6', br3: '#EE9362' }

describe('tipología Uso mixto', () => {
  it('crea un proyecto válido', () => {
    expect(ProjectSchema.parse(newProject('mixed-use'))).toBeTruthy()
  })

  it('trae la retícula de 8.1 × 8.1 en 3 módulos', () => {
    const g = newProject('mixed-use').grid!
    expect([g.x, g.y, g.modules]).toEqual([8.1, 8.1, 3])
  })

  it('trae Vivienda, Comercio y Núcleo con su uso y su entrepiso', () => {
    const p = newProject('mixed-use')
    expect(p.programs.map((x) => x.name)).toEqual(['Vivienda', 'Comercio', 'Núcleo'])
    const id = (n: string) => p.programs.find((x) => x.name === n)!.id
    expect(p.residential!.usos[id('Vivienda')]).toEqual({ uso: 'vivienda', entrepiso: 3.0 })
    expect(p.residential!.usos[id('Comercio')]).toEqual({ uso: 'comercio', entrepiso: 4.5 })
    expect(p.residential!.usos[id('Núcleo')].uso).toBe('nucleo')
  })

  it('trae los cuatro tipos de GFit con los colores de la paleta', () => {
    const tipos = newProject('mixed-use').residential!.tipos
    expect(tipos.map((t) => t.id)).toEqual(['studio', 'br1', 'br2', 'br3'])
    for (const t of tipos) expect(t.color).toBe(COLORES[t.id as keyof typeof COLORES])
  })

  it('ofrece el módulo residencial y no los industriales', () => {
    const m = modulesOf('mixed-use')
    expect(m).toContain('residential')
    for (const x of ['warehouse', 'docks', 'terrain', 'parking']) expect(m).not.toContain(x)
  })

  it('el módulo está presente solo con una masa de Vivienda o Comercio', () => {
    const p = newProject('mixed-use')
    expect(residential.present(p)).toBe(false)
    const viv = p.programs.find((x) => x.name === 'Vivienda')!.id
    const { project } = addMass(p, { programId: viv, footprint: { kind: 'rect', center: { x: 0, y: 0 }, width: 20, depth: 10, rotation: 0 } })
    expect(residential.present(project)).toBe(true)
  })

  it('paramsDe da los valores por defecto de un edificio sin los suyos', () => {
    expect(paramsDe(newProject('mixed-use'), 'b1')).toEqual({ fondo: 8.1, pasillo: 1.8, mezcla: { studio: 30, br1: 45, br2: 25 }, semilla: 1 })
  })
})
