// The data contract. Everything the user (or an optimizer, or an MCP client) can edit lives here.
//
// Each shape is written once, as a zod schema. From it we get:
//   1. the TypeScript type   (z.infer)            → the editor checks our code
//   2. runtime validation    (Schema.parse)       → rejects bad JSON from a file, MCP or optimizer
//   3. a JSON Schema         (z.toJSONSchema)     → what an MCP tool publishes as its input format
//
// This contract is typology-agnostic: industrial, retail or any other project uses the same shapes.
// What changes between typologies is the DATA (which programs, which site rules), see src/typologies/.
//
// Units: metres and degrees. Plan coordinates: x to the east, y to the north.
import { z } from 'zod'
import { PlanCatalogoSchema, ResidentialSchema } from '../modules/residential/engine/schema.ts'

export const IdSchema = z.string().min(1)
export type Id = z.infer<typeof IdSchema>

export const PointSchema = z.object({
  x: z.number(),
  y: z.number(),
})
export type Point = z.infer<typeof PointSchema>

/** A plain closed polygon: the first point is NOT repeated at the end. Engine-internal, never edited directly. */
export type Polygon = Point[]

// ---- Contour (ported from Plaza-Practiko `Contorno`) ----------------------------------------------------------

/**
 * A contour vertex with an optional corner radius (0 = sharp corner) or chamfer (Phase D.1): `chamfer = [a, b]`, the
 * set-back (m) of the cut along the corner's incoming wall and along its outgoing wall. The vertex stays where the two walls meet; a
 * radius and a chamfer exclude each other (see engine/geom/chamfer.ts).
 */
export const VertexSchema = PointSchema.extend({
  r: z.number().nonnegative(),
  chamfer: z.tuple([z.number().nonnegative(), z.number().nonnegative()]).optional(),
})
export type Vertex = z.infer<typeof VertexSchema>

/**
 * An editable outline: straight edges, rounded corners and arc edges.
 * - `vertices`: counter-clockwise, first one not repeated.
 * - `arcs`: optional; key = edge index i (vertices[i] → vertices[i+1]), value = bulge = tan(θ/4).
 *   Negative bulge bulges outwards on a counter-clockwise contour. See engine/geom/contour.ts.
 */
export const ContourSchema = z.object({
  vertices: z.array(VertexSchema).min(3),
  arcs: z.record(z.string().regex(/^\d+$/), z.number()).optional(),
})
export type Contour = z.infer<typeof ContourSchema>

// ---- Masses -------------------------------------------------------------------------------------------------

/**
 * A hole in a mass (Phase H; Practiko's `huecos`): a contour of its own in site coordinates (a court, a light well).
 * `corridor` (Phase H.4, Practiko's `pasilloDeHueco`): the width of a corridor round it, inside the mass; absent: none.
 */
export const HoleSchema = ContourSchema.extend({
  corridor: z.number().positive().optional(),
})
export type Hole = z.infer<typeof HoleSchema>

/**
 * How a mass's footprint is described.
 * - `rect`: the common case. Five numbers: easy to move, rotate and optimize.
 * - `contour`: any other shape (L, trapezoid, curves, a shape that follows the site).
 * The engine turns both into a Polygon, so everything downstream treats them the same.
 */
export const FootprintSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('rect'),
    center: PointSchema,
    width: z.number().positive(), // along the local x axis, before rotation
    depth: z.number().positive(), // along the local y axis, before rotation
    rotation: z.number(), // degrees, counter-clockwise
  }),
  z.object({
    kind: z.literal('contour'),
    contour: ContourSchema,
  }),
])
export type Footprint = z.infer<typeof FootprintSchema>

/** What the brief asks of a program (Decision "Brief"): its area in m² and how many masses; null = not asked. */
export const ProgramTargetSchema = z.object({
  area: z.number().nonnegative().nullable(),
  count: z.number().int().nonnegative().nullable(),
})
export type ProgramTarget = z.infer<typeof ProgramTargetSchema>

/**
 * A use that masses can be assigned to (warehouse, office, retail unit…).
 * Programs are data inside the project, copied from a typology template, so a project can add its own.
 */
/** How a program's masses are hatched on the plan (Decision "Plan style"); absent: built → diagonal, open → paving. */
export const HATCHES = ['none', 'diagonal', 'cross', 'dots', 'paving', 'asphalt'] as const
export type Hatch = (typeof HATCHES)[number]

/**
 * A program's loading docks (Decision "Exterior circulation"; on or off: Decision "Docks on or off"): its masses dock
 * on one long wall, the building's front, which turns with it, or its back when the front's court has no room
 * (Decision "Docks turn with the building"), never a wall another mass stands against; and how many doors: one every
 * `every` m of docked wall (`per: 'm'`) or one per `every` m² of floor (`per: 'm2'`, spread over the docked walls). A
 * mass can have its own walls (Mass.docks), set on the plan.
 */
/**
 * Where a docked wall's doors go while its mass stands on the structural grid (Decision "Structural grid", Phase G.3):
 * along the wall module by module, the modules of the building's end bays (`skip: 'ends'`) or the wall's first and last
 * (`'corners'`) left out, a door every `every` of the others from the `offset`th; or `mask`, a short run that repeats in
 * place of `every`, 1 a door and 0 none (`[1, 1, 0]`: two doors, a gap). The optimizer varies it, never door by door.
 */
export const DockPatternSchema = z.object({
  every: z.number().int().min(1),
  offset: z.number().int().min(0),
  skip: z.enum(['none', 'ends', 'corners']),
  mask: z.array(z.union([z.literal(0), z.literal(1)])).min(1).max(12).optional(),
})
export type DockPattern = z.infer<typeof DockPatternSchema>

export const DocksSchema = z.object({
  per: z.enum(['m', 'm2']),
  every: z.number().positive(),
  // Its doors on the structural grid (absent: one every module, the end bays skipped); `per` and `every` are then the
  // brief's target, not where they go (Decision "Structural grid").
  pattern: DockPatternSchema.optional(),
})
export type Docks = z.infer<typeof DocksSchema>

/**
 * What a program is (Decision "Program rule set"): a warehouse (its deep definition a warehouse type, in the Program
 * editor's six steps), an office, or free (a rectangle as any mass). Absent: free.
 */
export const PROGRAM_KINDS = ['warehouse', 'office', 'free'] as const
export type ProgramKind = (typeof PROGRAM_KINDS)[number]

const Range = z.tuple([z.number().positive(), z.number().positive()])

/** A grid's bay along x and y, in m, and the modules a bay is split in (a warehouse type's step 1, a program's grid). */
const OwnLinesSchema = z.object({ off: z.array(z.number().int()).optional(), on: z.array(z.number().int()).optional() })
export const TypeGridSchema = z.object({
  x: z.number().positive(),
  y: z.number().positive(),
  modules: z.number().int().min(1),
  // how step 1 types it (Decision "Grid by line"): by the module (each axis's in m, the bay their product); absent, by
  // the bay. The grid is the same either way
  by: z.literal('module').optional(),
  // its own lines (Decision "Grid by line", GR.3; modules/warehouse/engine/bays.ts withOwnLines): along each axis, the
  // module lines taken away from the column lines (off) or made ones (on), each counted from its nearer wall (k > 0
  // from the start, k < 0 from the end); absent: the rules' lines
  lines: z.object({ x: OwnLinesSchema.optional(), y: OwnLinesSchema.optional() }).optional(),
})

