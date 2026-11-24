// The ground on the plan (Decision "Terrain layout", Show's *Terrain ▾*), over the site's paper and under the masses:
// Contours (the minor ones faint, every fifth interval stronger with its height written along it, one of unknown
// height dashed; the points of the ground as dots), Slope (the surface's triangles in classes, with a legend in the
// viewport, SlopeLegend) or Cut & fill (the contours faint here; the platforms' graded cells by depth over the courts
// and the masses, under their labels, where most of the earthwork is: CutFill; a legend with the totals,
// CutFillLegend; Decision "Platforms"). While the ground is shown, each platform's level is written on its largest
// mass, under its label (PlatformMarks, over the masses). Nothing answers the pointer: the Heights tool has its own
// layer. Under a look (an optimizer's specimen) the earthwork, the levels and the totals are the look's (useShown).
import { useMemo } from 'react'
import type { Point, Terrain } from '../../../model/schema.ts'
import { useApp } from '../../../state/store.ts'
import { useShown } from '../../../views/viewport/look.ts'
import { LABEL_PX } from '../../../views/plan/planStyle.ts'
import { contoursOf, EARTH_CLASSES, earthColor, earthPathsOf, heightText, SLOPE_CLASSES, slopeColor, slopePathsOf } from './terrainDraw.ts'
import { useSiteTool } from '../../../views/plan/site/siteTools.ts'
import { useTerrainView } from './terrainView.ts'
import { t as tr } from '../../../i18n/idioma.ts' // mixed-use-mvp

const linesPath = (ls: Point[][]) => ls.map((l) => `M${l.map((p) => `${p.x.toFixed(2)},${(-p.y).toFixed(2)}`).join('L')}`).join('')

/** With no interval known (one height), or few contours, every known one is labelled. */
const LABEL_ALL = 30

/** `quiet`: under the cut and fill, faint and unlabelled. */
function Contours({ terrain, px, quiet = false }: { terrain: Terrain; px: number; quiet?: boolean }) {
  const contours = contoursOf(terrain)
  const paths = useMemo(
    () => ({
      minor: linesPath(contours.filter((c) => c.z !== null && !c.major).map((c) => c.points)),
      major: linesPath(contours.filter((c) => c.major).map((c) => c.points)),
      unknown: linesPath(contours.filter((c) => c.z === null).map((c) => c.points)),
      dots: terrain.points.map((p) => `M${p.x.toFixed(2)},${(-p.y).toFixed(2)}h0`).join(''),
    }),
    [contours, terrain.points],
  )
  const anyMajor = contours.some((c) => c.major)
  const labelled = quiet ? [] : contours.filter((c) => c.z !== null && (anyMajor ? c.major : contours.length <= LABEL_ALL))
  const size = 10 * px
  return (
    <g data-terrain="contours" pointerEvents="none" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={quiet ? 0.5 : undefined}>
      {paths.minor && <path d={paths.minor} stroke="var(--ink-tertiary)" strokeWidth={0.75} opacity={0.7} vectorEffect="non-scaling-stroke" />}
      {paths.unknown && <path d={paths.unknown} stroke="var(--ink-tertiary)" strokeWidth={0.75} strokeDasharray="4 3" opacity={0.7} vectorEffect="non-scaling-stroke" />}
      {paths.major && <path d={paths.major} stroke="var(--ink-secondary)" strokeWidth={1.25} vectorEffect="non-scaling-stroke" />}
      {paths.dots && <path d={paths.dots} stroke="var(--ink-tertiary)" strokeWidth={3} vectorEffect="non-scaling-stroke" />}
      {labelled.map((c) => (
        <text
          key={c.index}
          x={c.label.at.x}
          y={-c.label.at.y}
          dy={size * 0.35}
          transform={`rotate(${-c.label.angle} ${c.label.at.x} ${-c.label.at.y})`}
          textAnchor="middle"
          fontSize={size}
          fill="var(--ink-secondary)"
          stroke="var(--panel)"
          strokeWidth={size * 0.35}
          paintOrder="stroke"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {heightText(c.z!)}
        </text>
      ))}
    </g>
  )
}

function Slope({ terrain }: { terrain: Terrain }) {
  const paths = slopePathsOf(terrain)
  if (!paths) return null
  return (
    <g data-terrain="slope" pointerEvents="none" stroke="none" fillOpacity={0.6}>
      {paths.map((d, k) => (d ? <path key={k} data-slope={k} d={d} fill={slopeColor(k)} /> : null))}
    </g>
  )
}

/** The graded cells by depth, over the courts and the masses (the plan draws it after them) while Cut & fill shows. */
export function CutFill() {
  const earthwork = useShown((s) => s.derived.earthwork)
  const shown = useTerrainView((s) => s.show === 'earthwork')
  const terrain = useApp((s) => s.project.site.terrain)
  if (!earthwork || !shown || !terrain) return null
  const paths = earthPathsOf(earthwork.grid)
  return (
    <g data-terrain="earthwork" pointerEvents="none" stroke="none" fillOpacity={0.6}>
      {(['cut', 'fill'] as const).map((kind) => paths[kind].map((d, k) => (d ? <path key={`${kind}${k}`} data-earth={`${kind}-${k}`} d={d} fill={earthColor(kind, k)} /> : null)))}
    </g>
  )
}

