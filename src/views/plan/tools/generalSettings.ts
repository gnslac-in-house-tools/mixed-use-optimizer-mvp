// The settings of the General group's tools (Phase AS.5 task 5, Decision "Mirror, Array, Align"), set in the strip's ▾ beside
// Select, Move, Copy, Rotate, Mirror, Array, Align and Group:
//   keep    Mirror keeps the original (a mirrored copy, as CAD does); off, the thing itself is reflected
//   count   Array's copies in a row, the original counted
//   rows    Array's rows; with more than one, a third click gives the place of the second
//   how     Align's edges (the side nearest the line touches it) or centres (the centre goes on it)
// UI state of whoever is drawing, in this browser, never in the Project or the undo history, saved in localStorage as the
// snap's switches are (`snap/settings.ts`); if it cannot be read or written, the defaults stay.
// Array's count and rows are whole numbers from 1, each at most 50, and their product at most 100: every copy is a whole
// `copyPicked` made again at each pointer move, so a grid of thousands would freeze the plan. `setCount` and `setRows` hold a
// value to what is allowed with the other and return what they took.
import { create } from 'zustand'

export const GENERAL_KEY = 'gfit.general'

/** The most copies in a row, the most rows, and the most copies in all (count × rows). */
export const MAX_COUNT = 50
export const MAX_ROWS = 50
export const MAX_COPIES = 100

export type AlignHow = 'edges' | 'centres'

export interface GeneralSettings {
  keep: boolean
  count: number
  rows: number
  how: AlignHow
}

export const DEFAULT_GENERAL: GeneralSettings = { keep: true, count: 3, rows: 1, how: 'edges' }

/** The most `count` can be with `rows` rows, and the most `rows` with `count` in a row. */
export const countCap = (rows: number): number => Math.min(MAX_COUNT, Math.floor(MAX_COPIES / Math.max(1, rows)))
export const rowsCap = (count: number): number => Math.min(MAX_ROWS, Math.floor(MAX_COPIES / Math.max(1, count)))

/** `n` as a whole number from 1 to `cap`; null for what is no number. */
function whole(n: number, cap: number): number | null {
  if (!Number.isFinite(n)) return null
  return Math.min(cap, Math.max(1, Math.round(n)))
}

/** What was saved, merged with the defaults: an old or broken JSON, or a value out of range, leaves the default. */
export function readSaved(): GeneralSettings {
  let raw: Record<string, unknown> = {}
  try {
    const t = localStorage.getItem(GENERAL_KEY)
    const v: unknown = t ? JSON.parse(t) : null
    raw = v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
  } catch {
    // no localStorage, or garbage in it: the defaults
  }
  const keep = typeof raw.keep === 'boolean' ? raw.keep : DEFAULT_GENERAL.keep
  const how = raw.how === 'edges' || raw.how === 'centres' ? raw.how : DEFAULT_GENERAL.how
  const inRange = (v: unknown, cap: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= cap
  let count = inRange(raw.count, MAX_COUNT) ? raw.count : DEFAULT_GENERAL.count
  let rows = inRange(raw.rows, MAX_ROWS) ? raw.rows : DEFAULT_GENERAL.rows
  // a pair whose product is too big is not one that was saved
  if (count * rows > MAX_COPIES) {
    count = DEFAULT_GENERAL.count
    rows = DEFAULT_GENERAL.rows
  }
  return { keep, count, rows, how }
}

function save(s: GeneralSettings) {
  try {
    localStorage.setItem(GENERAL_KEY, JSON.stringify(s))
  } catch {
    // full or blocked: the settings last as long as the tab
  }
}

export const useGeneralTools = create<
  GeneralSettings & {
    setKeep(keep: boolean): void
    /** Array's count, held to 1 … what the rows leave of 100; returns what it took (the count as it was for what is no number). */
    setCount(n: number): number
    setRows(n: number): number
    setHow(how: AlignHow): void
  }
>()((set, get) => {
  const change = (patch: Partial<GeneralSettings>) => {
    set(patch)
    const { keep, count, rows, how } = get()
    save({ keep, count, rows, how })
  }
  return {
    ...readSaved(),
    setKeep: (keep) => change({ keep }),
    setCount: (n) => {
      const count = whole(n, countCap(get().rows))
      if (count !== null) change({ count })
      return get().count
    },
    setRows: (n) => {
      const rows = whole(n, rowsCap(get().count))
      if (rows !== null) change({ rows })
      return get().rows
    },
    setHow: (how) => change({ how }),
  }
})
