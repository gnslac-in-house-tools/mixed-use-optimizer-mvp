// The graph's UI state (Decisions "Graph mode", "Steps"): never in the Project or the history.
//   tool      the Rules step's diagram of programs: Select (drag a bubble to place it) · Rule (drag from a bubble to
//             another: a new rule)
//   kind      the kind a new rule gets
//   rule      the picked rule (its row in the list, its line; Properties edits it) · relation: the picked relation
//             (a mass with its partner, in Massing's graph; Properties says how it stands). Picking a mass lets go
//             of both.
//   lines     how the lines are drawn: curved, straight or orthogonal (per browser)
//   pinned    where a program's bubble was dragged to (the layout places the others around them)
//   (the rules' arcs on the plan and the warnings' chips beside the masses are shown or hidden by the layer store:
//   views/layers/layerView.ts, keys `RULES` and `ISSUES`, per project; with them on, only the broken rules' arcs show)
//   share     the graph's share of the column's height, over the rules list (per browser; the divider drags it)
//   graph     Massing shows the graph over the ghosted geometry (Show's *Graph*, G; Decision
//             "Graph in Massing"); for the session only, so a reload never opens on faded masses
import { create } from 'zustand'
import type { Id, Point, RuleKind } from '../../model/schema.ts'
import { useApp } from '../../state/store.ts'

export type GraphTool = 'select' | 'rule'
export type LineStyle = 'curved' | 'straight' | 'orthogonal'

export const RULE_KINDS: { key: RuleKind; label: string; verb: string; title: string }[] = [
  { key: 'adjacent', label: 'Adjacent', verb: 'must be adjacent to', title: 'Shares a wall with its nearest one' },
  { key: 'near', label: 'Near', verb: 'within', title: 'At most a distance from its nearest one' },
  { key: 'apart', label: 'Apart', verb: 'at least', title: 'At least a distance from every one' },
  { key: 'attached', label: 'Moves with', verb: 'moves with', title: 'Follows its nearest one when it moves' },
]

export const LINE_STYLES: { key: LineStyle; label: string }[] = [
  { key: 'curved', label: 'Curved' },
  { key: 'straight', label: 'Straight' },
  { key: 'orthogonal', label: 'Orthogonal' },
]

const PREFS_KEY = 'gfit.graph'
/** The graph's share of the height over the rules list, by default and after a double-click on the divider. */
export const GRAPH_SHARE = 0.62

function readPrefs(): { lines: LineStyle; share: number } {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null') as {
      lines?: unknown
      share?: unknown
    } | null
    const lines = LINE_STYLES.some((l) => l.key === raw?.lines) ? (raw!.lines as LineStyle) : 'curved'
    const share = typeof raw?.share === 'number' && raw.share >= 0.2 && raw.share <= 0.8 ? raw.share : GRAPH_SHARE
    return { lines, share }
  } catch {
    return { lines: 'curved', share: GRAPH_SHARE }
  }
}

interface GraphState {
  tool: GraphTool
  kind: RuleKind
  rule: Id | null
  relation: string | null
  lines: LineStyle
  share: number
  graph: boolean
  pinned: Record<string, Point>
  setTool(t: GraphTool): void
  setKind(k: RuleKind): void
  selectRule(id: Id | null): void
  selectRelation(id: string | null): void
  setLines(l: LineStyle): void
  setShare(f: number): void
  setGraph(on: boolean): void
  pin(id: string, at: Point): void
  unpinAll(): void
}

export const useGraph = create<GraphState>()((set, get) => {
  const save = () => {
    try {
      const { lines, share } = get()
      localStorage.setItem(PREFS_KEY, JSON.stringify({ lines, share }))
    } catch {
      // it lasts as long as the tab
    }
  }
  /** One thing is picked at a time: a rule or a relation lets go of the masses. */
  const letGoOfMasses = () => {
    if (useApp.getState().selection.massIds.length) useApp.getState().select(null)
  }
  return {
    tool: 'select',
    kind: 'adjacent',
    rule: null,
    relation: null,
    ...readPrefs(),
    pinned: {},
    graph: false,
    setGraph: (graph) => set({ graph, relation: graph ? get().relation : null }),
    setTool: (tool) => set({ tool }),
    setKind: (kind) => set({ kind }),
    selectRule: (rule) => {
      if (rule !== null) letGoOfMasses()
      set({ rule, relation: null })
    },
    selectRelation: (relation) => {
      if (relation !== null) letGoOfMasses()
      set({ relation, rule: null })
    },
    setLines: (lines) => {
      set({ lines })
      save()
    },
    setShare: (share) => {
      set({ share })
      save()
    },
    pin: (id, at) => set({ pinned: { ...get().pinned, [id]: at } }),
    unpinAll: () => set({ pinned: {} }),
  }
})

// A mass picked lets go of the rule and the relation; a rule or a relation that is gone is let go too.
useApp.subscribe((s, before) => {
  const { rule, relation } = useGraph.getState()
  if (rule === null && relation === null) return
  const massPicked = s.selection.massIds.length > 0 && s.selection.massIds !== before.selection.massIds
  if (massPicked || (rule !== null && !s.project.rules?.some((r) => r.id === rule))) useGraph.setState({ rule: null })
  if (massPicked || (relation !== null && !s.derived.relations.some((r) => r.id === relation))) useGraph.setState({ relation: null })
})

/** Draw rule: takes the rule tool, or lets it go if it is in hand. The Rules window's button and the command `rules.rule` call this one. */
export function toggleRuleTool(): void {
  const g = useGraph.getState()
  g.setTool(g.tool === 'rule' ? 'select' : 'rule')
}
