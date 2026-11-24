// The view switch: Plan · 3D · Split at the right end of the drafting bar (`ViewTabs`; the block editor's drafting bar has it
// too), except on a phone, whose top bar keeps it under the name, a group named Views without a caption: one place on each
// screen. Compare went into the menu (Design › Options › Compare…, Project C AS.1).
import { useCompare } from '../compare/compareView.ts'
import { Segmented } from '../controls/Segmented.tsx'
import { usePhone } from './media.ts'
import { shown, useUi, VIEWS } from './ui.ts'

/** Plan · 3D (Split is not a phone's): the phone's top bar. */
export function ViewSwitch() {
  return (
    <div role="group" aria-label="Views" className="flex shrink-0 items-center gap-3">
      <ViewTabs />
    </div>
  )
}

/** Plan · 3D · Split (the drafting bar's right end when there is no phone's top bar; the block editor's drafting bar has it too). */
export function ViewTabs() {
  const phone = usePhone()
  const chosen = useUi((s) => s.view)
  const setView = useUi((s) => s.setView)
  const comparing = useCompare((s) => s.open)
  // a phone has no room for two views: Split shows as Plan
  const view = phone && chosen === 'split' ? 'plan' : chosen
  const views = shown(VIEWS).filter((v) => !(phone && v.key === 'split'))
  return (
    // a width of its own: what stands beside it keeps its place whatever the view
    <div className={`flex shrink-0 ${phone ? '' : 'w-[11rem]'}`}>
      <Segmented
        kind="tabs"
        label="View"
        options={views.map((v) => ({
          key: v.key,
          label: v.label,
          disabled: comparing,
          title: comparing ? 'Compare has its own Plan · 3D' : v.title,
        }))}
        value={view}
        onChange={setView}
      />
    </div>
  )
}
