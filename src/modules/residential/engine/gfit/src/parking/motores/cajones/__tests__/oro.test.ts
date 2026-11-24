import { describe, expect, it } from 'vitest'
import casos from '../../__oro__/casos/cajones.json'
import oro from '../../__oro__/resultados/cajones.json'
import { acomodar } from '../acomodo.ts'

type Caso = (typeof casos)[number]
type Num = number[]

const TOL = 1e-3

function cerca(a: Num | undefined, b: Num | undefined, ctx: string) {
  expect(a, ctx).toBeDefined()
  expect(b, ctx).toBeDefined()
  expect(a!.length, ctx).toBe(b!.length)
  a!.forEach((v, i) => expect(Math.abs(v - b![i]), `${ctx}[${i}]`).toBeLessThan(TOL))
}

// Mismo orden que Python (el port conserva el orden de iteración); además se
// compara ordenado por centroide para que un empate numérico no tumbe la prueba.
function clave(f: Num): [number, number] {
  // rectángulo [u1, u2, v1, v2, ...] (cajones, pasillos y cruces)
  return [(f[0] + f[1]) / 2, (f[2] + f[3]) / 2]
}
function ordenados(l: Num[]) {
  return [...l].sort((p, q) => {
    const a = clave(p)
    const b = clave(q)
    // con tolerancia: el ruido de 1e-15 no debe cambiar el orden
    return Math.abs(a[0] - b[0]) > 1e-6 ? a[0] - b[0] : a[1] - b[1]
  })
}

function aPlano(poli: [number, number][]): Num {
  return poli.flat()
}

describe('motor de cajones contra el Python (oro)', () => {
  it('hay casos', () => {
    expect(casos.length).toBeGreaterThanOrEqual(8)
    expect(oro.length).toBe(casos.length)
  })

  casos.forEach((c: Caso, k) => {
    it(`caso: ${c.nombre}`, () => {
      const esp = oro[k].resultado
      expect(oro[k].nombre).toBe(c.nombre)
      const res = acomodar(
        c.borde as [number, number][][],
        c.obst as [number, number][][],
        c.rampa_pts as [number, number][],
        c.W,
        c.L,
        c.A,
        c.r,
        c.cruce_n,
        c.rampa_ancho,
        c.rampa_largo,
        c.rampa_paralela,
        c.angulo,
        c.cabeceras,
      )
      expect(res.cajones.length).toBe(esp.cajones.length)
      expect(res.angulo).toBeCloseTo(esp.angulo, 6)
      expect(res.acceso).toEqual(esp.acceso)
      expect(res.componentes).toBe(esp.componentes)
      expect(res.avisos).toEqual(esp.avisos)

      // en el mismo orden que el Python
      res.cajones.forEach((f, i) => cerca(f, esp.cajones[i], `cajon ${i}`))
      res.pasillos.forEach((f, i) => cerca(f, esp.pasillos[i], `pasillo ${i}`))
      res.cruces.forEach((f, i) => cerca(f, esp.cruces[i], `cruce ${i}`))
      expect(res.pasillos.length).toBe(esp.pasillos.length)
      expect(res.cruces.length).toBe(esp.cruces.length)

      // y ordenados por centroide
      const oc = ordenados(esp.cajones)
      ordenados(res.cajones).forEach((f, i) => cerca(f, oc[i], `cajon ord ${i}`))
      const op = ordenados(esp.pasillos)
      ordenados(res.pasillos).forEach((f, i) => cerca(f, op[i], `pasillo ord ${i}`))

      expect(res.rampas.length).toBe(esp.rampas.length)
      res.rampas.forEach((r, i) => cerca(aPlano(r), aPlano(esp.rampas[i] as [number, number][]), `rampa ${i}`))
      expect(res.bocas.length).toBe(esp.bocas.length)
      res.bocas.forEach((r, i) => cerca(aPlano(r), aPlano(esp.bocas[i] as [number, number][]), `boca ${i}`))
      expect(res.rampas_alto).toEqual(esp.rampas_alto)
    })
  })
})
