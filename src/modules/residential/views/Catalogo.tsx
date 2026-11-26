// La pestaña «Departamentos» del panel derecho (pieza 3): Mi biblioteca (los planos del proyecto, que se editan) y la
// Biblioteca GFit (los tipos en tres anchos, que se copian para editarlos). El lápiz abre la ventana «Departamento».
import './unidad.css'
import { cuenta } from './rotulos.ts'
import { useApp } from '../../../state/store.ts'
import { actions } from '../../../state/actions/index.ts'
import { useUi } from '../../../views/layout/ui.ts'
import { useModule } from '../../../views/modules.ts'
import { bibliotecaGFit, copiaDe, TIPOS, UNIT_COLORS, type PlanCatalogo } from '../engine/catalogo.ts'
import { paramsDe } from '../engine/defaults.ts'
import { useEditorUnidad } from './editorUnidad.ts'
import { PlanMini } from './PlanMini.tsx'
import { areaPlan } from '../engine/tipologias.ts'

const area = (p: PlanCatalogo) => areaPlan(p)

function Tarjeta({ p, accion, onAccion, onBorrar }: { p: PlanCatalogo; accion: string; onAccion: () => void; onBorrar?: () => void }) {
  return (
    <li className="flex flex-col gap-1 rounded-control bg-fill p-2" data-plan={p.id}>
      <PlanMini p={p} h={64} />
      <div className="flex items-start gap-2">
        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-pill" style={{ background: UNIT_COLORS[p.typeId] ?? '#ccc' }} />
        {/* el nombre entero: hasta dos renglones, completo al pasar el mouse */}
        <span data-nombre title={p.name} className="line-clamp-2 min-w-0 flex-1 break-words text-label text-ink">{p.name}</span>
        {onBorrar && (
          <button type="button" className="pressable text-caption text-ink-secondary hover:text-ink" aria-label={`Borrar ${p.name}`} onClick={onBorrar}>✕</button>
        )}
        <button type="button" className="pressable rounded-control px-1.5 text-label text-ink hover:bg-hover" aria-label={`${accion} ${p.name}`} title={accion} onClick={onAccion}>✎</button>
      </div>
      <span data-medidas className="flex flex-col text-caption tabular-nums text-ink-secondary">
        <span className="whitespace-nowrap">{p.w.toFixed(2)} × {p.d.toFixed(2)} m</span>
        <span className="whitespace-nowrap">{area(p).toFixed(1)} m² · {cuenta(p.rooms.length, 'recinto', 'recintos')}</span>
      </span>
    </li>
  )
}

export function Catalogo() {
  const { offered } = useModule('residential')
  const project = useApp((s) => s.project)
  if (!offered || !project.residential) return <p className="text-body text-ink-secondary">Solo en la tipología Uso mixto.</p>
  const mios = (project.residential.catalogo ?? []) as PlanCatalogo[]
  const fondo = project.buildings[0] ? paramsDe(project, project.buildings[0].id).fondo : 8.1
  const gfit = bibliotecaGFit(TIPOS, fondo)
  const abrir = (id: string) => { useEditorUnidad.getState().abrir(id); useUi.getState().openDialog('unidad') }
  const editarCopia = (p: PlanCatalogo) => {
    const c = copiaDe(p, mios)
    useApp.getState().apply((q) => actions.guardarPlan(q, c))
    abrir(c.id)
  }
  return (
    <section aria-label="Departamentos" className="flex flex-col gap-3">
      <h3 className="text-label text-ink">Mi biblioteca</h3>
      {mios.length ? (
        <ul className="grid grid-cols-2 gap-2" aria-label="Mi biblioteca">
          {mios.map((p) => (
            <Tarjeta key={p.id} p={p} accion="Editar" onAccion={() => abrir(p.id)} onBorrar={() => useApp.getState().apply((q) => actions.borrarPlan(q, p.id))} />
          ))}
        </ul>
      ) : (
        <p className="text-caption text-ink-secondary">Copia un plano de la Biblioteca GFit con ✎ para editarlo.</p>
      )}
      <h3 className="text-label text-ink">Biblioteca GFit</h3>
      <ul className="grid grid-cols-2 gap-2" aria-label="Biblioteca GFit">
        {gfit.map((p) => <Tarjeta key={p.id} p={p} accion="Copiar y editar" onAccion={() => editarCopia(p)} />)}
      </ul>
    </section>
  )
}
