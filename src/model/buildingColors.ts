// The colours a new building takes, in turn (Decision "Buildings and options"). Informational, like program colours:
// they are project data (saved in the Building), shown only when the view colours by building.
export const BUILDING_COLORS = ['#4e79a7', '#f28e2b', '#59a14f', '#b07aa1', '#76b7b2', '#edc948', '#9c755f', '#e15759']

/**
 * The colours a program can take in the Brief's style picker (Decision "Plan style"): the typologies' muted program
 * colours first, then the buildings'. Project data, like every program colour.
 */
export const PROGRAM_COLORS = [
  '#7d8fa8',
  '#b08a5a',
  '#8f7fb0',
  '#a7b59a',
  '#c27c6b',
  '#6f9e9a',
  '#c9a94e',
  '#9a9a9f',
  ...BUILDING_COLORS,
]

/** A new program's colour: the first building colour no program has (all taken: `fallback`). */
export function freeColor(programs: readonly { color: string }[], fallback: string): string {
  const used = new Set(programs.map((g) => g.color.toLowerCase()))
  return BUILDING_COLORS.find((c) => !used.has(c.toLowerCase())) ?? fallback
}

/** The colour of the n-th building (0-based), round and round. */
export const buildingColor = (n: number) => BUILDING_COLORS[((n % BUILDING_COLORS.length) + BUILDING_COLORS.length) % BUILDING_COLORS.length]
