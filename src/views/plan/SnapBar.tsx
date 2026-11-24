// The snap settings in the drafting bar (simplified port of Plaza-Practiko `vistas/paneles/BarraIman.tsx`): Snap
// (its key: view.snap); its kinds in a drop-down beside it (Decision "Bottom bar"), each with the sign the plan draws and its name, and
// *Snap to* ▸ Drawing lines · Reference lines · Contours (Decision "Drawing layers", Phase AS.5); Align; then Ortho and Grid (view.ortho, view.grid), which work with the snap off too. Grid is the structural grid's modules (whole
// metres on a project read without one, Phase G.2b), and on it also shows the grid on the plan and in the 3D (Decision
// "Grid chip"; the user: "when I press it and it is on, the grid shows"); its parameters, its pivot and its look in the
// *Grid ▾* menu beside it (GridMenu.tsx, Decision "Grid menu"). The block editor's bar (BE.10) is this one without *Snap
// to* (no drawing lines, reference lines or contours there) and without the grid's menu, its Grid the block's own module (`gridTitle`).
import { gridOf, moduleOf } from '../../engine/grid/index.ts'
import { useApp } from '../../state/store.ts'
import { titleWith } from '../commands/shortcuts.ts'
import { Icon } from '../controls/Icon.tsx'
import { ChipTrack, ToggleChip } from '../controls/ToggleChips.tsx'
import { BarMenu } from '../viewport/BarMenu.tsx'
import { GridMenu } from './grid/GridMenu.tsx'
import { SNAP_HELP, SNAP_KINDS, SNAP_NAMES, SNAP_TO, SNAP_TO_HELP, SNAP_TO_NAMES, signPath } from './snap/kinds.ts'
import { useSnapSettings } from './snap/settings.ts'
import { t as tr } from '../../i18n/idioma.ts' // mixed-use-mvp

/**
 * `disabled`: no plan on screen (the 3D view alone). `snapTo`: the *Snap to* reference lines and contours in the kinds'
 * drop-down. `gridTitle`: the Grid chip's title for a plan with a grid of its own (the block's), else the structural
 * grid's. `gridMenu`: the *Grid ▾* menu beside it (the structural grid's parameters, pivot and look).
 */
export function SnapBar({ disabled = false, snapTo = true, gridTitle, gridMenu = true }: { disabled?: boolean; snapTo?: boolean; gridTitle?: string; gridMenu?: boolean }) {
  const s = useSnapSettings((st) => st.settings)
  const toggle = useSnapSettings((st) => st.toggle)
  const toggleKind = useSnapSettings((st) => st.toggleKind)
  const toggleTo = useSnapSettings((st) => st.toggleTo)
  const module = useApp((st) => {
    const g = gridOf(st.project, st.option)
    if (!g) return null
    const m = moduleOf(g)
    const r = (v: number) => Math.round(v * 100) / 100
    return m.x === m.y ? `${r(m.x)} m` : `${r(m.x)} × ${r(m.y)} m`
  })
  return (
    <div role="toolbar" aria-label="Snap" data-tour="snap" className={`flex shrink-0 items-center gap-1.5 ${disabled ? 'opacity-50' : ''}`}>
      <ChipTrack>
        <ToggleChip pressed={s.on} disabled={disabled} title={`${titleWith('Object snap on/off', 'view.snap')}. Shift while dragging = no snap`} onClick={() => toggle('on')}>
          {tr("Snap")}
        </ToggleChip>
      </ChipTrack>
      {/* its kinds in a drop-down (Decision "Bottom bar"): each with the sign the plan draws and its name */}
      <BarMenu label={null} name="Snap kinds" title={tr("Which points the snap finds")} disabled={disabled} align="left">
        <div role="group" aria-label="Snap kinds" className="flex flex-col">
          {SNAP_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              role="menuitemcheckbox"
              aria-checked={s.kinds[k]}
              title={SNAP_HELP[k]}
              onClick={() => toggleKind(k)}
              className={`pressable flex h-row items-center gap-2 rounded-control px-2 text-label hover:bg-hover ${s.kinds[k] ? 'text-ink' : 'text-ink-tertiary'}`}
            >
              <Icon name="check" className={`h-3.5 w-3.5 ${s.kinds[k] ? '' : 'invisible'}`} />
              <svg width={11} height={11} viewBox="-5.5 -5.5 11 11" aria-hidden="true" className="overflow-visible">
                <path d={signPath(k, 4)} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
              </svg>
              {SNAP_NAMES[k]}
            </button>
          ))}
        </div>
        {/* what else attracts (Decision "Drawing layers"): yes or no each */}
        {snapTo && (
          <div role="group" aria-label="Snap to" className="mt-1 flex flex-col border-t border-separator pt-1">
            <span className="px-2 py-0.5 text-caption text-ink-tertiary">{tr("Snap to")}</span>
            {SNAP_TO.map((k) => (
              <button
                key={k}
                type="button"
                role="menuitemcheckbox"
                aria-checked={s.to[k]}
                title={SNAP_TO_HELP[k]}
                onClick={() => toggleTo(k)}
                className={`pressable flex h-row items-center gap-2 rounded-control px-2 text-label hover:bg-hover ${s.to[k] ? 'text-ink' : 'text-ink-tertiary'}`}
              >
                <Icon name="check" className={`h-3.5 w-3.5 ${s.to[k] ? '' : 'invisible'}`} />
                {SNAP_TO_NAMES[k]}
              </button>
            ))}
          </div>
        )}
      </BarMenu>
      <ChipTrack dim={!s.on && !disabled}>
        <ToggleChip
          pressed={s.align}
          disabled={disabled}
          title={tr("Align: walls line up with parallel walls (other masses, site, setback); a dragged corner tracks the mass's axes and the lines of nearby walls")}
          onClick={() => toggle('align')}
        >
          {tr("Align")}
        </ToggleChip>
      </ChipTrack>
      <ChipTrack>
        <ToggleChip pressed={s.ortho} disabled={disabled} title={`${titleWith('Ortho', 'view.ortho')}: a dragged corner moves only horizontally or vertically`} onClick={() => toggle('ortho')}>
          {tr("Ortho")}
        </ToggleChip>
        <ToggleChip
          pressed={s.grid}
          title={gridTitle ?? titleWith(module ? `The structural grid: shown, and the snap to its ${module} modules` : 'The 1 m grid: shown, and the snap to it', 'view.grid')}
          onClick={() => toggle('grid')}
        >
          {tr("Grid")}
        </ToggleChip>
      </ChipTrack>
      {gridMenu && (
        <BarMenu label={null} name="Grid" title={tr("The grid’s parameters (bays, modules, angle, origin), Move pivot, and its colour and opacity")} align="left">
          <GridMenu disabled={disabled} />
        </BarMenu>
      )}
    </div>
  )
}
