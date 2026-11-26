// Un departamento dibujado en sus Properties (spec 2026-11-26-blocks-residenciales): de qué plano de Mi biblioteca es
// copia (se cambia), Reflejar (en su lugar), Abrir en el editor y, si tiene variante, Volver al tipo. Cada cambio es un
// paso de deshacer de GIM.
import type { Id } from '../../../model/schema.ts'
import { actions } from '../../../state/actions/index.ts'
import { useApp } from '../../../state/store.ts'
import { SelectField } from '../../../views/controls/fields.tsx'
import { useUi } from '../../../views/layout/ui.ts'
import { useEditorUnidad } from './editorUnidad.ts'
import { useEdicionDepto, type ModoDepto } from './edicionDepto.ts'

const boton = 'pressable rounded-control bg-fill px-2 py-1 text-label text-ink hover:bg-hover'

export function PropiedadesDepto({ id }: { id: Id }) {
  const project = useApp((s) => s.project)
  const apply = useApp((s) => s.apply)
  const m = project.masses.find((x) => x.id === id)
  if (!m?.depto) return null
  const catalogo = project.residential?.catalogo ?? []
  const { destino, modo, poner } = useEdicionDepto()
  const opcion = (activo: boolean) => `pressable rounded-control px-2 py-1 text-label ${activo ? 'bg-ink text-on-ink' : 'bg-fill text-ink hover:bg-hover'}`
  return (
    <section aria-label="Departamento" className="flex flex-col gap-2">
      <h3 className="text-label text-ink-secondary">Departamento</h3>
      <SelectField label="Plano" value={m.depto.plan} options={catalogo.map((c) => ({ value: c.id, label: c.name }))} onCommit={(v) => apply((p) => actions.cambiarPlanDepto(p, id, v))} />
      {m.depto.variante && <p className="text-caption text-ink-secondary">Tiene su propia variante del plano.</p>}
      {/* editar en la planta y el 3D: a quién va el cambio y qué se edita */}
      <div className="flex flex-col gap-1" role="group" aria-label="Editar para">
        <span className="text-caption text-ink-secondary">Editar en planta y 3D para</span>
        <div className="flex gap-1">
          <button type="button" aria-pressed={destino === 'tipo'} className={opcion(destino === 'tipo')} title="El plano de Mi biblioteca: cambian todos los departamentos de este plano" onClick={() => poner({ destino: 'tipo' })}>Todo el tipo</button>
          <button type="button" aria-pressed={destino === 'unidad'} className={opcion(destino === 'unidad')} title="Solo este departamento: su variante" onClick={() => poner({ destino: 'unidad' })}>Esta unidad</button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Qué editar">
        {([['muros', 'Muros'], ['muebles', 'Muebles'], ['puerta', 'Puertas'], ['ventana', 'Ventanas']] as [ModoDepto, string][]).map(([k, label]) => (
          <button key={k} type="button" aria-pressed={modo === k} className={opcion(modo === k)} onClick={() => poner({ modo: k })}>{label}</button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        <button type="button" className={boton} onClick={() => apply((p) => actions.reflejarDepto(p, id))}>Reflejar</button>
        <button
          type="button"
          className={boton}
          onClick={() => {
            useEditorUnidad.getState().abrir(m.depto!.plan)
            useUi.getState().openDialog('unidad')
          }}
        >
          Abrir en el editor
        </button>
        {m.depto.variante && <button type="button" className={boton} onClick={() => apply((p) => actions.volverAlTipo(p, id))}>Volver al tipo</button>}
      </div>
    </section>
  )
}
