// The Layers tab (Phase AS.3, Decision "Layers"): one tree for what the option in view holds (tree.ts builds its rows, Row.tsx
// draws one): seen, hidden, locked and picked from there.
// - The eye hides a key of the layer store (layerView.ts, per project) or runs one of three switches (switches.ts); a
//   branch's eye acts on the keys under it alone (never on the three switches, which keep their own rows' eyes: a branch with no
//   key, Reference, has no eye) and reads "mixed" when only some are off; a building's goes through
//   `toggleHidden`, which keeps the building the plan is on drawn (`eyes.ts`; a mass has an eye of its own). The padlock is project data, one undo step: a mass, a level (its masses),
//   a building (its own flag: off, it also frees the masses locked one by one; *mixed* while the flag is off and some masses are locked), a gate, a lot, the Streets row (all its
//   segments), the Reference lines row (all the lines: a line's own row, where it is locked, has its own), the Notes row (all the notes of the option's levels, the same), a drawing layer, a file's parcels, a file (all its layers and parcels).
// - *On top* (a drawing layer, a file's parcels, a file, Drawings) is the same kind of view state: `toggleOnTop` of the keys the
//   row holds (`row.top`), a mixed row putting all on top; the plan and the 3D draw those over the model, and nothing else changes.
// - A click on a name picks the row (Shift: the run among its siblings, Ctrl / ⌘: one more; controls/rangeSelect.ts), by
//   what it is: a mass the selection (a locked one too: this is the one place that reaches it), a building the active one
//   (`goToBuilding`), a level the plan's (`setLevel`), a gate, an existing road, a lot where the plan picks
//   them, a street, a dimension or a note (the rows for the exceptions: a street that is locked or hidden, a dimension that is hidden, a note that is locked or hidden, is a child row under Streets, Dimensions or Notes; a dimension's or a note's row brings the plan to its level),
//   a drawing file (joined) or a layer or parcels (separated) the drawing pick, a locked or hidden one too (it still
//   does not move), all through the bridge (`plan/mix.ts`: `pickRefs`); every other row is `layerPick.ts`'s. One thing is picked: the row of what is picked on the plan is
//   marked, wherever it was picked (`usePickedRefs`), and scrolled into view when its branch is open.
// - The Buildings branch carries over what the Brief's tree did: double-click renames a building; dragging a building onto
//   another moves it before it (Alt or Ctrl: a copy of its own); dragging masses onto a building assigns them (Alt or Ctrl:
//   copies); a building dragged onto a mass, in the plan or the 3D (massDrop.ts); the right-click menu (the one menu of the app, `editing/menu/`: the row is picked, then the menu of
//   what it stands for is opened with its `Ref`s: a mass, a lot, a gate… the plan's menu of it; a building, a level and a drawing file their kinds'; a branch row (Streets, Gates…)
//   its own short one); a ＋ makes a building (`design.building.new`). The Drawings row's ＋ brings another drawing. Rename (F2, the menu) of a building or a level edits its name
//   in the row (`rowRename.ts`).
// - The keys: ↑ ↓ move between the rows that show, → opens a folded row (open, it goes to its first child), ← folds an open row
//   (folded, it goes to its parent), Home and End go to the first and the last, Enter picks the row focused (its name is a button).
// - Folds are kept per project with what is hidden: every row with something under it starts folded but Buildings, and
//   the store holds the rows the viewer changed from that (`foldedByDefault`).
// The tree is built once for a project, an option and a derived result, never on a pointer move, and rows are memoised;
// a folded branch draws no children. While a drag is in progress (every pointer move previews a project) it is not built
// at all: it shows the tree of before the drag and rebuilds once when the drag ends (settled.ts).
// Right-click: a row of an object, a level, a file, a branch… picks itself when it is not picked (the menu acts on what is picked); a
// building not among the picked is picked alone too, but the masses selected stay selected, for *Assign selection to
// <building>*; one among the picked keeps them all, and opens the menu of the several.
// Focus: when the row that had it goes (a deleted building, a folded branch) it moves to the row now in its place, else the one
// before, else the tree, and never to the page.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react'
import { buildingOfLevel } from '../../engine/buildings.ts'
import type { Ref } from '../../kinds/types.ts'
import type { DrawingPart } from '../../model/picked.ts'
import type { Id, Project } from '../../model/schema.ts'
import { actions } from '../../state/actions/index.ts'
import { useApp } from '../../state/store.ts'
import { runCommand } from '../commands/index.ts'
import { copyDrop } from '../controls/dragCopy.ts'
import { picksSeveral, rangePick } from '../controls/rangeSelect.ts'
import { BRANCH, isBranch } from '../editing/menu/kinds/branch.ts'
import { openMenu } from '../editing/menu/open.tsx'
import { useToast } from '../layout/toast.ts'
import { useModule } from '../modules.ts'
import {
  assign,
  copyBuildingInto,
  copyInto,
  dropBuilding,
  goToBuilding,
  pickFromRow,
  updateBuilding,
} from '../panels/buildingCommands.ts'
import { carryTreeItem } from '../panels/massDrop.ts'
import { drawingRef, pickedRefs, pickRefs, usePickedRefs } from '../plan/mix.ts'
import { letGo } from '../tools/hand.ts'
import { addDrawing, setFilesLocked, setLayerLocked, setParcelsOfLocked } from './drawingCommands.ts'
import { toggleRowEye } from './eyes.ts'
import { building as buildingKey } from './keys.ts'
import { toggleOnTop, useHiddenSet, useLayerView, useOnTopSet } from './layerView.ts'
import { useLayerPick } from './layerPick.ts'
import { heldByBuilding } from './locks.ts'
import { Row, type AddAction, type OverMark, type RowHandlers } from './Row.tsx'
import { useRowRename } from './rowRename.ts'
import { useSettled } from './settled.ts'
import { SWITCH_TITLES, useSwitches } from './switches.ts'
import { eyeKeys, eyeState, eyeSwitches, foldedByDefault, layerTree, topState, type LayerRow } from './tree.ts'

