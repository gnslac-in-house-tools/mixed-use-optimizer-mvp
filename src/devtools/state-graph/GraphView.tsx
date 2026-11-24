// The map: every module (static, from the code) and, over it, the round trip of the event on display.
//   grey lines      imports (dashed: type-only, hidden unless asked)
//   coloured arrows what the event did: view → store → verbs / engine, store → views that re-render
// What it shows goes through view.ts first (layers hidden, folders grouped, only the event), then layout().
import { Background, Controls, MarkerType, MiniMap, Panel, ReactFlow, useReactFlow, type Edge } from '@xyflow/react'
import { useEffect, useMemo, useRef } from 'react'
import type { TraceEvent } from '../../state/trace/tracer.ts'
import { FileNode, FolderNode, type FileNodeType, type FolderNodeType } from './FileNode.tsx'
import { STORE, type Activity } from './flow.ts'
import { COLUMNS, FOLDER_H, layout, NODE_W, nodeHeight } from './layout.ts'
import type { ModuleMap } from './map.ts'
import { FLOW_COLOR, ROLE_COLOR, fmtMs } from './roles.ts'
import { groupable, isGroup, shown as toShown, type ViewOptions } from './view.ts'

const nodeTypes = { file: FileNode, folder: FolderNode }
// room at the top for the filters and zoom buttons, which float over the map
const FRAME = { top: '56px', x: '24px', bottom: '24px' } as const

export function GraphView(props: {
  map: ModuleMap
  event: TraceEvent | null
  act: Activity | null
  /** The event is live: modules in it pulse. */
  live: boolean
  heat: Map<string, number>
  focus: string | null
  showTypes: boolean
  options: ViewOptions
  onOptions(o: ViewOptions): void
  onFocus(id: string | null): void
}) {
  const { map, event, act: fullAct, live, heat, focus, showTypes, options, onOptions, onFocus } = props
  const view = useMemo(() => toShown(map, fullAct, options), [map, fullAct, options])
  const act = view.act
  const { positions, folders } = useMemo(() => layout(view.map), [view.map])
  const focusId = focus && view.alias.get(focus)

  const nodes = useMemo(() => {
    const out: (FileNodeType | FolderNodeType)[] = folders.map((f) => ({
      id: `folder:${f.folder}:${f.x}`,
      type: 'folder',
      position: { x: f.x, y: f.y },
      width: NODE_W,
      height: FOLDER_H,
      data: { folder: f.folder },
      selectable: false,
    }))
    for (const m of view.map.nodes) {
      const role = act?.roles.get(m.id) ?? null
      const inside = view.members.get(m.id)
      out.push({
        id: m.id,
        type: 'file',
        position: positions.get(m.id)!,
        // known sizes: the minimap and fitView need no measuring (nodes are rebuilt on every event)
        width: NODE_W,
        height: nodeHeight(m),
        data: {
          module: m,
          role,
          ran: act?.verbs.get(m.id) ?? [],
          heat: inside ? inside.reduce((s, id) => s + (heat.get(id) ?? 0), 0) : (heat.get(m.id) ?? 0),
          pulse: live && role && event ? event.seq : null,
          focused: focusId === m.id,
          dim: act !== null && role === null,
          count: inside?.length,
        },
      })
    }
    return out
  }, [view, folders, positions, act, event, live, heat, focusId])

  const edges = useMemo(() => {
    const column = (id: string) => positions.get(id)?.column ?? 0
    const sides = (from: string, to: string) =>
      column(from) < column(to)
        ? { sourceHandle: 'r-out', targetHandle: 'l-in' }
        : column(from) > column(to)
          ? { sourceHandle: 'l-out', targetHandle: 'r-in' }
          : { sourceHandle: 'r-out', targetHandle: 'r-in' }

    const out: Edge[] = []
    for (const e of view.map.edges) {
      if (e.typeOnly && !showTypes) continue
      const lit = act !== null && act.roles.has(e.from) && act.roles.has(e.to)
      const near = focusId != null && (e.from === focusId || e.to === focusId)
      out.push({
        id: `import:${e.from}>${e.to}`,
        source: e.from,
        target: e.to,
        ...sides(e.from, e.to),
        selectable: false,
        style: {
          stroke: near ? 'var(--ink-secondary)' : lit ? 'var(--ink-tertiary)' : 'var(--separator)',
          strokeWidth: near || lit ? 1.5 : 1,
          strokeDasharray: e.typeOnly ? '4 4' : undefined,
        },
      })
    }
    if (act && event) {
      for (const f of act.flows) {
        const color = FLOW_COLOR[f.kind]
        out.push({
          id: `flow:${f.from}>${f.to}`,
          source: f.from,
          target: f.to,
          ...sides(f.from, f.to),
          animated: true,
          zIndex: 10,
          selectable: false,
          // an arrow onto a card carries the labels of every flow it stands for
          label: [...new Set(f.parts.map((p) => flowLabel(p.from, p.to, event, map)).filter(Boolean))].join(' · '),
          labelStyle: { fill: color },
          style: { stroke: color, strokeWidth: 2.5 },
          markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
        })
      }
    }
    return out
  }, [map, view, positions, act, event, showTypes, focusId])

  const toggleGroup = (folder: string) =>
    onOptions({ ...options, grouped: options.grouped.includes(folder) ? options.grouped.filter((g) => g !== folder) : [...options.grouped, folder] })

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: FRAME }}
      minZoom={0.05}
      maxZoom={2.5}
      nodesDraggable={false}
      nodesConnectable={false}
      onNodeClick={(_, n) => {
        // a card opens its folder; a folder's name groups it; a module shows its card on the side
        if (n.type === 'folder') {
          const { folder } = n.data as FolderNodeType['data']
          if (folder) toggleGroup(folder)
        } else if (isGroup(n.id)) toggleGroup(n.id.slice(0, -1))
        else onFocus(n.id === focus ? null : n.id)
      }}
      onPaneClick={() => onFocus(null)}
    >
      <Background gap={24} />
      <Controls showInteractive={false} />
      <Filters map={map} options={options} onOptions={onOptions} />
      <ZoomButtons ids={act ? [...act.roles].filter(([, r]) => r !== 'reach').map(([id]) => id) : []} only={options.only} onOnly={(only) => onOptions({ ...options, only })} />
      <Refit shape={view.map.nodes.map((n) => n.id).join('|')} />
      <MiniMap
        pannable
        zoomable
        nodeColor={(n) => {
          const role = n.type === 'file' ? (n.data as FileNodeType['data']).role : null
          return role ? ROLE_COLOR[role] : 'var(--fill)'
        }}
      />
    </ReactFlow>
  )
}

