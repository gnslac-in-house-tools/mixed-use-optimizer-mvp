// The command line on the docks, doors or patterns picked on a placed block (the user, 2026-11-18): a typed number slides them, never the block. Written here, in the On edge views, because
// only they call `actions.editEdge` (`oneEdgeEngine.test.ts`); `useEditCommand` registers it in place of the standing Move.
import type { Id, Point, Project } from '../../../model/schema.ts'
import { bounds } from '../../../engine/geom/polygon.ts'
import { footprintPolygon } from '../../../engine/geom/footprint.ts'
import { actions } from '../../../state/actions/index.ts'
import { useApp } from '../../../state/store.ts'
import { useToast } from '../../layout/toast.ts'
import type { Command } from '../../plan/command/command.ts'
import type { Registration } from '../../plan/command/commandState.ts'
import { endTyped, startTyped, type Told } from '../dimension/typed.ts'
import { SLIDE_HELP, SLIDE_WHAT, sentence, slideName } from './labels.ts'

const WHOLE = 'Slides go by whole modules'
const NUMBER = /^[-+]?(\d+\.?\d*|\.\d+)$/

/** The ids of `ids` that are still elements of the hall mass `host` in `p` (a pick outlives an undo, or the tool that took the dock). */
export const livePicks = (p: Project, host: Id, ids: Id[]): Id[] => (actions.edgeOf(p, { kind: 'mass', id: host })?.elements ?? []).filter((x) => ids.includes(x.id)).map((x) => x.id)

/**
 * The docks, doors or patterns picked on a placed block (`ids`, of the hall mass `host`): a typed number slides them along their wall by that many modules, as the slide drag's typed value
 * does (positive: towards the higher modules, the copy's local axis), one undo step; a second number replaces the first. Only a bare whole number counts (the rest of the line reads metres, this reads
 * modules): anything else is refused with a toast and nothing moves. A refusal of the engine (the wall's end, another element in the way) says why too: the block is never moved by it.
 */
export function slideRegistration(host: Id, ids: Id[]): Registration {
  const ref = { kind: 'mass' as const, id: host }
  const kind = (actions.edgeOf(useApp.getState().project, ref)?.elements ?? []).find((x) => ids.includes(x.id))?.kind ?? 'dock'
  const prompt = `${slideName(ids.length, kind)} · modules`
  const refuse = (why: string) => useToast.getState().show('info', sentence(why))
  /** Where the field stands: the block's centre. */
  const centre = (): Point => {
    const m = useApp.getState().project.masses.find((x) => x.id === host)
    if (!m) return { x: 0, y: 0 }
    const b = bounds(footprintPolygon(m.footprint))
    return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }
  }
  // a typed value, its edit: whole, off zero, and the engine's say
  const edit = (v: Point) => (p: Project, told: Told): Project | null => {
    if (!Number.isInteger(v.x) || v.y !== 0 || v.x === 0) {
      told.why = WHOLE
      return null
    }
    const w = actions.editEdge(p, ref, { op: 'slide', ids: livePicks(p, host, ids), by: v.x })
    if (w.reason) {
      told.why = sentence(w.reason)
      return null
    }
    return w.project
  }
  return {
    tool: SLIDE_WHAT,
    prompt,
    help: SLIDE_HELP,
    // a bare number only (its whole-ness is `edit`'s to refuse); the command line's other forms (decimals, #, @, <a, a unit) are not modules
    parse(text) {
      const t = text.trim()
      if (t === '') return { kind: 'empty' }
      // a number that is not a whole one still goes to `apply`, which refuses it with the toast and returns true: the field clears, as for an out-of-range number
      if (!NUMBER.test(t)) {
        refuse(WHOLE)
        return { kind: 'error', reason: WHOLE }
      }
      return { kind: 'point', point: { x: Number(t), y: 0 } }
    },
    context: () => ({ first: false, base: { x: 0, y: 0 }, cursor: null, rectangle: false, angle: null }),
    apply(c: Command) {
      if (c.kind === 'empty') return true
      if (c.kind !== 'point') return false
      const s = useApp.getState()
      const before = s.project
      const told: Told = {}
      if (edit(c.point)(before, told) === null) {
        refuse(told.why ?? WHOLE)
        return true
      }
      s.apply((p) => edit(c.point)(p, {}) ?? p)
      if (useApp.getState().project === before) return true
      // an edit of its own, which the next typed value replaces (one undo step), as the block's Move
      startTyped({
        what: SLIDE_WHAT,
        name: prompt,
        measure: 'point',
        shown: '',
        at: centre(),
        base: { x: 0, y: 0 },
        // a bare number goes along +x: its sign is the one typed
        way: { x: 1, y: 0 },
        help: SLIDE_HELP,
        apply: (v) => edit(v as Point),
        mode: 'live',
        from: before,
      })
      endTyped(false)
      return true
    },
    cancel() {},
    oneShot: true,
  }
}
