// The KPI strip (IZA's cell pattern; port of Plaza-Practiko `vistas/paneles/KpiStrip.tsx`), made reconfigurable
// (Decision "KPI strip"): a white row with the project's chosen KPIs in their order, the first one large. Values come
// from the engine's registry (engine/kpis.ts) and every figure goes through views/format.ts. A KPI with a limit
// shows it, with a status dot (the only colour in the strip, because it is data). "Customize" picks and orders them.
// On a phone it is a row that slides with the finger. The Issues cell opens the Summary's Issues tab (Decision "Issues
// from the KPI", revised by "Issues, one list": that tab is where issues are told).
// While the viewport shows a look (Decision "Specimen preview": an optimizer's specimen), the strip gives its figures,
// the design's KPIs in their order, each with ▲▼ and how far from the design's under it: green or red where its owner
// knows which way is better (the run's objectives), grey elsewhere. The same in every step (Decision "Steps change the
// tools"): the roads' KPIs and Issues too. While the Overview isolates a building or a program (Decision "Isolate in the
// Overview"), its figures are that one's alone.
// Three sizes (Phase U.1, decided with the ribbon, Decision "Ribbon"): Full (the name, the figure, the line under it), Medium (no line under, a
// smaller figure), Compact (one line, the name and the figure side by side; what the app opens with, Decision "Compact
// by default"); a look's ▲▼ shows at every size. Its bottom edge is a grip (KpiGrip):
// dragged up it goes a size smaller per jump, down a size larger; ↑ ↓ on it, a double-click back to Full.
// mixed-use-mvp (calificación): with the residential module, a switch «KPIs: Calificación · Proyecto» opens the strip and
// picks the ids (modules/residential/views/calificacion/juegoKpis.ts); a `calif-*` cell is drawn by the module.
import { createContext, useContext, useRef, type ReactNode } from 'react'
import type { KpiValue } from '../../engine/kpis.ts'
import { readKpi } from '../../modules/catalog.ts'
import { CeldaCalificacion, InterruptorJuego } from '../../modules/residential/views/calificacion/CeldaCalificacion.tsx' // mixed-use-mvp
import { conJuego, esKpiCalificacion, idsDeLaBarra, useJuegoKpis } from '../../modules/residential/views/calificacion/juegoKpis.ts' // mixed-use-mvp
import { useApp } from '../../state/store.ts'
import { figure, formatFigure } from '../format.ts'
import { useLook } from '../viewport/look.ts'
import { useIsolatedDerived } from './isolate.ts'
import { showIssues } from './issueCommands.ts'
import { KpiPicker } from './KpiPicker.tsx'
import { KPI_SIZES, useUi, type KpiSize } from '../layout/ui.ts'
import { beginDrag } from '../controls/beginDrag.ts'
import { t as tr } from '../../i18n/idioma.ts' // mixed-use-mvp

/** The strip's size, for its cells. */
const Size = createContext<KpiSize>('full')

/** How far the grip moves for one jump of size. */
const JUMP_PX = 24
const PAD: Record<KpiSize, string> = { full: 'py-3 phone:py-2.5', medium: 'py-2', compact: 'py-1' }
// the unit beside the figure: smaller figures keep it readable
const UNIT: Record<KpiSize, string> = { full: 'text-[0.5em]', medium: 'text-[0.6em]', compact: 'text-[0.75em]' }

const STATUS_COLOR = { over: 'var(--status-over)', within: 'var(--status-within)' } as const

/** The line under a figure: its limit and how it stands, or nothing. */
function note(k: KpiValue): string | null {
  if (k.id === 'issues') return k.status === 'over' ? 'Has errors' : k.value ? 'Warnings only' : 'All rules met'
  if (k.id === 'brief') return k.value === null ? 'No targets yet' : k.status === 'within' ? 'Meets the brief' : k.value < 1 ? 'Under the brief' : 'Over the brief'
  if (k.limit === null) return null
  const limit = `max ${formatFigure(k.limit, k.unit)}`
  return k.status === 'over' ? `Over the ${limit}` : `Within the ${limit}`
}