const button = 'h-row rounded-control bg-panel px-3 text-label shadow-control hover:bg-fill disabled:text-ink-tertiary'
const toggle = (on: boolean) =>
  `h-row rounded-control px-3 text-label shadow-control ${on ? 'bg-ink text-on-ink' : 'bg-panel text-ink-secondary hover:bg-fill'}`

/** Which layers are on the map, and whether each folder under a layer is one card. */
function Filters({ map, options, onOptions }: { map: ModuleMap; options: ViewOptions; onOptions(o: ViewOptions): void }) {
  const present = new Set(map.nodes.map((n) => n.layer))
  const layers = [...COLUMNS.filter((l) => present.has(l)), ...[...present].filter((l) => !COLUMNS.includes(l)).sort()]
  const grouped = options.grouped.length > 0
  return (
    <Panel position="top-left" className="flex flex-wrap gap-1" aria-label="Map filters">
      {layers.map((l) => {
        const on = !options.hidden.includes(l)
        return (
          <button
            key={l}
            type="button"
            aria-pressed={on}
            className={toggle(on)}
            title={on ? `Hide ${l}/` : `Show ${l}/`}
            onClick={() => onOptions({ ...options, hidden: on ? [...options.hidden, l] : options.hidden.filter((h) => h !== l) })}
          >
            {l}
          </button>
        )
      })}
      <button
        type="button"
        aria-pressed={grouped}
        className={`ml-2 ${toggle(grouped)}`}
        title={grouped ? 'Open every folder' : "Each folder under a layer becomes one card. Click a card to open it, a folder's name to group it"}
        onClick={() => onOptions({ ...options, grouped: grouped ? [] : groupable(map) })}
      >
        Group folders
      </button>
    </Panel>
  )
}

/** Only the modules of the event on display; frame them, or the whole map. */
function ZoomButtons({ ids, only, onOnly }: { ids: string[]; only: boolean; onOnly(only: boolean): void }) {
  const { fitView } = useReactFlow()
  return (
    <Panel position="top-right" className="flex gap-2">
      <button type="button" aria-pressed={only} className={toggle(only)} title="Hide the modules this event did not touch" onClick={() => onOnly(!only)}>
        Only event
      </button>
      <button type="button" className={button} disabled={ids.length === 0} onClick={() => fitView({ nodes: ids.map((id) => ({ id })), padding: { top: '80px', x: '64px', bottom: '64px' }, duration: 300 })}>
        Zoom to event
      </button>
      <button type="button" className={button} onClick={() => fitView({ padding: FRAME, duration: 300 })}>
        Whole map
      </button>
    </Panel>
  )
}

/** Frame the map again when the modules on it change (a layer hidden, a folder grouped, another event in "Only event"). */
function Refit({ shape }: { shape: string }) {
  const { fitView } = useReactFlow()
  const framed = useRef(shape) // the first frame is ReactFlow's own fitView
  useEffect(() => {
    if (shape === framed.current) return
    framed.current = shape
    // a frame later: React Flow has the new nodes by then
    const id = requestAnimationFrame(() => void fitView({ padding: FRAME, duration: 300 }))
    return () => cancelAnimationFrame(id)
  }, [shape, fitView])
  return null
}

/** What travels on an arrow: the door, the verbs (with their time) or the slices that are new. */
function flowLabel(from: string, to: string, e: TraceEvent, map: ModuleMap): string {
  if (to === STORE) return e.rejected ? `${e.door} · rejected` : e.door
  const calls = e.calls.filter((c) => `${c.module}.ts` === to || `${c.module}.tsx` === to)
  if (from === STORE && calls.length) return calls.map((c) => `${c.name} ${fmtMs(c.ms)}`).join(' · ')
  const reads = map.nodes.find((n) => n.id === to)?.reads ?? []
  return reads.filter((s) => e.slices.includes(s)).join(', ')
}

