// Project actions: what is about the project as a whole (its name). Pure, like the mass actions.
import type { Project } from '../../model/schema.ts'

/** A blank or unchanged name changes nothing (no empty undo step). */
export function renameProject(p: Project, name: string): Project {
  const n = name.trim()
  return n === '' || n === p.name ? p : { ...p, name: n }
}

/** The units CAD exports are written in (the model stays in metres). Metres removes the field; the same unit
 *  changes nothing (no empty undo step). */
export function setProjectUnits(p: Project, units: 'm' | 'ft'): Project {
  if ((p.units ?? 'm') === units) return p
  if (units === 'm') {
    const { units: _gone, ...rest } = p
    return rest
  }
  return { ...p, units }
}
