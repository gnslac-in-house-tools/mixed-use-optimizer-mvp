// Number formatting for the UI, in one place so every panel shows numbers the same way (Decision "Units and
// currency": values are stored in metres and the project's currency; conversion and formatting happen only here,
// at the edge). Today: metres and USD, en-US. Per-project units (ft, other currencies) arrive with 9.6 by changing
// this module, not its callers. Money is ported from Plaza-Practiko `vistas/paneles/formato.ts` (`formatoDinero`).
import type { KpiUnit } from '../engine/kpis.ts'

const INTEGER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const ONE_DECIMAL = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const finite = (n: number) => (Number.isFinite(n) ? n : 0)

/** A whole number, its unit apart (a table's header has it): 12,000. */
export const whole = (v: number) => INTEGER.format(finite(v))
export const m2 = (v: number) => `${whole(v)} m²`
export const m = (v: number) => `${v.toLocaleString('en-US', { maximumFractionDigits: 1 })} m`
/** A rectangle's sides: "155 × 77.5 m". */
export const sides = (width: number, depth: number) => `${width.toLocaleString('en-US', { maximumFractionDigits: 1 })} × ${m(depth)}`
export const pct = (v: number) => `${(v * 100).toFixed(1)}%`

/**
 * Compact money, without the currency (it goes apart, smaller): 12_300_000 → "$12.3 M", 45_200 → "$45.2 k",
 * 950 → "$950", 1.2e9 → "$1.2 B".
 */
export function money(n: number): string {
  const v = finite(n)
  const sign = v < 0 ? '−' : ''
  const a = Math.abs(v)
  if (a >= 1e9) return `${sign}$${ONE_DECIMAL.format(a / 1e9)} B`
  if (a >= 1e6) return `${sign}$${ONE_DECIMAL.format(a / 1e6)} M`
  if (a >= 1e3) return `${sign}$${ONE_DECIMAL.format(a / 1e3)} k`
  return `${sign}$${INTEGER.format(a)}`
}

/** A figure split for a big number with a small unit next to it (the KPI strip). null → "—", no unit. */
export function figure(value: number | null, unit: KpiUnit): { value: string; unit: string } {
  if (value === null) return { value: '—', unit: '' }
  switch (unit) {
    case 'm2':
      return { value: INTEGER.format(finite(value)), unit: 'm²' }
    case 'm3':
      return { value: INTEGER.format(finite(value)), unit: 'm³' }
    case 'pct':
      return { value: ONE_DECIMAL.format(finite(value) * 100), unit: '%' }
    case 'm':
      return { value: ONE_DECIMAL.format(finite(value)), unit: 'm' }
    case 'count':
      return { value: INTEGER.format(finite(value)), unit: '' }
  }
}

/** A figure on one line: "24,800 m²", "22.6 %", "3". */
export function formatFigure(value: number | null, unit: KpiUnit): string {
  const f = figure(value, unit)
  return f.unit ? `${f.value} ${f.unit}` : f.value
}
