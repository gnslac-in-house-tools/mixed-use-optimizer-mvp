// The agent's tools (Decision "Agent tools", Phase 8.0): the app's verbs and readings, one list for the agent in the
// app (8.1, through plugins/host.ts) and for MCP (8.2).
//   TOOLS        each with its name, description, kind and zod input
//   toolSchemas  what an agent is given: name, description, JSON Schema of the input
//   callTool     a call checked and run, pure: the project after it (settled: locks and anchored dimensions hold, as in
//                the store) and the answer, or why it could not run
//   LEFT_OUT     the verbs that are no tool, each with why: a new verb fails a test until it is one or is left out
import { z } from 'zod'
import { optionBuildings, optionOf } from '../../engine/buildings.ts'
import { groundLevel } from '../../engine/levels.ts'
import type { Project } from '../../model/schema.ts'
import { settle } from '../../state/settle.ts'
import { EDIT_TOOLS } from './edit.ts'
import { READ_TOOLS } from './read.ts'
import { SITE_TOOLS } from './site.ts'
import { ToolError, type Tool, type ToolContext } from './tool.ts'

export type { Tool, ToolContext } from './tool.ts'
export { AGENT_GUIDE } from './guide.ts'

export const TOOLS: Tool[] = [...READ_TOOLS, ...SITE_TOOLS, ...EDIT_TOOLS]

export interface ToolSchema {
  name: string
  description: string
  /** The input's JSON Schema (an object). */
  inputSchema: Record<string, unknown>
}

export const toolSchemas = (): ToolSchema[] =>
  TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: z.toJSONSchema(t.input, { io: 'input' }) as Record<string, unknown> }))

/** Without the app's view (MCP): the first option, the ground floor of its first building. */
export function defaultContext(p: Project): ToolContext {
  const option = optionOf(p, null)
  const first = optionBuildings(p, option)[0] ?? p.buildings[0]
  return { option: option.id, level: groundLevel(first.levels).id }
}

export type ToolCall = { ok: true; kind: Tool['kind']; project: Project; changed: boolean; output: unknown } | { ok: false; error: string }

/** Checks a call's input, runs it, settles what it made; a wrong input, id or refused edit comes back as its reason. */
export function callTool(p: Project, name: string, input: unknown, ctx: ToolContext = defaultContext(p)): ToolCall {
  const t = TOOLS.find((x) => x.name === name)
  if (!t) return { ok: false, error: `No tool "${name}".` }
  const parsed = t.input.safeParse(input ?? {})
  if (!parsed.success) return { ok: false, error: `${name}: ${z.prettifyError(parsed.error)}` }
  try {
    const r = t.run(p, parsed.data, ctx)
    const settled = settle(p, r.project)
    if ('refused' in settled) return { ok: false, error: `${name}: ${settled.refused}` }
    return { ok: true, kind: t.kind, project: settled.project, changed: settled.project !== p, output: r.output }
  } catch (e) {
    if (e instanceof ToolError) return { ok: false, error: e.message }
    return { ok: false, error: `${name} failed: ${e instanceof Error ? e.message : String(e)}` }
  }
}

/**
 * The verbs of `actions` that are no tool, and why. Drawing by hand (dimensions, roads; the corners are tools since
 * H.0) waits for its phase or stays the designer's; the others are steps inside a tool, or the app's own.
 */
