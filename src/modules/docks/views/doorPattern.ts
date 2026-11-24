// A dock door pattern in words and its mask as typed (Phase G.3b, Decision "Grid layout"), for the Brief's Docks column
// and a mass's Docks section. Pure.
import type { DockPattern } from '../../../model/schema.ts'

const SKIPS: Record<DockPattern['skip'], string> = { ends: 'the end bays skipped', corners: 'the corners skipped', none: 'none skipped' }

/** What the pattern places: "a door every module, the end bays skipped", "1 1 0 repeated from module 2, …". */
export function patternText(pt: DockPattern): string {
  const from = pt.offset ? ` from module ${pt.offset + 1}` : ''
  const run = pt.mask ? `${maskText(pt.mask)} repeated${from}` : `a door every ${pt.every === 1 ? 'module' : `${pt.every} modules`}${from}`
  return `${run}, ${SKIPS[pt.skip]}`
}

/** A mask as typed: "1 1 0". */
export const maskText = (mask: DockPattern['mask']): string => (mask ?? []).join(' ')

/** A mask from what was typed (ones and zeros, spaced or not); undefined for none; null when it is not one. */
export function parseMask(text: string): DockPattern['mask'] | null {
  const digits = text.replace(/[\s,]/g, '')
  if (digits === '') return undefined
  if (!/^[01]{1,12}$/.test(digits) || !digits.includes('1')) return null
  return [...digits].map((c) => (c === '1' ? 1 : 0))
}
