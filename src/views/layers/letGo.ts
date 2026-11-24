// What is picked and then hidden is let go (Phase AS.3, Decision "Layers"): a thing the eye hides is not on the plan, so it
// is not the selection either. One subscription to the layer store, one place for every kind: hiding Dimensions (or one dimension's own
// key) lets that dimension go; Streets, the streets picked (the node picked on one with it), and a street whose segments are all hidden
// (`street:<segment>`, Hide for one object) goes the same; Gates, Existing roads and Lots, or one object's own key, the gate, the
// existing road or the lot picked; a note, the same (its own key `note:<id>` or Notes), and a mass whose own eye (`mass:<id>`) goes off. The other picks stay: a mass of a hidden
// building, a drawing, the rest of a mixed selection. And what becomes locked while it is picked (below): a mass, a street, an existing street, a lot, a gate, a reference line, a note.
// Every letting go runs `together` (`plan/mixing.ts`): one thing hidden or locked leaves the rest of a mixed pick as it is, which a plain pick of another kind would not.
// Loaded by `plan/mix.ts`, which owns the mixed pick.
import { lockedMassIds } from '../../model/locks.ts'
import { existingRoadLocked, gateLocked, lotLocked, noteLocked, referenceLineLocked, streetLockState } from '../../kinds/locked.ts'
import { useApp } from '../../state/store.ts'
import { pickedLotIds, useLots } from '../../modules/parking/views/lotState.ts'
import { pickedGateIds, pickedSiteItems, useAccess } from '../plan/access/accessState.ts'
import { useAnnotations } from '../plan/annotations/annotationState.ts'
import { pickedIds, segmentsOfStreet, useRoads } from '../plan/circulation/roadState.ts'
import { together } from '../plan/mixing.ts'
import { selectedDimensionIds, useDimensions } from '../plan/tools/toolState.ts'
import { isObjectHidden, isStreetHidden, mass } from './keys.ts'
import { useLayerView } from './layerView.ts'

useLayerView.subscribe((s, before) => {
  if (s.hidden === before.hidden) return
  // letting one thing go is not a plain pick of another kind: the rest of a mix stays (the one-kind-at-a-time subscriptions stand aside)
  together(() => letGoHidden(s.hidden))
})
function letGoHidden(hidden: readonly string[]): void {
  const off = new Set(hidden)
  const dimensions = selectedDimensionIds(useDimensions.getState())
  const keptDimensions = dimensions.filter((id) => !isObjectHidden(off, 'dimension', id))
  if (keptDimensions.length !== dimensions.length) useDimensions.setState({ selected: keptDimensions[0] ?? null, also: keptDimensions.slice(1) })
  // the streets picked that the eyes hide: Streets, or every segment of the street
  const { derived } = useApp.getState()
  const roads = useRoads.getState()
  const picked = pickedIds(roads)
  const keptRoads = picked.filter((id) => {
    const segments = segmentsOfStreet(derived.circulation.roads, id)
    return segments.length === 0 || !isStreetHidden(off, segments)
  })
  if (keptRoads.length !== picked.length) {
    if (keptRoads.length === 0) roads.pick(null)
    else useRoads.setState({ picked: keptRoads[0], also: keptRoads.slice(1), node: null })
  }
  // the gates and the existing streets picked that the eyes hide
  const sites = pickedSiteItems(useAccess.getState()).map((x) => x.id)
  const gates = pickedGateIds(useAccess.getState())
  const keptSites = sites.filter((id) => !isObjectHidden(off, 'existing-road', id))
  const keptGates = gates.filter((id) => !isObjectHidden(off, 'gate', id))
  if (keptSites.length !== sites.length || keptGates.length !== gates.length) useAccess.getState().set(keptGates, keptSites)
  const lots = pickedLotIds(useLots.getState())
  const keptLots = lots.filter((id) => !isObjectHidden(off, 'lot', id))
  if (keptLots.length !== lots.length) useLots.setState({ picked: keptLots[0] ?? null, also: keptLots.slice(1) })
  // the reference lines and the notes the eyes hide (all of them, or one's own key)
  const guides = useAnnotations.getState().lines
  const keptGuides = guides.filter((id) => !isObjectHidden(off, 'reference-line', id))
  if (keptGuides.length !== guides.length) useAnnotations.setState({ lines: keptGuides })
  const texts = useAnnotations.getState().notes
  const keptTexts = texts.filter((id) => !isObjectHidden(off, 'note', id))
  if (keptTexts.length !== texts.length) useAnnotations.setState({ notes: keptTexts })
  // a mass whose own eye went off is not on the plan: it is let go (the rest of the masses picked stay)
  const app = useApp.getState()
  const seen = app.selection.massIds.filter((id) => !off.has(mass(id)))
  if (seen.length !== app.selection.massIds.length) app.selectMany(seen)
}

