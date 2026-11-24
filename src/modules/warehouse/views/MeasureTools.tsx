// The block editor's measures (Phase BE.10): Dimension (a tool: draws a dimension) and Ruler (reads one, with Select underneath), as
// chips in the block editor's drafting bar (BlockDraftingBar.tsx). The project's Dimension and Ruler are the Tools strip's Annotations
// (views/tools/ToolStrip.tsx); the Program window covers the strip, so the block editor keeps its own. `plan`: the plan is on screen.
import { titleWith } from '../../../views/commands/shortcuts.ts'
import { ChipTrack, ToggleChip } from '../../../views/controls/ToggleChips.tsx'
import { RULER_HINT, TOOLS, useRuler, useTool } from '../../../views/plan/tools/toolState.ts'
import { toggle } from '../../../views/tools/hand.ts'

export function MeasureTools({ plan }: { plan: boolean }) {
  const tool = useTool((s) => s.tool)
  const ruler = useRuler((s) => s.active)
  // the plan's alone
  const off = !plan
  const why = ' · on the plan'
  return (
    <div role="group" aria-label="Measure" className={`flex shrink-0 items-center ${off ? 'opacity-50' : ''}`}>
      <ChipTrack>
        <ToggleChip
          pressed={tool === 'dimension' && !ruler && !off}
          disabled={off}
          title={`${TOOLS.find((t) => t.key === 'dimension')!.title}${off ? why : ''}`}
          onClick={() => toggle('dimension')}
        >
          Dimension
        </ToggleChip>
        <ToggleChip pressed={ruler && !off} disabled={off} title={`${titleWith(RULER_HINT, 'tool.ruler')}${off ? why : ''}`} onClick={() => toggle('ruler')}>
          Ruler
        </ToggleChip>
      </ChipTrack>
    </div>
  )
}
