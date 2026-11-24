// A Warehouse program's tools, on top of the Program window (Decisions "Warehouse layout", "Warehouse by hand",
// "Program rule set layout"; they were the ribbon's while Warehouse was a workspace), drawn with the tool buttons: a
// new Warehouse program, or a copy of the one shown; the plan's Select (pick a zone, an edge or a hole, drag the
// handles), Hole (a court, Decision "Block shape") and Split (a zone in two, on a module line); Dock, Door and Pattern
// on a wall's modules, and Court in front of a wall (BE.4); Units, the block editor in metres or feet (BE.8). In the 3D view the plan's tools rest.
// Drawn in the docked bars' manner (GT.8; the spec: "the block editor matches"; the window's own bar, not the Tools strip): the docked bars' frame (`panel … px-2
// py-1`, DockedBar.tsx) and their separators between the groups; its tools as they were.
import { titleWith } from '../../../views/commands/shortcuts.ts'
import { Segmented } from '../../../views/controls/Segmented.tsx'
import { useUi } from '../../../views/layout/ui.ts'
import { Group, ToolButton } from '../../../views/tools/ToolButtons.tsx'
import { duplicateType, newType } from './commands.ts'
import { useModule } from '../../../views/modules.ts'
import { elementToolsFor } from './siteBlockState.ts'
import { useUnits, type LengthUnit } from './units.ts'
import { useCurrentType, useWarehouse } from './warehouseState.ts'
import { t as tr } from '../../../i18n/idioma.ts' // mixed-use-mvp

export function WarehouseTools() {
  const t = useCurrentType()
  const tool = useWarehouse((s) => s.tool)
  const setTool = useWarehouse((s) => s.setTool)
  const rest = useUi((s) => s.view === '3d') || !t
  const unit = useUnits((s) => s.unit)
  const setUnit = useUnits((s) => s.setUnit)
  // Dock and Court stand on docks: absent where the typology does not offer them
  const { offered: docks } = useModule('docks')
  return (
    <div role="group" aria-label="Warehouse tools" className="panel flex shrink-0 items-center gap-3 px-2 py-1">
      <Group caption="Type">
        <ToolButton icon="plus" label="New" title={tr("A new Warehouse program, its type every step open")} onClick={newType} />
        <ToolButton icon="duplicate" label="Duplicate" title={t ? `A copy of ${t.name}, a program of its own` : 'No type to copy'} disabled={!t} why onClick={() => t && duplicateType(t.id)} />
      </Group>
      <StripSeparator />
      <Group caption="Edit">
        <ToolButton icon="cursor" label="Select" title={tr("Pick a zone, an edge or a hole; drag a wall or a corner (onto a module line when near one, Shift free); double click a wall: its bay, to pull out or push in (Alt: a corner); double click a corner: removed (Esc)")} pressed={tool === 'select'} disabled={rest} onClick={() => setTool('select')} />
        <ToolButton icon="hole" label="Hole" title={tr("A hole through the block (a court): drag a rectangle inside the outline (its corners land on the module nodes when near them, Shift free)")} pressed={tool === 'hole'} disabled={rest} onClick={() => setTool(tool === 'hole' ? 'select' : 'hole')} />
        <ToolButton icon="split" label="Split" title={titleWith('A zone of the block in two, on the module line nearest the pointer; or a line from outside the block: the truck court it crosses is split', 'block.split')} pressed={tool === 'split'} disabled={rest} onClick={() => setTool(tool === 'split' ? 'select' : 'split')} />
      </Group>
      <StripSeparator />
      <Group caption="Elements">
        {elementToolsFor(docks).map((x) => (
          <ToolButton key={x.tool} icon={x.icon} label={x.label} title={x.title} pressed={tool === x.tool} disabled={rest} onClick={() => setTool(tool === x.tool ? 'select' : x.tool)} />
        ))}
      </Group>
      <StripSeparator />
      <Group caption="Units">
        <Segmented<LengthUnit>
          kind="toggle"
          label="Length unit"
          options={[
            { key: 'm', label: 'm', title: 'Metres: the block editor shows and takes lengths in metres' },
            { key: 'ft', label: 'ft', title: 'Feet: the block editor shows and takes lengths in decimal feet (the project stays in metres)' },
          ]}
          value={unit}
          onChange={setUnit}
        />
      </Group>
    </div>
  )
}

/** The strip's separator between two groups (the drafting bar's). */
const StripSeparator = () => <span aria-hidden data-separator="" className="h-5 w-px shrink-0 bg-separator" />
