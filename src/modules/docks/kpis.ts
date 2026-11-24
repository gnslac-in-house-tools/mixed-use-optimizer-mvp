// The docks module's KPI definitions (Decisions "Exterior circulation", "Catalog"): dock walls and doors, truck courts, as data like the
// core's (engine/kpis.ts has the type and the rest). Ids never change: saved projects keep the ones they chose.
import type { KpiDef } from '../../engine/kpis.ts'
import type { Derived } from '../../engine/types.ts'

/** On average, each dock wall's middle to the nearest truck gate's inner end, straight (m); null without both. */
function dockToGate(d: Derived): number | null {
  const gates = d.circulation.gates.filter((g) => g.vehicles !== 'cars' && g.flow !== 'out').map((g) => g.end)
  const docks = d.circulation.docks
  if (gates.length === 0 || docks.length === 0) return null
  const far = docks.map((k) => {
    const m = { x: (k.a.x + k.b.x) / 2, y: (k.a.y + k.b.y) / 2 }
    return Math.min(...gates.map((g) => Math.hypot(g.x - m.x, g.y - m.y)))
  })
  return far.reduce((s, x) => s + x, 0) / far.length
}

/** The docks module's: dock walls and doors, truck courts. */
export const DOCKS_KPIS: KpiDef[] = [
  {
    id: 'dock-doors',
    area: 'massing',
    label: 'Dock doors',
    unit: 'count',
    help: 'Loading dock doors on the walls that dock.',
    read: (_p, d) => d.circulation.totals.doors,
  },
  {
    id: 'doors-short',
    area: 'massing',
    label: 'Doors short',
    unit: 'count',
    help: 'On the structural grid: the dock doors the masses’ patterns place short of what the brief asks (per m² of floor or every m of wall); 0 meets it.',
    read: (_p, d) => d.docks.short,
    status: (_p, d) => (d.docks.short === null ? null : d.docks.short === 0 ? 'within' : 'over'),
  },
  {
    id: 'truck-courts',
    area: 'flow',
    label: 'Truck courts',
    unit: 'm2',
    help: 'The truck courts in front of the docks, merged.',
    read: (_p, d) => d.circulation.totals.courtArea,
  },
  {
    id: 'dock-gate-distance',
    area: 'flow',
    label: 'Dock to gate',
    unit: 'm',
    help: 'On average, how far each dock wall is from the nearest truck gate, straight: how far a truck drives on the site, roughly.',
    read: (_p, d) => dockToGate(d),
  },
]