export const ProgramSchema = z.object({
  id: IdSchema,
  name: z.string(),
  color: z.string(), // informational colour: belongs to project data, not to the UI theme
  built: z.boolean(), // true = a building (counts toward coverage, cannot overlap); false = open area
  // mixed-use-mvp: may stand inside another mass of its own building (a core in its tower): no overlap with them
  nested: z.boolean().optional(),
  kind: z.enum(PROGRAM_KINDS).optional(),
  // Its own grid (Decision "Program rule set": every program has its own, none inherited), while it has no warehouse
  // type: a Warehouse program's is its type's (engine/programs.ts programGrid). Absent: none yet.
  grid: TypeGridSchema.optional(),
  // The sizes its masses may take, width (the long side) and depth, in m: what the optimizer may search; a Warehouse
  // program's is its type's hall's. Absent: its size as it is.
  range: z.object({ width: Range, depth: Range }).partial().optional(),
  // The rectangle a new mass of it starts with, in m, set by hand (Decision "New mass size"). Absent: the brief's area
  // per mass (else `massArea`) at 2:1, engine/brief.ts programSize. The graph's new nodes read it too. `fixed`: the
  // brief asks exactly this size (Decision "Fixed size"): the optimizer gives each of its masses this rectangle and only
  // moves and turns it (the plan still edits a mass by hand).
  size: z.object({ width: z.number().positive(), depth: z.number().positive(), fixed: z.boolean().optional() }).optional(),
  // The most elongated the optimizer may make its masses, long side over short, either way round (absent: 3, MAX_ASPECT
  // in engine/brief.ts). Not for a fixed size.
  maxAspect: z.number().min(1).optional(),
  // m²: a new mass's area when the brief does not give one (its typology's typical mass). Absent: DEFAULT_MASS_AREA.
  massArea: z.number().positive().optional(),
  // The brief's target for it (absent: none). Its area is floor area: GFA for a built program, ground for an open one.
  target: ProgramTargetSchema.optional(),
  hatch: z.enum(HATCHES).optional(),
  // Its masses' loading docks (absent: none). The first per-kind parameter (Decision "Program kinds").
  docks: DocksSchema.optional(),
  // What it asks of the parking (Decision "Program rule set", the Brief's Circulation tab): a car stall per so many m² of
  // its floor (`carStalls`), so many trailer stalls per dock door of its masses (`trailerStalls`). Absent: none.
  demand: z.object({ carStalls: z.number().positive(), trailerStalls: z.number().positive() }).partial().optional(),
})
export type Program = z.infer<typeof ProgramSchema>

// ---- Levels (ported from Plaza-Practiko `Nivel`) ---------------------------------------------------------------

/**
 * A floor of a building: its masses and dimensions are drawn on it (Decisions "Levels", "Buildings and options"). Its
 * id is unique in the whole project, so a mass's level also says its building. `elevation` is where its floor is, from
 * the site's ground (0; negative = below it). `repeat` (×N) makes it a typical floor: N identical
 * floors stacked, each `height` tall, so it counts N times in the 3D, the floor area and the volume.
 */
export const LevelSchema = z.object({
  id: IdSchema,
  name: z.string(),
  elevation: z.number(), // m
  height: z.number().positive(), // m, floor to floor
  repeat: z.number().int().min(1), // ×N; 1 = one floor
})
export type Level = z.infer<typeof LevelSchema>

// ---- Warehouse types (Decision "Warehouse type", Phase W) -----------------------------------------------------------

/**
 * A warehouse type's six steps, in order, each edited at any time and locked once checked (modules/warehouse/engine/
 * steps.ts, Decision "Free steps"): the grid, the
 * box (its size), its columns, its envelope, its shape (`morphology`, shown as Shape), the elements on its edges.
 */
export const WAREHOUSE_STEPS = ['grid', 'hall', 'columns', 'envelope', 'morphology', 'elements'] as const
export type WarehouseStep = (typeof WAREHOUSE_STEPS)[number]

/**
 * The way a wall of the block faces, in its own frame (modules/warehouse/engine/): the front towards -y (the box's
 * along y = 0), the back towards +y, the left towards -x, the right towards +x.
 */
export const HALL_SIDES = ['front', 'back', 'left', 'right'] as const
export type HallSide = (typeof HALL_SIDES)[number]

// Step 1, the grid (TypeGridSchema, with the programs): the interior bay along the box's length (x) and width (y).
/**
 * Step 2: the block's box, its length (along x) and width (along y), in m, column line to column line: the bounding
 * box of its outline (Decision "Block shape"), what the optimizer and the range play with. Whole bays inside, the end
 * bays take what is left (`ends`: at both ends, or all of it at the start or the end of each axis). `range`: what the
 * optimizer may search (absent: the size as it is).
 */
export const HallSchema = z.object({
  length: z.number().positive(),
  width: z.number().positive(),
  ends: z.enum(['both', 'start', 'end']),
  // the width's own end bays, when they are not the length's (a bump on the front keeps the grid where it stood:
  // Decision "Block shape"); absent: `ends`
  endsWidth: z.enum(['both', 'start', 'end']).optional(),
  // an axis whose end bay under half a bay stays its own, not joined to the next (a box grown by a bump shallower
  // than that keeps its wall's column line: Decision "Block shape"); absent: joined
  shortEnds: z.object({ x: z.literal(true).optional(), y: z.literal(true).optional() }).optional(),
  // m: an end bay shorter joins the whole bay next to it, along either axis (Decision "Grid by line"); absent: two
  // thirds of a bay
  joinUnder: z.number().nonnegative().optional(),
  range: z.object({ length: Range, width: Range }).partial().optional(),
})
/** Step 3: a column at every grid intersection inside the outline, `size` m square; along each axis on every `every`th
 *  line (the box's first and last always). */
export const ColumnsSchema = z.object({ size: z.number().positive(), every: z.object({ x: z.number().int().min(1), y: z.number().int().min(1) }) })
/** Step 4: the envelope, its walls' thickness (m; an edge may have its own, step 5), and how tall the block is (m). */
export const EnvelopeSchema = z.object({ height: z.number().positive(), thickness: z.number().positive() })
/**
 * A corner of the block's outline (step 5, Decisions "Block shape", "Outline in metres"): at `x` along the length and `y`
 * along the width (m, the type's frame: column line A / 1 at 0, 0), the walls' reference line (where the module lines
 * were; not the outer face). The edge from it to the next corner is `id`'s, with its own wall `thickness` and its
 * facade's `offset` out from the reference line (m) when it says so (absent: the envelope's, 0). `r` and `chamfer`
 * are the corner of the wall's outer face (what the Corner and Chamfer tools set, as a contour's vertex has them).
 * What stands on an edge (its docks, doors, patterns) names its id.
 */
export const OutlineCornerSchema = z.object({
  id: IdSchema,
  x: z.number(),
  y: z.number(),
  r: z.number().nonnegative().optional(),
  chamfer: z.tuple([z.number().nonnegative(), z.number().nonnegative()]).optional(),
  thickness: z.number().positive().optional(),
  offset: z.number().min(0).optional(),
})
export type OutlineCorner = z.infer<typeof OutlineCornerSchema>
/** A hole through the block (step 5: a court, a light well): a contour of its own in m (the type's frame), inside its
 *  outline, with an `id`; `corridor` is a migrated mass's (Phase H.4). */
export const ShapeHoleSchema = HoleSchema.extend({
  id: IdSchema,
})
export type ShapeHole = z.infer<typeof ShapeHoleSchema>
/**
 * A zone of the block (step 5, Decisions "Warehouse by hand", "Block shape"): a rectangle of its module grid, from
 * module line `x[0]` to `x[1]` along the length and `y[0]` to `y[1]` along the width, with its program (absent: the
 * block's) and its floor `level` m from the block's (absent: 0). Information inside the one mass, never a mass of its
 * own: counted by program in the KPIs, drawn. The zones cover the box without overlapping
 * (modules/warehouse/engine/zones.ts).
 */
export const HallZoneSchema = z.object({
  id: IdSchema,
  name: z.string().optional(),
  x: z.tuple([z.number().int().min(0), z.number().int().min(1)]),
  y: z.tuple([z.number().int().min(0), z.number().int().min(1)]),
  program: IdSchema.nullable().optional(),
  level: z.number().optional(),
})
export type HallZone = z.infer<typeof HallZoneSchema>
/**
 * Step 5, the shape (Decisions "Block shape", "Outline in metres"): the outline, counter-clockwise, a simple polygon in m
 * (fewer than three corners: the box, its edges e1 front, e2 right, e3 back, e4 left); `arcs` the edges that bulge
 * (keyed by the corner an edge starts at, as `Contour.arcs`); its holes; its zones (absent or empty: one, the whole
 * block; rectangles of module lines). Drawn on a box of its own size: on a longer or shorter box (step 2, a variant, the
 * optimizer) each corner keeps its distance in m from the box's nearer wall (engine/shape.ts).
 */
