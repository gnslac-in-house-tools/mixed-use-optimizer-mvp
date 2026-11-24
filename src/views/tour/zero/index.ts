// From zero (spec docs/superpowers/specs/2026-11-10-from-zero-tutorial-design.md): the second tutorial's steps, a
// project built from an empty one to a DXF, chapter by chapter (one file each).
import { showToolsFor } from '../anchors.ts'
import type { TourStep } from '../tour.ts'
import { BLOCK_STEPS } from './block.ts'
import { EARTHWORK_STEPS } from './earthwork.ts'
import { FLOW_STEPS } from './flow.ts'
import { MOVING_STEPS } from './moving.ts'
import { ON_SITE_STEPS } from './onSite.ts'
import { PROJECT_STEPS } from './project.ts'
import { SITE_STEPS } from './site.ts'

// a step that points at a tool shows the Tools strip first (tour/anchors.ts)
export const ZERO_STEPS: TourStep[] = showToolsFor([...PROJECT_STEPS, ...SITE_STEPS, ...BLOCK_STEPS, ...ON_SITE_STEPS, ...MOVING_STEPS, ...FLOW_STEPS, ...EARTHWORK_STEPS])