export const LEFT_OUT: Record<string, string> = {
  // mixed-use-mvp: the residential module's verbs; the agent is out of this piece
  setParams: 'The residential module’s GFit parameters of a building (mixed-use MVP): set in its Properties; the agent is out of piece 1',
  setCalificacion: 'The residential module’s calificación rules (mixed-use MVP): set in the Reglas de calificación window; the agent is out of this piece',
  guardarPlan: 'A department plan of the residential module’s library (mixed-use MVP, piece 3): edited in the Departamento window; the agent is out of this piece',
  borrarPlan: 'Deletes a department plan from the residential module’s library (mixed-use MVP, piece 3): from the Departamentos tab; the agent is out of this piece',
  setPot: 'The residential module’s POT (mixed-use MVP): set in the site’s Properties; the agent is out of this piece',
  setProjectUnits: 'Project data’s Units (Decision "Project units"): only CAD exports read it, and the agent has no export tool yet',
  // the streets (Decision "Streets"): addStreet, setStreetType, moveStreet, moveStreetNode and removeStreet are tools
  // (ST.3, the road tools'); these are the plan's gestures, and the types the Brief's until ST.9
  splitStreetSegment: 'a double click on a street (the plan); addStreet joins and splits where it is drawn',
  removeStreetNode: 'Delete on a street’s node (the plan); removeStreet takes its segments',
  pathOf: 'the plan’s path handles (Phase PE.1, Decision "Path engine"); the agent edits a street with addStreet, moveStreet, moveStreetNode and setStreetEdges',
  editPath: 'the plan’s path handles (Phase PE.1, Decision "Path engine"); the agent edits a street with addStreet, moveStreet, moveStreetNode and setStreetEdges',
  setStreetTypes: 'the agent edits the street types from ST.9 (Decision "Streets")',
  setStreetSegmentWidth: 'a width for whole segments keeping the shares of their sides: nothing in the plan calls it since PE.1 (the pills and the typed width go through editPath); the agent uses setStreetEdges',
  // a street end and the lot it reaches (Decision "Streets follow their lots", SE.6): every tool's edit is settled
  disconnectStreetEnd: 'Properties’ Disconnect on a picked street; a street end moved away lets go too (moveStreetNode)',
  followLots: 'every edit settles it (Decision "Streets follow their lots")',
  followRoads: 'every edit settles it (Phase PE.1, Decision "Street links")',
  linkStreetEnds: 'the sample and the demo link their street ends as they are built (Phase PE.2)',
  followGates: 'every edit settles it (Phase PE.2, Decision "On edge engine"): a gate stays on its side of the street it stands on',
  // an existing street transformed (Phase PE.2, task 11): the Tools strip’s Mirror and Copy; the agent’s moveExistingRoad, rotateExistingRoad and updateExistingRoad (locked) are the others
  mirrorExistingRoads: 'the Tools strip’s Mirror over a picked existing street (Phase PE.2); no mirror tool for the agent (plan Decision 23)',
  copyExistingRoads: 'the Tools strip’s Copy over a picked existing street (Phase PE.2); no copy tool for the agent (plan Decision 23)',
  lotEntrances: 'a helper: the entrances the settle step reads',
  // the Tools strip's Move, Copy and Rotate (Decision "Tools strip")
  turnMassesAbout: 'drawing by hand: the Tools strip’s Move, Copy and Rotate (Decision "Tools strip")',
  turnStreetNodes: 'drawing by hand: the Tools strip’s Move, Copy and Rotate (Decision "Tools strip")',
  moveDimensions: 'drawing by hand: the Tools strip’s Move, Copy and Rotate (Decision "Tools strip")',
  turnDimensions: 'drawing by hand: the Tools strip’s Move, Copy and Rotate (Decision "Tools strip")',
  movePicked: 'drawing by hand: the Tools strip’s Move, Copy and Rotate (Decision "Tools strip")',
  copyPicked: 'drawing by hand: the Tools strip’s Move, Copy and Rotate (Decision "Tools strip")',
  turnPicked: 'drawing by hand: the Tools strip’s Move, Copy and Rotate (Decision "Tools strip")',
  mirrorPicked: 'drawing by hand: the Tools strip’s Mirror, Array and Align (Phase AS.5, Decision "Mirror, Array, Align")',
  arrayPicked: 'drawing by hand: the Tools strip’s Mirror, Array and Align (Phase AS.5, Decision "Mirror, Array, Align")',
  alignPicked: 'drawing by hand: the Tools strip’s Mirror, Array and Align (Phase AS.5, Decision "Mirror, Array, Align")',
  groupRefs: 'grouping across kinds is by hand: Group in the Tools strip and the Edit menu (Phase AS.5, Decision "Groups of any kind"); the agent’s groupMasses groups masses',
  ungroupRefs: 'grouping across kinds is by hand: Ungroup in the Edit menu (Phase AS.5, Decision "Groups of any kind"); the agent’s ungroupMasses takes masses apart',
  mirrorMasses: 'a step of the Tools strip’s Mirror (Phase AS.5, Decision "Mirror, Array, Align")',
  mirrorStreetNodes: 'a step of the Tools strip’s Mirror (Phase AS.5, Decision "Mirror, Array, Align")',
  mirrorDimensions: 'a step of the Tools strip’s Mirror (Phase AS.5, Decision "Mirror, Array, Align")',
  mirrorReferenceLines: 'a step of the Tools strip’s Mirror (Phase AS.5, Decision "Mirror, Array, Align")',
  mirrorNotes: 'a step of the Tools strip’s Mirror (Phase AS.5, Decision "Mirror, Array, Align")',
  isBlockMass: 'a helper',
  // helpers, not edits
  isLayerLocked: 'a helper',
  parcelsLocked: 'a helper',
  stayedLocked: 'a helper',
  newId: 'a helper',
  newLevelId: 'a helper',
  copyName: 'a helper',
  translateFootprint: 'a helper',
  release: 'a helper',
  withLevels: 'a step of the level verbs',
  withoutEmptyBuildings: 'every edit settles it (Decision "No empty buildings")',
  toContour: 'a step of the shape verbs',
  // covered by another tool
  removeMass: 'removeMasses',
  removeLevels: 'removeLevel, one at a time (the level rows of the Layers tree delete several picked at once)',
  updateMasses: 'updateMass, one at a time',
  copyMasses: 'copyMass',
  copyWithBlocks: 'copyMass (a block is copied whole: a new block of its type)',
  stretchWarehouseHall: 'drawing by hand: a block box’s wall dragged on the plan (B.2)',
  stretchBlockWall: 'drawing by hand: a block’s wall dragged on the plan (Decision "Block shape")',
  moveBlockEdge: 'drawing by hand: a block’s inner wall dragged on the plan (Decision "Block shape")',
  shapeWarehouse: 'drawing by hand: a block’s shape edited on its plan, the Program window (Decision "Block shape")',
  shapeCopy: 'drawing by hand: a placed block’s own outline edited on the site, a bump or a corner removed (Phase D.1)',
  edgeRefusal: 'a reading: why a wall takes no dock, door, pattern or truck court (it is not along the grid, Phase D.2); the element tools are drawn by hand',
  blockHoleOf: 'a reading: a block’s hole for the shape handles (Phase D.2), the adapter of its kind; shapeOf is the verb',
  addTypeHole: 'drawing by hand: the block editor’s Hole tool cuts a rectangle in a block type (Phase D.2); the agent’s hole tools reach a placed block’s holes',
  editBlockHole: 'drawing by hand: a block’s hole edited through editShape (Phase D.2); moveHoleVertex and the hole tools are the agent’s',
  editBlockHoles: 'the hole verbs of a mass (addHole, removeHole, setHoleOutline, setHoleCorridor) on a block’s hall, which they hand to its copy (Phase D.2)',
  typeShapeOf: 'a reading: a block type’s outline for the shape handles (Phase D.1), the adapter of its kind; shapeOf is the verb',
  editTypeShape: 'drawing by hand: a block type’s outline edited through editShape (Phase D.1), the adapter of its kind',
  blockShapeOf: 'a reading: a block’s mass for the shape handles (Phase D.1), the adapter of its kind; shapeOf is the verb',
  editBlockShape: 'drawing by hand: a block’s mass edited through editShape (Phase D.1), the adapter of its kind',
  courtShapeOf: 'a reading: a truck court for the shape handles (Phase D.3), the adapter of the `court` and `block-court` kinds; shapeOf is the verb, getDocks the agent’s reading of the courts',
  editCourtShape: 'drawing by hand: a truck court edited through editShape (Phase D.3), the adapter of its kinds; the agent leaves editing a court to the designer (setEdgeCourt’s note)',
  removeCourt: 'drawing by hand: Delete on a picked truck court takes that one court (a piece of a split), the wall’s other courts stay (Phase D.3); setEdgeCourt is the agent’s',
  courtToRectangle: 'drawing by hand: *Back to a rectangle* in a truck court’s menu (Phase D.3)',
  edgeOf: 'a reading: the walls of a block with their slots and elements for the On edge handles (Phase D.3); getDocks is the agent’s reading of the docks',
  editEdge: 'drawing by hand: a block’s docks, doors and patterns put, slid, counted and sized through the On edge engine (Phase D.3); the agent leaves them to the designer (putElements’ note)',
  gateEdgeOf: 'a reading: the sides of a street, an existing street or the boundary with their slots and gates for the On edge handles (Phase PE.2), the adapters of those hosts; edgeOf is the verb',
  editGateEdge: 'drawing by hand: a gate put, slid and sized on a side through editEdge (Phase PE.2), the adapters of those hosts; the agent’s addGate and updateGate take `on`',
  editTypeEdge: 'drawing by hand: a block type’s elements edited through editEdge (Phase D.3), the adapter of its host',
  editBlockEdge: 'drawing by hand: a placed block’s own elements edited through editEdge (Phase D.3), the adapter of its host',
  courtDepthRefusal: 'a reading: why a wall’s own court depth is refused (its courts have shapes of their own, Phase D.3); setCourtDepth says it itself',
  typeEdgeOf: 'a reading: a block type’s walls for the On edge handles (Phase D.3), the adapter of its host; edgeOf is the verb',
  blockEdgeOf: 'a reading: a placed block’s walls for the On edge handles (Phase D.3), the adapter of its host; edgeOf is the verb',
  putElements: 'drawing by hand: a block’s docks, doors and patterns put on its modules by the plan’s tools (Decision "Elements by module")',
  removeElements: 'drawing by hand: a block’s docks, doors and patterns picked on its plan and deleted (Decision "Elements by module")',
  setElementsWidth: 'drawing by hand: the Width of a block’s docks, doors or patterns, in step 6 of its editor (Decision "Elements by module")',
  renameElements: 'drawing by hand: the Name of a block’s patterns, in step 6 of its editor (Decision "Elements by module")',
  setEdgeCourt: 'drawing by hand: a block wall’s truck court, the plan’s Court tool and its pill (Decision "Truck court"); setTypeCourt sets the block’s depth',
  moveGridLines: 'drawing by hand: several column lines picked on a block’s plan dragged together by a bubble (Decision "Multi-selection"); the tool moves one at a time',
  slideElements: 'drawing by hand: several docks, doors and patterns picked on a block’s plan slid along their walls (Decision "Multi-selection")',
  removePicked: 'drawing by hand: Delete on what is picked on a block’s plan (Decision "Multi-selection"); removeElements and the grid line tool delete them too',
  removeMassesWithBlocks: 'removeMasses',
  blockWalls: 'a helper',
  blockWall: 'a helper',
  toggleMassLock: 'lockMasses',
  addNode: 'addMass, or addFromBrief',
  // every building is a block (Phase D.2, Decision "Draw makes a block"): the plain mass stays inside the engine, for the tests' projects and the stress test
  addMass: 'a plain mass stays inside the engine (the tests’ projects, the circulation’s stress test); the agent’s addMass, addMassFromPoints, packMasses and checkMasses’ trial make blocks, through drawBlock (Phase D.2)',
  blockTypeFor: 'a step of drawBlock: the type of the block’s program, made from the typology’s defaults the first time (Phase D.2)',
  addProgramMass: 'addFromBrief',
  removeProgramMass: 'removeMasses',
  solveIssue: 'solve',
  addLevel: 'the levels are the ones the masses make (Decision "Levels follow the masses"): moveMassToLevel',
  addLevelAtEnd: 'the levels are the ones the masses make (Decision "Levels follow the masses"): moveMassToLevel',
  copyMassToLevel: 'copyMass, then moveMassToLevel',
  showKpi: 'setKpis',
  hideKpi: 'setKpis',
  moveKpi: 'setKpis',
  // drawing by hand: the designer's, or its phase's
  dragVertex: 'moveVertex (a drag of it)',
  stretchMass: 'drawing by hand',
  refusalOf: 'a reading: why a mass refuses a corner edit (a block’s outline is free since D.2: it refuses none); the shape tools say it when they refuse (Phase D.1)',
  shapeOf: 'a reading: the outline the shape handles draw (Phase D.1); getMassOutline is the agent’s reading of a mass',
  editShape: 'drawing by hand: the shape handles’ one verb for a mass, a hole and a block (Phase D.1), and the only way to set a chamfer: no tool sets one; moveWall, moveVertex, insertVertex, removeVertex, setCornerRadius and the hole tools are the agent’s',
  dragHoleVertex: 'moveHoleVertex (a drag of it)',
  addDimension: 'annotations: Phase 10.D',
  removeDimension: 'annotations: Phase 10.D',
  toggleDimensionLock: 'annotations: Phase 10.D',
  setDimensionOffset: 'annotations: Phase 10.D',
  setDimensionLength: 'annotations: Phase 10.D',
  addReferenceLine: 'annotations drawn by hand on the plan (Phase AS.5): the agent’s tools for reference lines and notes are later work',
  removeReferenceLine: 'annotations drawn by hand on the plan (Phase AS.5): the agent’s tools for reference lines and notes are later work',
  moveReferenceLines: 'annotations drawn by hand on the plan (Phase AS.5): the agent’s tools for reference lines and notes are later work',
  turnReferenceLines: 'annotations drawn by hand on the plan (Phase AS.5): the agent’s tools for reference lines and notes are later work',
  setReferenceLinePoint: 'annotations drawn by hand on the plan (Phase AS.5): the agent’s tools for reference lines and notes are later work',
  lockReferenceLines: 'annotations drawn by hand on the plan (Phase AS.5): the agent’s tools for reference lines and notes are later work',
  addNote: 'annotations drawn by hand on the plan (Phase AS.5): the agent’s tools for reference lines and notes are later work',
  removeNote: 'annotations drawn by hand on the plan (Phase AS.5): the agent’s tools for reference lines and notes are later work',
  moveNotes: 'annotations drawn by hand on the plan (Phase AS.5): the agent’s tools for reference lines and notes are later work',
  turnNotes: 'annotations drawn by hand on the plan (Phase AS.5): the agent’s tools for reference lines and notes are later work',
  setNoteText: 'annotations drawn by hand on the plan (Phase AS.5): the agent’s tools for reference lines and notes are later work',
  setNoteSize: 'annotations drawn by hand on the plan (Phase AS.5): the agent’s tools for reference lines and notes are later work',
  lockNotes: 'annotations drawn by hand on the plan (Phase AS.5): the agent’s tools for reference lines and notes are later work',
  importSite: 'setBoundary and setLocation (a file is the designer’s)',
  importSiteFile: 'setBoundary and setLocation (a file is the designer’s)',
  removeSiteDrawing: 'a drawing is the designer’s file: its references are taken out from Layers',
  setGeo: 'setLocation',
  placeSite: 'setLocation (Place is the designer’s drag)',
  setMap: 'the map is an image the browser captures',
  setTerrain: 'the ground comes from a file (Phase E: its import is the designer’s)',
  setContourHeight: 'the Heights tool, on the plan (Phase E)',
  setPlatformLevel: 'platforms: the designer’s in Properties for now (Phase E)',
  joinPlatform: 'platforms: the designer’s in Properties for now (Phase E)',
  ownPlatform: 'platforms: the designer’s in Properties for now (Phase E)',
  stepMasses: 'platforms: the designer’s in Properties for now (Phase E)',
  unstepMasses: 'platforms: the designer’s in Properties for now (Phase E)',
  setStepLevel: 'platforms: the designer’s in Properties for now (Phase E)',
  removeStep: 'platforms: the designer’s in Properties for now (Phase E)',
  balanceWithBanks: 'platforms: the designer’s in Properties for now (Phase E)',
  setTerrainSmoothing: 'the ground: the designer’s, in Properties of the Terrain row of Layers (Phase E)',
  moveMassesToElevation: 'the 3D gumball’s up and down; moveMassToLevel is the tool’s',
  setGrid: 'the grid: the designer’s in the bottom bar’s Grid menu; an agent’s through a stage’s run (runStage: the grid’s variables)',
  updateGrid: 'the grid: the designer’s in the bottom bar’s Grid menu; an agent’s through a stage’s run (runStage: the grid’s variables)',
  ownGrid: 'the grid: the designer’s in the bottom bar’s Grid menu; an agent’s through a stage’s run (runStage: the grid’s variables)',
  sharedGrid: 'the grid: the designer’s in the bottom bar’s Grid menu; an agent’s through a stage’s run (runStage: the grid’s variables)',
  stretchBuilding: 'the grid: a building’s bays in Properties; an agent’s through a stage’s run (runStage)',
  splitAtGridLine: 'the grid: the plan menu’s Split at line; an agent’s through a stage’s run (runStage)',
  setProgramPattern: 'the doors on the grid: the Brief’s and Properties’; an agent’s through a stage’s run (runStage: the door patterns)',
  setDoorPattern: 'the doors on the grid: the Brief’s and Properties’; an agent’s through a stage’s run (runStage: the door patterns)',
  flipDoor: 'the doors on the grid: a click on the plan (Phase G)',
  clearDoorFlips: 'the doors on the grid: Properties’ (Phase G)',
  ownGates: 'a step of the gate verbs',
  dropOwnGates: 'the site’s gates are the designer’s, in Properties of the Gates row of Layers',
  // options and buildings the designer arranges
  assignMasses: 'arranging buildings by hand',
  makeBuildingUnique: 'arranging buildings by hand',
  copyBuilding: 'arranging buildings by hand',
  addBuildingToOption: 'arranging buildings by hand',
  moveBuildingInOption: 'arranging buildings by hand',
  removeBuildingFromOption: 'arranging buildings by hand',
  importOption: 'the optimizer’s Keep',
  setOptionGroup: 'the optimizer’s stage options: approveStage groups what it approves',
  moveProgram: 'the order of the brief’s rows',
  copyProgram: 'addProgram',
  // the warehouse types (Phase W): the Warehouse workspace's, step by step; their tools join with W.7
  addWarehouseType: 'the Program window (Phase W, K.3)',
  renameWarehouseType: 'the Program window (Phase W, K.3)',
  duplicateWarehouseType: 'the Program window (Phase W, K.3)',
  removeWarehouseType: 'the Program window (Phase W, K.3)',
  setWarehouseProgram: 'the Program window (Phase W, K.3)',
  copyWarehouseType: 'copyProgram: a Warehouse program’s type comes with it (Decision "Program rule set")',
  // the block library (Phase BL): its blocks live in the browser, not in the project the tools see
  bringBlock: 'the Blocks panel’s library (Phase BL.2): its blocks are the browser’s',
  updateFromLibrary: 'opening a project (Phase BL.3): its blocks are the browser’s',
  linkBlock: 'Save to library (Phase BL.3)',
  unlinkBlock: 'the Program window’s Unlink (Phase BL.3)',
  setProgramKind: 'the Brief’s Kind (Phase K)',
  setProgramGrid: 'the Brief’s rows (Phase K.2)',
  setProgramRange: 'the Brief’s rows (Phase K.2)',
  setProgramHall: 'the Brief’s rows (Phase K.2)',
  setWarehouseFigures: 'setProgramGrid, setProgramRange, setProgramHall',
  setStandardSearch: 'the Brief’s Circulation tab (Phase K.4)',
  setOptionStandards: 'the optimizer’s Road widths (Phase K.4)',
  updateWarehouseStep: 'the Program window (Phase W, K.3)',
  setGridBy: 'the Program window’s Set by (GR.2): how step 1 is typed, not the grid',
  pastRanges: 'a helper: getIssues lists them (code range)',
  bringToRange: 'the optimizer’s Run, after it asks (RB.2): runStage’s backToRange',
  lockWarehouseStep: 'the Program window (Phase W, K.3)',
  reopenWarehouseStep: 'the Program window (Phase W, K.3)',
  editWarehouseStep: 'the Program window’s plan, by hand (Phase W, K.3)',
  placeWarehouse: 'the Program window (Phase W, K.3)',
  placeWarehouseAt: 'the Program window (Phase W, K.3): Place, or a drag from Blocks (Draw makes a block, Decision "Draw makes a block")',
  setWarehouseOverrides: 'the Program window (Phase W, K.3)',
  putCopyElements: 'drawing by hand: a placed block’s own docks, doors and patterns, the site’s block tools (Decision "Blocks on the site")',
  setCopyEdgeCourt: 'drawing by hand: a placed block’s own truck court, the site’s Court tool (Decision "Blocks on the site")',
  copyBackToType: 'Properties: a copy’s Back to type (Decision "Blocks on the site")',
  // the app's own
  setPluginData: 'each plugin’s own (its tools come with its manifest)',
}