type Dragged = { kind: 'building'; id: Id } | { kind: 'masses'; ids: Id[] }

/** What is being dragged in the tree (null: nothing): HTML drag data cannot be read during dragover in every browser. */
let dragged: Dragged | null = null

/** The row clicked last: where a Shift run starts. */
let anchor: string | null = null

/** The title of an eye that runs one of the three switches alone (the Grid, the Terrain, the Program graph): what it runs. */
function switchTitle(row: LayerRow): string | undefined {
  const switches = eyeSwitches(row.eyes)
  return switches.length === 1 && eyeKeys(row.eyes).length === 0 ? SWITCH_TITLES[switches[0]] : undefined
}

/** What a row is picked as: each family is picked its own way, and a run keeps to the clicked row's family. */
type Family = 'mass' | 'gate' | 'lot' | 'street' | 'dimension' | 'reference-line' | 'note' | 'access' | 'drawing' | 'row'

const splitOf = (p: Project, file: string | undefined) => file !== undefined && p.site.drawings?.find((d) => d.file === file)?.split === true

/** The drawing part a row picks as the plan does: a joined file whole, a separated file's layer or parcels. Null: not a drawing pick. */
function partOf(row: LayerRow, p: Project): DrawingPart | null {
  const file = row.ref?.file
  if (file === undefined) return null
  if (row.kind === 'file') return splitOf(p, file) ? null : { file }
  if (row.kind === 'layer' && row.ref?.layer !== undefined) return splitOf(p, file) ? { file, layer: row.ref.layer } : null
  if (row.kind === 'parcels') return splitOf(p, file) ? { file, parcels: true } : null
  return null
}

function familyOf(row: LayerRow, p: Project): Family {
  switch (row.kind) {
    case 'mass':
      return 'mass'
    case 'gate':
      return 'gate'
    case 'lot':
      return 'lot'
    case 'street':
      return 'street'
    case 'dimension':
      return 'dimension'
    case 'reference-line':
      return 'reference-line'
    case 'note':
      return 'note'
    case 'existing-road':
      return 'access'
    default:
      return partOf(row, p) ? 'drawing' : 'row'
  }
}