export const MorphologySchema = z.object({
  outline: z.array(OutlineCornerSchema),
  arcs: z.record(z.string().regex(/^\d+$/), z.number()).optional(),
  holes: z.array(ShapeHoleSchema),
  zones: z.array(HallZoneSchema).optional(),
})
export type Morphology = z.infer<typeof MorphologySchema>
/**
 * An element on the grid (step 6, Decision "Elements by module"): a dock, a level door (an access) or a pattern the
 * designer names, one record per module. On an edge of the outline (its id), centred on `module` (from module line k to
 * k + 1 along the edge's axis, counted on the box the outline was drawn on, as `OutlineCorner.x` and `.y` are: on a
 * longer or shorter box it keeps its distance from the nearer wall, engine/shape.ts), `width` m along the wall (wider
 * than its module is allowed).
 */
export const HallElementSchema = z.object({
  id: IdSchema,
  kind: z.enum(['dock', 'door', 'pattern']),
  name: z.string().optional(),
  edge: IdSchema,
  module: z.number().int().min(0),
  width: z.number().positive(),
})
export type HallElement = z.infer<typeof HallElementSchema>

/**
 * A truck court on an edge of a block's outline (its id), with its own depth (m) when it has one. Phase D.3: a court may have a shape of its own,
 * a contour in its wall's frame (x m along the wall's face from the end where the outline enters the wall, y m out of the face; engine
 * courts.ts), and then no depth: its deepest point is it. `id` (c1, c2…): a court has one once it has a shape or its wall has a second court (a
 * split). Absent `shape`: the rectangle across the wall by its depth.
 */
export const CourtByEdgeSchema = z.object({ edge: IdSchema, depth: z.number().positive().optional(), id: IdSchema.optional(), shape: ContourSchema.optional() })
export type CourtByEdge = z.infer<typeof CourtByEdgeSchema>

// ---- Dimensions ---------------------------------------------------------------------------------------------

/** A corner of a mass: vertex `vertex` of its footprint's contour (a rect's four corners keep their order). */
export const DimensionAnchorSchema = z.object({
  massId: IdSchema,
  vertex: z.number().int().nonnegative(),
})
export type DimensionAnchor = z.infer<typeof DimensionAnchorSchema>

/**
 * A dimension drawn by hand (the Dimension tool): the distance from `a` to `b`, its line `offset` m to the left of
 * a→b (negative: to the right). It stays on the plan and travels in the .gft; it measures, it does not constrain.
 * An end placed on a mass corner is anchored to it (`anchorA`, `anchorB`; Decision "Associative dimensions"): it
 * follows that corner when the mass moves or changes. `a` and `b` are always kept up to date, so what draws a
 * dimension never reads the anchors. A `locked` dimension keeps its length: moving one of its masses drags the other
 * along, and an edit that would change it is refused.
 */
export const DimensionSchema = z.object({
  id: IdSchema,
  levelId: IdSchema, // the level it is drawn on (it measures that level's masses); on a warehouse type, the type's id
  a: PointSchema,
  b: PointSchema,
  offset: z.number(),
  anchorA: DimensionAnchorSchema.optional(),
  anchorB: DimensionAnchorSchema.optional(),
  locked: z.boolean().optional(),
  // The group it is in (Decision "Groups", Phase AS.5): one id names a group across kinds. Absent: none.
  group: IdSchema.optional(),
})
export type Dimension = z.infer<typeof DimensionSchema>

// ---- Reference lines and notes (Phase AS.5) ------------------------------------------------------------------

/**
 * A reference line: a line of two points or more, without a width, drawn on the plan as a guide the other tools snap to. It is the
 * project's, seen on every level and in every option (a guide belongs to the site). `locked`: its padlock, held by `state/settle.ts`
 * (Decision "Padlocks by kind"); `group`: the group it is in, whatever the kinds in it. Ids `r1`, `r2`… Absent from the project: none.
 */
export const ReferenceLineSchema = z.object({
  id: IdSchema,
  points: z.array(PointSchema).min(2),
  locked: z.boolean().optional(),
  group: IdSchema.optional(),
})
export type ReferenceLine = z.infer<typeof ReferenceLineSchema>

/** A note's text size on the plan: the middle one is no `size` at all. */
export const NOTE_SIZES = ['small', 'large'] as const
export type NoteSize = (typeof NOTE_SIZES)[number]

/**
 * A note: a text at a point on a level (as a dimension is), as many lines as its text has, left-aligned from `at`, at `angle` degrees
 * counter-clockwise (absent: 0). `size`: smaller or larger than the plan's labels (absent: as they are). Ids `t1`, `t2`…
 */
export const NoteSchema = z.object({
  id: IdSchema,
  levelId: IdSchema, // the level it is placed on
  at: PointSchema,
  text: z.string(),
  angle: z.number().optional(),
  size: z.enum(NOTE_SIZES).optional(),
  locked: z.boolean().optional(),
  group: IdSchema.optional(),
})
export type Note = z.infer<typeof NoteSchema>

/**
 * A warehouse type (Decision "Warehouse type"): the recipe a project's warehouses are made from, designed alone in the
 * Program window, step by step. Each step's settings are kept in bays and modules where they are places, so a new
 * grid re-applies them. `locks`: the steps locked (checked), and those to lock again (an earlier one edited since);
 * absent: none, every step open.
 * `program`: the hall's, and the program it defines (Decision "Program rule set": one program, one rule set, so no two
 * types share one).
 */
export const WarehouseTypeSchema = z.object({
  id: IdSchema,
  name: z.string(),
  program: IdSchema.nullable(),
  grid: TypeGridSchema,
  hall: HallSchema,
  columns: ColumnsSchema,
  envelope: EnvelopeSchema,
  morphology: MorphologySchema,
  elements: z.array(HallElementSchema),
  locks: z.partialRecord(z.enum(WAREHOUSE_STEPS), z.enum(['locked', 'again'])).optional(),
  // Its truck courts (Decision "Truck court"; the docks step's): the depth in front of each docked edge (m), and the
  // range the optimizer may search. Absent: the standards' `courtDepth`. A placed copy's walls may have their own
  // (Mass.courts).
  court: z.object({ depth: z.number().positive(), range: Range.optional() }).optional(),
  // Its truck courts by edge (Decision "Truck court", BE.2): an edge with docks always has its court, the block's depth
  // (`court`); an entry on it gives it its own `depth`, an entry on an edge without docks puts a court there (its own
  // depth, else the block's). On the site a copy's walls take them (Mass.blockCourts) under their own (Mass.courts).
  // Absent: none of its own.
  courts: z.array(CourtByEdgeSchema).optional(),
  // The library block it came from (Decision "Block library"), and the version of it it is: opening the project
  // brings it up to the block's newest. Absent: the project's own.
  library: z.object({ id: IdSchema, version: z.number().int().min(1) }).optional(),
  // Dimensions drawn by hand in the block editor (BE.10), in the type's frame, its `levelId` the type's id: saved in
  // its block. Absent: none (so no new block version).
  dimensions: z.array(DimensionSchema).optional(),
})
export type WarehouseType = z.infer<typeof WarehouseTypeSchema>

/** What a block's file says it is, and the shape of it this code writes (2: Decision "Block shape"; 3: Decision "Grid by
 *  line", its end bays joined under two thirds of a bay; 4: Decision "Elements by module", one element a module;
 *  5: Phase D.2, the outline and holes in metres; 6: Phase D.3, a truck court may have a shape and an id of its own; absent: 1). */
export const BLOCK_FORMAT = 'gfit-block'
export const BLOCK_VERSION = 6

/**
 * A smart block in the library (Decision "Block library"): a warehouse type with the programs it names (its own
 * first, then its zones'), so any project can take it; `version` grows each time it is saved over; `formatVersion`:
 * the shape of the file (io/blocks.ts reads an older one into this).
 */
export const BlockSchema = z.object({
  format: z.literal(BLOCK_FORMAT),
  formatVersion: z.literal(BLOCK_VERSION),
  id: IdSchema,
  version: z.number().int().min(1),
  savedAt: z.number(),
  type: WarehouseTypeSchema,
  programs: z.array(ProgramSchema).min(1),
})
export type Block = z.infer<typeof BlockSchema>

/**
 * What a copy changes of its type (a variant): any of a step's figures; a list given replaces the type's (its own
 * outline: its inner walls moved, Decision "Block shape").
 */
export const WarehouseOverridesSchema = z.object({
  grid: TypeGridSchema.partial(),
  hall: HallSchema.partial(),
  columns: ColumnsSchema.partial(),
  envelope: EnvelopeSchema.partial(),
  morphology: MorphologySchema.partial(),
  elements: z.array(HallElementSchema),
  // its own outline's courts by edge, carried with it (one bundle: Decision "Elements by module")
  courts: z.array(CourtByEdgeSchema),
  program: IdSchema.nullable(),
}).partial()
export type WarehouseOverrides = z.infer<typeof WarehouseOverridesSchema>

