// Frozen: the block as BLOCK_VERSION 4 kept it, for the steps that read older files; never edited, never imported by the app
// (only engine/migrate.ts reaches this folder: src/modules/__tests__/boundaries.test.ts).
//
// The types of a block on its module lines (Decision "Block shape", Phase D.2 "A block's outline in metres" moves the live ones on):
// the outline's corners are whole module lines, a hole a rectangle of them, and the type and its copy's overrides are made of
// those. Copied from model/schema.ts as it stood at BLOCK_VERSION 4 and PROJECT_VERSION 16; the figures that D.2 does not touch
// (the grid, the hall, the columns, the envelope, the zones, the elements, the courts, the dimensions) are the live schema's.
import { z } from 'zod'
import { ColumnsSchema, CourtByEdgeSchema, DimensionSchema, EnvelopeSchema, HallElementSchema, HallSchema, HallZoneSchema, IdSchema, TypeGridSchema, WAREHOUSE_STEPS } from '../../../../model/schema.ts'

const Range = z.tuple([z.number().positive(), z.number().positive()])

/** A corner of the outline on the module lines: `x` along the length from column line A, `y` along the width from line 1. */
export const LegacyOutlineCornerSchema = z.object({
  id: IdSchema,
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  thickness: z.number().positive().optional(),
  offset: z.number().min(0).optional(),
})
export type LegacyOutlineCorner = z.infer<typeof LegacyOutlineCornerSchema>

/** A hole through the block: a rectangle of module lines inside its outline. */
export const LegacyShapeHoleSchema = z.object({
  id: IdSchema,
  x: z.tuple([z.number().int().min(0), z.number().int().min(1)]),
  y: z.tuple([z.number().int().min(0), z.number().int().min(1)]),
})
export type LegacyShapeHole = z.infer<typeof LegacyShapeHoleSchema>

export const LegacyMorphologySchema = z.object({
  outline: z.array(LegacyOutlineCornerSchema),
  holes: z.array(LegacyShapeHoleSchema),
  zones: z.array(HallZoneSchema).optional(),
})
export type LegacyMorphology = z.infer<typeof LegacyMorphologySchema>

/** The warehouse type of a block of format 4 (and of a project of version 16): its outline on module lines. */
export const LegacyTypeSchema = z.object({
  id: IdSchema,
  name: z.string(),
  program: IdSchema.nullable(),
  grid: TypeGridSchema,
  hall: HallSchema,
  columns: ColumnsSchema,
  envelope: EnvelopeSchema,
  morphology: LegacyMorphologySchema,
  elements: z.array(HallElementSchema),
  locks: z.partialRecord(z.enum(WAREHOUSE_STEPS), z.enum(['locked', 'again'])).optional(),
  court: z.object({ depth: z.number().positive(), range: Range.optional() }).optional(),
  courts: z.array(CourtByEdgeSchema).optional(),
  library: z.object({ id: IdSchema, version: z.number().int().min(1) }).optional(),
  dimensions: z.array(DimensionSchema).optional(),
})
export type LegacyType = z.infer<typeof LegacyTypeSchema>

/** What a copy changes of its type, its own outline on module lines. */
export const LegacyOverridesSchema = z
  .object({
    grid: TypeGridSchema.partial(),
    hall: HallSchema.partial(),
    columns: ColumnsSchema.partial(),
    envelope: EnvelopeSchema.partial(),
    morphology: LegacyMorphologySchema.partial(),
    elements: z.array(HallElementSchema),
    courts: z.array(CourtByEdgeSchema),
    program: IdSchema.nullable(),
  })
  .partial()
export type LegacyOverrides = z.infer<typeof LegacyOverridesSchema>

/** A building that is a copy of a type: where it stands and what it changes. */
export const LegacyCopySchema = z.object({
  type: IdSchema,
  place: z.object({ x: z.number(), y: z.number(), angle: z.number() }),
  overrides: LegacyOverridesSchema.optional(),
})
export type LegacyCopy = z.infer<typeof LegacyCopySchema>