export function TerrainLayer({ px }: { px: number }) {
  const terrain = useApp((s) => s.project.site.terrain)
  const show = useTerrainView((s) => s.show)
  // the Heights tool draws the contours itself, each with its height
  const heights = useSiteTool((s) => s.tool === 'heights')
  if (!terrain) return null
  if (show === 'contours' && !heights) return <Contours terrain={terrain} px={px} />
  if (show === 'slope') return <Slope terrain={terrain} />
  if (show === 'earthwork' && !heights) return <Contours terrain={terrain} px={px} quiet />
  return null
}

/** How far under a mass's centre its platform's level is written: below its two-line label. */
const MARK_BELOW = 2.7

/**
 * Each design platform's level (▽ 1,204.5), on its largest mass under its label, while the ground is shown: a typed
 * level in ink, a balanced one in grey.
 */
export function PlatformMarks({ px }: { px: number }) {
  const earthwork = useShown((s) => s.derived.earthwork)
  const show = useTerrainView((s) => s.show)
  if (!earthwork || show === 'off') return null
  const size = 11 * px
  return (
    <g data-platform-marks="" pointerEvents="none">
      {earthwork.platforms
        .filter((x) => !x.context && x.level !== null)
        .map((x) => (
          <text
            key={x.id}
            data-platform={x.id}
            x={x.at.x}
            y={-x.at.y + MARK_BELOW * LABEL_PX * px}
            textAnchor="middle"
            fontSize={size}
            fontWeight={x.typed ? 600 : undefined}
            fill={x.typed ? 'var(--ink)' : 'var(--ink-secondary)'}
            stroke="var(--panel)"
            strokeWidth={size * 0.3}
            strokeLinejoin="round"
            paintOrder="stroke"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            ▽ {heightText(x.level!)}
          </text>
        ))}
    </g>
  )
}

/** The slope's classes, bottom left of the viewport while Slope is shown and the ground has a surface. */
export function SlopeLegend() {
  const terrain = useApp((s) => s.project.site.terrain)
  const shown = useTerrainView((s) => s.show === 'slope')
  if (!terrain || !shown || !slopePathsOf(terrain)) return null
  return (
    <div aria-label="Slope" className="glass pointer-events-none absolute bottom-7 left-3 z-[1] flex flex-col gap-0.5 rounded-glass px-2 py-1.5 text-caption text-ink-glass shadow-glass">
      <span className="text-ink">{tr("Slope")}</span>
      {SLOPE_CLASSES.map((c, k) => (
        <span key={c.label} className="flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-3.5 rounded-[0.125rem]" style={{ background: slopeColor(k), opacity: 0.8 }} />
          {c.label}
        </span>
      ))}
    </div>
  )
}

const m3 = (v: number) => `${Math.round(v).toLocaleString('en-US')} m³`

/** Cut & fill's classes and the option's totals (the platforms' and the graded roads'), bottom left of the viewport while it is shown. */
export function CutFillLegend() {
  const earthwork = useShown((s) => s.derived.earthwork)
  const roads = useShown((s) => s.derived.roadGrading)
  const shown = useTerrainView((s) => s.show === 'earthwork')
  if (!earthwork || !shown) return null
  return (
    <div aria-label="Cut and fill" className="glass pointer-events-none absolute bottom-7 left-3 z-[1] flex flex-col gap-0.5 rounded-glass px-2 py-1.5 text-caption text-ink-glass shadow-glass">
      <span className="text-ink">Cut &amp; fill</span>
      {EARTH_CLASSES.slice(1).map((c, i) => (
        <span key={c.label} className="flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-3.5 rounded-[0.125rem]" style={{ background: earthColor('cut', i + 1), opacity: 0.85 }} />
          <span aria-hidden className="h-2.5 w-3.5 rounded-[0.125rem]" style={{ background: earthColor('fill', i + 1), opacity: 0.85 }} />
          {c.label}
        </span>
      ))}
      {/* each total with its colour: which column is which */}
      {(['cut', 'fill'] as const).map((kind, i) => (
        <span key={kind} className={`flex items-center gap-1.5 tabular-nums ${i === 0 ? 'mt-0.5' : ''}`}>
          <span aria-hidden className="h-2.5 w-3.5 rounded-[0.125rem]" style={{ background: earthColor(kind, 2), opacity: 0.85 }} />
          {kind === 'cut' ? 'Cut' : 'Fill'} ≈ {m3(earthwork[kind] + (roads?.[kind] ?? 0))}
        </span>
      ))}
      {roads && roads.cut + roads.fill >= 1 && (
        <span className="tabular-nums">
          roads’ {m3(roads.cut)} · {m3(roads.fill)} among them
        </span>
      )}
    </div>
  )
}
