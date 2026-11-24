// La variable elegida en la ventana «Reglas de calificación» (spec §6, la maqueta aprobada: `renderSheet`): el nombre
// como título, Palanca, Unidad y Fuente; la tarjeta Fórmula (evaluada al teclear, sin perder el cursor; el resultado de
// hoy, el mensaje y los chips de los datos) y la tarjeta Cómo se califica (los 4 modos, las 5 bandas con el marcador de
// hoy, los 4 umbrales en % si el modo es de mediana o la unidad es %, y la frase). Los campos, salvo la fórmula, se
// guardan al salir (blur o Enter). Solo edita el borrador: la ventana decide cuándo se aplica.
import { useEffect, useLayoutEffect, useRef, type InputHTMLAttributes } from 'react'
import type { Traza } from '../../engine/calificacion/calificar.ts'
import { DATOS_CALIFICACION } from '../../engine/calificacion/datos.ts'
import type { ResultadoFormula } from '../../engine/calificacion/formula.ts'
import { MODO_ES, PALANCAS, PALANCA_ES, type Modo, type Variable } from '../../engine/calificacion/reglas.ts'
import { BANDAS, conSigno, fmtValor, posicion, texto } from './piezas.tsx'

export const CAMPO = 'h-7 min-w-0 rounded-control bg-fill px-2 text-label text-ink outline-none focus:bg-hover'
const CAMPO_MAL = 'ring-1 ring-status-over'

const MODO_AYUDA: Record<Modo, string> = {
  higher: 'El valor alto compensa',
  lower: 'El valor bajo compensa',
  vsMedianHigher: 'Compara contra la mediana de las opciones: arriba compensa',
  vsMedianLower: 'Compara contra la mediana de las opciones: abajo compensa',
}
const MODOS = Object.keys(MODO_ES) as Modo[]
const BORDE = ['+2', '+1', '0', '−1']

const esMediana = (m: Modo) => m === 'vsMedianHigher' || m === 'vsMedianLower'
const enPct = (v: Variable) => esMediana(v.mode) || v.unit === '%'
const mayus = (s: string) => s[0].toUpperCase() + s.slice(1)

