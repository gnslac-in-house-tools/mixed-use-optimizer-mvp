// A typology is a TEMPLATE, not a separate app: the programs and site rules a new project starts with.
// The engine never imports typologies; it only sees the programs copied into the project.
// Later a typology may also switch on typology-specific engines (e.g. truck courts for industrial).
import type { Program, Project, Rule, SiteRules, Standards } from '../model/schema.ts'

export interface Typology {
  id: string
  name: string
  description: string
  programs: Program[]
  siteRules: SiteRules
  /** The KPI strip a new project starts with (ids of engine/kpis.ts; `program:<id>` for a program's footprint). */
  kpis: string[]
  /** The height of a new project's first level (m): what its masses are, unless they say otherwise. */
  levelHeight: number
  /** The brief's rules a new project starts with, between its programs (Decision "Rules"): example values. */
  rules?: Rule[]
  /** The circulation's standards a new project starts with (Decision "Exterior circulation"; absent: the engine's). */
  standards?: Standards
  /**
   * The modules it offers beyond the core (Decision "Modules"; ids of `modules/index.ts`; the user: "if I create another
   * typology, a house for example, docks make no sense there"): what creates something of a module (a tool's entry, the
   * Brief's docks column) shows when the typology offers it, the rest only once the project has something the module acts
   * on (Decision "What is not there is not shown"). An unknown typology offers them all (`modulesOf`, in `modules/catalog.ts`).
   */
  modules: string[]
  /** A new structural grid's bays (m) and modules per bay (Decision "Structural grid"; absent: the engine's). */
  grid?: { x: number; y: number; modules: number }
  /**
   * Each plugin's defaults for this typology, by plugin id (the twin of `Project.plugins`): opaque to the core, read by
   * the plugin with its own schema through `plugins/host.ts` (the optimizer's templates and stage plans: plans.ts).
   */
  plugins?: Record<string, unknown>
  /** mixed-use-mvp: the fields a module adds to a new project (Uso mixto: `residential`), from its programs. */
  extra?(programs: Program[]): Partial<Project>
}
