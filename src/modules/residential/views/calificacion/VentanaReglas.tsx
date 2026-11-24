// La ventana «Reglas de calificación» (spec §6, la maqueta aprobada: `renderSheet`), dentro del `Frame` de Dialogs.tsx:
// edita un borrador de las reglas del proyecto y solo «Aplicar» lo escribe (un paso de deshacer, `setCalificacion`);
// ✕, Esc, un clic afuera o «Cancelar» lo descartan. A la izquierda, la lista: cada palanca con su peso (− / +) y su
// parte del puntaje, sus variables (calificación de hoy o ⚠) y «+ Variable»; al pie, la fuente del set y «Umbrales
// provisionales». A la derecha, la variable elegida (EditorVariable.tsx). El pie dice cuántas variables tienen error y
// desactiva Aplicar hasta corregirlas. El borrador se califica con los datos de la opción en vista, como la pestaña.
import { useMemo, useState } from 'react'
import { actions } from '../../../../state/actions/index.ts'
import { useApp } from '../../../../state/store.ts'
import { useUi } from '../../../../views/layout/ui.ts'
import { calificar, type Traza } from '../../engine/calificacion/calificar.ts'
import { datosDeOpcion } from '../../engine/calificacion/datos.ts'
import { evaluarFormula } from '../../engine/calificacion/formula.ts'
import { PALANCAS, PALANCA_ES, REGLAS_INICIO, reglasDe, validarVariable, type Palanca, type Reglas, type Variable } from '../../engine/calificacion/reglas.ts'
import { CAMPO, CampoAlSalir, EditorVariable } from './EditorVariable.tsx'
import { Valor } from './piezas.tsx'

const BOTON = 'pressable h-7 shrink-0 rounded-control px-3 text-label'
const copia = (r: Reglas): Reglas => structuredClone(r)

/** Una variable nueva en la palanca, con un id que no se repite (la de la maqueta). */
function nueva(r: Reglas, lever: Palanca): Variable {
  let n = 1
  while (r.variables.some((v) => v.id === `nueva_${n}`)) n++
  return { id: `nueva_${n}`, label: 'Nueva variable', lever, formula: 'm2_vendibles / unidades', mode: 'higher', steps: [90, 80, 70, 60], unit: 'm²/unidad', legalRef: 'Por definir' }
}

