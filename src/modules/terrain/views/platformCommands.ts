// What a building's Platform in Properties and the menus do with platforms (Decisions "Terrain layout", "Platforms"):
// each one verb through `actions`, one undo step. The menus' items, for the tree's building and masses and the plan's
// selection, only while the site has ground (without it a platform changes nothing to see); what the selection cannot
// do is greyed out and says why. The masses' two rows are the verbs *Own platform* and *Back to the building's* of the mass kind's menu
// (`views/editing/menu/kinds/mass.ts`); the building's are its own verbs *Join platform with …* and *Own platform* (`views/editing/menu/kinds/building.ts`).
import type { Building, DesignOption, Id, Project } from '../../../model/schema.ts'
import { buildingOf } from '../../../engine/buildings.ts'
import { platformRoot, stepsByMass } from '../engine/index.ts'
import { actions } from '../../../state/actions/index.ts'
import { useApp } from '../../../state/store.ts'
import type { MenuEntry } from '../../../views/controls/Menu.tsx'
import { useToast } from '../../../views/layout/toast.ts'

/** The site has ground: platforms mean something. */
export const hasGround = (p: Project) => p.site.terrain !== undefined

const apply = (f: (p: Project) => Project) => useApp.getState().apply(f)

export function setPlatformLevel(buildingId: Id, level: number | null) {
  apply((p) => actions.setPlatformLevel(p, buildingId, level))
}

export function joinPlatform(buildingId: Id, withId: Id) {
  apply((p) => actions.joinPlatform(p, buildingId, withId))
}

export function ownPlatform(buildingId: Id) {
  apply((p) => actions.ownPlatform(p, buildingId))
}

export function setStepLevel(stepId: Id, level: number | null) {
  apply((p) => actions.setStepLevel(p, stepId, level))
}

export function removeStep(stepId: Id) {
  apply((p) => actions.removeStep(p, stepId))
}

/** A platform (a building's, or a step) typed at the level that balances its cut and fill with its banks, in the active option. */
export function balanceWithBanks(id: Id) {
  const option = useApp.getState().option
  apply((p) => actions.balanceWithBanks(p, id, option))
}

const count = (n: number) => (n === 1 ? '1 mass' : `${n} masses`)

export function stepMasses(ids: Id[]) {
  let made = 0
  apply((p) => {
    const r = actions.stepMasses(p, ids)
    made = r.ids.length
    return r.project
  })
  if (made) useToast.getState().show('info', `${count(ids.length)} on a platform of their own (a step): its level in the building’s Properties.`)
}

export function unstepMasses(ids: Id[]) {
  apply((p) => actions.unstepMasses(p, ids))
}

/** The buildings standing on the same platform as `b` (itself left out). */
export function joinedWith(p: Project, b: Building): Building[] {
  const root = platformRoot(p, b.id)
  return p.buildings.filter((x) => x.id !== b.id && platformRoot(p, x.id) === root)
}

/** The option's other design buildings `b` may join: not on its platform already. */
export function joinable(p: Project, o: DesignOption, b: Building): Building[] {
  if (b.context) return []
  const root = platformRoot(p, b.id)
  return o.buildingIds.flatMap((id) => p.buildings.filter((x) => x.id === id && x.id !== b.id && !x.context && platformRoot(p, x.id) !== root))
}

/** Why these masses cannot step onto a platform of their own; null when they can. */
export function whyNotStep(p: Project, ids: Id[]): string | null {
  if (!hasGround(p)) return 'The site has no ground: Import its contours or points first'
  if (ids.length === 0) return 'Select masses first'
  const masses = p.masses.filter((m) => ids.includes(m.id))
  if (masses.every((m) => buildingOf(p, m).context)) return 'A context building stands on the ground as it is'
  const steps = stepsByMass(p)
  const first = steps.get(masses[0]?.id)?.step.id
  if (first && masses.every((m) => steps.get(m.id)?.step.id === first) && steps.get(masses[0].id)!.step.masses.length === masses.length)
    return 'They are a step of their own already'
  return null
}

/** Why these masses cannot go back onto their building's platform; null when they can. */
export function whyNotUnstep(p: Project, ids: Id[]): string | null {
  if (!hasGround(p)) return 'The site has no ground: Import its contours or points first'
  if (ids.length === 0) return 'Select masses first'
  const steps = stepsByMass(p)
  return ids.some((id) => steps.has(id)) ? null : 'They stand on their building’s platform already'
}

/** A building's platform items in the tree's menu: join another's, or its own again. */
export function buildingPlatformItems(p: Project, o: DesignOption, b: Building): MenuEntry[] {
  if (!hasGround(p)) return []
  const others = joinable(p, o, b)
  const shared = joinedWith(p, b)
  const joins: MenuEntry[] = others.length
    ? others.map((x) => ({
        key: `join:${x.id}`,
        label: `Join platform with ${x.name}`,
        title: `${b.name} stands on ${x.name}’s platform: one level for both, balanced over both`,
        onSelect: () => joinPlatform(b.id, x.id),
      }))
    : [{ key: 'join', label: 'Join platform with…', disabled: true, title: b.context ? 'A context building stands on the ground as it is' : `No other building of ${o.name} to join`, onSelect: () => {} }]
  return [
    'separator',
    ...joins,
    {
      key: 'own-platform',
      label: 'Own platform',
      disabled: shared.length === 0,
      title: shared.length ? `${b.name} leaves the platform it shares with ${shared.map((x) => x.name).join(', ')}` : 'It stands on a platform of its own already',
      onSelect: () => ownPlatform(b.id),
    },
  ]
}

/** Masses' platform rows (the one right-click menu's): a step of their own (`step`), or back to the building's (`unstep`); none without ground. */
export function massPlatformRows(ids: Id[]): MenuEntry[] {
  const p = useApp.getState().project
  if (!hasGround(p)) return []
  const notStep = whyNotStep(p, ids)
  const notBack = whyNotUnstep(p, ids)
  return [
    {
      key: 'step',
      label: 'Own platform',
      disabled: notStep !== null,
      title: notStep ?? `${count(ids.length)} on a platform of their own in their building (a step), at its balanced level`,
      onSelect: () => stepMasses(ids),
    },
    {
      key: 'unstep',
      label: 'Back to the building’s',
      disabled: notBack !== null,
      title: notBack ?? 'Back onto their building’s platform',
      onSelect: () => unstepMasses(ids),
    },
  ]
}
