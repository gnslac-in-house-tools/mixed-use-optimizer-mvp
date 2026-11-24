// Metres or feet in the block editor (Phase BE.8, spec Goal 12). Everything stays stored in metres: the project, the
// engine and the actions never see a foot. The toggle changes only what the block editor shows and what is typed in it
// (its fields, the plan's dimensions, the 3D labels, the figures). A foot is decimal, two decimals ("50.00 ft"); an area
// is in ft². The choice is remembered for the session (a store, not the project). The KPIs outside the block editor
// stay in metres. BE.10's Ruler and Dimension read their text through `useLengths()`, from a context.
import { create } from 'zustand'

export type LengthUnit = 'm' | 'ft'
export const FT = 0.3048

/** The block editor's unit; session only. */
export const useUnits = create<{ unit: LengthUnit; setUnit(u: LengthUnit): void }>((set) => ({
  unit: 'm',
  setUnit: (unit) => set({ unit }),
}))

/** m, to the µm: a typed foot with no float left over (50 ft = 15.24 m, not 15.240000000000002). */
const um = (v: number) => Math.round(v * 1e6) / 1e6

/** A length in metres, as it is shown in `u`. Metres are the identity. */
export const toShown = (m: number, u: LengthUnit): number => (u === 'ft' ? m / FT : m)
/** A length typed in `u`, in metres. Metres are the identity. */
export const fromShown = (v: number, u: LengthUnit): number => (u === 'ft' ? um(v * FT) : v)

/** The number alone: feet to `decimals` always (50.00), metres without trailing zeros (12, 10.5). */
export function lengthNumber(m: number, u: LengthUnit, decimals = 2): string {
  if (u === 'ft') return toShown(m, u).toFixed(decimals)
  const k = 10 ** decimals
  return String(Math.round(m * k) / k + 0)
}

/** '50.00 ft' | '15.24 m' (metres without trailing zeros: '12 m'). */
export const lengthText = (m: number, u: LengthUnit, decimals = 2): string => `${lengthNumber(m, u, decimals)} ${u}`

/** '1,234 m' | '4,049 ft': a long length, whole, with thousands separators (a wall's total). */
export const lengthWhole = (m: number, u: LengthUnit): string => `${Math.round(toShown(m, u)).toLocaleString('en-US')} ${u}`

/** '1,000 ft²' | '24,800 m²' (whole, like the app's areas). */
export const areaText = (m2: number, u: LengthUnit): string =>
  `${Math.round(u === 'ft' ? m2 / (FT * FT) : m2).toLocaleString('en-US')} ${u}²`

/** The unit and its formatters, for a view of the block editor (and BE.10's readouts). */
export function useLengths() {
  const unit = useUnits((s) => s.unit)
  return {
    unit,
    /** '15.24 m' | '50.00 ft' */
    text: (m: number, decimals = 2) => lengthText(m, unit, decimals),
    /** a long length, whole: '1,234 m' */
    whole: (m: number) => lengthWhole(m, unit),
    /** the number alone */
    num: (m: number, decimals = 2) => lengthNumber(m, unit, decimals),
    area: (m2: number) => areaText(m2, unit),
  }
}
