import { CATALOGO, TIPOS, areaDe, bibliotecaGFit, coincidencia, copiaDe, huella, planNuevo } from './catalogo'

test('la Biblioteca GFit trae los cuatro tipos en tres anchos, con recintos y muebles', () => {
  const lib = bibliotecaGFit()
  expect(lib.length).toBe(TIPOS.length * 3)
  for (const p of lib) {
    expect(p.id.startsWith('G-')).toBe(true)
    expect(p.rooms.length).toBeGreaterThan(1)
    expect(p.muebles.length).toBeGreaterThan(0)
    // los recintos llenan la unidad sin salirse de ella
    const suma = p.rooms.reduce((s, r) => s + areaDe(r.shape), 0)
    expect(suma).toBeCloseTo(p.w * p.d, 1)
    for (const r of p.rooms) for (const [x, y] of r.shape) {
      expect(x).toBeGreaterThanOrEqual(-1e-3); expect(x).toBeLessThanOrEqual(p.w + 1e-3)
      expect(y).toBeGreaterThanOrEqual(-1e-3); expect(y).toBeLessThanOrEqual(p.d + 1e-3)
    }
    // cada mueble es del catálogo y queda dentro de la unidad
    for (const m of p.muebles) {
      expect(CATALOGO[m.kind]).toBeDefined()
      const b = huella(m)
      expect(b[0]).toBeGreaterThanOrEqual(-0.03); expect(b[2]).toBeLessThanOrEqual(p.w + 0.03)
      expect(b[1]).toBeGreaterThanOrEqual(-0.03); expect(b[3]).toBeLessThanOrEqual(p.d + 0.03)
    }
  }
})

test('la biblioteca es determinista', () => {
  const a = JSON.stringify(planNuevo(TIPOS[1], 7.2, 8.1, [], false))
  const b = JSON.stringify(planNuevo(TIPOS[1], 7.2, 8.1, [], false))
  expect(a).toBe(b)
})

test('un plano vacío es un solo recinto a mano', () => {
  const p = planNuevo(TIPOS[0], 5, 8, [], true)
  expect(p.origen).toBe('manual')
  expect(p.rooms).toHaveLength(1)
})

test('coincidencia: 1 al mismo tamaño, menos al alejarse', () => {
  expect(coincidencia({ w: 7.2, d: 8.1 }, 7.2, 8.1)).toBe(1)
  expect(coincidencia({ w: 6, d: 8.1 }, 7.2, 8.1)).toBeLessThan(1)
  expect(coincidencia({ w: 6, d: 8.1 }, 0, 8.1)).toBe(0)
})

test('copiar de la Biblioteca GFit da un id nuevo y recuerda el origen', () => {
  const g = bibliotecaGFit()[0]
  const c = copiaDe(g, [])
  expect(c.id).toBe('C1')
  expect(c.desde).toBe(g.id)
  expect(c.rooms).not.toBe(g.rooms)
})