/**
 * A building that is a copy of a warehouse type (Decision "Warehouse type"): its masses are made from the type and
 * remade when it changes. `place`: where the type's column line A / 1 stands on the plan and its x axis's angle (deg,
 * counter-clockwise), read again from its hall when it is moved; `overrides`: what it changes (absent: none).
 */
export const WarehouseCopySchema = z.object({
  type: IdSchema,
  place: z.object({ x: z.number(), y: z.number(), angle: z.number() }),
  overrides: WarehouseOverridesSchema.optional(),
})
export type WarehouseCopy = z.infer<typeof WarehouseCopySchema>

// ---- Buildings and options (Decision "Buildings and options") ----------------------------------------------------

/** A step of a building (Decision "Platforms"): some of its masses on a platform of their own; `level` typed (m). */
export const StepSchema = z.object({
  id: IdSchema,
  masses: z.array(IdSchema).min(1),
  level: z.number().optional(),
})
export type Step = z.infer<typeof StepSchema>

/**
 * A building's platform (Decisions "Terrain", "Platforms"): the flat ground its masses stand on, its levels' 0, while
 * the site has a terrain. Absent: its own, at the level that balances its cut and fill. `level`: typed (m, the
 * terrain's heights); `joined`: it stands on that building's platform (buildings that work together share one, and
 * its level); `steps`: masses of its own on a platform of their own.
 */
export const PlatformSchema = z.object({
  level: z.number().optional(),
  joined: IdSchema.optional(),
  steps: z.array(StepSchema).optional(),
})
export type Platform = z.infer<typeof PlatformSchema>

/**
 * A named group of masses with its own levels, like a layer: *Building 1*, *Train station*, *Context*. Not a
 * construction phase. `context`: drawn, but left out of KPIs, its own checks and analysis (design masses are still
 * checked against it). `color`: used when the view colours by building (programs keep theirs otherwise).
 * `levelHeight`: the height a new level of this building takes. `locked` (Decision "Padlocks by kind"): its own flag, not the
 * sum of its masses: a locked building keeps its own data and every mass in it, now and later, and a mass in it is locked
 * (state/settle.ts holds it, kinds/locked.ts says it). Absent: free.
 */
export const BuildingSchema = z.object({
  id: IdSchema,
  name: z.string(),
  color: z.string(), // informational colour, like a program's: project data, not the UI theme
  levelHeight: z.number().positive(), // m
  context: z.boolean().optional(), // absent = a design building, counted
  levels: z.array(LevelSchema).min(1),
  platform: PlatformSchema.optional(), // absent = its own, balanced (Decision "Platforms")
  warehouse: WarehouseCopySchema.optional(), // a copy of a warehouse type (Decision "Warehouse type"); absent: none
  locked: z.boolean().optional(),
})
export type Building = z.infer<typeof BuildingSchema>

// ---- Exterior circulation (Decision "Exterior circulation") -------------------------------------------------------

/** A position on a closed outline's perimeter: the fraction of its length from vertex 0 (Practiko's `t`). */
const T = z.number().min(0).max(1)

/** Who uses a gate or a road. */
export const VEHICLES = ['trucks', 'cars', 'all'] as const
export type Vehicles = (typeof VEHICLES)[number]

/** Car stalls along a road: on one side, both or none. */
export const PARKING_SIDES = ['none', 'single', 'double'] as const
export const ParkingSideSchema = z.enum(PARKING_SIDES)
export type ParkingSide = z.infer<typeof ParkingSideSchema>

/** Where a gate stands when it is on a street (Phase PE.2, project 20): a side of a street's segment, or of an existing street. `at`: m along the host's drawn line from its start (a segment: from its node `a`; an existing street: along its whole line); `side`: walking that line. */
export const GateOnSchema = z.object({
  kind: z.enum(['street', 'existing-road']),
  id: IdSchema,
  side: z.enum(['left', 'right']),
  at: z.number().min(0),
})
export type GateOn = z.infer<typeof GateOnSchema>

/**
 * A gate (Practiko's `AccesoVehicular`): its opening (`width`, m), the turning radius it is built for, which way it lets traffic through and for
 * whom; a guard house and a queue (m of trucks waiting off the street) are optional. It stands on the boundary, at `t` on its perimeter, or (project
 * 20, Phase PE.2, Decision "On edge engine") on a side of a street or of an existing street, `on`: exactly one of the two.
 */
export const GateSchema = z
  .object({
    id: IdSchema,
    t: T.optional(),
    on: GateOnSchema.optional(),
    width: z.number().positive(),
    radius: z.number().nonnegative(),
    flow: z.enum(['in', 'out', 'both']),
    vehicles: z.enum(VEHICLES),
    guardHouse: z.boolean().optional(),
    queue: z.number().nonnegative().optional(),
    locked: z.boolean().optional(), // its padlock (Decision "Padlocks by kind"); absent: free
    group: IdSchema.optional(), // the group it is in (Decision "Groups", Phase AS.5); absent: none
  })
  .refine((g) => (g.t === undefined) !== (g.on === undefined), { message: 'A gate stands on the boundary or on a street' })
export type Gate = z.infer<typeof GateSchema>
export type GateFlow = Gate['flow']

/**
 * A street type (Decision "Streets"): who drives it, how wide it is and the turning radius its corners are drawn
 * with. The typology's are the default; the project's copy is `Standards.streetTypes`.
 */
export const StreetTypeSchema = z.object({
  id: IdSchema,
  name: z.string(),
  width: z.number().positive(),
  radius: z.number().nonnegative(),
  vehicles: z.enum(VEHICLES),
})
export type StreetType = z.infer<typeof StreetTypeSchema>

/**
 * A node of an option's streets: where a segment starts, ends or meets another. `lot` (Decision "Streets follow their
 * lots"): the parking lot whose entrance it is connected to, so it follows the entrance when the lot moves; absent,
 * none (every node before SE.6). `road` (Phase PE.1, Decision "Street links"): the existing street (the site's
 * `existingRoads`) whose drawn line it lies on, so it follows that street when it is edited; absent, none.
 */
export const StreetNodeSchema = z.object({ id: IdSchema, x: z.number(), y: z.number(), lot: IdSchema.optional(), road: IdSchema.optional() })
export type StreetNode = z.infer<typeof StreetNodeSchema>

/** A street segment's own car stalls (Decision "Street parking by side"): on its left or right walking from a to b, both or none. */
export const STREET_PARKING = ['none', 'left', 'right', 'both'] as const
export const StreetParkingSchema = z.enum(STREET_PARKING)
export type StreetParking = z.infer<typeof StreetParkingSchema>

/** m: stored lanes add up to the width within this. */
const LANE_TOLERANCE = 1e-3
const LanesSchema = z.array(z.number().positive()).min(1)
const lanesAddUp = (s: { left: number; right: number; lanes?: number[] }) => !s.lanes || Math.abs(s.lanes.reduce((a, b) => a + b, 0) - (s.left + s.right)) <= LANE_TOLERANCE
const LANES_MESSAGE = 'The lanes add up to the street’s width'

/**
 * A straight stretch of street between two nodes, of a street type; `left` and `right` (project 19, Decision "Drawing side"):
 * the paving each side of its drawn line, walking from a to b, in m (a street drawn by its edge has 0 on that side); its
 * width is their sum. `vehicles` and `radius` (its corners' turning radius): its own, over the type's (a road derived
 * before ST.4 its sharp corners, radius 0: model/migrate.ts). `parking`: its own car stalls, over the option's
 * (Decision "Street parking by side"); absent, the option's. `lanes` (project 20, Phase PE.2): the lanes it is divided in, m, left to
 * right walking a → b, adding up to `left + right` within 1 mm; absent, it shows equal lanes from its width (`engine/path/lanes.ts`).
 */
