// Los detalles que dejó la revisión de las rampas (plan 2026-11-24-rampas-calle-sotanos, «Deferred minors»).
import { describe, expect, it } from 'vitest'
import type { Ring } from '../engine/gfit/src/model/geom.ts'
import { conPlantaBaja } from '../engine/gfit/src/model/calc.ts'
import type { Massed } from '../engine/gfit/src/model/massing.ts'
import { highOf } from '../engine/gfit/src/parking/adapter.ts'
import { bocaAltaDe, tRampa } from '../engine/derivar.ts'
import { rampasPlanas } from '../views/sotano3d.ts'

const cuadro = (x0: number, y0: number, x1: number, y1: number): Ring => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]

describe('los detalles de las rampas', () => {
  it('la planta baja pierde solo el área de la rampa, y conserva lo que ya descontaba (núcleo automático, lobby)', () => {
    const nivel = { num: 1, shape: [cuadro(0, 0, 10, 10)], cores: [], plateA: 100, net: 80, sell: 80, lobby: false, prog: 'ret' }
    const lobby = { ...nivel, net: 0, sell: 0, lobby: true }
    const m = { ok: true, levels: [nivel, lobby] } as unknown as Massed
    const r = conPlantaBaja(m, [cuadro(0, 0, 10, 2)], [{ id: 'ret', eff: 100 }] as never)
    expect(r.levels[0].net).toBeCloseTo(60, 6)
    expect(r.levels[0].plateA).toBe(100)
    expect(r.levels[1].net).toBe(0)
  })

  it('una rampa que baja marca como alto el extremo de este piso (z = 0), no el de abajo', () => {
    expect(highOf({ puntos: [{ z: 0 }, { z: -3.3 }, { z: -3.3 }, { z: 0 }] })).toEqual([1, 0, 0, 1])
    expect(highOf({ puntos: [{ z: 0 }, { z: 3.3 }, { z: 3.3 }, { z: 0 }] })).toEqual([0, 1, 1, 0])
  })

  it('la boca alta es la del extremo más alto aunque ninguna altura sea exactamente 1', () => {
    const huella = cuadro(0, 0, 22, 6)
    const baja = cuadro(-6, 0, 0, 6), alta = cuadro(22, 0, 28, 6)
    expect(bocaAltaDe(huella, [0, 0.999, 0.999, 0], [baja, alta])).toBe(alta)
    expect(bocaAltaDe(huella, [0.999, 0, 0, 0.999], [baja, alta])).toBe(baja)
  })

  it('con un solo sótano no se dibuja en el S1 la boca de una rampa que vendría de abajo', () => {
    const huella = cuadro(0, 0, 22, 6), baja = cuadro(-6, 0, 0, 6), alta = cuadro(22, 0, 28, 6)
    const plano = { rampas: [huella, baja, alta], rampa: { huella, alto: [0, 1, 1, 0], bocaAlta: [alta] } } as never
    expect(rampasPlanas(plano, 1)).toEqual([baja])
    expect(rampasPlanas(plano, 2)).toEqual([baja, alta])
  })

  it('el desempate entre orillas casi igual de cercanas no depende de su orden: gana la más larga', () => {
    // tres orillas casi al frente de la calle: a 10.000 m (30 m de largo), 10.008 (35) y 10.016 (55). Las dos primeras
    // empatan con la más cercana; la tercera ya no (le lleva 0.016). Gana la de 35, aunque la de 55 empate con ella.
    const calle = [[[-100, -10], [300, -10]]] as [number, number][][]
    const contorno = [[[0, 0], [30, 0], [65, 0.016], [120, 0.016], [120, 40], [0, 40]]] as Ring[]
    const r = tRampa(contorno, 6, 22, calle)
    expect(r.lado).toBeCloseTo(35, 0)
  })
})
