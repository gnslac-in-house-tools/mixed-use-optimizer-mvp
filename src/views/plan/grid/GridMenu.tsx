// The bottom bar's Grid menu (Phase QF.3, Decision "Grid menu"): everything about the structural grid the active option
// stands on, which every project has (Decision "Grid always"), in one box beside the Grid chip. Top to bottom: **Move
// pivot**, a toggle that turns the grid tool on (the origin's and the arm's handles on the plan: GridToolLayer.tsx, drawn
// whatever the area) with **Restore original** beside it; the bays, modules, angle and origin in two compact columns,
// each field one undo step through `actions`; whose grid it is (*Project*, or the option's own: what an option tries
// without moving the others'); then the look (GridLook.tsx). No Add, Fit or Remove. `disabled`: no plan on screen (the
// 3D view alone), so no pivot to move; the fields still work. Properties mounts it whole for the Grid row of Layers (Phase AS.3).
import { gridOf, moduleOf } from '../../../engine/grid/index.ts'
import { optionOf } from '../../../engine/buildings.ts'
import { actions } from '../../../state/actions/index.ts'
import { useApp } from '../../../state/store.ts'
import { NumberField, Total } from '../../controls/fields.tsx'
import { Segmented } from '../../controls/Segmented.tsx'
import { ChipTrack, ToggleChip } from '../../controls/ToggleChips.tsx'
import { useSiteTool } from '../site/siteTools.ts'
import { toggle } from '../../tools/hand.ts'
import { GridLook } from './GridLook.tsx'
import { restoreGrid } from './GridToolLayer.tsx'
import { t as tr } from '../../../i18n/idioma.ts' // mixed-use-mvp

const metres = (v: number) => `${Math.round(v * 100) / 100}`

/** `inPanel`: as wide as the panel it stands in (Properties, for the Grid row of Layers), not the menu's fixed width. */
export function GridMenu({ disabled = false, inPanel = false }: { disabled?: boolean; inPanel?: boolean }) {
  const project = useApp((s) => s.project)
  const optionId = useApp((s) => s.option)
  const apply = useApp((s) => s.apply)
  const pivot = useSiteTool((s) => s.tool === 'grid')
  const option = optionOf(project, optionId)
  const g = gridOf(project, optionId)
  // never without one (Decision "Grid always"): a project is given its grid when it is made, read or edited
  if (!g) return null
  const own = option.grid !== undefined
  const m = moduleOf(g)
  const update = (patch: Parameters<typeof actions.updateGrid>[2]) => apply((p) => actions.updateGrid(p, optionId, patch))
  return (
    <div className={`flex flex-col gap-3 p-0.5 ${inPanel ? 'w-full' : 'w-[17.5rem]'}`}>
      <div className="flex items-center gap-2">
        <ChipTrack>
          <ToggleChip
            pressed={pivot}
            disabled={disabled}
            title={tr("Move the grid by its origin and turn it by its handle on the plan (Shift: free, 15° steps). Escape or this button lets it go")}
            onClick={() => toggle('grid')}
          >
            {tr("Move pivot")}
          </ToggleChip>
        </ChipTrack>
        <button
          type="button"
          title={tr("Along the site’s main axis again, from the buildable area’s corner (its bays and modules kept)")}
          onClick={restoreGrid}
          className="pressable h-6 rounded-control px-2 text-label text-ink-segment hover:bg-hover hover:text-ink"
        >
          {tr("Restore original")}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        <NumberField narrow label="Bay x" unit="m" min={1} max={200} value={g.x} onCommit={(v) => update({ x: v })} />
        <NumberField narrow label="Bay y" unit="m" min={1} max={200} value={g.y} onCommit={(v) => update({ y: v })} />
        <NumberField narrow label="Modules" min={1} max={24} decimals={0} value={g.modules} onCommit={(v) => update({ modules: Math.round(v) })} />
        <dl className="contents">
          <Total label="Module" value={m.x === m.y ? `${metres(m.x)} m` : `${metres(m.x)} × ${metres(m.y)} m`} />
        </dl>
        <NumberField narrow label="Angle" unit="°" min={-360} max={360} decimals={1} value={g.angle} onCommit={(v) => update({ angle: v })} />
        <span aria-hidden />
        <NumberField narrow label="Origin x" unit="m" value={g.origin.x} onCommit={(v) => update({ origin: { x: v } })} />
        <NumberField narrow label="Origin y" unit="m" value={g.origin.y} onCommit={(v) => update({ origin: { y: v } })} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-label text-ink-secondary">{tr("Grid of")}</span>
        <Segmented
          kind="toggle"
          label="Grid of"
          options={[
            { key: 'project', label: 'Project', title: 'The project’s grid: every option without one of its own stands on it' },
            { key: 'own', label: `${option.name}’s own`, title: `${option.name} tries a grid of its own; the other options keep theirs` },
          ]}
          value={own ? 'own' : 'project'}
          onChange={(k) => apply((p) => (k === 'own' ? actions.ownGrid(p, optionId) : actions.sharedGrid(p, optionId)))}
        />
      </div>
      <div className="border-t border-separator pt-2">
        <GridLook />
      </div>
    </div>
  )
}