export const StreetSegmentSchema = z.object({
  id: IdSchema,
  a: IdSchema,
  b: IdSchema,
  type: IdSchema,
  // m of paving each side of its drawn line, walking a → b (project 19); their sum is its width, at least 0.5 m
  left: z.number().min(0),
  right: z.number().min(0),
  vehicles: z.enum(VEHICLES).optional(),
  radius: z.number().min(0).optional(),
  parking: StreetParkingSchema.optional(),
  // its lanes, m left to right walking a → b (project 20): they add up to `left + right` within 1 mm
  lanes: LanesSchema.optional(),
  // its padlock (Decision "Padlocks by kind"): a street's is its segments' (the derived road's id changes when it is split), and a
  // locked segment holds its fields and the place of its two nodes (state/settle.ts); absent: free
  locked: z.boolean().optional(),
  // the group it is in (Decision "Groups", Phase AS.5): a street's is on each of its segments; absent: none
  group: IdSchema.optional(),
})
  .refine((s) => s.left + s.right >= 0.5, { message: 'A street is 0.5 m wide at least' })
  .refine(lanesAddUp, { message: LANES_MESSAGE })
export type StreetSegment = z.infer<typeof StreetSegmentSchema>

/** The side a street is drawn by (Decision "Drawing side"), as the UI and the verbs name it: its drawn line is its `left` edge, its `centre` or its `right`
 *  edge. Stored, a street has no side: it has the `left` and `right` metres of paving either hand of the drawn line (a side of 0 is the drawn edge). */
export type StreetSide = 'left' | 'centre' | 'right'

/** An option's streets (Decision "Streets"): a network of nodes and the segments between them, drawn by hand or by Connect. */
export const StreetsSchema = z.object({
  nodes: z.array(StreetNodeSchema),
  segments: z.array(StreetSegmentSchema),
})
export type Streets = z.infer<typeof StreetsSchema>

/** A road that is already in the parcel (a street or an easement): not buildable, and the network uses it. */
export const ExistingRoadSchema = z.object({
  id: IdSchema,
  // its drawn line, and the paving each side of it walking it, a pair per stretch (project 19; 0.5 m wide at least)
  points: z.array(PointSchema).min(2),
  // `lanes` (project 20): the lanes of that stretch, m left to right, adding up to its sides
  stretches: z.array(z.object({ left: z.number().min(0), right: z.number().min(0), lanes: LanesSchema.optional() })),
  name: z.string().optional(),
  // its padlock (Decision "Padlocks by kind", Phase PE.2): it keeps every field, and cannot be deleted; absent: free
  locked: z.boolean().optional(),
  // the group it is in (Decision "Groups of any kind", Phase PE.2); absent: none
  group: IdSchema.optional(),
})
  .refine((r) => r.stretches.length === r.points.length - 1, { message: 'An existing road has a pair of sides per stretch' })
  .refine((r) => r.stretches.every((t) => t.left + t.right >= 0.5), { message: 'A street is 0.5 m wide at least' })
  .refine((r) => r.stretches.every(lanesAddUp), { message: LANES_MESSAGE })
export type ExistingRoad = z.infer<typeof ExistingRoadSchema>

/**
 * The structural grid (Decisions "Structural grid", "Grid layout"; Phase G), the unit the project grows from: bays
 * `x` by `y` m along its own axes, each bay in `modules` modules (12 ÷ 4 = 3 m: the dock doors' unit), its first lines
 * crossing at `origin`, its x axis `angle` degrees counter-clockwise from the plan's. Lines A, B, C… along its x,
 * 1, 2, 3… along its y (engine/grid/).
 */
export const GridSchema = z.object({
  x: z.number().positive(),
  y: z.number().positive(),
  modules: z.number().int().min(1),
  origin: PointSchema,
  angle: z.number(),
})
export type Grid = z.infer<typeof GridSchema>

/**
 * A side of a mass's box (Decision "Lot tool"), in the mass's own frame: `s` along its footprint's first edge, `t` to
 * its left. s0 and s1 are the box's ends along that edge, t0 and t1 its two sides across it. The frame turns with the
 * mass, so a lot against a side follows it.
 */
export const LOT_SIDES = ['s0', 's1', 't0', 't1'] as const
export type LotSide = (typeof LOT_SIDES)[number]

/**
 * A parking lot (Decision "Lot tool"): car stalls in rows, two rows to an aisle. **Anchored** to a side of a mass's box
 * (`anchor`), it follows it when the mass grows, moves or turns: along the whole side, or `length` m from `from` m past
 * the corner where the side starts; `rows` deep (absent: as many as fit before the first street, court or mass in its way, else the setback), from a walk off the wall.
 * **Free**: its rectangle (`rect`, its rows along its width), as many rows as its depth holds. `sizes`: its own stall
 * width and depth and aisle width, over the standards'. `entry`: the end of its aisles a street must reach (absent: the
 * end nearer a road).
 */
export const LotSchema = z
  .object({
    id: IdSchema,
    name: z.string().min(1),
    anchor: z.object({ massId: IdSchema, side: z.enum(LOT_SIDES), from: z.number().min(0).optional(), length: z.number().positive().optional() }).optional(),
    rect: z.object({ center: PointSchema, width: z.number().positive(), depth: z.number().positive(), rotation: z.number() }).optional(),
    rows: z.number().int().min(1).optional(),
    sizes: z.object({ stallWidth: z.number().positive(), stallDepth: z.number().positive(), aisleWidth: z.number().positive() }).partial().optional(),
    entry: z.enum(['start', 'end']).optional(),
    locked: z.boolean().optional(), // its padlock (Decision "Padlocks by kind"); absent: free
    group: IdSchema.optional(), // the group it is in (Decision "Groups", Phase AS.5); absent: none
  })
  .refine((l) => !!l.anchor !== !!l.rect, { message: 'a lot is anchored to a wall or free: one of the two' })
export type Lot = z.infer<typeof LotSchema>

/**
 * A design option: the buildings it shows. A building in several options is the same building (linked): editing it
 * in one changes it in all. Checks and KPIs are computed per option. Its circulation follows its masses
 * (Decision "Exterior circulation"): its own gates (absent: the site's) and its streets (Decision "Streets": since ST.4
 * the only roads it has, but for the existing ones); its car parking over the standard's (`parking`, Decision
 * "Circulation optimization"); its parking lots (`lots`, Decision "Lot tool"). `grid`: its own structural grid (absent: the
 * project's), what it tries without moving the others' (Decision "Structural grid"). `group`: shown folded under
 * another option, in a group of that name (a stage plan's options under the option it started from, Decision "Stage
 * options"); with that option gone, it stands on its own.
 */
export const OptionSchema = z.object({
  id: IdSchema,
  name: z.string(),
  buildingIds: z.array(IdSchema),
  gates: z.array(GateSchema).optional(),
  streets: StreetsSchema.optional(),
  parking: ParkingSideSchema.optional(),
  lots: z.array(LotSchema).optional(),
  grid: GridSchema.optional(),
  group: z.object({ under: IdSchema, name: z.string() }).optional(),
  // Its own road widths (Phase K.4: what the optimizer tried within the standards' `search`); absent, the standards'.
  standards: z.object({ roadWidth: z.number().positive(), carRoadWidth: z.number().positive() }).partial().optional(),
})
export type DesignOption = z.infer<typeof OptionSchema>

