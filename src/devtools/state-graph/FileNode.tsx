// One module on the map (or a grouped folder's card): its name, folder, the slices it reads and its exports. The verbs
// that ran in the event on display are marked; a ring pulses each time the module takes part in a new event.
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import type { Role } from './flow.ts'
import { MAX_ROWS, NODE_W, FOLDER_H, nodeHeight } from './layout.ts'
import type { ModuleNode } from './map.ts'
import { ROLE_COLOR, ROLE_LABEL, tint } from './roles.ts'

export type FileData = {
  module: ModuleNode
  role: Role | null
  /** Verbs of this module that ran in the event on display. */
  ran: string[]
  /** How many events in the log touched it. */
  heat: number
  /** The seq of the live event it took part in (restarts the pulse), or null. */
  pulse: number | null
  focused: boolean
  /** An event is on display and this module is not in it. */
  dim: boolean
  /** A grouped folder's card: how many modules it holds (its "exports" are what is in the folder). */
  count?: number
}
export type FileNodeType = Node<FileData, 'file'>
export type FolderNodeType = Node<{ folder: string }, 'folder'>

// hidden anchors: arrows enter on the left or right, depending on where they come from
const handle = 'pointer-events-none !min-h-0 !min-w-0 !border-0 !bg-transparent'

export function FileNode({ data }: NodeProps<FileNodeType>) {
  const { module: m, role, ran, heat, pulse, focused, dim, count } = data
  const color = role ? ROLE_COLOR[role] : null
  const shown = m.exports.slice(0, MAX_ROWS)
  const card = count !== undefined
  return (
    <div
      className={`relative flex flex-col rounded-control bg-panel px-3 py-2 shadow-control transition-opacity duration-fast ${card ? 'cursor-pointer' : ''}`}
      style={{
        width: NODE_W,
        height: nodeHeight(m),
        opacity: dim && !focused ? 0.38 : 1,
        background: color ? tint(color, role === 'reach' ? 5 : 9) : undefined,
        outline: focused ? '2px solid var(--ink)' : color ? `1.5px ${role === 'reach' ? 'dashed' : 'solid'} ${color}` : '1px solid var(--separator)',
        outlineOffset: focused ? 2 : 0,
        // a card is a stack of modules: a second sheet peeks out under it
        boxShadow: card ? 'var(--shadow-control), 4px 4px 0 -1px var(--panel), 4px 4px 0 0 var(--separator)' : undefined,
      }}
      title={card ? `${m.id} · ${count} modules · click to open` : role ? `${m.id} · ${ROLE_LABEL[role]}` : m.id}
    >
      <Handle type="target" position={Position.Left} id="l-in" className={handle} />
      <Handle type="source" position={Position.Left} id="l-out" className={handle} />
      <Handle type="target" position={Position.Right} id="r-in" className={handle} />
      <Handle type="source" position={Position.Right} id="r-out" className={handle} />
      {pulse !== null && color && <span key={pulse} className="sg-pulse" style={{ ['--pulse' as string]: color }} />}

      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-label" style={{ color: color ?? undefined }}>
          {m.name}
        </span>
        {heat > 0 && <span className="text-caption text-ink-secondary">×{heat}</span>}
      </div>
      <div className="truncate text-caption text-ink-tertiary">
        {card ? `${count} modules` : m.folder || 'src'} · {m.lines} lines{m.reads.length > 0 && ` · reads ${m.reads.join(', ')}`}
      </div>
      {shown.length > 0 && (
        <ul className="mt-1 flex flex-col">
          {shown.map((x) => {
            const hit = ran.includes(x)
            return (
              <li key={x} className="flex h-[17px] items-center gap-1 truncate text-caption" style={{ color: hit ? (color ?? undefined) : 'var(--ink-secondary)', fontWeight: hit ? 600 : 400 }}>
                <span className="inline-block h-[5px] w-[5px] shrink-0 rounded-pill" style={{ background: hit ? (color ?? 'var(--ink)') : 'var(--fill)' }} />
                {x}
              </li>
            )
          })}
          {m.exports.length > MAX_ROWS && <li className="h-[17px] text-caption text-ink-tertiary">+{m.exports.length - MAX_ROWS} more</li>}
        </ul>
      )}
    </div>
  )
}

/** A folder's name over its modules. Clicking it groups the folder into one card (not the root of src/). */
export function FolderNode({ data }: NodeProps<FolderNodeType>) {
  return (
    <div
      className={`flex items-end text-caption text-ink-tertiary ${data.folder ? 'cursor-pointer hover:text-ink' : ''}`}
      style={{ width: NODE_W, height: FOLDER_H }}
      title={data.folder ? `Group ${data.folder}/ into one card` : undefined}
    >
      {data.folder || 'src'}/
    </div>
  )
}
