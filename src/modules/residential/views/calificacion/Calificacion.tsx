// La pestaña «Calificación» del Resumen (spec §5): la etiqueta «provisional» y el botón de reglas, la tarjeta del
// puntaje, una fila por palanca que se despliega en sus variables y el pie con «Editar reglas…». Lo que explica cada
// número (umbrales, porqué, fórmula y fuente) va oculto (GIM, Decision «Help»): sale en una tarjeta a la izquierda del
// panel al pasar el cursor o con el foco, y en línea con el ? de GIM encendido. Solo lee: calcula `calificacionDe`.
import { useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../../../../views/controls/Icon.tsx'
import { useUi } from '../../../../views/layout/ui.ts'
import { useShown } from '../../../../views/viewport/look.ts'
import type { Calificacion as Cal, Traza } from '../../engine/calificacion/calificar.ts'
import { PALANCAS, PALANCA_ES, reglasDe } from '../../engine/calificacion/reglas.ts'
import { BarraBandas, BarraSuma, DetalleVariable, Puntos, Valor, conSigno, fmtValor, leer } from './piezas.tsx'
import { useCalificacion, usePalancasAbiertas } from './useCalificacion.ts'

const ANCHO_TARJETA = 268
const color = (r: number) => (r > 0 ? 'text-status-within' : r < 0 ? 'text-status-over' : 'text-ink-secondary')

type Tarjeta = { traza: Traza; left: number; top: number }

function Puntaje({ c }: { c: Cal }) {
  const hay = c.n > 0 && c.puntaje != null && Number.isFinite(c.puntaje)
  return (
    <div role="group" aria-label="Puntaje" className="grid grid-cols-[auto_1fr] items-center gap-x-3.5 gap-y-1.5 rounded-panel border border-separator bg-panel-sunken px-3.5 pb-3 pt-3.5">
      <span className={`row-span-2 text-[30px] font-semibold leading-none tracking-tight tabular-nums ${hay ? color(c.puntaje!) : 'text-ink-tertiary'}`}>
        {hay ? conSigno(c.puntaje!) : '—'}
      </span>
      <BarraSuma calificacion={c} />
      <span className="text-caption text-ink-secondary">
        {hay ? `sobre ${c.n} de ${PALANCAS.length} palancas · ${c.nVars} de ${c.nTot} variables` : 'sin datos'}
      </span>
    </div>
  )
}

type PropsVariable = { t: Traza; primera: boolean; help: boolean; tip: string | undefined; mostrar(t: Traza, el: HTMLElement): void; ocultar(): void }

function Variable({ t, primera, help, tip, mostrar, ocultar }: PropsVariable) {
  const sin = t.rating == null
  return (
    <div
      role="group"
      tabIndex={0}
      aria-label={`${t.variable.label}: ${fmtValor(t)}, ${leer(t.rating)}`}
      aria-describedby={tip}
      onMouseEnter={(e) => mostrar(t, e.currentTarget)}
      onMouseLeave={ocultar}
      onFocus={(e) => mostrar(t, e.currentTarget)}
      onBlur={ocultar}
      className={`relative flex flex-col gap-2 rounded-control pb-2.5 pt-2 ${primera ? '' : 'border-t border-dashed border-separator'}`}
    >
      <Linea t={t} sin={sin} />
      <div className="mr-[34px]">
        <BarraBandas traza={t} />
        {help && <DetalleVariable traza={t} />}
      </div>
    </div>
  )
}

function Linea({ t, sin }: { t: Traza; sin: boolean }) {
  return (
    <div className="grid grid-cols-[1fr_auto_26px] items-baseline gap-2">
      <span className={`truncate text-label ${sin ? 'text-ink-secondary' : 'text-ink'}`}>{t.variable.label}</span>
      <span className="text-caption tabular-nums text-ink-secondary">{fmtValor(t)}</span>
      <Valor rating={t.rating} />
    </div>
  )
}

export function Calificacion() {
  const c = useCalificacion()
  const reglas = reglasDe(useShown((s) => s.project))
  const help = useUi((s) => s.help)
  const abiertas = usePalancasAbiertas((s) => s.abiertas)
  const alternar = usePalancasAbiertas((s) => s.alternar)
  const raiz = useRef<HTMLDivElement>(null)
  const [tarjeta, setTarjeta] = useState<Tarjeta | null>(null)
  const idTip = useId()
  const editar = () => useUi.getState().openDialog('calificacion')

  const mostrar = (traza: Traza, el: HTMLElement) => {
    if (help) return
    const r = el.getBoundingClientRect()
    const panel = raiz.current?.getBoundingClientRect()
    const left = Math.max(12, (panel?.left ?? r.left) - ANCHO_TARJETA - 12)
    const top = Math.max(12, Math.min(r.top - 6, window.innerHeight - 280))
    setTarjeta({ traza, left, top })
  }
  const ocultar = () => setTarjeta(null)
  const visible = tarjeta && !help ? tarjeta : null

  return (
    <div ref={raiz} className="flex flex-col gap-3.5">
      <div className="flex items-center gap-2">
        {reglas.provisional && (
          <span title={reglas.source} className="rounded-pill bg-fill px-2 py-0.5 text-caption text-ink-secondary">
            provisional
          </span>
        )}
        <span className="flex-1" />
        <button
          type="button"
          aria-label="Editar reglas de calificación"
          title="Editar reglas…"
          onClick={editar}
          className="pressable grid h-7 w-7 place-items-center rounded-control text-ink-secondary hover:bg-hover hover:text-ink"
        >
          <Icon name="sliders" />
        </button>
      </div>

      <Puntaje c={c} />

      <div className="flex flex-col">
        {c.palancas.map((l) => {
          const abierta = abiertas.includes(l.palanca)
          return (
            <div key={l.palanca} className="border-t border-separator py-1 first:border-t-0">
              <button
                type="button"
                aria-expanded={abierta}
                aria-label={`${PALANCA_ES[l.palanca]}: ${leer(l.rating)}, peso ${l.peso}`}
                onClick={() => alternar(l.palanca)}
                className="grid min-h-[40px] w-full grid-cols-[10px_1fr_70px_26px] items-center gap-2 rounded-control px-1.5 text-left hover:bg-hover focus-visible:-outline-offset-2"
              >
                <Icon name="chevronRight" className={`h-2.5 w-2.5 text-ink-tertiary transition-transform duration-fast motion-reduce:transition-none ${abierta ? 'rotate-90' : ''}`} />
                <span className="truncate text-body font-medium text-ink">
                  {PALANCA_ES[l.palanca]}
                  <small className="ml-1 text-caption font-normal text-ink-tertiary">×{l.peso}</small>
                </span>
                <Puntos rating={l.rating} />
                <Valor rating={l.rating} />
              </button>
              {abierta && (
                <div className="flex flex-col pb-1 pl-[24px] pr-1.5">
                  {l.trazas.map((t, i) => (
                    <Variable key={t.variable.id} t={t} primera={i === 0} help={help} tip={visible?.traza === t ? idTip : undefined} mostrar={mostrar} ocultar={ocultar} />
                  ))}
                  {!l.trazas.length && <p className="py-2 text-caption text-ink-secondary">sin variables</p>}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-2 border-t border-separator pt-3">
        <span className="min-w-0 flex-1 truncate text-caption text-ink-tertiary" title={reglas.source}>
          {help ? `Fuente: ${reglas.source}` : ''}
        </span>
        <button type="button" onClick={editar} className="pressable h-7 shrink-0 rounded-control px-2.5 text-label text-ink-secondary hover:bg-hover hover:text-ink">
          Editar reglas…
        </button>
      </div>

      {visible &&
        createPortal(
          <div
            id={idTip}
            role="tooltip"
            className="panel pointer-events-none fixed z-[80] flex flex-col gap-2 rounded-panel px-3.5 py-3 shadow-sheet"
            style={{ left: visible.left, top: visible.top, width: ANCHO_TARJETA }}
          >
            <Linea t={visible.traza} sin={visible.traza.rating == null} />
            <div>
              <BarraBandas traza={visible.traza} />
              <DetalleVariable traza={visible.traza} />
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
