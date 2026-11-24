// Programs and calculator assumptions — the mockup's PROGS0 / CG0 / CG (option 9), spec §6.4.

export const TYPES = [
  { n: 'Studio', a: 38 },
  { n: '1BR', a: 58 },
  { n: '2BR', a: 82 },
] as const

export interface Program {
  id: string
  n: string
  col: string
  inc: 'sale' | 'rent' | 'none'
  basis: 'unit' | 'm2' | 'none'
  /** m² of sellable/rentable area per stall */
  m2: number
  /** sellable or rentable % of the net plate */
  eff: number
  /** construction $/m² built */
  cost: number
  rent: number
  price: number
  /** floor height, m */
  fh: number
  /** residential only: stalls per unit and $/m² by type */
}

export interface Globals {
  visitors: number
  margin: number
  round: 'up' | 'near'
  occ: number
  cap: number
  prem: number
  soft: number
  exc: number
  park: number
  land: number
  target: number
}

export function PROGS0(): Program[] {
  return [
    { id: 'res', n: 'Residential', col: '#5b8fd0', inc: 'sale', basis: 'unit', m2: 60, eff: 86, cost: 1650, rent: 0, price: 0, fh: 3.2 },
    { id: 'ret', n: 'Retail', col: '#d6913a', inc: 'rent', basis: 'm2', m2: 30, eff: 85, cost: 1400, rent: 28, price: 3500, fh: 5.0 },
    { id: 'off', n: 'Office', col: '#3e9d8f', inc: 'rent', basis: 'm2', m2: 40, eff: 82, cost: 1500, rent: 24, price: 3200, fh: 4.0 },
    { id: 'amen', n: 'Amenities', col: '#9073c9', inc: 'none', basis: 'none', m2: 60, eff: 70, cost: 1200, rent: 0, price: 0, fh: 3.6 },
  ]
}

export const CG0: Globals = { visitors: 10, margin: 10, round: 'up', occ: 92, cap: 7.5, prem: 8, soft: 12, exc: 600, park: 18000, land: 10, target: 20 }

const fmt = (n: number) => Math.round(n).toLocaleString('en-US')
export interface GlobalField { k: Exclude<keyof Globals, 'round'>; l: string; f: (v: number) => string; st: number; tip?: string }
export const CG: GlobalField[] = [
  { k: 'visitors', l: 'Visitors', f: (v) => '+' + v + '%', st: 1, tip: 'Added to residential stalls' },
  { k: 'margin', l: 'Parking margin', f: (v) => v + ' stalls', st: 1, tip: 'Extra stalls tolerated before a warning' },
  { k: 'occ', l: 'Occupancy', f: (v) => v + '%', st: 1, tip: 'Share of rentable area leased' },
  { k: 'cap', l: 'Cap rate', f: (v) => v.toFixed(2) + '%', st: 0.25, tip: 'Turns annual rent into value' },
  // the premium by level is the price-levels rule now (Rules step); cg.prem only seeds it when a v0.1 file opens
  { k: 'soft', l: 'Soft costs', f: (v) => v + '%', st: 1, tip: 'Fees, permits, contingency' },
  { k: 'exc', l: 'Basements', f: (v) => '$' + fmt(v) + '/m²', st: 50 },
  { k: 'park', l: 'Parking', f: (v) => '$' + fmt(v) + '/stall', st: 500 },
  { k: 'land', l: 'Land', f: (v) => 'USD ' + v.toFixed(1) + ' M', st: 0.5 },
  { k: 'target', l: 'Target margin', f: (v) => v + '%', st: 1 },
]

export const PSTEP: Record<string, number> = { m2: 0.5, eff: 1, cost: 50, price: 100, rent: 1, r: 0.1, p: 100, fh: 0.1 }