/** The id of the row a picked thing is (tree.ts): a street's is the derived road's own id (`street:<its first segment>`). */
function rowOfRef(r: Ref): string {
  switch (r.kind) {
    case 'street':
      return r.id
    case 'drawing':
      return `file:${r.file ?? r.id}`
    case 'drawing-layer':
      return `layer:${r.file ?? ''}/${r.id}`
    case 'parcels':
      return `parcels:${r.file ?? r.id}`
    default:
      return `${r.kind}:${r.id}`
  }
}

/** The ids of the rows picked now, wherever they were picked: the plan, the 3D, another row (the bridge says what is picked; the rows of kinds and branches are the layer pick's). */
function usePickedRows(): ReadonlySet<string> {
  const keys = useLayerPick((s) => s.keys)
  const refs = usePickedRefs()
  return useMemo(() => new Set([...keys, ...refs.map(rowOfRef)]), [keys, refs])
}

/** The kinds a right-click on a row opens the menu of what is picked for (the others have none: Boundary, Map, Labels…). */
const OBJECT_ROWS = new Set(['mass', 'gate', 'lot', 'street', 'dimension', 'reference-line', 'note', 'existing-road', 'file', 'layer', 'parcels'])

interface Index {
  byId: Map<string, LayerRow>
  /** A row's siblings, itself among them, in the tree's order. */
  siblings: Map<string, LayerRow[]>
  /** A row's parent (null: a branch). */
  parent: Map<string, string | null>
}

function indexOf(rows: LayerRow[]): Index {
  const byId = new Map<string, LayerRow>()
  const siblings = new Map<string, LayerRow[]>()
  const parent = new Map<string, string | null>()
  const walk = (list: LayerRow[], above: string | null) => {
    for (const r of list) {
      byId.set(r.id, r)
      siblings.set(r.id, list)
      parent.set(r.id, above)
      if (r.children) walk(r.children, r.id)
    }
  }
  walk(rows, null)
  return { byId, siblings, parent }
}

interface Visible {
  row: LayerRow
  depth: number
  open: boolean | undefined
}

/** The rows that show: a folded row draws none of what is under it. */
function visibleRows(rows: LayerRow[], folded: ReadonlySet<string>): Visible[] {
  const out: Visible[] = []
  const walk = (list: LayerRow[], depth: number) => {
    for (const row of list) {
      const has = (row.children?.length ?? 0) > 0
      const open = has ? foldedByDefault(row) === folded.has(row.id) : undefined
      out.push({ row, depth, open })
      if (has && open) walk(row.children!, depth + 1)
    }
  }
  walk(rows, 0)
  return out
}

/** What the handlers read when they run: the latest of everything, so the handlers themselves never change. */
interface Latest {
  project: Project
  option: Id
  index: Index
  picked: ReadonlySet<string>
  off: ReadonlySet<string>
  switches: ReturnType<typeof useSwitches>
  folded: ReadonlySet<string>
}

const NEW_BUILDING_ACTION: AddAction = {
  label: 'New building',
  title: 'A new building in the option in view, with one level (Design › New building)',
  run: () => void runCommand('design.building.new'),
}
const ADD_DRAWING_ACTION: AddAction = {
  label: 'Add drawing…',
  title: 'Bring another drawing of the site (DXF, DWG) for its drawing lines and parcels: the boundary and the ground stay',
  run: addDrawing,
}

