// The Summary's Overview (Decision "Isolate in the Overview"; the user: "the analysis panels in grouped categories, with
// their stats: docks, parking, programs, topography, distances"): the option's KPIs in groups that fold (Site, Built,
// then the programs' bars and the buildings' rows, Docks, Parking & roads, Topography), each with the registry's
// figures it has, of the modules that are on (a group with none, as Docks in a Blank project or Topography without ground, is left out). A program's or a building's row
// isolates it (isolate.ts): the groups and the KPI strip then read it alone, and a chip on top says so (its ✕ lets it
// go). *Expand* opens the rows: a building into its programs, a program into its masses. Which groups are folded and
// Expand are the viewer's, for the session.
import { useEffect } from 'react'
import { create } from 'zustand'
import type { KpiValue } from '../../engine/kpis.ts'
import { kpisOn, readKpi } from '../../modules/catalog.ts'
import { useApp } from '../../state/store.ts'
import { Icon } from '../controls/Icon.tsx'
import { formatFigure } from '../format.ts'
import { BuildingRows } from './BuildingRows.tsx'
import { isolatedName, useIsolate, useIsolatedDerived } from './isolate.ts'
import { ProgramBars } from './ProgramBars.tsx'
import { ResumenResidencial } from '../../modules/residential/views/ResumenResidencial.tsx' // mixed-use-mvp
import { t as tr } from '../../i18n/idioma.ts' // mixed-use-mvp

/** The groups and their KPIs, in order (the registry's ids). */
export const OVERVIEW_GROUPS = [
  { key: 'site', label: 'Site', ids: ['site-area', 'buildable-area', 'built-footprint', 'coverage', 'open-area'] },
  { key: 'built', label: 'Built', ids: ['gfa', 'built-volume', 'corridor-area', 'buildings', 'masses', 'brief'] },
  { key: 'docks', label: 'Docks & trucks', ids: ['dock-doors', 'doors-short', 'truck-courts', 'dock-gate-distance'] },
  { key: 'parking', label: 'Parking & roads', ids: ['stalls', 'road-area', 'steepest-road'] },
  { key: 'ground', label: 'Topography', ids: ['cut', 'fill', 'earth-balance', 'earth-moved', 'largest-step', 'steepest-ground'] },
] as const

export const useOverview = create<{ expanded: boolean; folded: string[]; setExpanded(v: boolean): void; fold(key: string): void }>()((set, get) => ({
  expanded: false,
  folded: [],
  setExpanded: (expanded) => set({ expanded }),
  fold: (key) => set({ folded: get().folded.includes(key) ? get().folded.filter((k) => k !== key) : [...get().folded, key] }),
}))

/** A group that folds: its caption is the button. */
export function Group({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  const folded = useOverview((s) => s.folded.includes(id))
  return (
    <section aria-label={label} className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={!folded}
        onClick={() => useOverview.getState().fold(id)}
        className="flex items-center gap-1 self-start text-label text-ink-secondary hover:text-ink"
      >
        <Icon name={folded ? 'chevronRight' : 'chevronDown'} className="h-3 w-3" />
        <h2>{tr(label)}</h2>
      </button>
      {!folded && children}
    </section>
  )
}

function Metric({ k }: { k: KpiValue }) {
  const color = k.status === 'over' ? 'text-status-over' : k.status === 'within' ? 'text-status-within' : 'text-ink'
  const label = k.limit === null ? tr(k.label) : `${tr(k.label)} (${tr('max')} ${formatFigure(k.limit, k.unit)})`
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-label text-ink-secondary">{label}</span>
      <span className={`text-body tabular-nums ${color}`}>{formatFigure(k.value, k.unit)}</span>
    </div>
  )
}

/** The chip on top while something is isolated. */
function IsolatedChip() {
  const isolated = useIsolate((s) => s.isolated)
  const name = useApp((s) => isolatedName(s.project, isolated))
  useEffect(() => {
    if (!isolated) return
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useIsolate.getState().clear()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [isolated])
  if (!isolated || !name) return null
  return (
    <div role="status" className="flex min-w-0 select-text items-center justify-between gap-2 rounded-control bg-fill py-1 pl-2.5 pr-1 text-label">
      <span className="min-w-0">
        Isolated: <span className="font-medium text-ink">{name}</span>
        <span className="block text-caption text-ink-secondary">{tr("The figures are its alone")}</span>
      </span>
      <button type="button" aria-label="Show everything" title={tr("Show everything (Esc)")} onClick={() => useIsolate.getState().clear()} className="grid h-6 w-6 place-items-center rounded-control text-ink-secondary hover:bg-hover hover:text-ink">
        <Icon name="close" className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

export function Overview() {
  const designProject = useApp((s) => s.project)
  const designDerived = useApp((s) => s.derived)
  const iso = useIsolatedDerived()
  const expanded = useOverview((s) => s.expanded)
  const project = iso?.project ?? designProject
  const derived = iso?.derived ?? designDerived
  // only the KPIs of the modules that are on: docks that are off read 0, not null, and still would show
  const on = new Set(kpisOn(project).map((k) => k.id))
  const groups = OVERVIEW_GROUPS.map((g) => ({ ...g, kpis: g.ids.filter((id) => on.has(id)).flatMap((id) => readKpi(id, project, derived) ?? []).filter((k) => k.value !== null) }))
  const group = (key: (typeof OVERVIEW_GROUPS)[number]['key']) => {
    const g = groups.find((x) => x.key === key)!
    return g.kpis.length === 0 ? null : (
      <Group key={g.key} id={g.key} label={g.label}>
        {g.kpis.map((k) => (
          <Metric key={k.id} k={k} />
        ))}
      </Group>
    )
  }
  return (
    <>
      <IsolatedChip />
      <div className="-mb-3 flex justify-end">
        <label className="flex shrink-0 items-center gap-1.5 text-label text-ink-secondary" title={tr("A building into its programs, a program into its masses")}>
          <input type="checkbox" className="h-3.5 w-3.5 accent-ink" checked={expanded} onChange={(e) => useOverview.getState().setExpanded(e.target.checked)} />
          {tr("Expand")}
        </label>
      </div>
      {group('site')}
      {group('built')}
      <Group id="programs" label="Footprint by program">
        <ProgramBars expanded={expanded} />
      </Group>
      <Group id="buildings" label="By building">
        <BuildingRows expanded={expanded} />
      </Group>
      {group('docks')}
      {group('parking')}
      {group('ground')}
      {/* mixed-use-mvp */}
      <ResumenResidencial />
    </>
  )
}
