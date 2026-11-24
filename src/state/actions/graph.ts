// The brief's rules and the graph's verbs (Decisions "Rules" and "Graph mode"). Pure, like every action, and the MCP
// tools of the graph:
//   addRule · updateRule · removeRule   the rules between programs (the Brief's list, or a line drawn between two
//                                       program bubbles in the Graph)
//   addNode · addFromBrief              new masses, each placed where its program's rules ask (engine/graph/place.ts)
//   arrange                             the option's masses slide to meet the rules (engine/graph/arrange.ts)
//   solve                               both: the brief's missing masses, then arrange (the Issues tab's ▶ Solve all)
//   solveIssue                          one issue alone: its program's missing masses, or its masses arranged (a Solve
//                                       per issue in the Issues tab: Decision "Issues, one list")
//   addProgramMass · removeProgramMass  a program's + and −: a mass more or less, and the brief asks for what is left
// The masses' relations are not stored: the graph derives them from the rules (engine/graph/relations.ts).
import { massIsLocked } from '../../model/locks.ts'
import type { Id, Mass, Project, Rule, RuleKind } from '../../model/schema.ts'
import { programSize } from '../../engine/brief.ts'
import { courtShapes, type Issue } from '../../engine/types.ts'
import { buildingOf, massesOfOption, optionBuildings, optionOf } from '../../engine/buildings.ts'
import { arrange as arrangeOption } from '../../engine/graph/arrange.ts'
import { placeByRules } from '../../engine/graph/place.ts'
import { deriveMassing } from '../../engine/derive.ts'
import { gridOf, moduleOf } from '../../engine/grid/index.ts'
import { RULE_DEFAULTS } from '../../engine/graph/relations.ts'
import { drawBlock } from '../../modules/warehouse/actions.ts'
import { newId, removeMasses } from './masses.ts'
import { setProgramTarget } from './programs.ts'

export interface NewRule {
  kind: RuleKind
  /** The program the rule speaks of. */
  a: Id
  /** Its partner program. */
  b: Id
  weight?: number
  required?: boolean
  reason?: string
  minShared?: number
  max?: number
  min?: number
}

function build(id: Id, init: NewRule): Rule {
  const base = {
    id,
    a: init.a,
    b: init.b,
    weight: init.weight ?? 1,
    ...(init.required ? { required: true } : {}),
    ...(init.reason ? { reason: init.reason } : {}),
  }
  switch (init.kind) {
    case 'adjacent':
      return { ...base, kind: 'adjacent', minShared: init.minShared ?? RULE_DEFAULTS.minShared }
    case 'near':
      return { ...base, kind: 'near', max: init.max ?? RULE_DEFAULTS.max }
    case 'apart':
      return { ...base, kind: 'apart', min: init.min ?? RULE_DEFAULTS.min }
    case 'attached':
      return { ...base, kind: 'attached' }
  }
}

/**
 * Adds a rule between two programs and returns its id; null when a program is missing. The same kind for the same
 * programs is not added twice: its id comes back and nothing changes.
 */
export function addRule(p: Project, init: NewRule): { project: Project; id: Id } | null {
  if (!p.programs.some((g) => g.id === init.a) || !p.programs.some((g) => g.id === init.b)) return null
  const rules = p.rules ?? []
  const same = rules.find((r) => r.kind === init.kind && r.a === init.a && r.b === init.b)
  if (same) return { project: p, id: same.id }
  const id = newId('rule', rules.map((r) => r.id))
  return { project: { ...p, rules: [...rules, build(id, init)] }, id }
}

/** Changes a rule: its programs, weight, parameter, required or reason; another kind starts from its defaults. */
export function updateRule(p: Project, id: Id, patch: Partial<NewRule>): Project {
  const r = p.rules?.find((x) => x.id === id)
  if (!r) return p
  const kind = patch.kind ?? r.kind
  // another kind starts from its defaults; the same one keeps its parameter
  const keep: Partial<NewRule> = kind === r.kind ? { ...r } : { a: r.a, b: r.b, weight: r.weight, required: r.required, reason: r.reason }
  const next = build(id, { ...keep, ...patch, kind } as NewRule)
  if (!p.programs.some((g) => g.id === next.a) || !p.programs.some((g) => g.id === next.b)) return p
  if (JSON.stringify(next) === JSON.stringify(r)) return p
  return { ...p, rules: p.rules!.map((x) => (x.id === id ? next : x)) }
}

export function removeRule(p: Project, id: Id): Project {
  if (!p.rules?.some((r) => r.id === id)) return p
  const next: Project = { ...p, rules: p.rules.filter((r) => r.id !== id) }
  if (!next.rules!.length) delete next.rules
  return next
}

/**
 * A new mass of a program in an option, on `levelId`, at the program's size, where its rules ask (next to the masses
 * it must be adjacent to…). null when there is no room for it.
 */