// What becomes locked while it is picked is let go (the padlock is CAD's: a locked object is not on the plan's selection): Edit › Lock,
// the padlock in Properties, a redo of a lock, the agent's tool. A lock that was already there when it was picked (the tree's row picks
// one) is not touched, nor is something picked after it is locked. A mass first; then a street (when all its segments are locked: a street
// with only some is mixed, and stays picked), a lot and a gate.
useApp.subscribe((s, before) => {
  if (s.project === before.project) return
  // what is let go here is not a plain pick of another kind: the rest of a mix stays
  together(() => {
    if ((s.project.masses !== before.project.masses || s.project.buildings !== before.project.buildings) && s.selection.massIds.length > 0) {
      const was = new Set(lockedMassIds(before.project))
      const locked = new Set(lockedMassIds(s.project).filter((id) => !was.has(id) && before.project.masses.some((m) => m.id === id)))
      const kept = locked.size === 0 ? s.selection.massIds : s.selection.massIds.filter((id) => !locked.has(id))
      if (kept.length !== s.selection.massIds.length) s.selectMany(kept)
    }
    if (s.project.options === before.project.options && s.project.site === before.project.site) return
    const newly = (now: boolean, was: boolean) => now && !was
    const option = s.option
    const roads = useRoads.getState()
    const streets = pickedIds(roads)
    if (streets.length > 0) {
      const segmentsOf = (id: string, d: typeof s.derived) => segmentsOfStreet(d.circulation.roads, id)
      const kept = streets.filter((id) => {
        const segs = segmentsOf(id, s.derived)
        return !newly(streetLockState(s.project, option, segs) === 'locked', streetLockState(before.project, option, segs) === 'locked')
      })
      if (kept.length !== streets.length) {
        if (kept.length === 0) roads.pick(null)
        else useRoads.setState({ picked: kept[0], also: kept.slice(1), node: null })
      }
    }
    const lots = pickedLotIds(useLots.getState())
    const keptLots = lots.filter((id) => !newly(lotLocked(s.project, option, id), lotLocked(before.project, option, id)))
    if (keptLots.length !== lots.length) useLots.setState({ picked: keptLots[0] ?? null, also: keptLots.slice(1) })
    const gates = pickedGateIds(useAccess.getState())
    const keptGates = gates.filter((id) => !newly(gateLocked(s.project, option, id), gateLocked(before.project, option, id)))
    // an existing street that becomes locked while picked is let go too (its flag is the site's: no option is asked)
    const sites = pickedSiteItems(useAccess.getState()).map((x) => x.id)
    const keptSites = sites.filter((id) => !newly(existingRoadLocked(s.project, id), existingRoadLocked(before.project, id)))
    if (keptGates.length !== gates.length || keptSites.length !== sites.length) useAccess.getState().set(keptGates, keptSites)
  })
})
// the reference lines are the project's (no option) and the notes a level's: one that becomes locked while picked is let go, as a lot is
useApp.subscribe((s, before) => {
  together(() => {
    if (s.project.referenceLines !== before.project.referenceLines) {
      const guides = useAnnotations.getState().lines
      const kept = guides.filter((id) => !(referenceLineLocked(s.project, id) && !referenceLineLocked(before.project, id)))
      if (kept.length !== guides.length) useAnnotations.setState({ lines: kept })
    }
    if (s.project.notes !== before.project.notes) {
      const texts = useAnnotations.getState().notes
      const kept = texts.filter((id) => !(noteLocked(s.project, id) && !noteLocked(before.project, id)))
      if (kept.length !== texts.length) useAnnotations.setState({ notes: kept })
    }
  })
})
