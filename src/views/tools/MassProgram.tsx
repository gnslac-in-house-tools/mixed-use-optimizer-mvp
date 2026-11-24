// The program a block drawn with Draw takes (Decisions "Mass with its program", "Draw makes a block"): the Massing group's ▾ holds it
// (GroupOptions.tsx, "Draw makes"). Picking one takes the Draw tool. Its colour's dot before it. With nothing picked yet the select shows
// what Draw makes: the brief's first program. The stroke is the outer face of a block of that program's type, drawn free; a program with
// its type has ▦ before it, one without gets its type (from the typology's defaults) on the first stroke. *No program* is the shared
// *Block* type; *＋ New block…* begins a type in the Program window.
import { useApp } from '../../state/store.ts'
import { useModule } from '../modules.ts'
import { newType, openProgram } from '../../modules/warehouse/views/commands.ts'
import { newMassProgram, useMassProgram } from '../plan/tools/toolState.ts'
import { SHOW_SELECT } from '../show/ShowControls.tsx'
import { take } from './hand.ts'
import { planToolsRefusal } from './pickTool.ts'
import { t as tr } from '../../i18n/idioma.ts' // mixed-use-mvp

/** The select's value for *＋ New block…* (another option's is a program's id). */
const NEW_PROGRAM = 'new-program'

export function MassProgram() {
  const programs = useApp((s) => s.project.programs)
  const types = useApp((s) => s.project.warehouseTypes)
  const picked = useMassProgram((s) => s.programId)
  const id = useApp((s) => newMassProgram(s.project, picked))
  const colour = programs.find((g) => g.id === id)?.color
  const typed = (programId: string | null) => types?.some((t) => t.program === programId) ?? false
  // beginning a block type is the warehouse module's: the typology offers it (Decision "What is not there is not shown")
  const { offered: warehouse } = useModule('warehouse')
  return (
    <div className="flex w-56 items-center gap-1.5">
      {id !== null && typed(id) ? (
        <span aria-hidden className="shrink-0 text-label leading-none text-ink-secondary">
          ▦
        </span>
      ) : (
        <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-pill border border-separator" style={{ background: colour ?? 'transparent' }} />
      )}
      <select
        aria-label="New block’s program"
        title="The program a block drawn with Draw takes; the stroke is its outer face, drawn free. A program with its type (▦) draws a block of it; one without gets its type on the first stroke"
        value={id ?? ''}
        onChange={(e) => {
          const v = e.target.value
          if (v === NEW_PROGRAM) {
            newType()
            openProgram()
            return
          }
          useMassProgram.getState().setProgram(v === '' ? null : v)
          // the pick is kept either way; Draw is taken where the plan can be drawn on (not the 3D alone, not Compare)
          if (planToolsRefusal() === true) take('mass')
        }}
        className={SHOW_SELECT}
      >
        <option value="">{tr("No program")}</option>
        {programs.map((g) => (
          <option key={g.id} value={g.id}>
            {typed(g.id) ? `▦ ${g.name}` : g.name}
          </option>
        ))}
        {warehouse && <option value={NEW_PROGRAM}>＋ New block…</option>}
      </select>
    </div>
  )
}