/** A mass on the site. In the industrial typology, one warehouse; interiors are out of scope. */
export const MassSchema = z.object({
  id: IdSchema,
  name: z.string(),
  levelId: IdSchema, // the level it stands on
  programId: IdSchema.nullable(), // null = no program yet (treated as built)
  footprint: FootprintSchema,
  // Its holes (HoleSchema), cut out of the footprint; what leaves it does not count (engine/geom/holes.ts). Absent: none.
  holes: z.array(HoleSchema).optional(),
  // m; absent = its level's height, which it follows when the level changes (Practiko's `altura: null`)
  height: z.number().positive().optional(),
  // Locked (Decision "One padlock": the padlock is CAD's): seen, not picked on the plan or in the 3D, and not changed by a
  // view, a verb, a tool of the agent's or the optimizer: every other field stays as it is, and it cannot be deleted
  // (state/settle.ts). Picked from its row in Layers alone, to read it or to take the lock off. Absent = free.
  locked: z.boolean().optional(),
  // Its own dock walls (Decision "Exterior circulation"): the `t` of each docked wall's middle on its outline's
  // perimeter, which keeps naming that wall when the outline is resized; [] = no docks. Absent = its program's.
  docks: z.array(T).optional(),
  // On the structural grid (Phase G.3): its own door pattern (absent: its program's), and its exceptions, each a module
  // of a docked wall (the wall named by the t of its middle, as `docks`; the module counted from the wall's start)
  // whose door the pattern gives or not, turned the other way. Absent: none.
  doorPattern: DockPatternSchema.optional(),
  doorFlips: z.array(z.object({ t: T, module: z.number().int().nonnegative() })).optional(),
  // The group it is in (Decision "Groups"): masses of one group are picked, moved and turned as one. Absent: none.
  group: IdSchema.optional(),
  // A block's mass (Decision "Block shape"): what of its floor its zones give another program (null: none), m² each,
  // counted as that program's in the brief and taken from the mass's own. Written with the mass. Absent: none.
  zones: z.array(z.object({ programId: IdSchema.nullable(), area: z.number().nonnegative() })).optional(),
  // Made from a warehouse type (Decision "Warehouse type"): the part of it ('hall': a block is one mass since Decision
  // "Block shape"), so the copy's mass is found again when the type changes. Absent: drawn by hand.
  part: z.string().optional(),
  // The exact doors of its docked walls, where the type's elements put them: by wall (the t of its middle, as `docks`),
  // each door's middle in m from the wall's start, and its kind. Read before any pattern. Absent: none given.
  doorsAt: z.array(z.object({ t: T, at: z.array(z.number().nonnegative()), kind: z.enum(['dock', 'door']) })).optional(),
  // Its docked walls' own truck court depths (Decision "Truck court": the pill on a court's outer edge), by wall (the t
  // of its middle, as `docks`), m. Over its block's (Mass.blockCourts, WarehouseType.court) and the standards'. Absent:
  // none.
  courts: z.array(z.object({ t: T, depth: z.number().positive() })).optional(),
  // A warehouse type's copy (BE.2): the depths its block gives some of its walls (WarehouseType.courts), by wall (the t
  // of its middle, as `docks`), m. Under its own (`courts`), over its block's one depth. Written with the mass. Phase D.3: a wall may have
  // several (a split), each with its `id`, and a court with a `shape` has no depth. The shape is in the wall's frame as the SITE reads it (engine
  // copies.ts `onWall`): x m along the footprint's wall from its start, y m out of it, so a block's own x = 0 (its reference line's start) moves
  // by the wall's thickness; a copy's masses are made again whenever its type or place changes, so it is never stale.
  blockCourts: z.array(z.object({ t: T, depth: z.number().positive().optional(), id: IdSchema.optional(), shape: ContourSchema.optional() })).optional(),
  // mixed-use-mvp: un departamento (spec 2026-11-26-blocks-residenciales): el plano de Mi biblioteca del que es copia,
  // si su interior va en espejo y su variante (el plano propio de esta unidad, editado solo para ella). Su lugar, su
  // giro y su tamaño se leen de su huella (modules/residential/engine/deptos.ts). Absent: no es un departamento.
  depto: z.object({ plan: z.string(), espejo: z.boolean().optional(), variante: PlanCatalogoSchema.optional() }).optional(),
})
export type Mass = z.infer<typeof MassSchema>

// ---- Site ---------------------------------------------------------------------------------------------------

/**
 * Zoning-type rules that apply to any typology. No spacing between masses (Decision "Spacing by rules"): how far two
 * programs keep apart is an *apart* rule of the brief. Older files' `minSpacing` is dropped when they are read.
 */
export const SiteRulesSchema = z.object({
  setback: z.number().nonnegative(), // m, distance every built mass keeps from the boundary
  maxCoverage: z.number().min(0).max(1).nullable(), // built footprint / site area; null = no limit
  // the steepest ground a built mass may stand on (rise over run: 0.15 = 15 %; Decision "Terrain"); absent or null =
  // no limit
  maxSlope: z.number().positive().nullable().optional(),
})
export type SiteRules = z.infer<typeof SiteRulesSchema>

/**
 * Where the plan sits on the Earth (Decision "Site files"): the plan's origin (0, 0) at `lat` / `lon` (WGS 84,
 * degrees), and `north`, the degrees counter-clockwise from the plan's +y to true north (0: the plan's y is north).
 * engine/geo/local.ts turns plan points into lat / lon and back.
 */
export const GeoSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  north: z.number(),
})
export type Geo = z.infer<typeof GeoSchema>

export const MAP_SOURCES = ['street', 'satellite'] as const
export type MapSource = (typeof MAP_SOURCES)[number]

/**
 * The map under the plan (Phase 5.4; port of Practiko's `MapaSitio`): `source`'s tiles round `lat` / `lon` (the
 * image's centre) at `zoom`, captured once and kept as an image (a data URL), north up, `width` × `height` m. It is
 * drawn where the georeference puts its centre, turned by `north`, so it needs one (the schema refuses a map without
 * `geo`). Whether it shows and how strongly are the viewer's, not the project's (views/plan/site/mapView.ts).
 */
export const SiteMapSchema = z.object({
  source: z.enum(MAP_SOURCES),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  zoom: z.number().int().min(0).max(22),
  image: z.string(),
  width: z.number().positive(),
  height: z.number().positive(),
  attribution: z.string(),
})
export type SiteMap = z.infer<typeof SiteMapSchema>

/** A point of the ground: x, y in site coordinates and z, its height (m, over the datum its file gives). */
export const GroundPointSchema = PointSchema.extend({ z: z.number() })
export type GroundPoint = z.infer<typeof GroundPointSchema>

/**
 * A contour line of the ground, in site coordinates: an open polyline, or a closed one (`closed`), at height `z`.
 * Absent: its file drew it flat, and its height is the designer's (Terrain.given) or counted from those
 * (modules/terrain/engine/heights.ts).
 */
export const ContourLineSchema = z.object({
  points: z.array(PointSchema).min(2),
  closed: z.boolean().optional(),
  z: z.number().optional(),
})
export type ContourLine = z.infer<typeof ContourLineSchema>

/** How the ground is smoothed (Decision "Terrain smoothing"): as triangulated, or its flat triangles smoothed (the default). */
export const TERRAIN_SMOOTHINGS = ['off', 'surface'] as const
export type TerrainSmoothing = (typeof TERRAIN_SMOOTHINGS)[number]

/**
 * The ground under the site (Decision "Terrain", Phase E): contour lines and points, from a file (`source`: its name
 * and the layers read). `given`: the heights the designer gave contours (the Heights tool), by the contour's index,
 * over the file's; two neighbours of a file drawn flat say the interval and the way up, and the others are counted.
 * `smoothing`: how the ground is smoothed (absent: the surface).
 */
export const TerrainSchema = z.object({
  contours: z.array(ContourLineSchema),
  points: z.array(GroundPointSchema),
  given: z.array(z.object({ contour: z.number().int().nonnegative(), z: z.number() })).optional(),
  source: z.object({ file: z.string(), layers: z.array(z.string()) }).optional(),
  smoothing: z.enum(TERRAIN_SMOOTHINGS).optional(),
  // Decision "Ground to the boundary": points along the boundary beyond the survey, at the nearest ground's height,
  // made at import so the surface reaches the whole site; apart from the surveyed points. Absent: none needed.
  edge: z.array(GroundPointSchema).optional(),
})
export type Terrain = z.infer<typeof TerrainSchema>

/**
 * A drawing kept for its lines of reference (Decision "Drawing layers"): the file it came from and its Reference
 * layers, each with its colour (the AutoCAD Color Index its file gave it; absent: none) and its lines on the plan, flat
 * (arcs as corners). Drawn, shown or hidden in Layers, snapped to; never ground, boundary nor design.
 */
export const DrawingLineSchema = z.object({
  points: z.array(PointSchema).min(2),
  closed: z.boolean().optional(),
})
export const DrawingLayerSchema = z.object({
  name: z.string(),
  color: z.number().int().min(1).max(255).optional(),
  lines: z.array(DrawingLineSchema),
  // Decision "Drawings move": a locked layer is not picked and does not move (absent: unlocked)
  locked: z.boolean().optional(),
})
export type DrawingLayer = z.infer<typeof DrawingLayerSchema>
export const SiteDrawingSchema = z.object({
  file: z.string().min(1),
  layers: z.array(DrawingLayerSchema),
  // Decision "Drawings move": its layers are picked one by one, not as one piece (absent: one piece)
  split: z.boolean().optional(),
})
export type SiteDrawing = z.infer<typeof SiteDrawingSchema>

