// The plan's hatches (Decision "Plan style"; port of Plaza-Practiko `vistas/planta/texturas.ts` and `Textura.tsx`, the
// families GFit uses, and `Trama.tsx` for a mass without a program). Subtle: a veil of ink over the program's colour.
// They measure in screen px at any zoom (`px`: metres per screen pixel), as <pattern>s in the plan's <defs>; each mass
// is filled once more with its hatch's patterns over its colour. Each program has one (Program.hatch, picked in the
// Brief); without one, a built program is diagonal and an open one paving.
import type { Hatch, Program } from '../../model/schema.ts'

/** One family of lines or dots, in screen px. */
export type Family = { kind: 'lines'; angle: number; step: number } | { kind: 'dots'; step: number; r: number; staggered?: boolean }

export interface HatchStyle {
  label: string
  families: Family[]
  /** The ink's opacity. */
  opacity: number
  /** Line width (px). */
  width: number
}

/** The hatches a program can take, as the Brief's picker lists them. */
export const HATCH_STYLES: Record<Exclude<Hatch, 'none'>, HatchStyle> = {
  diagonal: { label: 'Diagonal', families: [{ kind: 'lines', angle: 45, step: 7 }], opacity: 0.16, width: 0.6 },
  cross: {
    label: 'Cross',
    families: [
      { kind: 'lines', angle: 45, step: 9 },
      { kind: 'lines', angle: -45, step: 9 },
    ],
    opacity: 0.14,
    width: 0.5,
  },
  dots: { label: 'Dots', families: [{ kind: 'dots', step: 7, r: 0.65, staggered: true }], opacity: 0.25, width: 0 },
  paving: {
    label: 'Paving',
    families: [
      { kind: 'lines', angle: 0, step: 11 },
      { kind: 'lines', angle: 90, step: 11 },
    ],
    opacity: 0.14,
    width: 0.5,
  },
  asphalt: { label: 'Asphalt', families: [{ kind: 'dots', step: 5, r: 0.45, staggered: true }], opacity: 0.14, width: 0 },
}

/** A mass without a program: grey with a denser, darker 45° hatch (Practiko's trama), so it reads as unassigned. */
export const UNASSIGNED: HatchStyle = { label: 'No program', families: [{ kind: 'lines', angle: 45, step: 6 }], opacity: 0.35, width: 1 }

export const HATCH_LABELS: Record<Hatch, string> = {
  none: 'None',
  diagonal: HATCH_STYLES.diagonal.label,
  cross: HATCH_STYLES.cross.label,
  dots: HATCH_STYLES.dots.label,
  paving: HATCH_STYLES.paving.label,
  asphalt: HATCH_STYLES.asphalt.label,
}

/** A program's hatch when none is picked: a building diagonal, open ground paving. */
export const defaultHatch = (g: Pick<Program, 'built'>): Hatch => (g.built ? 'diagonal' : 'paving')

/** What a mass is hatched with: its program's (or the default), 'unassigned' without a program. */
export function hatchOf(g: Pick<Program, 'built' | 'hatch'> | null | undefined): Hatch | 'unassigned' {
  if (!g) return 'unassigned'
  return g.hatch ?? defaultHatch(g)
}

type Key = Exclude<Hatch, 'none'> | 'unassigned'
const styleOf = (k: Key): HatchStyle => (k === 'unassigned' ? UNASSIGNED : HATCH_STYLES[k])
const ALL: Key[] = [...(Object.keys(HATCH_STYLES) as Exclude<Hatch, 'none'>[]), 'unassigned']

/** A family's <pattern> id: `base` (unique per drawing) makes it unique. */
export const patternId = (base: string, k: Key, i: number) => `${base}-hatch-${k}-${i}`

const r3 = (v: number) => Math.round(v * 1000) / 1000

/** The patterns, in the drawing's <defs>: every hatch, or `only` these. */
export function HatchPatterns({ base, px, only }: { base: string; px: number; only?: Key[] }) {
  return (
    <>
      {(only ?? ALL).flatMap((k) => {
        const s = styleOf(k)
        return s.families.map((f, i) => <Pattern key={`${k}-${i}`} id={patternId(base, k, i)} f={f} px={px} style={s} />)
      })}
    </>
  )
}

function Pattern({ id, f, px, style }: { id: string; f: Family; px: number; style: HatchStyle }) {
  const p = r3(f.step * px)
  if (f.kind === 'lines')
    return (
      <pattern id={id} patternUnits="userSpaceOnUse" width={p} height={p} patternTransform={`rotate(${f.angle})`}>
        <line x1={p / 2} y1={0} x2={p / 2} y2={p} stroke="var(--ink)" strokeOpacity={style.opacity} strokeWidth={style.width * px} />
      </pattern>
    )
  const r = f.r * px
  const tall = f.staggered ? 2 * p : p
  return (
    <pattern id={id} patternUnits="userSpaceOnUse" width={p} height={tall}>
      <circle cx={p / 2} cy={p / 2} r={r} fill="var(--ink)" fillOpacity={style.opacity} />
      {f.staggered && (
        <>
          <circle cx={0} cy={(3 * p) / 2} r={r} fill="var(--ink)" fillOpacity={style.opacity} />
          <circle cx={p} cy={(3 * p) / 2} r={r} fill="var(--ink)" fillOpacity={style.opacity} />
        </>
      )}
    </pattern>
  )
}

/** A shape (its path `d`) filled with a hatch's patterns, over what is drawn under it; nothing for none. `opacity`:
 *  fainter (Ghosted, Decision "Ghosted detail"). */
export function HatchFill({ base, hatch, d, opacity }: { base: string; hatch: Hatch | 'unassigned'; d: string; opacity?: number }) {
  if (hatch === 'none') return null
  return (
    <g data-hatch={hatch} pointerEvents="none" opacity={opacity}>
      {styleOf(hatch).families.map((_, i) => (
        <path key={i} d={d} fill={`url(#${patternId(base, hatch, i)})`} fillRule="evenodd" stroke="none" />
      ))}
    </g>
  )
}

/** A small sample of a colour and a hatch (the Brief's style picker): `size` px square. */
export function HatchSwatch({ color, hatch, size, id }: { color: string; hatch: Hatch; size: number; id: string }) {
  const base = `sw-${id}`
  const d = `M0 0H${size}V${size}H0Z`
  return (
    <svg aria-hidden width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block shrink-0 rounded-[3px]">
      {hatch !== 'none' && (
        <defs>
          <HatchPatterns base={base} px={1} only={[hatch]} />
        </defs>
      )}
      <path d={d} fill={color} fillOpacity={0.85} />
      <HatchFill base={base} hatch={hatch} d={d} />
    </svg>
  )
}