/** A look's figure against the design's: ▲▼ and how far, or "= yours" when it rounds to nothing as shown. */
function against(k: KpiValue, mine: KpiValue | undefined, better: 'min' | 'max' | undefined): { text: string; tone: string } | null {
  if (k.value === null || !mine || mine.value === null) return null
  const delta = k.value - mine.value
  const shown = formatFigure(Math.abs(delta), k.unit)
  if (shown === formatFigure(0, k.unit)) return { text: '= yours', tone: 'text-ink-secondary' }
  const tone = !better ? 'text-ink-secondary' : (better === 'min') === delta < 0 ? 'text-status-within' : 'text-status-over'
  return { text: `${delta > 0 ? '▲' : '▼'} ${shown} vs yours`, tone }
}

export function KpiStrip() {
  const project = useApp((s) => s.project)
  const derived = useApp((s) => s.derived)
  const look = useLook((s) => s.look)
  const iso = useIsolatedDerived()
  // a look's figures (or the isolated ones), in the design's choice of KPIs
  const shown = look ?? iso
  const juego = useJuegoKpis((s) => s.juego) // mixed-use-mvp
  const ids = idsDeLaBarra(project, juego) // mixed-use-mvp: the project's choice, or the calificación's set
  const switcher = conJuego(project) // mixed-use-mvp
  const from = shown ?? { project, derived }
  const kpis = ids.flatMap((id) => readKpi(id, from.project, from.derived) ?? [])
  const mine = look ? new Map(ids.flatMap((id) => readKpi(id, project, derived) ?? []).map((k) => [k.id, k])) : null
  const columns = (switcher ? 'auto ' : '') + (kpis.length ? `minmax(0,1.3fr) repeat(${kpis.length - 1}, minmax(0,1fr)) auto` : 'minmax(0,1fr) auto')
  const size = useUi((s) => s.kpiSize)
  const compact = size === 'compact'

  return (
    <Size.Provider value={size}>
      <section className={`panel relative mx-gutter mb-gutter px-1 ${PAD[size]}`} aria-label="Project figures" data-kpi-size={size} data-tour="kpis">
        <div
          className="grid items-center divide-x divide-separator phone:no-scrollbar phone:flex phone:snap-x phone:snap-mandatory phone:overflow-x-auto"
          style={{ gridTemplateColumns: columns }}
        >
          {switcher && <InterruptorJuego />}
          {kpis.length === 0 && <p className="px-panel-pad text-body text-ink-secondary">{tr("No KPIs chosen: pick some with Customize.")}</p>}
          {kpis.map((k, i) => {
            const f = figure(k.value, k.unit)
            const sub = note(k)
            const vs = mine ? against(k, mine.get(k.id), look?.better?.[k.id]) : null
            if (esKpiCalificacion(k.id)) return <CeldaCalificacion key={k.id} kpi={k} grande={i === 0} /> // mixed-use-mvp
            const Wrap = k.id === 'issues' && derived.issues.length > 0 && !look ? IssuesCell : Cell
            return (
              <Wrap key={k.id} label={k.label}>
                <span className={`flex items-baseline ${compact ? 'min-w-0 gap-1.5' : 'gap-2'}`}>
                  {k.status && (
                    <span
                      aria-hidden
                      data-status={k.status}
                      className="h-2.5 w-2.5 shrink-0 self-center rounded-pill"
                      style={{ background: STATUS_COLOR[k.status] }}
                    />
                  )}
                  <span
                    className={`block select-text truncate tabular-nums ${
                      size === 'full' ? `text-title ${i === 0 ? 'xl:text-[2.25rem] xl:leading-[1.05]' : ''}` : size === 'medium' ? 'text-headline' : 'text-body font-semibold'
                    }`}
                  >
                    <span>{f.value}</span>
                    {f.unit && <span className={`${UNIT[size]} font-medium tracking-normal text-ink-secondary`}> {f.unit}</span>}
                  </span>
                </span>
                {/* a look's ▲▼ at every size (beside the figure when compact); the line under it, Full only */}
                {vs ? (
                  <div data-against={k.id} className={`min-w-0 select-text truncate text-caption tabular-nums phone:hidden ${vs.tone}`}>
                    {vs.text}
                  </div>
                ) : (
                  size === 'full' &&
                  sub && <div className={`select-text truncate text-caption phone:hidden ${k.status === 'over' ? 'text-status-over' : 'text-ink-secondary'}`}>{sub}</div>
                )}
              </Wrap>
            )
          })}
          <div className="px-2 phone:shrink-0">
            <KpiPicker />
          </div>
        </div>
        <KpiGrip />
      </section>
    </Size.Provider>
  )
}