/** A parcel inside the site (Decision "Drawing layers"): a closed shape of a Parcels layer, named, from its file. */
export const ParcelSchema = z.object({
  name: z.string().min(1),
  contour: ContourSchema,
  file: z.string().optional(),
  // Decision "Drawings move": the parcels start locked; true: this one moves with its file (set for the file's all)
  unlocked: z.boolean().optional(),
})
export type Parcel = z.infer<typeof ParcelSchema>

/** The lengths a drawing may be in. */
export const LENGTH_UNITS = ['m', 'cm', 'mm', 'ft', 'in'] as const
export type LengthUnit = (typeof LENGTH_UNITS)[number]

/**
 * How the site's file's coordinates became the plan's (Decision "Site file survey"): its units, and the file's point
 * (in metres) at the plan's origin; in UTM, its zone. Another file in the same coordinates lands on the site with it.
 * `layers`: what each of its layers was (the survey's choice, Ignore left out), for another file to start from.
 */
export const SiteFrameSchema = z.object({
  units: z.enum(LENGTH_UNITS),
  origin: PointSchema,
  utm: z.object({ zone: z.number().int().min(1).max(60), south: z.boolean() }).optional(),
  layers: z.record(z.string(), z.enum(['boundary', 'parcels', 'contours', 'points', 'roads', 'reference'])).optional(),
})
export type SiteFrame = z.infer<typeof SiteFrameSchema>

export const SiteSchema = z.object({
  boundary: ContourSchema.nullable(), // null until a file is imported or it is drawn
  rules: SiteRulesSchema,
  // Access (Decision "Exterior circulation"), all absent = none: the gates every option uses unless it has its own, and the
  // roads already in the parcel (a street the site faces is one).
  gates: z.array(GateSchema).optional(),
  existingRoads: z.array(ExistingRoadSchema).optional(),
  // Phase 5 (Decision "Site files"), all absent = none: the file the boundary came from ('parcel.kml'; 'Drawn' when
  // drawn by hand), the georeference and the map under the plan.
  source: z.string().optional(),
  geo: GeoSchema.optional(),
  map: SiteMapSchema.optional(),
  // Phase E (Decision "Terrain"): the ground; absent = flat, none known.
  terrain: TerrainSchema.optional(),
  // Decision "Site file survey": the frame of the file the boundary came from; absent = none (drawn, or a geo file).
  frame: SiteFrameSchema.optional(),
  // Decision "Drawing layers", absent = none: the drawings kept for their drawing lines, and the parcels inside the site.
  drawings: z.array(SiteDrawingSchema).optional(),
  parcels: z.array(ParcelSchema).optional(),
})
export type Site = z.infer<typeof SiteSchema>

/**
 * A terrain of the terrain library (Decision "Home libraries"): a site without its rules (they are a typology's), named,
 * at a version — its boundary, access, georeference, map, ground and frame. Its file (.gfs) is this, with its format.
 */
export const TERRAIN_FORMAT = 'gfit-terrain'
export const TERRAIN_VERSION = 1
export const TerrainSiteSchema = SiteSchema.omit({ rules: true })
export type TerrainSite = z.infer<typeof TerrainSiteSchema>
export const LibraryTerrainSchema = z.object({
  format: z.literal(TERRAIN_FORMAT),
  formatVersion: z.literal(TERRAIN_VERSION),
  id: IdSchema,
  name: z.string().min(1),
  version: z.number().int().min(1),
  savedAt: z.number(),
  site: TerrainSiteSchema,
})
export type LibraryTerrain = z.infer<typeof LibraryTerrainSchema>

/**
 * The project's standards (Decision "Exterior circulation"; the first of 6.0's `standards`): the circulation's
 * defaults, copied from the typology; each absent one is the engine's (engine/circulation/standards.ts).
 *   roadWidth   a truck road's width: the Trucks street type's (m)          courtDepth  a truck court's depth (m)
 *   carRoadWidth   a car road's: the Cars street type's (m; Decision "Circulation optimization")
 *   ringClear   a road's edge from a wall without docks (m): within it a road serves a court from its side
 *   gateWidth, gateRadius   a new gate's            stallWidth, stallDepth   a car stall's (m)
 *   aisleWidth  a parking lot's aisle, between two rows of stalls (m; Decision "Lot tool")
 *   parking     car stalls along the roads: on one side, both or none
 *   dockHeight  how far a truck court stands below its building's platform (m; Decision "Platforms")
 *   maxStep     the most two platforms of one building (its steps, buildings joined) may differ (m)
 *   bankRatio   a bank's run over its rise at a platform's edge (n of 1 : n; Decision "Banks")
 *   maxGrade    the steepest a road may climb on the ground (rise over run; Decision "Roads on the ground")
 *   laneWidth   a street's lane (m; project 20, Phase PE.2): a new lane's width, and the lanes an unstored street shows (width ÷ it)
 *   search      the range the optimizer may try a road width in (Phase K.4: `road.width`), m from and to; an option
 *               keeps what it tried as its own (`DesignOption.standards`)
 *   streetTypes the street types the streets are drawn with (Decision "Streets"); absent, the engine's trucks and cars
 *               at `roadWidth` and `carRoadWidth` (engine/circulation/streets.ts)
 */
export const StandardsSchema = z.object({
  roadWidth: z.number().positive().optional(),
  carRoadWidth: z.number().positive().optional(),
  courtDepth: z.number().positive().optional(),
  ringClear: z.number().nonnegative().optional(),
  gateWidth: z.number().positive().optional(),
  gateRadius: z.number().nonnegative().optional(),
  stallWidth: z.number().positive().optional(),
  stallDepth: z.number().positive().optional(),
  aisleWidth: z.number().positive().optional(),
  parking: ParkingSideSchema.optional(),
  dockHeight: z.number().nonnegative().optional(),
  maxStep: z.number().positive().optional(),
  bankRatio: z.number().positive().optional(),
  maxGrade: z.number().positive().max(1).optional(),
  laneWidth: z.number().positive().optional(),
  search: z.object({ roadWidth: Range, carRoadWidth: Range }).partial().optional(),
  streetTypes: z.array(StreetTypeSchema).min(1).optional(),
})
export type Standards = z.infer<typeof StandardsSchema>

// ---- Rules (Decision "Rules") -------------------------------------------------------------------------------

/**
 * A rule of the brief between two programs, read as a sentence: each mass of program `a` …
 *   adjacent  … must share a wall at least `minShared` m long (0: at least 1 m) with its nearest mass of `b`
 *   near      … must be within `max` m of its nearest mass of `b`
 *   apart     … must be at least `min` m from every mass of `b`
 *   attached  … moves with its nearest mass of `b` (a link: it follows it)
 * `a` and `b` may be the same program (each warehouse at least 30 m from the others). The graph applies every rule to
 * the masses of each option (engine/graph/relations.ts): the pairs are found again whenever the massing changes.
 * `weight` is its priority when the masses are arranged; `required` makes a broken one an error, not a warning.
 */
const ruleBase = {
  id: IdSchema,
  a: IdSchema,
  b: IdSchema,
  weight: z.number().positive(),
  // required: broken, it is an error (the design does not hold); otherwise a warning (a preference)
  required: z.boolean().optional(),
  // why, in plain words: shown with its warnings and wherever the rule is read
  reason: z.string().optional(),
}
export const RuleSchema = z.discriminatedUnion('kind', [
  z.object({ ...ruleBase, kind: z.literal('adjacent'), minShared: z.number().nonnegative() }),
  z.object({ ...ruleBase, kind: z.literal('near'), max: z.number().nonnegative() }),
  z.object({ ...ruleBase, kind: z.literal('apart'), min: z.number().nonnegative() }),
  z.object({ ...ruleBase, kind: z.literal('attached') }),
])
export type Rule = z.infer<typeof RuleSchema>
export type RuleKind = Rule['kind']

// ---- Project ------------------------------------------------------------------------------------------------

/**
 * Who decided a change (Decision "Decision log"): the designer by hand, ▶ Solve (the design rules), the optimizer (a
 * specimen kept) or an agent (in the app or through MCP). The variable the thesis measures.
 */
export const LOG_BY = ['designer', 'solve', 'optimizer', 'agent'] as const
export type LogBy = (typeof LOG_BY)[number]

