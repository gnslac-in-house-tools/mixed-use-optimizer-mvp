// A warehouse type's steps in words (Decision "Warehouse layout"): each row's name and the summary of its figures
// (① Grid 12 × 12 / 4, ② Hall 200 × 96 m · 15 × 8 bays, ⑤ Shape 8 edges · 1 hole…), from the type and what it
// generates.
import type { WarehouseStep, WarehouseType } from '../../../model/schema.ts'
import type { Generated } from '../engine/generate.ts'
import { figuresOf } from '../engine/figures.ts'
import { zonesOf } from '../engine/zones.ts'
import { lengthNumber, type LengthUnit } from './units.ts'

export const STEP_NAMES: Record<WarehouseStep, string> = {
  grid: 'Grid',
  hall: 'Hall',
  columns: 'Columns',
  envelope: 'Envelope',
  morphology: 'Shape',
  elements: 'Elements',
}

/** What each step settles, for its row's tooltip. */
export const STEP_TITLES: Record<WarehouseStep, string> = {
  grid: 'The interior bay each way and the modules a bay is split in',
  hall: 'The block’s box, its length and width (its shape’s bounding box): whole bays inside, the end bays take what is left',
  columns: 'A column at every grid intersection',
  envelope: 'The walls round the block: their thickness, and how tall it is',
  morphology: 'Its outline (bumps and notches, an edge’s own wall), its holes, its zones and their programs',
  elements: 'Docks, level doors and a named pattern, one a module along an edge',
}

/** ①…⑥ */
export const circled = (n: number): string => String.fromCodePoint(0x2460 + n - 1)

/** m, without trailing zeros: 12, 10.5, 0.3. */
export const m = (v: number): string => String(Math.round(v * 100) / 100)

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** `u`: the block editor's unit (BE.8); the numbers are metres. */
export function stepSummary(t: WarehouseType, g: Generated, step: WarehouseStep, u: LengthUnit = 'm'): string {
  const f = figuresOf(g)
  const n = (v: number) => lengthNumber(v, u)
  switch (step) {
    case 'grid':
      return `${t.grid.by === 'module' ? `${n(t.grid.x / t.grid.modules)} × ${n(t.grid.y / t.grid.modules)} ${u} modules / ${t.grid.modules}` : `${n(t.grid.x)} × ${n(t.grid.y)} / ${t.grid.modules}`}${t.grid.lines ? ' · lines of its own' : ''}`
    case 'hall':
      return `${n(f.length)} × ${n(f.width)} ${u} · ${f.bays.x} × ${f.bays.y} bays`
    case 'columns':
      return `${plural(f.columns, 'column')} · ${n(t.columns.size)} ${u}`
    case 'envelope':
      return `${n(t.envelope.thickness)} ${u} · ${n(t.envelope.height)} ${u} tall`
    case 'morphology': {
      const zones = zonesOf(t, g.runs).length
      const bits = [
        g.edges.length !== 4 && plural(g.edges.length, 'edge'),
        g.holes.length && plural(g.holes.length, 'hole'),
        zones > 1 && plural(zones, 'zone'),
        g.edges.some((e) => e.offset > 0 || e.thickness !== t.envelope.thickness) && 'own walls',
      ].filter(Boolean)
      return bits.length ? bits.join(' · ') : 'The box'
    }
    case 'elements': {
      const bits = [f.docks && plural(f.docks, 'dock'), f.doors && plural(f.doors, 'door'), f.marks && plural(f.marks, 'mark')].filter(Boolean)
      return bits.length ? bits.join(' · ') : 'None'
    }
  }
}

/** The bays along one way, in words: "15 bays of 12 m, end bays 10 + 10 m" (or "of 39.37 ft"). */
export function baysInWords(run: Generated['runs']['x'], u: LengthUnit = 'm'): string {
  const n = (v: number) => lengthNumber(v, u)
  const inner = run.bays.filter((b) => !b.end).map((b) => Math.round((b.hi - b.lo) * 1000) / 1000)
  const ends = [run.start, run.end].filter((e) => e > 0)
  // the bays of the rules first, then those of other lengths (lines of its own: Decision "Grid by line"), each with how many
  const lengths = [...new Set(inner)].sort((a, b) => (a === run.bay ? -1 : b === run.bay ? 1 : a - b))
  const bays = inner.length ? lengths.map((l, i) => `${i === 0 ? plural(inner.filter((x) => x === l).length, 'bay') : inner.filter((x) => x === l).length} of ${n(l)} ${u}`).join(', ') : 'no whole bay'
  return ends.length ? `${bays}, end ${ends.length === 1 ? 'bay' : 'bays'} ${ends.map(n).join(' + ')} ${u}` : bays
}