/** The strip's bottom edge: dragged up a size smaller per jump, down a size larger; ↑ ↓; a double-click: Full. */
function KpiGrip() {
  const size = useUi((s) => s.kpiSize)
  const setSize = useUi((s) => s.setKpiSize)
  const drag = useRef<{ y: number; from: number } | null>(null)
  const index = KPI_SIZES.findIndex((k) => k.key === size)
  const to = (i: number) => setSize(KPI_SIZES[Math.min(KPI_SIZES.length - 1, Math.max(0, i))].key)
  const label = KPI_SIZES[index].label
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="KPI strip size"
      aria-valuetext={label}
      tabIndex={0}
      title={`KPI strip: ${label}. Drag up to shrink it, down to grow it; double-click: Full`}
      className="group absolute inset-x-0 -bottom-1 flex h-2.5 cursor-row-resize touch-none items-center justify-center outline-none"
      onPointerDown={(e) => {
        if (e.button !== 0) return
        beginDrag(e)
        drag.current = { y: e.clientY, from: index }
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (!d) return
        // up (a negative move) goes a size smaller: a larger index
        to(d.from - Math.round((e.clientY - d.y) / JUMP_PX))
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
      onDoubleClick={() => setSize('full')}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
        e.preventDefault()
        to(index + (e.key === 'ArrowUp' ? 1 : -1))
      }}
    >
      <span aria-hidden className="h-1 w-10 rounded-pill bg-separator opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
    </div>
  )
}

const CELL = 'min-w-0 px-panel-pad phone:w-[max(11rem,34%)] phone:shrink-0 phone:snap-start'

function Cell({ label, children }: { label: string; children: ReactNode }) {
  // compact: the name and the figure on one line
  const compact = useContext(Size) === 'compact'
  return (
    <div role="group" aria-label={label} className={`${CELL} ${compact ? 'flex items-baseline gap-2' : ''}`}>
      <div className="truncate text-label text-ink-secondary">{tr(label)}</div>
      {children}
    </div>
  )
}

/** The Issues cell while there are some: a click opens the Summary's Issues tab, where they are listed. */
function IssuesCell({ label, children }: { label: string; children: ReactNode }) {
  const issues = useApp((s) => s.derived.issues)
  const text = issues.length === 1 ? '1 issue' : `${issues.length} issues`
  const compact = useContext(Size) === 'compact'
  return (
    <div role="group" aria-label={label} className={CELL}>
      <button
        type="button"
        title={`${text}: a click shows them in the Summary's Issues`}
        onClick={() => showIssues(null)}
        className={`pressable -m-1 w-[calc(100%+0.5rem)] rounded-control p-1 text-left hover:bg-hover ${compact ? 'flex items-baseline gap-2' : 'block'}`}
      >
        <span className="block truncate text-label text-ink-secondary">{label}</span>
        {children}
      </button>
    </div>
  )
}
