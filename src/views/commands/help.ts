// The Help menu's commands (Project C, AS.1): Help (the notes and the guide, F1 and the ? key), Learn GFit from zero, Sample
// tour, About, State graph (development only). The tours and About answer on Home too. Each `run` calls what the control
// it stands for calls (`toggleHelp`, the tours' starts, Home's About, the State graph window).
import { openAbout, startSampleTour } from '../layout/files.ts'
import { openStateGraph } from '../layout/stateGraph.ts'
import { toggleHelp } from '../layout/ui.ts'
import { startZero } from '../tour/zero/run.ts'
import { register } from './registry.ts'
import type { Command } from './types.ts'

const HELP = ['Help']

export const HELP_COMMANDS: Command[] = [
  { id: 'help.help', label: 'Help', menu: HELP, key: ['F1', '?'], where: ['project', 'home', 'block-editor'], run: toggleHelp },
  { id: 'help.zero', label: 'Learn GFit from zero', menu: HELP, where: ['project', 'home'], run: () => startZero() },
  { id: 'help.tour', label: 'Sample tour', menu: HELP, where: ['project', 'home'], run: startSampleTour },
  { id: 'help.about', label: 'About', menu: HELP, where: ['project', 'home'], run: openAbout },
  { id: 'help.state-graph', label: 'State graph', menu: HELP, where: ['project', 'home'], dev: true, separatorBefore: true, run: openStateGraph },
]

export function registerHelp(): void {
  register(HELP_COMMANDS)
}
