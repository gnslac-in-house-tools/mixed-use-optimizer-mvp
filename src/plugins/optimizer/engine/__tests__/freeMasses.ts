// The masses' template as it was before Phase D.2, for the tests of the kinds that act on a plain mass (`mass.proportion`: a free rect's width at
// its area). The typology's MASSES template now varies each block's box (`warehouse.hall`) instead, since no building a view or a file makes is a
// plain mass; the engine still holds the kind, and these tests keep it honest on the demo's plain masses.
import { MASSES as PLAN } from '../../../../typologies/plans.ts'
import type { Template } from '../template.ts'

export const MASSES: Template = {
  ...PLAN,
  variables: [
    { kind: 'mass.position', step: 1 },
    { kind: 'mass.rotation', step: 15 },
    { kind: 'mass.proportion', step: 1 },
  ],
}
