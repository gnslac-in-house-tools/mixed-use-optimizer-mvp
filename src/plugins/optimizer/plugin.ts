// The optimizer plugin's manifest (Decisions "Optimizer plugin", "Stages layout"): Optimize, an action at the left
// rail's end (Decision "Areas rail"), opens *Stages* in the Parameters panel (the plan, where you are, the decision) and *Specimens*
// in the Summary panel (the run: its front, its specimens), which ⤢ stands wide under the viewport (the user: "the stages
// on the left, the genomes on the right, and it can still go bigger under the viewport"); a stage's parameters
// in a window of their own. Its tools for an agent run, follow and keep a run (Decision "Plugin tools"), and work the
// stages as the panel does (Decision "Stage tools").
import type { Plugin } from '../types.ts'
import { guide, tools } from './tools/index.ts'

// a front and the specimens moving onto it
const FRONT = 'M2.75 2.75c0 5.8 4.7 10.5 10.5 10.5M8.5 4.5h.01M11.5 7.5h.01M10.5 3.5h.01'

export const optimizer: Plugin = {
  id: 'optimizer',
  name: 'Optimizer',
  description: 'Multi-objective search over the design, in stages: each specimen you keep becomes a new option',
  tabs: [
    {
      id: 'stages',
      side: 'left',
      label: 'Stages',
      // the plan: stages down a line, seed to leaf
      icon: 'M4.75 2.75v10.5M4.75 4.25h.01M4.75 8h.01M4.75 11.75h.01M7.75 4.25h5.5M7.75 8h5.5M7.75 11.75h5.5',
      load: () => import('./views/StagesTab.tsx'),
    },
    {
      id: 'specimens',
      side: 'right',
      label: 'Specimens',
      // a scatter of specimens on two objectives
      icon: 'M2.75 2.75v10.5h10.5M5.5 10.25h.01M7.25 6.75h.01M9.75 9h.01M11.75 5h.01',
      load: () => import('./views/SpecimensTab.tsx'),
      // the scatter, the lines and the list side by side under the viewport (Decisions "Specimens tab", "Stages layout")
      wide: true,
    },
  ],
  windows: [{ id: 'stage', label: 'Stage', load: () => import('./views/StageWindow.tsx') }],
  actions: [
    {
      id: 'optimize',
      label: 'Optimize',
      title: 'The optimizer: its stages on the left, its specimens on the right (⤢: wide under the viewport; again: back to your tabs)',
      icon: FRONT,
      opens: { left: 'stages', right: 'specimens' },
      // a run's progress
      badge: () => import('./views/OptimizeBadge.tsx'),
    },
  ],
  tools,
  guide,
}
