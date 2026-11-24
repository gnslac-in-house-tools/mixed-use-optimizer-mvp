// A CSV of points of the ground (Decision "Site file survey"), pure: its columns (named by a header, or numbered) and
// its rows; a guess of which column is x, y and z, by the header's names (x, este, easting; y, norte, northing; z,
// cota, elevación…) or, without one, by how many numbers a row has (three: x, y, z; more, a point number first:
// P, E, N, Z); then the chosen columns as a drawing with one layer of points, which the survey reads as any other
// (its units, its coordinates). The separator is guessed (`,`, `;`, a tab or spaces); with `;` or a tab a number may
// have a decimal comma.
import type { DxfDrawing } from './dxf.ts'

export interface CsvTable {
  /** The header's names, or Column 1, Column 2… */
  columns: string[]
  /** Each row's cells as numbers (null: not one). */
  rows: (number | null)[][]
  /** The guess of the x, y and z columns, or null. */
  guess: CsvColumns | null
}

export interface CsvColumns {
  x: number
  y: number
  z: number
}

const plain = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()

const NAMES: Record<keyof CsvColumns, RegExp> = {
  x: /^(x|e|este|easting|east|coord_?x)$/,
  y: /^(y|n|norte|northing|north|coord_?y)$/,
  z: /^(z|h|cota|cotas|elev|elevacion|elevation|altura|height|alt)$/,
}

function separatorOf(lines: string[]): RegExp {
  const sample = lines.slice(0, 20).join('\n')
  const count = (c: string) => sample.split(c).length - 1
  if (count('\t')) return /\t/
  if (count(';')) return /;/
  if (count(',')) return /,/
  return /\s+/
}

export function readCsv(text: string): CsvTable {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (!lines.length) throw new Error('This CSV has no rows')
  const sep = separatorOf(lines)
  const decimalComma = sep.source !== ','
  const cells = lines.map((l) => l.trim().split(sep).map((c) => c.trim().replace(/^"(.*)"$/, '$1')))
  const num = (c: string): number | null => {
    const v = Number(decimalComma ? c.replace(',', '.') : c)
    return c !== '' && Number.isFinite(v) ? v : null
  }
  // a header: a first row with a word where the next rows have numbers (a column of descriptions has words in all)
  const below = cells.slice(1, 6)
  const header = below.length ? cells[0].some((c, i) => num(c) === null && below.some((r) => num(r[i] ?? '') !== null)) : cells[0].some((c) => num(c) === null)
  const width = cells.reduce((w, r) => Math.max(w, r.length), 0)
  const columns = Array.from({ length: width }, (_, i) => (header ? (cells[0][i] ?? '') : '') || `Column ${i + 1}`)
  const rows = cells.slice(header ? 1 : 0).map((r) => Array.from({ length: width }, (_, i) => num(r[i] ?? '')))
  return { columns, rows, guess: guessColumns(columns, rows, header) }
}

function guessColumns(columns: string[], rows: (number | null)[][], header: boolean): CsvColumns | null {
  if (header) {
    const find = (re: RegExp) => columns.findIndex((c) => re.test(plain(c)))
    const g = { x: find(NAMES.x), y: find(NAMES.y), z: find(NAMES.z) }
    if (g.x >= 0 && g.y >= 0 && g.z >= 0) return g
  }
  // the columns that are numbers in most rows
  const numeric = columns.map((_, i) => i).filter((i) => rows.filter((r) => r[i] !== null).length >= rows.length / 2)
  if (numeric.length === 3) return { x: numeric[0], y: numeric[1], z: numeric[2] }
  if (numeric.length >= 4) return { x: numeric[1], y: numeric[2], z: numeric[3] }
  return null
}

/** The chosen columns' points as a drawing of one layer (`layer`: the file's name); a row missing one is left out. */
export function csvDrawing(t: CsvTable, c: CsvColumns, layer: string): DxfDrawing {
  const points = t.rows.flatMap((r) => (r[c.x] !== null && r[c.y] !== null && r[c.z] !== null ? [{ x: r[c.x]!, y: r[c.y]!, z: r[c.z]!, layer }] : []))
  const missing = t.rows.length - points.length
  return { shapes: [], lines: [], points, texts: {}, labels: [], curves: [], colors: {}, units: 'm', warnings: missing ? [`${missing} row${missing === 1 ? '' : 's'} without x, y and z left out`] : [] }
}