/** Un campo que guarda al salir (blur o Enter); vuelve a nacer si el borrador cambia por otro lado (Restablecer). */
export function CampoAlSalir({ valor, guardar, ...props }: { valor: string; guardar(s: string): void } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'defaultValue'>) {
  return (
    <input
      key={valor}
      defaultValue={valor}
      onBlur={(e) => {
        if (e.currentTarget.value !== valor) guardar(e.currentTarget.value)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
      {...props}
    />
  )
}

type Props = {
  v: Variable
  traza: Traza | undefined
  ev: ResultadoFormula
  msg: string | null
  help: boolean
  /** recién agregada: el título toma el foco, seleccionado */
  enfocar: boolean
  cambiar(parcial: Partial<Variable>): void
  quitar(): void
}

export function EditorVariable({ v, traza, ev, msg, help, enfocar, cambiar, quitar }: Props) {
  const raiz = useRef<HTMLDivElement>(null)
  const fx = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!enfocar) return
    const t = raiz.current?.querySelector<HTMLInputElement>('[data-titulo]')
    t?.focus()
    t?.select()
  }, [enfocar])
  // dónde estaba el cursor de la fórmula (de esta variable), y dónde ponerlo tras insertar un chip
  const cursor = useRef<{ id: string; pos: number } | null>(null)
  const pendiente = useRef<number | null>(null)
  useLayoutEffect(() => {
    if (pendiente.current == null || !fx.current) return
    fx.current.focus()
    fx.current.setSelectionRange(pendiente.current, pendiente.current)
    pendiente.current = null
  })
  const recordar = (el: HTMLInputElement) => {
    cursor.current = { id: v.id, pos: el.selectionStart ?? el.value.length }
  }
  const insertar = (k: string) => {
    const at = cursor.current?.id === v.id ? Math.min(cursor.current.pos, v.formula.length) : v.formula.length
    const antes = v.formula.slice(0, at)
    const ins = (antes && !/[\s(+\-*/]$/.test(antes) ? ' ' : '') + k
    cursor.current = { id: v.id, pos: at + ins.length }
    pendiente.current = at + ins.length
    cambiar({ formula: antes + ins + v.formula.slice(at) })
  }

  const err = 'err' in ev ? ev.err : null
  const falta = !err && 'falta' in ev ? ev.falta : null
  const motivo = !err && 'motivo' in ev ? ev.motivo : undefined
  const pieza2 = !!falta?.length && falta.every((k) => DATOS_CALIFICACION.find((d) => d.k === k)?.pieza === 2)
  const pct = enPct(v)
  const neg = v.mode === 'lower' || v.mode === 'vsMedianLower'
  const b = traza ? posicion(traza) : null
  const r = traza?.rating ?? null
  const mal = !!(msg || err)

  const umbral = (j: number, s: string) => {
    const raw = s.trim().replace(',', '.').replace('%', '')
    const n = raw === '' ? null : Number(raw)
    const steps = [...v.steps] as Variable['steps']
    steps[j] = n == null || !Number.isFinite(n) ? null : pct ? n / 100 : n
    cambiar({ steps })
  }

  return (
    <div ref={raiz} className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <CampoAlSalir
          valor={v.label}
          guardar={(s) => cambiar({ label: s })}
          aria-label="Nombre de la variable"
          data-titulo=""
          className="h-9 min-w-0 flex-1 rounded-control bg-transparent px-1.5 text-headline text-ink outline-none hover:bg-hover focus:bg-fill"
        />
        <button type="button" onClick={quitar} className="pressable h-7 shrink-0 rounded-control px-2.5 text-label text-status-over hover:bg-hover">
          Quitar
        </button>
      </div>
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-caption text-ink-tertiary">Palanca</span>
          <select aria-label="Palanca" value={v.lever} onChange={(e) => cambiar({ lever: e.target.value as Variable['lever'] })} className={CAMPO}>
            {PALANCAS.map((x) => (
              <option key={x} value={x}>
                {PALANCA_ES[x]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-caption text-ink-tertiary">Unidad</span>
          <CampoAlSalir valor={v.unit} guardar={(s) => cambiar({ unit: s })} aria-label="Unidad" className={`${CAMPO} w-[120px]`} />
        </label>
        <label className="flex min-w-[200px] flex-1 flex-col gap-1">
          <span className="text-caption text-ink-tertiary">Fuente · de dónde sale</span>
          <CampoAlSalir valor={v.legalRef} guardar={(s) => cambiar({ legalRef: s })} aria-label="Fuente · de dónde sale" className={CAMPO} />
        </label>
      </div>

      <section aria-label="Fórmula" className="flex flex-col gap-2 rounded-panel border border-separator bg-panel-sunken p-3.5">
        <div className="flex items-baseline gap-2">
          <h3 className="text-label font-semibold text-ink" title={help ? undefined : 'Con los datos del proyecto · + − × ÷ ( )'}>
            Fórmula
          </h3>
          {help && <span className="text-caption text-ink-tertiary">con los datos del proyecto · + − × ÷ ( )</span>}
        </div>
        <div className="flex items-stretch gap-2">
          <input
            ref={fx}
            aria-label="Fórmula"
            aria-invalid={!!err}
            spellCheck={false}
            autoComplete="off"
            value={v.formula}
            onChange={(e) => {
              recordar(e.currentTarget)
              cambiar({ formula: e.target.value })
            }}
            onSelect={(e) => recordar(e.currentTarget)}
            onBlur={(e) => recordar(e.currentTarget)}
            className={`${CAMPO} h-9 flex-1 font-mono ${err ? CAMPO_MAL : ''}`}
          />
          <div className="flex min-w-[90px] flex-col justify-center rounded-control bg-fill px-2.5">
            <span className="text-caption text-ink-tertiary">Hoy</span>
            <b className={`text-label tabular-nums ${err ? 'text-status-over' : 'text-ink'}`}>{err ? '⚠' : traza ? fmtValor(traza) : '—'}</b>
          </div>
        </div>
        <p className={`min-h-[1.25em] text-caption ${err ? 'text-status-over' : 'text-ink-secondary'}`}>
          {err ??
            (motivo
              ? `Sin dato hoy: con los datos de hoy ${motivo}.`
              : falta
                ? `Sin dato hoy: falta ${falta.join(', ')}${pieza2 ? ' (llega con la pieza 2)' : ''}.`
                : '')}
        </p>
        <div aria-label="Datos del proyecto" className="flex flex-wrap gap-1.5">
          {DATOS_CALIFICACION.map((d) => (
            <button
              key={d.k}
              type="button"
              title={`${d.label} · pieza ${d.pieza}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertar(d.k)}
              className={`pressable h-6 rounded-pill border px-2 font-mono text-caption text-ink-secondary hover:bg-hover hover:text-ink ${
                d.pieza === 2 ? 'border-dashed border-ink-tertiary' : 'border-separator bg-fill'
              }`}
            >
              {d.k}
            </button>
          ))}
        </div>
      </section>

      <section aria-label="Cómo se califica" className="flex flex-col gap-3 rounded-panel border border-separator bg-panel-sunken p-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="flex-1 text-label font-semibold text-ink">Cómo se califica</h3>
          <div role="group" aria-label="Modo" className="flex rounded-control bg-fill p-0.5">
            {MODOS.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={m === v.mode}
                title={MODO_AYUDA[m]}
                onClick={() => cambiar({ mode: m })}
                className={`pressable h-6 rounded-control px-2 text-caption ${m === v.mode ? 'bg-panel font-semibold text-ink shadow-control' : 'text-ink-secondary hover:text-ink'}`}
              >
                {MODO_ES[m]}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <div aria-hidden className="grid grid-cols-5 text-center text-caption tabular-nums text-ink-secondary">
            {['−2', '−1', '0', '+1', '+2'].map((x, i) => (
              <span key={x} className={r === i - 2 ? `font-semibold ${texto(r)}` : ''}>
                {x}
                <small className="ml-1 text-ink-tertiary">{['penaliza', '', 'neutral', '', 'compensa'][i]}</small>
              </span>
            ))}
          </div>
          <div aria-hidden className="relative grid h-2.5 grid-cols-5 gap-px">
            {BANDAS.map((c, i) => (
              <b key={c} className={`block ${i === 0 ? 'rounded-l-pill' : i === 4 ? 'rounded-r-pill' : ''} ${r === i - 2 ? 'ring-1 ring-ink-tertiary' : ''}`} style={{ background: c }} />
            ))}
            {b && <span title="Hoy" className="absolute -top-[3px] -ml-[2px] h-4 w-1 rounded-pill bg-ink ring-[1.5px] ring-[var(--panel)]" style={{ left: `${(b.pos * 100).toFixed(1)}%` }} />}
          </div>
          <div className="mx-[10%] grid grid-cols-4 gap-1.5">
            {[3, 2, 1, 0].map((j) => {
              const nombre = `${BORDE[j]} ${neg ? 'hasta' : 'desde'}`
              const s = v.steps[j]
              return (
                <label key={j} className="flex flex-col items-center gap-0.5">
                  <span className="text-caption text-ink-tertiary">{nombre}</span>
                  <span className="relative flex w-full max-w-[96px] items-center">
                    <CampoAlSalir
                      valor={s == null ? '' : String(pct ? +(s * 100).toFixed(2) : s)}
                      guardar={(x) => umbral(j, x)}
                      aria-label={nombre}
                      placeholder="—"
                      inputMode="decimal"
                      className={`${CAMPO} w-full text-right tabular-nums ${pct ? 'pr-5' : ''} ${msg ? CAMPO_MAL : ''}`}
                    />
                    {pct && <i className="pointer-events-none absolute right-2 text-caption not-italic text-ink-tertiary">%</i>}
                  </span>
                </label>
              )
            })}
          </div>
        </div>
        <p className={`text-label ${mal ? 'text-status-over' : 'text-ink-secondary'}`}>
          {msg ? (
            `⚠ ${mayus(msg)}.`
          ) : !traza || r == null ? (
            `Hoy no califica: ${traza?.porque ?? 'sin datos'}.`
          ) : (
            <>
              Hoy {esMediana(v.mode) ? `queda ${traza.porque}` : `vale ${fmtValor(traza)}`} → <b className={texto(r)}>{conSigno(r)}</b>
              {esMediana(v.mode) ? '' : ` (${traza.porque})`}.
            </>
          )}
        </p>
        {esMediana(v.mode) && help && <p className="text-caption text-ink-tertiary">Los umbrales son % contra la mediana de las opciones del proyecto.</p>}
      </section>
    </div>
  )
}
