// The survey's setups (Decision "Site file survey"): how a file was read (its units, its coordinates, what each layer
// was, by name), for another file to start from. Nothing is remembered unasked: *Remember this setup* keeps one in this
// browser (localStorage, with try/catch: there may be no storage; newest first, one per file name, eight at most), and
// the site's own (the frame its file was read in, Site.frame) is offered as well. *Start from* fills what matches by
// layer name, if the layer can be that; the rest stays guessed.
import type { LengthUnit, Site } from '../../../model/schema.ts'
import { LENGTH_UNITS } from '../../../model/schema.ts'
import { canBe, LAYER_KINDS, type Coordinates, type LayerKind, type LayerSurvey, type SurveyChoice } from '../../../io/site/survey.ts'

export const SETUPS_KEY = 'gfit.import.setups'
const MAX = 8

export interface Setup {
  /** The file it was read from. */
  file: string
  /** When it was remembered (ISO); none for the site's. */
  at?: string
  units: LengthUnit
  coordinates: Coordinates
  kinds: Record<string, LayerKind>
}

const isSetup = (s: unknown): s is Setup => {
  const x = s as Setup
  return (
    typeof x?.file === 'string' &&
    LENGTH_UNITS.includes(x.units) &&
    ['local', 'utm', 'site'].includes(x.coordinates?.kind) &&
    typeof x.kinds === 'object' &&
    x.kinds !== null &&
    Object.values(x.kinds).every((k) => LAYER_KINDS.includes(k))
  )
}

/** The setups this browser remembers, newest first. */
export function rememberedSetups(): Setup[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(SETUPS_KEY) ?? '[]')
    return Array.isArray(v) ? v.filter(isSetup) : []
  } catch {
    return []
  }
}

/** Keeps a setup first, in place of one of the same file. */
export function rememberSetup(s: Setup): void {
  const list = [s, ...rememberedSetups().filter((x) => x.file !== s.file)].slice(0, MAX)
  try {
    localStorage.setItem(SETUPS_KEY, JSON.stringify(list))
  } catch {
    // not remembered: there is no storage
  }
}

/** The setup the site's file was read with: its units, As the site's, what its layers were; none without a frame. */
export function siteSetup(site: Pick<Site, 'frame' | 'source'>): Setup | null {
  const f = site.frame
  return f ? { file: site.source ?? 'the site’s file', units: f.units, coordinates: { kind: 'site' }, kinds: f.layers ?? {} } : null
}

/**
 * A setup laid over a file's layers: its units and coordinates (As the site's only on a site with a frame), and the
 * kind of each layer it names, if the layer holds what that kind needs; the rest as `guessed`.
 */
export function setupChoice(s: Setup, layers: LayerSurvey[], guessed: SurveyChoice, hasFrame: boolean): SurveyChoice {
  const kinds = Object.fromEntries(
    layers.map((l) => {
      const k = s.kinds[l.name]
      return [l.name, k && canBe(l, k) ? k : (guessed.kinds[l.name] ?? 'ignore')]
    }),
  )
  const coordinates = s.coordinates.kind === 'site' && !hasFrame ? guessed.coordinates : s.coordinates
  return { units: s.units, coordinates, kinds }
}
