// What the map shows of the code: three filters, so a big app stays readable.
//   hide a layer     its modules leave the map, with their arrows
//   group a folder   the folder (sub-folders too) becomes one card; arrows to its files end on the card
//   only the event   the modules the event on display did not touch leave the map
// Pure: map and activity in, a smaller map and activity out. layout() then packs what is left, with no gaps.
import { ROLES, type Activity, type FlowKind, type Role } from './flow.ts'
import { inLayer, type ImportEdge, type ModuleMap, type ModuleNode } from './map.ts'

export interface ViewOptions {
  /** Layers left out: 'views', 'engine' (a module's engine too)… */
  hidden: string[]
  /** Folders shown as one card each: 'views/plan' (its sub-folders go in it). */
  grouped: string[]
  /** Only the modules of the event on display. */
  only: boolean
}

export const SHOW_ALL: ViewOptions = { hidden: [], grouped: [], only: false }

/** A folder's card. Its id ends in '/': it never meets a file's. */
export const groupId = (folder: string) => `${folder}/`
export const isGroup = (id: string) => id.endsWith('/')

/** The folders "Group folders" makes cards of: each one under a layer ('views/plan', 'engine/circulation'). */
export function groupable(map: ModuleMap): string[] {
  return [...new Set(map.nodes.filter((n) => n.folder.includes('/')).map((n) => n.folder.split('/').slice(0, 2).join('/')))].sort()
}

export type ShownFlow = Activity['flows'][number] & {
  /** The event's own flows this arrow stands for (several when it ends on a card). */
  parts: { from: string; to: string }[]
}

export interface Shown {
  map: ModuleMap
  act: (Omit<Activity, 'flows'> & { flows: ShownFlow[] }) | null
  /** Module id → what stands for it on the map: itself, or its folder's card. Hidden modules have none. */
  alias: Map<string, string>
  /** Card id → the modules in it. */
  members: Map<string, string[]>
}

const KINDS: FlowKind[] = ['reject', 'call', 'engine', 'data'] // strongest first, when arrows merge

export function shown(map: ModuleMap, act: Activity | null, options: ViewOptions): Shown {
  const kept = map.nodes.filter((n) => !options.hidden.some((l) => inLayer(n, l)))
  // the outermost grouped folder wins: 'views' grouped swallows 'views/plan'
  const outer = [...options.grouped].sort((a, b) => a.length - b.length)
  const groupOf = (folder: string) => outer.find((g) => folder === g || folder.startsWith(`${g}/`))

  const alias = new Map<string, string>()
  const members = new Map<string, string[]>()
  for (const n of kept) {
    const g = groupOf(n.folder)
    const id = g === undefined ? n.id : groupId(g)
    alias.set(n.id, id)
    if (g !== undefined) members.set(id, [...(members.get(id) ?? []), n.id])
  }

  const roles = new Map<string, Role>()
  const verbs = new Map<string, string[]>()
  const flows: ShownFlow[] = []
  if (act) {
    for (const [id, role] of act.roles) {
      const to = alias.get(id)
      const now = to && roles.get(to)
      if (to && (!now || ROLES.indexOf(role) < ROLES.indexOf(now))) roles.set(to, role)
    }
    for (const [id, list] of act.verbs) if (alias.get(id) === id) verbs.set(id, list)
    for (const f of act.flows) {
      const from = alias.get(f.from)
      const to = alias.get(f.to)
      if (!from || !to || from === to) continue
      const was = flows.find((x) => x.from === from && x.to === to)
      if (!was) flows.push({ from, to, kind: f.kind, parts: [{ from: f.from, to: f.to }] })
      else {
        was.parts.push({ from: f.from, to: f.to })
        if (KINDS.indexOf(f.kind) < KINDS.indexOf(was.kind)) was.kind = f.kind
      }
    }
  }

  const byId = new Map(map.nodes.map((n) => [n.id, n]))
  const cards: ModuleNode[] = [...members].map(([id, ids]) => {
    const folder = id.slice(0, -1)
    const inside = ids.map((x) => byId.get(x)!)
    // what is directly in the folder: its files, and its sub-folders as 'snap/'
    const entry = (n: ModuleNode) => (n.folder === folder ? n.name : `${n.folder.slice(folder.length + 1).split('/')[0]}/`)
    const ran = [...new Set(inside.filter((n) => act?.roles.has(n.id) && act.roles.get(n.id) !== 'reach').map(entry))].sort()
    if (ran.length) verbs.set(id, ran)
    const rest = [...new Set(inside.map(entry))].filter((e) => !ran.includes(e)).sort()
    const slash = folder.lastIndexOf('/')
    return {
      id,
      layer: inside[0].layer,
      // under its parent's name; a layer's own folder keeps its name, so its card sits under 'views/'
      folder: slash < 0 ? folder : folder.slice(0, slash),
      name: `${folder.slice(slash + 1)}/`,
      exports: [...ran, ...rest], // the ones that took part first, so they are not in "+n more"
      reads: [...new Set(inside.flatMap((n) => n.reads))],
      lines: inside.reduce((s, n) => s + n.lines, 0),
    }
  })

  let nodes = [...kept.filter((n) => alias.get(n.id) === n.id), ...cards]
  if (options.only && act) nodes = nodes.filter((n) => roles.has(n.id) && roles.get(n.id) !== 'reach')
  const visible = new Set(nodes.map((n) => n.id))

  const edges = new Map<string, ImportEdge>()
  for (const e of map.edges) {
    const from = alias.get(e.from)
    const to = alias.get(e.to)
    if (!from || !to || from === to || !visible.has(from) || !visible.has(to)) continue
    const was = edges.get(`${from}>${to}`)
    // a merged import is type-only when all of its imports are
    edges.set(`${from}>${to}`, { from, to, typeOnly: (was?.typeOnly ?? true) && e.typeOnly })
  }

  return {
    map: { nodes, edges: [...edges.values()] },
    act: act && { roles, verbs, flows: flows.filter((f) => visible.has(f.from) && visible.has(f.to)) },
    alias,
    members,
  }
}