/** One committed change: one undo step, an undo or a redo. */
export const LogEntrySchema = z.object({
  /** When, in ms since 1970. */
  at: z.number(),
  /** The name set in this browser (Designer when none). */
  author: z.string(),
  by: z.enum(LOG_BY),
  /** The verb that made it ('moveMass', 'solve'…; 'undo', 'redo'); '' when none ran through `actions`. */
  verb: z.string(),
  /** In words: 'Move mass: Warehouse 1'. */
  what: z.string(),
  /** The option in view. */
  option: IdSchema,
  /** The option's Issues, before → after. */
  issues: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
})
export type LogEntry = z.infer<typeof LogEntrySchema>

/** The shape version this code writes; model/migrate.ts brings older files up to it. */
export const PROJECT_VERSION = 20

/** The whole editable document. Stores decisions only, never computed values (those live in Derived). */
export const ProjectSchema = z.object({
  version: z.literal(PROJECT_VERSION), // bump when the shape changes, so old files can be migrated
  // Made once, when the project is made (Decision "Project id"); a copy of its file keeps it. What a browser keeps
  // beside a project (a plugin's last run) is found by it; the decision log and the datasets will name it too.
  id: IdSchema,
  name: z.string(),
  // The units CAD exports are written in (absent = metres; Decision "Project units"). The model stays in metres:
  // only the exports read it, so it is optional and PROJECT_VERSION does not change.
  units: z.enum(['m', 'ft']).optional(),
  typology: z.string(), // the template it started from ('industrial', 'blank'…); informative only
  site: SiteSchema,
  programs: z.array(ProgramSchema),
  buildings: z.array(BuildingSchema).min(1),
  options: z.array(OptionSchema).min(1),
  masses: z.array(MassSchema),
  // Which KPIs the top strip shows, in order (ids of engine/kpis.ts), never their values. Absent = the core default.
  // A decision about what the client sees, so it travels in the .gft (Decision "KPI strip").
  kpis: z.array(z.string()).optional(),
  // Dimensions drawn by hand (absent = none).
  dimensions: z.array(DimensionSchema).optional(),
  // Reference lines (the project's: no level, every option) and notes (on a level), drawn by hand (absent = none; Phase AS.5).
  referenceLines: z.array(ReferenceLineSchema).optional(),
  notes: z.array(NoteSchema).optional(),
  // The brief's rules between programs (absent = none; Decision "Rules"). The graph derives each mass's relations.
  rules: z.array(RuleSchema).optional(),
  // The circulation's defaults (absent: the engine's; Decision "Exterior circulation").
  standards: StandardsSchema.optional(),
  // The structural grid every option stands on unless it has its own (absent: none; Decision "Structural grid").
  grid: GridSchema.optional(),
  // The warehouse types the project's warehouses are copies of (absent: none; Decision "Warehouse type").
  warehouseTypes: z.array(WarehouseTypeSchema).optional(),
  // mixed-use-mvp: the residential module's data (its programs' uses, unit types, each building's GFit parameters)
  residential: ResidentialSchema.optional(),
  // Each plugin's own data, by plugin id (absent = none; Decision "Optimizer plugin"). The core never reads it: each
  // plugin checks its own with its own zod schema, and it is kept and saved as it is, even when the plugin is off.
  plugins: z.record(z.string(), z.unknown()).optional(),
  // Who decided each change, oldest first (absent = none yet; Decision "Decision log"). Written by the store, never by
  // a verb, and never undone: an undo is an entry of its own. It travels with the .gft.
  log: z.array(LogEntrySchema).optional(),
}).superRefine((p, ctx) => {
  // the circulation's lists: ids unique in each (an option's own gates may repeat the site's: they are its copy)
  const unique = (list: { id: Id }[] | undefined, path: (string | number)[], what: string) => {
    if (list && new Set(list.map((x) => x.id)).size !== list.length) ctx.addIssue({ code: 'custom', path, message: `two ${what} share an id` })
  }
  unique(p.site.gates, ['site', 'gates'], 'gates')
  unique(p.site.existingRoads, ['site', 'existingRoads'], 'existing roads')
  // the map sits where the georeference puts it
  if (p.site.map && !p.site.geo) ctx.addIssue({ code: 'custom', path: ['site', 'map'], message: 'a map needs the site’s georeference' })
  p.options.forEach((o, i) => {
    unique(o.gates, ['options', i, 'gates'], 'gates')
    unique(o.lots, ['options', i, 'lots'], 'lots')
    if (o.streets) {
      unique(o.streets.nodes, ['options', i, 'streets', 'nodes'], 'street nodes')
      unique(o.streets.segments, ['options', i, 'streets', 'segments'], 'street segments')
      const nodes = new Set(o.streets.nodes.map((n) => n.id))
      o.streets.segments.forEach((s, k) => {
        if (!nodes.has(s.a) || !nodes.has(s.b) || s.a === s.b)
          ctx.addIssue({ code: 'custom', path: ['options', i, 'streets', 'segments', k], message: 'a street segment joins two nodes that are there' })
      })
    }
  })
  unique(p.standards?.streetTypes, ['standards', 'streetTypes'], 'street types')
  // ids are unique, and what points to something names one that exists (a file, MCP or optimizer cannot leave a mass
  // floating or an option showing a building that is not there)
  const all = p.buildings.flatMap((b) => b.levels)
  const levels = new Set(all.map((l) => l.id))
  if (levels.size !== all.length) ctx.addIssue({ code: 'custom', path: ['buildings'], message: 'two levels share an id' })
  const buildings = new Set(p.buildings.map((b) => b.id))
  if (buildings.size !== p.buildings.length) ctx.addIssue({ code: 'custom', path: ['buildings'], message: 'two buildings share an id' })
  if (new Set(p.options.map((o) => o.id)).size !== p.options.length)
    ctx.addIssue({ code: 'custom', path: ['options'], message: 'two options share an id' })
  // a copy names a warehouse type that is there
  const types = new Set((p.warehouseTypes ?? []).map((t) => t.id))
  if (p.warehouseTypes && types.size !== p.warehouseTypes.length)
    ctx.addIssue({ code: 'custom', path: ['warehouseTypes'], message: 'two warehouse types share an id' })
  p.buildings.forEach((b, i) => {
    if (b.warehouse && !types.has(b.warehouse.type))
      ctx.addIssue({ code: 'custom', path: ['buildings', i, 'warehouse', 'type'], message: `no warehouse type "${b.warehouse.type}"` })
  })
  p.options.forEach((o, i) =>
    o.buildingIds.forEach((b, j) => {
      if (!buildings.has(b)) ctx.addIssue({ code: 'custom', path: ['options', i, 'buildingIds', j], message: `no building "${b}"` })
    }),
  )
  p.masses.forEach((m, i) => {
    if (!levels.has(m.levelId)) ctx.addIssue({ code: 'custom', path: ['masses', i, 'levelId'], message: `no level "${m.levelId}"` })
  })
  p.dimensions?.forEach((d, i) => {
    if (!levels.has(d.levelId)) ctx.addIssue({ code: 'custom', path: ['dimensions', i, 'levelId'], message: `no level "${d.levelId}"` })
  })
  unique(p.referenceLines, ['referenceLines'], 'reference lines')
  unique(p.notes, ['notes'], 'notes')
  p.notes?.forEach((n, i) => {
    if (!levels.has(n.levelId)) ctx.addIssue({ code: 'custom', path: ['notes', i, 'levelId'], message: `no level "${n.levelId}"` })
  })
  const programs = new Set(p.programs.map((g) => g.id))
  // a type defines a program that is there, and no other type defines it (Decision "Program rule set")
  const defined = new Set<Id>()
  p.warehouseTypes?.forEach((t, i) => {
    if (t.program === null) return
    if (!programs.has(t.program)) ctx.addIssue({ code: 'custom', path: ['warehouseTypes', i, 'program'], message: `no program "${t.program}"` })
    if (defined.has(t.program)) ctx.addIssue({ code: 'custom', path: ['warehouseTypes', i, 'program'], message: `two warehouse types define program "${t.program}"` })
    defined.add(t.program)
  })
  if (p.rules &&new Set(p.rules.map((r) => r.id)).size !== p.rules.length)
    ctx.addIssue({ code: 'custom', path: ['rules'], message: 'two rules share an id' })
  p.rules?.forEach((r, i) => {
    for (const end of ['a', 'b'] as const)
      if (!programs.has(r[end])) ctx.addIssue({ code: 'custom', path: ['rules', i, end], message: `no program "${r[end]}"` })
  })
})
export type Project = z.infer<typeof ProjectSchema>
