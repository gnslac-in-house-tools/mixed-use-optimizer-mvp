// Evaluador de fórmulas de la calificación por palancas.
// Tokenizador + descenso recursivo a mano; no usa eval ni Function.

export type Datos = Record<string, number | null>
/**
 * `{ v }` un número; `{ v: null }` sin dato hoy: faltan datos (`falta`) o, con los datos de hoy, la cuenta no da un número
 * (`motivo`, p. ej. m² vendibles en 0); `{ err }` un defecto de la fórmula (sintaxis, un nombre ajeno, o no da un número
 * sin ningún dato de por medio).
 */
export type ResultadoFormula = { v: number } | { v: null; falta: string[]; motivo?: string } | { err: string }

type Token =
  | { t: 'num'; v: number }
  | { t: 'nom'; v: string }
  | { t: 'op'; v: '+' | '-' | '*' | '/' | '(' | ')' }

type Nodo =
  | { k: 'num'; v: number }
  | { k: 'nom'; v: string }
  | { k: 'neg'; a: Nodo }
  | { k: 'bin'; op: '+' | '-' | '*' | '/'; a: Nodo; b: Nodo }

class ErrorFormula extends Error {}
/** Una cuenta que no da un número finito (÷ 0): con datos de por medio es «sin dato», no un error de la fórmula. */
class SinNumero extends Error {}

const CARACTERES_PERMITIDOS = /^[\w\s.+\-*/()]*$/

function tokenizar(texto: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < texto.length) {
    const c = texto[i]
    if (/\s/.test(c)) {
      i++
    } else if (/[0-9.]/.test(c)) {
      let j = i
      while (j < texto.length && /[0-9.]/.test(texto[j])) j++
      const numero = Number(texto.slice(i, j))
      if (Number.isNaN(numero)) throw new ErrorFormula('número no válido')
      tokens.push({ t: 'num', v: numero })
      i = j
    } else if (/[A-Za-z_]/.test(c)) {
      let j = i
      while (j < texto.length && /\w/.test(texto[j])) j++
      tokens.push({ t: 'nom', v: texto.slice(i, j) })
      i = j
    } else if ('+-*/()'.includes(c)) {
      tokens.push({ t: 'op', v: c as '+' | '-' | '*' | '/' | '(' | ')' })
      i++
    } else {
      throw new ErrorFormula('solo + − × ÷ ( ) y nombres')
    }
  }
  return tokens
}

function parsear(tokens: Token[]): Nodo {
  let pos = 0
  const incompleta = () => new ErrorFormula('fórmula incompleta')
  const esOp = (v: string) => {
    const tk = tokens[pos]
    return tk !== undefined && tk.t === 'op' && tk.v === v
  }

  function expr(): Nodo {
    let izq = term()
    while (esOp('+') || esOp('-')) {
      const op = (tokens[pos++] as { v: '+' | '-' }).v
      izq = { k: 'bin', op, a: izq, b: term() }
    }
    return izq
  }

  function term(): Nodo {
    let izq = factor()
    while (esOp('*') || esOp('/')) {
      const op = (tokens[pos++] as { v: '*' | '/' }).v
      izq = { k: 'bin', op, a: izq, b: factor() }
    }
    return izq
  }

  function factor(): Nodo {
    const tk = tokens[pos]
    if (tk === undefined) throw incompleta()
    if (tk.t === 'num') {
      pos++
      return { k: 'num', v: tk.v }
    }
    if (tk.t === 'nom') {
      pos++
      return { k: 'nom', v: tk.v }
    }
    if (tk.v === '-') {
      pos++
      return { k: 'neg', a: factor() }
    }
    if (tk.v === '+') {
      pos++
      return factor()
    }
    if (tk.v === '(') {
      pos++
      const dentro = expr()
      if (!esOp(')')) throw tokens[pos] === undefined ? incompleta() : new ErrorFormula('fórmula no válida')
      pos++
      return dentro
    }
    throw new ErrorFormula('fórmula no válida')
  }

  const arbol = expr()
  if (pos < tokens.length) throw new ErrorFormula('fórmula no válida')
  return arbol
}

function recolectarNombres(nodo: Nodo, salida: string[]): void {
  if (nodo.k === 'nom') {
    if (!salida.includes(nodo.v)) salida.push(nodo.v)
  } else if (nodo.k === 'neg') {
    recolectarNombres(nodo.a, salida)
  } else if (nodo.k === 'bin') {
    recolectarNombres(nodo.a, salida)
    recolectarNombres(nodo.b, salida)
  }
}

function calcular(nodo: Nodo, datos: Datos): number {
  switch (nodo.k) {
    case 'num':
      return nodo.v
    case 'nom':
      return datos[nodo.v] as number
    case 'neg':
      return -calcular(nodo.a, datos)
    case 'bin': {
      const a = calcular(nodo.a, datos)
      const b = calcular(nodo.b, datos)
      let r: number
      if (nodo.op === '+') r = a + b
      else if (nodo.op === '-') r = a - b
      else if (nodo.op === '*') r = a * b
      else r = a / b
      if (!Number.isFinite(r)) throw new SinNumero()
      return r
    }
  }
}

/** Nombres de datos que usa la fórmula, sin repetir, en orden de aparición. */
export function nombresDe(formula: string): string[] {
  try {
    if (!CARACTERES_PERMITIDOS.test(formula)) return []
    const tokens = tokenizar(formula)
    const nombres: string[] = []
    for (const tk of tokens) if (tk.t === 'nom' && !nombres.includes(tk.v)) nombres.push(tk.v)
    return nombres
  } catch {
    return []
  }
}

const NO_NUMERO = 'no da un número'
/** Sin ningún nombre de dato: si no da un número, es la fórmula (`1 / 0`), no los datos de hoy. */
const formulaSinDatos = (formula: string) => nombresDe(formula).length === 0

export function evaluarFormula(formula: string, datos: Datos): ResultadoFormula {
  if (!CARACTERES_PERMITIDOS.test(formula)) return { err: 'solo + − × ÷ ( ) y nombres' }
  if (formula.trim() === '') return { err: 'vacía' }
  try {
    const arbol = parsear(tokenizar(formula))
    const nombres: string[] = []
    recolectarNombres(arbol, nombres)
    for (const n of nombres) {
      if (!Object.prototype.hasOwnProperty.call(datos, n)) return { err: `«${n}» no es un dato del proyecto` }
    }
    const falta = nombres.filter((n) => datos[n] === null)
    if (falta.length > 0) return { v: null, falta }
    const v = calcular(arbol, datos)
    if (!Number.isFinite(v)) throw new SinNumero()
    return { v }
  } catch (e) {
    if (e instanceof SinNumero) return formulaSinDatos(formula) ? { err: NO_NUMERO } : { v: null, falta: [], motivo: NO_NUMERO }
    if (e instanceof ErrorFormula) return { err: e.message }
    throw e
  }
}
