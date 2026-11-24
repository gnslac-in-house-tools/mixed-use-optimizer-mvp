// La celda de la barra de KPIs de un KPI `calif-*` (spec §4; la maqueta aprobada, `renderKpis`): sigue el patrón de GIM
// (nombre, cifra, línea; Full, Medium y Compact). El puntaje lleva el punto de estado, la cifra con signo y la mini barra
// de lo que aporta cada palanca; la línea dice «compensa · N de 5 palancas · provisional». Una palanca lleva su
// calificación en su color y la escala de 5 puntos; la línea dice «N de M variables · ×peso». Un clic abre la pestaña
// «Calificación» (con esa palanca desplegada), como la celda de Issues abre la suya. Aquí va también el interruptor
// «KPIs: Calificación · Proyecto» que la barra pone a su inicio.
import type { KpiValue } from '../../../../engine/kpis.ts'
import { showPanel, useUi } from '../../../../views/layout/ui.ts'
import { useShown } from '../../../../views/viewport/look.ts'
import { PALANCAS, reglasDe } from '../../engine/calificacion/reglas.ts'
import { BarraSuma, Puntos, conSigno, leer, texto } from './piezas.tsx'
import { Segmented, type SegmentedOption } from '../../../../views/controls/Segmented.tsx'
import { useJuegoKpis, type Juego } from './juegoKpis.ts'
import { abrirPalanca, useCalificacion } from './useCalificacion.ts'

// las de la celda de GIM (views/stats/KpiStrip.tsx), para que la celda mida lo mismo
const CELDA = 'min-w-0 px-panel-pad phone:w-[max(11rem,34%)] phone:shrink-0 phone:snap-start'
const PUNTAJE = 'calif-puntaje'
const PUNTO = 'h-2.5 w-2.5 shrink-0 self-center rounded-pill'
const fondo = (r: number) => (r > 0 ? 'var(--status-within)' : r < 0 ? 'var(--status-over)' : 'var(--ink-secondary)')
const estadoDe = (r: number | null) => (r == null ? 'sin datos' : r > 0 ? 'compensa' : r < 0 ? 'penaliza' : 'neutral')

/** Abre la pestaña «Calificación» (y el panel a la vista): el clic de la celda del puntaje. */
function abrirPestana(): void {
  useUi.getState().setSummaryTab('calificacion')
  showPanel('right')
}

export function CeldaCalificacion({ kpi, grande = false }: { kpi: KpiValue; grande?: boolean }) {
  const size = useUi((s) => s.kpiSize)
  const provisional = reglasDe(useShown((s) => s.project)).provisional
  const c = useCalificacion()
  const compact = size === 'compact'
  const r = kpi.value != null && Number.isFinite(kpi.value) ? kpi.value : null
  const esPuntaje = kpi.id === PUNTAJE
  const palanca = esPuntaje ? null : c.palancas.find((l) => 'calif-' + l.palanca === kpi.id)

  const estado = estadoDe(r)
  const linea = esPuntaje
    ? `${estado} · ${c.n} de ${PALANCAS.length} palancas${provisional ? ' · provisional' : ''}`
    : palanca
      ? `${palanca.trazas.filter((t) => t.rating != null).length} de ${palanca.trazas.length} variables · ×${palanca.peso}`
      : null
  const nombre = esPuntaje
    ? `${kpi.label} ${leer(r)}, ${estado}. Abre la pestaña Calificación`
    : `${kpi.label} ${leer(r)}. Abre la palanca en la pestaña Calificación`
  const cifra =
    size === 'full' ? `text-title ${grande ? 'xl:text-[2.25rem] xl:leading-[1.05]' : ''}` : size === 'medium' ? 'text-headline' : 'text-body font-semibold'

  return (
    <div role="group" aria-label={kpi.label} className={CELDA}>
      <button
        type="button"
        aria-label={nombre}
        title={esPuntaje ? 'Σ calificación × peso · clic: abre la pestaña Calificación' : 'Clic: abre la palanca en la pestaña Calificación'}
        onClick={() => (palanca ? abrirPalanca(palanca.palanca) : abrirPestana())}
        className={`pressable -m-1 w-[calc(100%+0.5rem)] rounded-control p-1 text-left hover:bg-hover ${compact ? 'flex items-baseline gap-2' : 'block'}`}
      >
        <span className="block truncate text-label text-ink-secondary">{kpi.label}</span>
        <span className={`flex items-center ${compact ? 'min-w-0 gap-1.5' : 'gap-2'}`}>
          {esPuntaje && r != null && <span aria-hidden data-status={kpi.status ?? 'neutral'} className={PUNTO} style={{ background: fondo(r) }} />}
          <span className={`block shrink-0 select-text tabular-nums ${cifra} ${esPuntaje ? '' : texto(r)}`}>{r == null ? '—' : conSigno(r)}</span>
          {esPuntaje ? (
            !compact && (
              <span className="block min-w-[40px] max-w-[90px] flex-1">
                <BarraSuma calificacion={c} clase="h-1.5" />
              </span>
            )
          ) : (
            <Puntos rating={palanca?.rating ?? null} className={compact ? 'w-[56px]' : 'w-[70px]'} />
          )}
        </span>
        {size === 'full' && linea && <span className="block select-text truncate text-caption text-ink-secondary phone:hidden">{linea}</span>}
      </button>
    </div>
  )
}

const JUEGOS: SegmentedOption<Juego>[] = [
  { key: 'calificacion', label: 'Calificación' },
  { key: 'proyecto', label: 'Proyecto' },
]

/** El interruptor «KPIs: Calificación · Proyecto» al inicio de la barra (solo en un proyecto con el módulo residencial). */
export function InterruptorJuego() {
  const juego = useJuegoKpis((s) => s.juego)
  const setJuego = useJuegoKpis((s) => s.setJuego)
  return (
    <div className="flex items-center gap-2 px-panel-pad phone:shrink-0">
      <span aria-hidden className="text-label text-ink-secondary">
        KPIs
      </span>
      <Segmented kind="toggle" label="KPIs" options={JUEGOS} value={juego} onChange={setJuego} />
    </div>
  )
}
