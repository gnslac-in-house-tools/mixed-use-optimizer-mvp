// What the general tools share (Phases GT.4, GT.5 and AS.5: Move, Copy, Rotate, Mirror, Array and Align, in `Transform.tsx`,
// `Mirror.tsx`, `ArrayTool.tsx` and `Align.tsx`): the things picked as the tool starts and how they are picked again, what
// attracts a point (the plan without what moves), the guards of a preview that stands between two clicks, and the
// reasons a verb skipped something, told once.
//   Held / holdNow / pickAgain   what the tool carries, taken as it starts and put back as it ends or steps back
//   targetsWithout               what attracts the target: the plan now, without what is picked
//   useStandingPreview           the preview on the project, made one undo step by `commit`, dropped by `drop`
//   editsProject / EDITS         the app's keys that edit the project: the tool's own while a preview stands
//   useTell                      each reason a verb left something alone, said once while the tool is on
// Unlike a drag's, the preview stands between two clicks, so it is kept from being made a step half-way
// (`useStandingPreview`): the pointer leaving the plan (for a panel, the command line) drops it, the app's keys that
// edit the project are the tool's in the step it stands in (`editsProject`), and an undo or redo cancels it (the
// store); if anything else still commits or cancels it, the tool goes back to its first step rather than preview from
// the project it left. The one `keydown` listener of that guard is here (`LOCAL_KEYS` in commands/keys.ts names this file).
import { useCallback, useEffect, useRef } from 'react'
import type { Project } from '../../../model/schema.ts'
import type { DrawingPart, Picked } from '../../../model/picked.ts'
import { existingRoadLocked } from '../../../kinds/locked.ts'
import { useApp } from '../../../state/store.ts'
import { chordOf } from '../../commands/keys.ts'
import { commandForKey } from '../../commands/shortcuts.ts'
import { useToast } from '../../layout/toast.ts'
import { letGo } from '../../tools/hand.ts'
import { useCommand } from '../command/commandState.ts'
import { nothingPicked, pickedHeld, pickedNow, setPicked } from '../mix.ts'
import { snapLevels } from '../reference.ts'
import { keysOf } from '../site/drawingPick.ts'
import { targetsOf, type Targets } from '../snap/move.ts'
import { roadSources, sourcesFor } from '../snap/sources.ts'
import { behindModal, typingIn } from './common.tsx'

/** What the tool carries: the things picked as it started, the picked streets' ids,
 *  the drawings' parts as their store held them (to pick them again). */
export interface Held {
  picked: Picked
  roads: string[]
  drawings: DrawingPart[]
}

/** What attracts the target: the plan now, without the picked masses, lots, reference lines, streets, existing streets and gates (what moves; a locked existing
 *  street stays where it is, so it still attracts), nor the picked drawings' lines that move (Decision
 *  "Drawing pick": hidden to the snap while they move; their locked layers and parcels stay, and still attract). */
export function targetsWithout({ picked, roads }: Held): Targets {
  const { project, derived } = useApp.getState()
  const streets = roads.filter((id) => derived.circulation.roads.some((r) => (r.street ?? r.id) === id && r.kind === 'street'))
  // the existing streets that move (a locked one stays: it still attracts), by the ids of their runs
  const sites = new Set(picked.existing.filter((id) => !existingRoadLocked(project, id)))
  const runs = derived.circulation.roads.filter((r) => r.kind === 'existing' && sites.has(r.sourceId ?? r.id)).map((r) => r.id)
  const levels = snapLevels()
  const moving = keysOf(project.site, picked.drawings)
  if (levels.drawn && moving.length) levels.drawn = { ...levels.drawn, hidden: [...levels.drawn.hidden, ...moving] }
  return targetsOf([
    ...sourcesFor(project, derived, [...picked.masses, ...picked.lots, ...picked.lines], levels),
    // the picked lots' entrances move with them
    ...roadSources(derived, new Set([...streets, ...runs, ...picked.gates, ...picked.lots])),
  ])
}

/** What is picked now, held. */
export const holdNow = (): Held => ({
  picked: pickedNow(),
  ...pickedHeld(),
})

/** The things held picked again (a street gone from the derived roads is left out; the
 *  drawings as their store held them, a whole one whole). */
export function pickAgain({ picked, roads, drawings }: Held): void {
  const shown = useApp.getState().derived.circulation.roads
  const kept = roads.filter((id) => shown.some((r) => (r.street ?? r.id) === id))
  setPicked(kept, { ...picked, drawings })
}

/**
 * The app's keys that edit the project (the commands Paste, Paste here, Duplicate, Group, Ungroup, Lock, Rotate 90°, Redo,
 * Union and Solve all, by the keys they have now: `commands/shortcuts.ts`, so a remapped key is swallowed too). With a
 * target previewed, `apply` would make the half-made move a step first. A tool's letter is not one: it goes to the other tool.
 */
export function editsProject(e: KeyboardEvent): boolean {
  const chord = chordOf(e)
  const c = chord ? commandForKey(chord, 'project') : undefined
  return !!c && EDITS.has(c.id)
}
const EDITS = new Set(['edit.paste', 'edit.paste-here', 'edit.duplicate', 'edit.group', 'edit.ungroup', 'edit.lock', 'edit.rotate90', 'edit.redo', 'tool.union', 'design.solve'])

/**
 * The guards of a preview that stands between two clicks. Started with nothing picked, the tool gives way to Select;
 * gone (another tool), its preview goes too. `standing`: the tool is in the step where a preview can
 * stand, so the app's keys that edit the project are its own and do nothing. `lost`: what the tool does when someone
 * else commits or cancels its preview (an apply from a panel, an undo): back to its first step.
 */
export function useStandingPreview(standing: boolean, lost: () => void) {
  const previewing = useRef(false)

  useEffect(() => {
    if (nothingPicked()) letGo()
    return () => {
      if (previewing.current) {
        previewing.current = false
        useApp.getState().cancel()
      }
      useCommand.getState().register(null)
    }
  }, [])

  useEffect(
    () =>
      useApp.subscribe((s, before) => {
        if (!previewing.current || !before.dragStart || s.dragStart) return
        previewing.current = false
        lost()
      }),
    [lost],
  )

  useEffect(() => {
    if (!standing) return
    const onKey = (e: KeyboardEvent) => {
      if (typingIn(e.target) || behindModal(null) || !editsProject(e)) return
      e.preventDefault()
      e.stopPropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [standing])

  /** The preview let go (the project as it was). */
  const drop = useCallback(() => {
    if (!previewing.current) return
    previewing.current = false
    useApp.getState().cancel()
  }, [])

  /** The preview of `f` from the project as it was. */
  const show = useCallback((f: (p: Project) => Project | null) => {
    useApp.getState().preview(f)
    previewing.current = true
  }, [])

  /** The preview made one undo step. */
  const commit = useCallback(() => {
    previewing.current = false
    useApp.getState().commit()
  }, [])

  return { drop, show, commit }
}

/** Each reason a verb left something alone, told once while the tool is on. */
export function useTell() {
  const told = useRef(new Set<string>())
  return useCallback((reasons: string[]) => {
    const fresh = [...new Set(reasons)].filter((x) => !told.current.has(x))
    for (const x of fresh) told.current.add(x)
    if (fresh.length) useToast.getState().show('info', fresh.join(' · '))
  }, [])
}
