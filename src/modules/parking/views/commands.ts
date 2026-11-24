// The parking module's tool as a command (Project C, AS.1): Lot, a parking lot against a wall or free (Decision "Lot tool").
// Tools › Parking lists it while the typology offers parking (views/commands/index.ts). The command takes the tool, as its key
// does, whatever panel tab is open; it rests in the 3D and with Compare open, as the strip's button does.
import type { Command } from '../../../views/commands/types.ts'
import { TOOLS as PLAN_TOOLS } from '../../../views/plan/tools/toolState.ts'
import { inHand, toggle } from '../../../views/tools/hand.ts'
import { planToolsRefusal } from '../../../views/tools/pickTool.ts'

export const COMMANDS: Command[] = [
  {
    id: 'tool.lot',
    label: 'Lot',
    menu: ['Tools', 'Parking'],
    key: 'P',
    tool: { group: 'parking', icon: 'parking', hint: PLAN_TOOLS.find((t) => t.key === 'lot')!.hint },
    run: () => toggle('lot'),
    enabled: planToolsRefusal,
    checked: () => inHand('lot'),
  },
]