export function LayersTab() {
  const { project, derived } = useSettled()
  const option = useApp((s) => s.option)
  const level = useApp((s) => (s.showAll ? null : s.level))
  const activeBuilding = useApp((s) => buildingOfLevel(s.project, s.level)?.id)
  const terrain = useModule('terrain').on
  const parking = useModule('parking').offered
  const off = useHiddenSet()
  const onTop = useOnTopSet()
  const asked = useRowRename((s) => s.asked)
  const foldedList = useLayerView((s) => s.folded)
  const switches = useSwitches()
  const picked = usePickedRows()
  const [editing, setEditing] = useState<string | null>(null)
  const [over, setOver] = useState<{ id: string; mark: OverMark } | null>(null)
  const container = useRef<HTMLDivElement>(null)

  // the rows, once for a project, an option and what was derived for it: never on a pointer move
  const rows = useMemo(() => layerTree(project, option, derived, { terrain, parking }, off), [project, option, derived, terrain, parking, off])
  const index = useMemo(() => indexOf(rows), [rows])
  const folded = useMemo(() => new Set(foldedList), [foldedList])
  const visible = useMemo(() => visibleRows(rows, folded), [rows, folded])

  // a row picked and then gone (another option, a deleted building) is let go
  useEffect(() => {
    useLayerPick.getState().keep(new Set(index.byId.keys()))
  }, [index])

  // what is picked on the plan: its row scrolls into view when its branch is open
  useEffect(() => {
    for (const node of container.current?.querySelectorAll<HTMLElement>('[data-row-id]') ?? []) {
      if (!picked.has(node.dataset.rowId ?? '')) continue
      if (typeof node.scrollIntoView === 'function') node.scrollIntoView({ block: 'nearest' })
      break
    }
  }, [picked])

  // Rename of a building or a level (F2, Edit › Rename, the menu): its name goes into its field, when its row shows
  useEffect(() => {
    if (!asked) return
    if (visible.some((v) => v.row.id === asked)) setEditing(asked)
    useRowRename.getState().take()
  }, [asked, visible])

  const latest = useRef<Latest>(null as unknown as Latest)
  latest.current = { project, option, index, picked, off, switches, folded }

  const h = useMemo<RowHandlers>(() => {
    const now = () => latest.current

    /** The rows a click leaves picked, in the clicked row's family: Shift a run among its siblings, Ctrl one more. */
    function runOf(row: LayerRow, e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }): LayerRow[] {
      const c = now()
      const order = (c.index.siblings.get(row.id) ?? []).map((r) => r.id)
      const next = rangePick(order, { ids: [...c.picked], anchor }, row.id, e)
      anchor = next.anchor
      const family = familyOf(row, c.project)
      return next.ids.flatMap((id) => {
        const r = c.index.byId.get(id)
        return r && familyOf(r, c.project) === family ? [r] : []
      })
    }

    /** Picks these rows, all of one family, the way their kind is picked. `go`: a building or a level also becomes the plan's. */
    function pickRows(row: LayerRow, rs: LayerRow[], go: boolean) {
      const c = now()
      const family = familyOf(row, c.project)
      /** The objects these rows stand for, as the bridge takes them. */
      const objects = (kind: string): Ref[] => rs.flatMap((r) => (r.ref?.object ? [{ kind, id: r.ref.object }] : []))
      if (family === 'mass') {
        pickFromRow(c.option, rs.flatMap((r) => r.ref?.masses ?? []))
      } else if (family === 'gate' || family === 'lot' || family === 'street' || family === 'reference-line') {
        letGo()
        pickRefs(objects(family))
      } else if (family === 'dimension' || family === 'note') {
        // a hidden dimension or a note on another level: the plan goes to its level, where it is picked
        if (row.ref?.level) useApp.getState().setLevel(row.ref.level)
        letGo()
        pickRefs(objects(family))
      } else if (family === 'access') {
        letGo()
        const one = rs.find((r) => r.id === row.id)
        pickRefs(one?.ref?.object ? [{ kind: 'existing-road', id: one.ref.object }] : [])
      } else if (family === 'drawing') {
        pickRefs(rs.flatMap((r) => partOf(r, c.project) ?? []).map(drawingRef))
      } else {
        useLayerPick.getState().set(rs.map((r) => r.id))
        const only = rs.length === 1 && rs[0].id === row.id
        if (go && only && row.kind === 'building' && row.ref?.building) {
          const b = c.project.buildings.find((x) => x.id === row.ref!.building)
          if (b) goToBuilding(c.option, b)
        } else if (go && only && row.kind === 'level' && row.ref?.level) useApp.getState().setLevel(row.ref.level)
      }
    }

    /** What a right-click picks first: the row alone, when it is not picked already. */
    function pickForContext(row: LayerRow) {
      if (!now().picked.has(row.id)) {
        anchor = row.id
        pickRows(row, [row], false)
      }
    }

    /** The ids of the rows picked among this row's siblings (a run of buildings, of levels), in the order they were picked. */
    function pickedSiblings(row: LayerRow): LayerRow[] {
      const c = now()
      const sibling = (c.index.siblings.get(row.id) ?? []).map((r) => r.id)
      return useLayerPick
        .getState()
        .keys.filter((k) => sibling.includes(k))
        .flatMap((k) => c.index.byId.get(k) ?? [])
    }

    /**
     * What a right-click on this row opens the menu of: the `Ref`s of what the row stands for, the row picked first when it is not picked. A building not among the picked is picked
     * alone, but the masses selected stay selected (*Assign selection to <building>* acts on them); the ones picked, a run of buildings or levels, are all in it. A branch row
     * (Streets, Gates…) is the one `BRANCH` ref. Null: the row has no menu.
     */
    function menuRefs(row: LayerRow): Ref[] | null {
      const c = now()
      if (row.kind === 'building' && row.ref?.building) {
        if (!c.picked.has(row.id)) {
          anchor = row.id
          useLayerPick.getState().set([row.id], true)
        }
        return pickedSiblings(row).flatMap((r) => (r.ref?.building ? [{ kind: 'building', id: r.ref.building }] : []))
      }
      if (row.kind === 'level' && row.ref?.level) {
        pickForContext(row)
        return pickedSiblings(row).flatMap((r) => (r.ref?.level ? [{ kind: 'level', id: r.ref.level }] : []))
      }
      if (isBranch(row.id)) {
        pickForContext(row)
        return [{ kind: BRANCH, id: row.id }]
      }
      if (row.kind === 'grid') {
        pickForContext(row)
        return [{ kind: 'grid', id: 'grid' }]
      }
      if (!OBJECT_ROWS.has(row.kind)) return null
      // a thing's own right-click is of the things: a building marked beside the masses selected (its right-click) lets go
      useLayerPick.getState().clear()
      pickForContext(row)
      return pickedRefs()
    }

    return {
      pick(row, e) {
        const rs = runOf(row, e)
        pickRows(row, rs, !picksSeveral(e))
      },
      fold(row) {
        // the store holds the rows that differ from their first fold: flipping a row's fold flips its membership
        useLayerView.getState().setFolded(row.id, !now().folded.has(row.id))
      },
      eye(row) {
        // all hidden: show all; otherwise hide all (a building's goes through `toggleHidden`: eyes.ts)
        toggleRowEye(row)
      },
      top(row) {
        toggleOnTop(row.top ?? [])
      },
      lock(row) {
        // locked or free: a click on a mixed row locks all
        const lock = row.lock !== 'locked'
        const c = now()
        const apply = useApp.getState().apply
        const children = (kind: string) => (row.children ?? []).flatMap((r) => (r.kind === kind && r.ref?.object ? [r.ref.object] : []))
        // a mass or a level of a locked building is held by the building's padlock: freeing its own flag changes nothing, and the notice says where it comes off
        const inLocked = (ids: Id[]) => c.project.buildings.find((b) => b.locked === true && c.project.masses.some((m) => ids.includes(m.id) && b.levels.some((l) => l.id === m.levelId)))
        if (row.kind === 'mass' || row.kind === 'level') {
          const ids = row.ref?.masses ?? []
          const held = !lock ? inLocked(ids) : undefined
          if (held) useToast.getState().show('info', heldByBuilding(row.label, held.name))
          return apply((p) => actions.lockMasses(p, ids, lock))
        }
        if (row.kind === 'building' && row.ref?.building) {
          const id = row.ref.building
          return apply((p) => actions.lockBuildings(p, [id], lock))
        }
        if (row.kind === 'buildings') {
          const ids = (row.children ?? []).flatMap((r) => (r.ref?.building ? [r.ref.building] : []))
          return apply((p) => actions.lockBuildings(p, ids, lock))
        }
        if (row.kind === 'gate' || row.kind === 'gates') {
          const ids = row.kind === 'gate' ? (row.ref?.object ? [row.ref.object] : []) : children('gate')
          return apply((p) => actions.lockGates(p, ids, lock, c.option))
        }
        // an existing road's padlock is its own flag (the site's: no option is asked; Phase PE.2)
        if (row.kind === 'existing-road' || row.kind === 'existing-roads') {
          const ids = row.kind === 'existing-road' ? (row.ref?.object ? [row.ref.object] : []) : children('existing-road')
          return apply((p) => actions.lockExistingRoads(p, ids, lock))
        }
        if (row.kind === 'lot' || row.kind === 'lots') {
          const ids = row.kind === 'lot' ? (row.ref?.object ? [row.ref.object] : []) : children('lot')
          return apply((p) => actions.lockLots(p, ids, lock))
        }
        // a reference line's padlock is its own flag: the Reference lines row holds every line, the ones with a row of their own or not
        if (row.kind === 'reference-line' || row.kind === 'reference-lines') {
          const ids = row.kind === 'reference-line' ? (row.ref?.object ? [row.ref.object] : []) : (row.ref?.objects ?? [])
          return apply((p) => actions.lockReferenceLines(p, ids, lock))
        }
        // a note's padlock is its own flag: the Notes row holds every note of the option's levels, the ones with a row of their own or not
        if (row.kind === 'note' || row.kind === 'notes') {
          const ids = row.kind === 'note' ? (row.ref?.object ? [row.ref.object] : []) : (row.ref?.objects ?? [])
          return apply((p) => actions.lockNotes(p, ids, lock))
        }
        // a street's padlock is its segments': the Streets row holds all of them
        if (row.kind === 'street' || row.kind === 'streets') {
          const segments = row.ref?.segments ?? []
          return apply((p) => actions.lockStreets(p, segments, lock, c.option))
        }
        const file = row.ref?.file
        if (row.kind === 'layer' && file !== undefined && row.ref?.layer !== undefined) return setLayerLocked(file, row.ref.layer, lock)
        if (row.kind === 'parcels' && file !== undefined) return setParcelsOfLocked(file, lock)
        if (row.kind === 'file' && file !== undefined) return setFilesLocked([file], lock)
        if (row.kind === 'drawings') return setFilesLocked(row.ref?.files ?? [], lock)
      },
      menu(row, e) {
        const refs = menuRefs(row)
        if (!refs || refs.length === 0) return
        e.preventDefault()
        openMenu(e, refs, 'layers')
      },
      startRename(row) {
        if (row.kind === 'building') setEditing(row.id)
      },
      rename(row, name) {
        setEditing(null)
        if (name === null) return
        if (row.kind === 'level' && row.ref?.level) {
          const level = row.ref.level
          return useApp.getState().apply((p) => actions.updateLevel(p, level, { name }))
        }
        if (row.ref?.building) updateBuilding(row.ref.building, { name })
      },
      dragStart(row, e) {
        const c = now()
        if (row.kind === 'building' && row.ref?.building) {
          dragged = { kind: 'building', id: row.ref.building }
          carryTreeItem(e, { kind: 'building', id: row.ref.building, optionId: c.option }, row.label)
        } else if (row.kind === 'mass' && row.ref?.masses?.[0]) {
          // a mass of the selection takes the selection with it
          const sel = pickedRefs().flatMap((r) => (r.kind === 'mass' ? [r.id] : []))
          const id = row.ref.masses[0]
          dragged = { kind: 'masses', ids: sel.includes(id) ? sel : [id] }
          e.dataTransfer?.setData('text/plain', row.label)
        }
      },
      dragEnd() {
        dragged = null
        setOver(null)
      },
      dragOver(row, e) {
        const d = dragged
        if (!d || row.kind !== 'building' || !row.ref?.building) return
        if (!(d.kind === 'masses' || copyDrop(e) || d.id !== row.ref.building)) return
        e.preventDefault()
        if (e.dataTransfer) e.dataTransfer.dropEffect = copyDrop(e) ? 'copy' : 'move'
        setOver({ id: row.id, mark: d.kind === 'building' ? 'before' : 'into' })
      },
      dragLeave(row) {
        setOver((o) => (o?.id === row.id ? null : o))
      },
      drop(row, e) {
        const d = dragged
        const copy = copyDrop(e)
        dragged = null
        setOver(null)
        const buildingId = row.ref?.building
        if (!d || row.kind !== 'building' || !buildingId) return
        if (!(d.kind === 'masses' || copy || d.id !== buildingId)) return
        e.preventDefault()
        const c = now()
        if (d.kind === 'masses') (copy ? copyInto : assign)(d.ids, c.option, buildingId)
        else (copy ? copyBuildingInto : dropBuilding)(d.id, c.option, buildingId)
      },
    }
  }, [])

  /** Focuses a row's name (the button that picks it). */
  const focusRow = (id: string | null | undefined) => {
    if (!id) return
    for (const node of container.current?.querySelectorAll<HTMLElement>('[data-row-id]') ?? []) {
      if (node.dataset.rowId === id) return void node.querySelector<HTMLElement>('[data-row-pick]')?.focus()
    }
  }

  // the row that had focus last, and where it stood: if it is deleted while it has focus, the browser leaves focus on the page
  const focused = useRef<{ id: string; at: number } | null>(null)
  const onFocus = (e: FocusEvent<HTMLDivElement>) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-row-id]')?.dataset.rowId
    const at = id ? visible.findIndex((v) => v.row.id === id) : -1
    focused.current = id && at >= 0 ? { id, at } : null
  }
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    // focus that went elsewhere, or the window's, is not a row gone: only a row that is still there forgets it (a removed one fires nothing)
    if ((e.target as HTMLElement).isConnected) focused.current = null
  }
  useLayoutEffect(() => {
    const was = focused.current
    if (!was || visible.some((v) => v.row.id === was.id)) return
    focused.current = null
    const active = document.activeElement
    if (active && active !== document.body) return
    const to = visible[Math.min(was.at, visible.length - 1)]
    if (to) focusRow(to.row.id)
    else container.current?.focus()
  }, [visible])

  /** ↑ ↓ → ← Home End on a row's name (never in a field, never with a modifier); Enter is the button's own click. */
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
    const target = e.target as HTMLElement
    if (!target.matches('[data-row-pick]')) return
    const id = target.closest<HTMLElement>('[data-row-id]')?.dataset.rowId
    const at = visible.findIndex((v) => v.row.id === id)
    if (!id || at < 0) return
    const here = visible[at]
    const go = (to: Visible | undefined) => {
      e.preventDefault()
      focusRow(to?.row.id)
    }
    if (e.key === 'ArrowDown') go(visible[at + 1])
    else if (e.key === 'ArrowUp') go(visible[at - 1])
    else if (e.key === 'Home') go(visible[0])
    else if (e.key === 'End') go(visible[visible.length - 1])
    else if (e.key === 'ArrowRight') {
      if (here.open === false) {
        e.preventDefault()
        h.fold(here.row)
      } else if (here.open) go(visible[at + 1])
    } else if (e.key === 'ArrowLeft') {
      if (here.open) {
        e.preventDefault()
        h.fold(here.row)
      } else {
        const up = index.parent.get(id)
        if (up) go(visible.find((v) => v.row.id === up))
      }
    }
  }

  return (
    <>
      {/* the keys are the tree's: each row's name is a button, and an arrow on it moves among the rows */}
      <div
        ref={container}
        role="tree"
        aria-label="Layers"
        aria-multiselectable="true"
        tabIndex={-1}
        className="flex flex-col gap-px outline-none"
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
      >
        {visible.map(({ row, depth, open }) => {
          const eye = eyeState(row.eyes, off, switches)
          const dim = eye === 'hidden' || (row.underBuilding !== undefined && off.has(buildingKey(row.underBuilding)))
          const add = row.kind === 'buildings' ? NEW_BUILDING_ACTION : row.kind === 'drawings' && project.site.boundary ? ADD_DRAWING_ACTION : null
          return (
            <Row
              key={row.id}
              row={row}
              depth={depth}
              open={open}
              eye={eye}
              eyeTitle={switchTitle(row)}
              top={topState(row.top, onTop)}
              picked={picked.has(row.id)}
              current={(row.kind === 'building' && row.ref?.building === activeBuilding) || (row.kind === 'level' && row.ref?.level === level)}
              dim={dim}
              editing={editing === row.id}
              draggable={row.kind === 'building' || row.kind === 'mass'}
              over={over?.id === row.id ? over.mark : null}
              add={add}
              h={h}
            />
          )
        })}
      </div>
    </>
  )
}
