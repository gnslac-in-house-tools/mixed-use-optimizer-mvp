// The project's units as the CAD exports read them (Decision "Project units"). The model is always in metres
// (Decision "Units and currency"); this only says what a CAD file is told its units are. Pure.
import type { Project } from '../model/schema.ts'

export type Units = NonNullable<Project['units']>

/** The project's units: metres unless it says feet. */
export const unitsOf = (p: Project): Units => p.units ?? 'm'
