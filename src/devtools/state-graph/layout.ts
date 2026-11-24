// Where each module sits: layers left to right in the order data flows (app → views → state → engine), each
// grouped by folder. A layer taller than MAX_H wraps into more columns, between folders (inside a folder only when
// it alone is taller), so the map stays wide rather than tall. Pure, so a new file just takes its place on the next save.
import type { ModuleMap, ModuleNode } from './map.ts'

export const COLUMNS = ['app', 'views', 'state', 'engine', 'modules', 'typologies', 'model']
export const NODE_W = 240
export const MAX_ROWS = 8 // exports listed on a node; the rest is "+n more"
export const FOLDER_H = 22
const MAX_H = 1100
const COL_GAP = 60 // between columns of one layer
const LAYER_GAP = 160 // between layers: room for the arrows
const NODE_GAP = 14
const FOLDER_GAP = 36
const HEADER_H = 44
const ROW_H = 17

export function nodeHeight(n: ModuleNode): number {
  const rows = Math.min(n.exports.length, MAX_ROWS) + (n.exports.length > MAX_ROWS ? 1 : 0)
  return HEADER_H + rows * ROW_H + (rows ? 8 : 0)
}

export interface Layout {
  /** `column`: left-to-right index over all columns (arrows pick their side from it). */
  positions: Map<string, { x: number; y: number; column: number }>
  /** Headers over each folder's modules: '' is the root of src/. */
  folders: { folder: string; x: number; y: number }[]
}

export function layout(map: ModuleMap): Layout {
  const extra = [...new Set(map.nodes.map((n) => n.layer))].filter((l) => !COLUMNS.includes(l)).sort()
  const positions: Layout['positions'] = new Map()
  const folders: Layout['folders'] = []
  let x = 0
  let column = 0
  for (const layer of [...COLUMNS, ...extra]) {
    const nodes = map.nodes.filter((n) => n.layer === layer).sort((a, b) => a.folder.localeCompare(b.folder) || a.name.localeCompare(b.name))
    if (nodes.length === 0) continue
    const groups = new Map<string, ModuleNode[]>()
    for (const n of nodes) groups.set(n.folder, [...(groups.get(n.folder) ?? []), n])
    let y = 0
    for (const [folder, group] of groups) {
      const h = FOLDER_H + group.reduce((s, n) => s + nodeHeight(n) + NODE_GAP, 0)
      if (y > 0 && y + h > MAX_H) {
        // wrap: this folder starts the next column of the layer
        x += NODE_W + COL_GAP
        column++
        y = 0
      } else if (y > 0) y += FOLDER_GAP - NODE_GAP
      folders.push({ folder, x, y })
      y += FOLDER_H
      for (const n of group) {
        // a folder taller than a column by itself goes on in the next one, under its name again
        if (y > FOLDER_H && y + nodeHeight(n) > MAX_H) {
          x += NODE_W + COL_GAP
          column++
          y = 0
          folders.push({ folder, x, y })
          y += FOLDER_H
        }
        positions.set(n.id, { x, y, column })
        y += nodeHeight(n) + NODE_GAP
      }
    }
    x += NODE_W + LAYER_GAP
    column++
  }
  return { positions, folders }
}