export function VentanaReglas() {
  const project = useApp((s) => s.project)
  const option = useApp((s) => s.derived.option)
  const help = useUi((s) => s.help)
  const [borrador, setBorrador] = useState(() => copia(reglasDe(project)))
  const [sel, setSel] = useState(0)
  const [nuevaId, setNuevaId] = useState<string | null>(null)
  const { enUso, otras } = useMemo(() => datosDeOpcion(project, option), [project, option])

  const c = calificar(borrador, enUso, otras)
  const trazas = new Map<Variable, Traza>(c.palancas.flatMap((l) => l.trazas.map((t) => [t.variable, t] as const)))
  const estado = borrador.variables.map((v) => {
    const ev = evaluarFormula(v.formula, enUso)
    const msg = validarVariable(v)
    return { ev, msg, mal: 'err' in ev || msg != null }
  })
  const errores = estado.filter((e) => e.mal).length
  const sinModulo = !project.residential
  const i = Math.min(sel, borrador.variables.length - 1)
  const v = borrador.variables[i]
  const tot = PALANCAS.reduce((a, l) => a + borrador.weights[l], 0) || 1

  const cambiarVariable = (k: number, parcial: Partial<Variable>) =>
    setBorrador((r) => ({ ...r, variables: r.variables.map((x, j) => (j === k ? { ...x, ...parcial } : x)) }))
  const peso = (l: Palanca, w: number) => setBorrador((r) => ({ ...r, weights: { ...r.weights, [l]: Number.isFinite(w) && w >= 0 ? +w.toFixed(2) : 0 } }))
  const agregar = (l: Palanca) => {
    const n = nueva(borrador, l)
    setBorrador((r) => ({ ...r, variables: [...r.variables, n] }))
    setSel(borrador.variables.length)
    setNuevaId(n.id)
  }
  const quitar = (k: number) => {
    setBorrador((r) => ({ ...r, variables: r.variables.filter((_, j) => j !== k) }))
    setSel(Math.max(0, k - 1))
  }
  const cerrar = () => useUi.getState().closeDialog()
  const aplicar = () => {
    useApp.getState().apply((p) => actions.setCalificacion(p, borrador))
    cerrar()
  }

  return (
    <div className="panel flex h-full min-h-0 flex-col rounded-panel">
      <header className="flex flex-wrap items-center gap-3 border-b border-separator p-panel-pad pr-12">
        <div className="min-w-0 flex-1">
          <h2 className="text-headline" title={help ? undefined : 'Cada variable es una fórmula sobre los datos del proyecto; sus umbrales la llevan de −2 (penaliza) a +2 (compensa).'}>
            Reglas de calificación
          </h2>
          {help && <p className="text-caption text-ink-secondary">Cada variable es una fórmula sobre los datos del proyecto; sus umbrales la llevan de −2 (penaliza) a +2 (compensa).</p>}
        </div>
        <button
          type="button"
          title="Vuelve a las reglas de SPEC_DEMO §5"
          onClick={() => {
            setBorrador(copia(REGLAS_INICIO))
            setSel(0)
          }}
          className={`${BOTON} text-ink-secondary hover:bg-hover hover:text-ink`}
        >
          Restablecer
        </button>
        <button type="button" disabled title="Por decidir" className={`${BOTON} text-ink-tertiary disabled:cursor-default`}>
          Importar Excel…
        </button>
      </header>

      <div className="flex min-h-0 flex-1 phone:flex-col">
        <section aria-label="Palancas y variables" className="flex w-[300px] shrink-0 flex-col gap-3 overflow-y-auto border-r border-separator p-3 phone:w-full phone:border-r-0">
          {PALANCAS.map((l) => {
            const parte = Math.round((borrador.weights[l] / tot) * 100)
            return (
              <div key={l} role="group" aria-label={PALANCA_ES[l]} className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-label font-semibold text-ink">{PALANCA_ES[l]}</span>
                  <span className="flex items-center" title={`Peso: ${parte}% del puntaje`}>
                    <button type="button" aria-label={`Bajar el peso de ${PALANCA_ES[l]}`} onClick={() => peso(l, Math.max(0, borrador.weights[l] - 0.5))} className={`${BOTON} w-7 px-0 text-ink-secondary hover:bg-hover`}>
                      −
                    </button>
                    <CampoAlSalir
                      valor={String(borrador.weights[l])}
                      guardar={(s) => peso(l, Number(s.trim().replace(',', '.')))}
                      aria-label={`Peso de ${PALANCA_ES[l]}`}
                      inputMode="decimal"
                      className={`${CAMPO} w-11 text-center tabular-nums`}
                    />
                    <button type="button" aria-label={`Subir el peso de ${PALANCA_ES[l]}`} onClick={() => peso(l, borrador.weights[l] + 0.5)} className={`${BOTON} w-7 px-0 text-ink-secondary hover:bg-hover`}>
                      +
                    </button>
                  </span>
                </div>
                <div aria-hidden className="flex items-center gap-2">
                  <span className="relative h-1 flex-1 overflow-hidden rounded-pill bg-fill">
                    <i className="absolute inset-y-0 left-0 bg-ink-secondary" style={{ width: `${parte}%` }} />
                  </span>
                  <span className="w-8 text-right text-caption tabular-nums text-ink-tertiary">{parte}%</span>
                </div>
                {borrador.variables.map((x, k) =>
                  x.lever !== l ? null : (
                    <button
                      key={x.id}
                      type="button"
                      data-variable=""
                      aria-current={k === i}
                      onClick={() => setSel(k)}
                      className={`grid grid-cols-[1fr_auto] gap-x-2 rounded-control px-2 py-1.5 text-left ${k === i ? 'bg-fill' : 'hover:bg-hover'}`}
                    >
                      <span className={`truncate text-label ${estado[k].mal ? 'text-status-over' : 'text-ink'}`}>{x.label}</span>
                      {estado[k].mal ? (
                        <span title="Con error" className="text-label text-status-over">
                          ⚠
                        </span>
                      ) : (
                        <Valor rating={trazas.get(x)?.rating ?? null} />
                      )}
                      <code className="col-span-2 truncate text-[10.5px] text-ink-tertiary">{x.formula || '—'}</code>
                    </button>
                  ),
                )}
                <button type="button" onClick={() => agregar(l)} className={`${BOTON} self-start px-2 text-ink-secondary hover:bg-hover hover:text-ink`}>
                  + Variable
                </button>
              </div>
            )
          })}
          <div className="mt-1 flex flex-col gap-1.5 border-t border-separator pt-3">
            <label className="flex flex-col gap-1">
              <span className="text-caption text-ink-tertiary">Fuente del set</span>
              <textarea
                key={borrador.source}
                rows={3}
                defaultValue={borrador.source}
                onBlur={(e) => {
                  const s = e.currentTarget.value
                  setBorrador((r) => ({ ...r, source: s }))
                }}
                className="min-w-0 resize-y rounded-control bg-fill px-2 py-1 text-caption text-ink outline-none focus:bg-hover"
              />
            </label>
            <label className="flex items-center gap-2 text-label text-ink-secondary">
              <input type="checkbox" checked={borrador.provisional} onChange={(e) => setBorrador((r) => ({ ...r, provisional: e.target.checked }))} />
              Umbrales provisionales
            </label>
          </div>
        </section>

        <section aria-label="Variable elegida" className="min-w-0 flex-1 overflow-y-auto p-panel-pad">
          {v ? (
            <EditorVariable
              key={v.id}
              v={v}
              traza={trazas.get(v)}
              ev={estado[i].ev}
              msg={estado[i].msg}
              help={help}
              enfocar={nuevaId === v.id}
              cambiar={(parcial) => cambiarVariable(i, parcial)}
              quitar={() => quitar(i)}
            />
          ) : (
            <p className="text-label text-ink-secondary">No hay variables. Agrega una con «+ Variable».</p>
          )}
        </section>
      </div>

      <footer className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2 border-t border-separator p-3">
        <span className={`min-w-0 flex-1 text-caption ${errores || sinModulo ? 'text-status-over' : 'text-ink-secondary'}`}>
          {sinModulo
            ? 'Solo con la tipología Uso mixto'
            : errores
              ? `${errores} variable${errores > 1 ? 's' : ''} con error: corrígela${errores > 1 ? 's' : ''} para aplicar`
              : `${borrador.variables.length} variables en ${PALANCAS.length} palancas · los cambios se ven al aplicar`}
        </span>
        <button type="button" onClick={cerrar} className={`${BOTON} text-ink hover:bg-hover`}>
          Cancelar
        </button>
        <button
          type="button"
          disabled={errores > 0 || sinModulo}
          onClick={aplicar}
          className={`${BOTON} bg-ink font-semibold text-on-ink shadow-control hover:opacity-90 disabled:opacity-40`}
        >
          Aplicar
        </button>
      </footer>
    </div>
  )
}
