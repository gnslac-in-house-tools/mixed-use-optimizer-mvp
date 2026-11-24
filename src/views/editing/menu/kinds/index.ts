// The core's kinds that have their verbs in the one right-click menu (Phase AS.4): each file registers its runners (`../verbs.ts`) when it is
// loaded, and `../build.ts` loads this one. A new kind's file is one line here; a module's kinds register from its own `views/`
// (`../modules.ts`). The building and the level, the rows of Layers that are not picked on the plan, register here too; the branch rows (Streets, Gates…) are not kinds: `branch.ts` is their menu.
import './mass.ts'
import './building.ts'
import './level.ts'
import './street.ts'
import './existing-road.ts'
import './gate.ts'
import './lot.ts'
import './dimension.ts'
import './note.ts'
import './reference-line.ts'
import './drawing.ts'
import './grid.ts'