export function addNode(p: Project, optionId: Id, levelId: Id, programId: Id): { project: Project; id: Id } | null {
  const program = p.programs.find((g) => g.id === programId)
  if (!program) return null
  // on a grid: along its axes, its sides whole modules (the area kept within a module's strip) unless typed by hand
  const grid = gridOf(p, optionId)
  let { width, depth } = programSize(program)
  if (grid && !program.size) {
    const m = moduleOf(grid)
    const area = width * depth
    width = Math.max(1, Math.round(width / m.x)) * m.x
    depth = Math.max(1, Math.round(area / width / m.y)) * m.y
  }
  // off the option's truck courts
  const courts = deriveMassing(p, optionId).options[optionId]?.docks.docks.flatMap(courtShapes) ?? []
  const c = placeByRules(p, optionId, programId, width, depth, { grid, avoid: courts })
  if (!c) return null
  // a block (Phase D.2, Decision "Draw makes a block"): its rectangle the outer face, of its program's type, a building of its own
  const r = drawBlock(p, { programId, footprint: { kind: 'rect', center: c, width, depth, rotation: grid ? grid.angle : 0 }, levelId, optionId })
  return r && { project: r.project, id: r.id }
}

/**
 * *From brief*: for each program whose target asks for more masses than the option has, new masses, each placed by
 * its rules (addNode). The biggest programs go first, so the smaller ones are placed against them (as Arrange leaves
 * the dominant mass where it is). Returns what it added and how many found no room. One undo step for all of them.
 * `programId`: that program's alone.
 */
export function addFromBrief(p: Project, optionId: Id, levelId: Id, programId?: Id): { project: Project; added: Id[]; missing: number } {
  const option = optionOf(p, optionId)
  let project = p
  const added: Id[] = []
  let missing = 0
  const footprint = (g: Project['programs'][number]) => programSize(g).width * programSize(g).depth
  for (const g of [...p.programs].sort((x, y) => footprint(y) - footprint(x))) {
    if (programId !== undefined && g.id !== programId) continue
    const want = g.target?.count
    if (!want) continue
    const have = designMasses(p, option.id, g.id).length
    for (let i = have; i < want; i++) {
      const r = addNode(project, option.id, levelId, g.id)
      if (!r) {
        missing++
        continue
      }
      project = r.project
      added.push(r.id)
    }
  }
  return { project, added, missing }
}

/** An option's masses of a program, in the order they were drawn; context ones are not the design's. */
function designMasses(p: Project, optionId: Id, programId: Id): Mass[] {
  const option = optionOf(p, optionId)
  const design = new Set(optionBuildings(p, option).filter((b) => !b.context).map((b) => b.id))
  return massesOfOption(p, option).filter((m) => m.programId === programId && design.has(buildingOf(p, m).id))
}

/**
 * A program's + (Decision "Brief steppers"): one mass more of a program, placed where its rules ask (addNode), and
 * the brief asks for the masses the option then has, so the two agree. One undo step; null when there is no room.
 */
export function addProgramMass(p: Project, optionId: Id, levelId: Id, programId: Id): { project: Project; id: Id } | null {
  const has = designMasses(p, optionId, programId).length
  const r = addNode(p, optionId, levelId, programId)
  if (!r) return null
  return { project: setProgramTarget(r.project, programId, { count: has + 1 }), id: r.id }
}

/**
 * A program's −: the program's last-drawn mass that is not locked goes, and the brief asks for the masses the
 * option then has (none left: it stops counting the program). One undo step; the same project when nothing changes.
 */
export function removeProgramMass(p: Project, optionId: Id, programId: Id): Project {
  const masses = designMasses(p, optionId, programId)
  const last = masses.findLast((m) => !massIsLocked(p, m))
  const has = masses.length - (last ? 1 : 0)
  return setProgramTarget(last ? removeMasses(p, [last.id]) : p, programId, { count: has > 0 ? has : null })
}

/**
 * *Arrange* (Decision "Arrange"): the option's masses slide to meet the brief's rules inside the buildable area;
 * locked and context masses stay. One undo step; the same project when nothing moves.
 */
export function arrange(p: Project, optionId: Id): Project {
  return arrangeOption(p, optionId)
}

/**
 * *Solve* (Decision "Solve"; the Graph's ▶ Solve): from the brief and its rules to geometry. The masses the brief still
 * asks for are placed where their rules ask (addFromBrief), then the option's masses slide to meet the rules (arrange:
 * the smaller of two moves, the dominant one stays). One undo step.
 */
export function solve(p: Project, optionId: Id, levelId: Id): { project: Project; added: Id[]; missing: number } {
  const r = addFromBrief(p, optionId, levelId)
  return { ...r, project: arrangeOption(r.project, optionId) }
}

/**
 * *Solve* one issue (Decision "Issues, one list"; the user: "one Solve for all and another issue by issue"): a program
 * with fewer masses than the brief asks for gets them, placed by its rules (addFromBrief, that program alone); a broken
 * rule's two masses slide to meet it, an overlap's apart, a mass outside the buildable area back in (arrange focused on
 * them: the rest stay where they are). Any other issue has nothing to solve: the same project. One undo step.
 */
export function solveIssue(p: Project, optionId: Id, levelId: Id, issue: Pick<Issue, 'code' | 'massIds' | 'rule' | 'program'>): { project: Project; added: Id[]; missing: number } {
  if (issue.code === 'brief') return issue.program && issue.massIds.length === 0 ? addFromBrief(p, optionId, levelId, issue.program) : { project: p, added: [], missing: 0 }
  const arranges = (issue.code === 'relation' && issue.rule !== undefined) || issue.code === 'overlap' || issue.code === 'outside-buildable'
  if (!arranges || issue.massIds.length === 0) return { project: p, added: [], missing: 0 }
  return { project: arrangeOption(p, optionId, { masses: issue.massIds, rule: issue.code === 'relation' ? issue.rule : undefined }), added: [], missing: 0 }
}
