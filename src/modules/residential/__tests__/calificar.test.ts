import { describe, expect, it } from 'vitest'
import { ProjectSchema } from '../../../model/schema.ts'
import { newProject } from '../../../typologies/index.ts'
import { calificar } from '../engine/calificacion/calificar.ts'
import { CalificacionSchema, MODO_ES, REGLAS_INICIO, reglasDe, validarVariable, type Reglas, type Variable } from '../engine/calificacion/reglas.ts'

const traza = (r: ReturnType<typeof calificar>, id: string) => r.palancas.flatMap((p) => p.trazas).find((t) => t.variable.id === id)!
const palanca = (r: ReturnType<typeof calificar>, p: string) => r.palancas.find((x) => x.palanca === p)!

describe('calificar · port de la app anterior', () => {
  it('uso_indice 0.88 da +1 con «≥ 0.85»', () => {
    const t = traza(calificar(REGLAS_INICIO, { indice_usado: 0.88, indice_permitido: 1 }, []), 'uso_indice')
    expect(t.rating).toBe(1)
    expect(t.porque).toBe('≥ 0.85')
  })
  it('uso_indice 0.5 da −2 con «no alcanza 0.60»', () => {
    const t = traza(calificar(REGLAS_INICIO, { indice_usado: 0.5, indice_permitido: 1 }, []), 'uso_indice')
    expect(t.rating).toBe(-2)
    expect(t.porque).toBe('no alcanza 0.60')
  })
  it('sótanos 2 → −1, 1 → 0, 3 → −2', () => {
    const r = (n: number) => traza(calificar(REGLAS_INICIO, { sotanos: n }, []), 'sotanos').rating
    expect([r(2), r(1), r(3)]).toEqual([-1, 0, -2])
  })
})

describe('calificar · mediana', () => {
  const d = (ingreso: number) => ({ ingreso, m2_vendibles: 1 })
  it('compara contra la mediana de todas las opciones', () => {
    const t = traza(calificar(REGLAS_INICIO, d(1860), [d(1780), d(1820)]), 'precio_m2')
    expect(t.rel).toBeCloseTo(0.022, 3)
    expect(t.rating).toBe(1)
    expect(t.mediana).toBe(1820)
    expect(t.porque).toBe('+2.2% vs mediana 1,820')
  })
  it('si las otras opciones no tienen dato tampoco hay referencia', () => {
    const t = traza(calificar(REGLAS_INICIO, d(1860), [{ ingreso: null, m2_vendibles: 1 }]), 'precio_m2')
    expect(t.rating).toBeNull()
    expect(t.porque).toBe('sin referencia: una sola opción')
  })
  it('sin otras opciones no hay referencia', () => {
    const t = traza(calificar(REGLAS_INICIO, d(1860), []), 'precio_m2')
    expect(t.rating).toBeNull()
    expect(t.porque).toBe('sin referencia: una sola opción')
  })
})

describe('calificar · sin dato', () => {
  it('una variable sin dato no cuenta en el promedio de la palanca', () => {
    const r = calificar(REGLAS_INICIO, { ingreso: null, m2_vendibles: 1, ajuste_mezcla: 0.95 }, [{ ingreso: 1, m2_vendibles: 1 }])
    expect(traza(r, 'precio_m2').rating).toBeNull()
    expect(palanca(r, 'precio_producto').rating).toBe(2)
  })
  it('una palanca sin ningún dato da null y no entra a n', () => {
    const r = calificar(REGLAS_INICIO, { sotanos: 1 }, [])
    expect(palanca(r, 'm2_vendibles').rating).toBeNull()
    expect(r.n).toBe(1)
    expect(r.puntaje).toBe(0)
  })
})

describe('calificar · pesos', () => {
  it('con todos los pesos en 0 no hay puntaje', () => {
    const reglas: Reglas = { ...REGLAS_INICIO, weights: { m2_vendibles: 0, precio_producto: 0, velocidad_venta: 0, costo_obra: 0, plazo_riesgo: 0 } }
    const r = calificar(reglas, { sotanos: 1, indice_usado: 1, indice_permitido: 1 }, [])
    expect(r.puntaje).toBeNull()
    expect(r.n).toBe(0)
  })
  it('una palanca sin variables da null', () => {
    const r = calificar({ ...REGLAS_INICIO, variables: [] }, {}, [])
    expect(r.palancas.every((p) => p.rating === null)).toBe(true)
    expect(r.puntaje).toBeNull()
  })
  it('el puntaje suma rating × peso', () => {
    const reglas: Reglas = { ...REGLAS_INICIO, weights: { ...REGLAS_INICIO.weights, plazo_riesgo: 3 } }
    const r = calificar(reglas, { sotanos: 2, indice_usado: 1, indice_permitido: 1, m2_vendibles: 0.8, m2_brutos: 1 }, [])
    expect(r.puntaje).toBe(2 * 1 + -1 * 3)
  })
})

describe('esquema', () => {
  it('rechaza steps de largo 3 y un peso negativo', () => {
    const v = REGLAS_INICIO.variables[0]
    expect(CalificacionSchema.safeParse({ ...REGLAS_INICIO, variables: [{ ...v, steps: [1, 2, 3] }] }).success).toBe(false)
    expect(CalificacionSchema.safeParse({ ...REGLAS_INICIO, weights: { ...REGLAS_INICIO.weights, costo_obra: -1 } }).success).toBe(false)
    expect(CalificacionSchema.safeParse(REGLAS_INICIO).success).toBe(true)
  })
  it('reglasDe sin calificación es REGLAS_INICIO', () => {
    expect(reglasDe(newProject('mixed-use'))).toBe(REGLAS_INICIO)
  })
  it('un proyecto con residential sin calificación pasa', () => {
    const p = { ...newProject('mixed-use'), residential: { usos: {}, tipos: [], edificios: {} } }
    expect(ProjectSchema.parse(p).residential).toBeTruthy()
  })
})

describe('esquema · robustez', () => {
  it('una calificación mal guardada se descarta y rigen las reglas de inicio', () => {
    const v = REGLAS_INICIO.variables[0]
    const mala = { ...REGLAS_INICIO, variables: [{ ...v, steps: [1, 2, 3] }] }
    const r = ProjectSchema.safeParse({ ...newProject('mixed-use'), residential: { usos: {}, tipos: [], edificios: {}, calificacion: mala } })
    expect(r.success).toBe(true)
    if (r.success) expect(reglasDe(r.data)).toBe(REGLAS_INICIO)
  })
  it('MODO_ES', () => {
    expect(MODO_ES).toEqual({ higher: 'Mayor es mejor', lower: 'Menor es mejor', vsMedianHigher: 'Sobre la mediana', vsMedianLower: 'Bajo la mediana' })
  })
})

describe('validarVariable', () => {
  const v = (mode: Variable['mode'], steps: Variable['steps']): Variable => ({ ...REGLAS_INICIO.variables[0], mode, steps })
  it('umbrales fuera de orden', () => {
    expect(validarVariable(v('higher', [0.95, 0.99, 0.75, 0.6]))).toBe('los umbrales deben ir de mayor a menor (+2 → −1)')
    expect(validarVariable(v('lower', [3, 2, 1, 0]))).toBe('los umbrales deben ir de menor a mayor (+2 → −1)')
  })
  it('sin umbrales', () => {
    expect(validarVariable(v('higher', [null, null, null, null]))).toBe('pon al menos un umbral')
  })
  it('las reglas de inicio son válidas', () => {
    expect(REGLAS_INICIO.variables.map(validarVariable)).toEqual(Array(8).fill(null))
  })
})
