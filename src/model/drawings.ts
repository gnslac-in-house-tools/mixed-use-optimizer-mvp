// The locks of an imported drawing (Decision "Drawings move"), read by the verbs (`state/actions/drawings.ts`) and the
// plan's pick (`views/plan/site/drawingPick.ts`) alike: one source, pure, the model only.
import type { DrawingLayer, Site } from './schema.ts'

/** A layer is locked when it says so (absent: unlocked; reference layers start so). */
export const isLayerLocked = (l: DrawingLayer): boolean => l.locked === true

/** The parcels of a file are locked (they start so) when it has some and none is unlocked. Takes the site's parcels
 *  only, so a panel can read it without the whole project. */
export function parcelsLocked(site: Pick<Site, 'parcels'>, file: string): boolean {
  const mine = (site.parcels ?? []).filter((x) => x.file === file)
  return mine.length > 0 && mine.every((x) => !x.unlocked)
}
