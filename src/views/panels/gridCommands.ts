// The right-click menu's *Split at line …* (Phase G.2b, Decision "Grid layout"; the mass kind's own verb since AS.4), one undo step through `actions`. (There is no
// *Add grid*, *Fit to the site* or *Remove grid* any more: a project always has its grid, Decision "Grid always".)
import { massIsLocked } from '../../kinds/locked.ts'
import type { Id, Point } from '../../model/schema.ts'
import { centroid } from '../../engine/geom/polygon.ts'
import { bayOf, gridOf, linesInside, nameBase, nameOf, rectOnGrid, toGrid, type Axis } from '../../engine/grid/index.ts'
import { actions } from '../../state/actions/index.ts'
import { useApp } from '../../state/store.ts'
import type { MenuEntry } from '../controls/Menu.tsx'
import { useToast } from '../layout/toast.ts'

/**
 * The plan menu's *Split at line …* (Phase G.2b, Decision "Grid layout"), while the option stands on a grid: for one
 * rect along the grid's axes, the bay line inside it nearest where the menu was opened (`at`; its middle else); greyed
 * with why for anything else. Split, the part after the line is a mass of its own, picked (then *Own platform*).
 */
export function splitItems(ids: Id[], at: Point | null): MenuEntry[] {
  const { project, derived, option } = useApp.getState()
  const g = gridOf(project, option)
  if (!g) return []
  const greyed = (title: string): MenuEntry[] => [{ key: 'split', label: 'Split at a grid line', disabled: true, title, onSelect: () => {} }]
  const m = ids.length === 1 ? project.masses.find((x) => x.id === ids[0]) : undefined
  const dm = m ? derived.masses[m.id] : undefined
  if (!m || !dm) return greyed('Select one mass on the grid to split it at a grid line')
  if (massIsLocked(project, m)) return greyed('A locked mass keeps its shape: unlock it first')
  // a block's hall is not cut into plain masses: Phase D.2 leaves its split out (its walls are drawn in its block editor)
  if (actions.isBlockMass(project, m)) return greyed('A block is not split: reshape it in its block editor')
  if (m.holes?.length) return greyed('A mass with holes is not split')
  if (!rectOnGrid(g, m.footprint)) return greyed('Only a rectangle along the grid’s axes splits at its lines')
  const inside = linesInside(g, dm.polygon)
  if (inside.length === 0) return greyed('No grid line runs through it')
  const q = toGrid(g, at ?? centroid(dm.polygon))
  const gap = (l: { axis: Axis; k: number }) => Math.abs(l.k * bayOf(g, l.axis) - q[l.axis])
  const line = inside.reduce((a, b) => (gap(b) < gap(a) ? b : a))
  const name = nameOf(line.axis, line.k, nameBase(g, derived.site.polygon))
  return [
    {
      key: 'split',
      label: `Split at line ${name}`,
      title: `${m.name} becomes two masses either side of line ${name}; then Own platform steps one`,
      onSelect: () => {
        let made: Id | null = null
        useApp.getState().apply((p) => {
          const r = actions.splitAtGridLine(p, option, m.id, line.axis, line.k)
          made = r?.id ?? null
          return r?.project ?? p
        })
        if (made === null) return
        useApp.getState().select(made)
        const copy = useApp.getState().project.masses.find((x) => x.id === made)
        useToast.getState().show('info', `${m.name} split at line ${name}: ${copy?.name ?? 'the part after it'} is picked.`)
      },
    },
  ]
}
