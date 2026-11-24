// The ground under the site (Decision "Terrain", Phase E): the contours' heights (the designer's, the file's, or
// counted) and the surface through them and the points of the ground, its elevation and slope anywhere, its mean
// height over an area, and the platforms the masses stand on with their earthwork (Decision "Platforms"). Pure.
export { largestStep, steepestGround, steepUnder, terrainIssues } from './checks.ts'
export { gradedSurfaceOf } from './graded.ts'
export { heightsOf, neighboursOf, type HeightFrom, type Heights, type Neighbours } from './heights.ts'
export { meanHeight } from './over.ts'
export { bankBalancedLevel, cellMiddle, derivePlatforms, platformOfMass, platformRoot, stepsByMass } from './platforms.ts'
export { gradeRoad, gradeRoads, profileHeight, profileOf, ROAD_STEP } from './roads.ts'
export { samplesOf, spacingFor, type Samples } from './samples.ts'
export { smoothingOf } from './smooth.ts'
export { edgeOf, EDGE_STEP, withEdge } from './edge.ts'
export { surfaceFrom, surfaceOf, type Surface } from './surface.ts'
