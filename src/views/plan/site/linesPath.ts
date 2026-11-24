// A drawing layer's lines as one SVG path (Decision "Drawing layers"): plan y up is SVG y down. Its own module so the
// plan's cache per layer (DrawingsLayer.tsx) can be checked to build only the layers a move changed.
import type { Point } from '../../../model/schema.ts'

export const linesPath = (ls: { points: Point[]; closed?: boolean }[]): string =>
  ls.map((l) => `M${l.points.map((p) => `${p.x.toFixed(2)},${(-p.y).toFixed(2)}`).join('L')}${l.closed ? 'Z' : ''}`).join('')
