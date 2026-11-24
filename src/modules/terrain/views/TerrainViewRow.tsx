// The terrain's look, in the drafting bar before the Detail (Decision "Bottom bar"; the user: "the terrain's view
// controls somewhere visible… this Terrain to the bottom bar, left of the Presentation drop-down"): what the ground shows (off · Contours · Slope · Cut & fill:
// Decisions "Terrain layout", "Platforms"). How many times the 3D draws its heights went to the Terrain section's Ground
// (TerrainSection.tsx; the user: "remove this button, put it in the site's options"). There once the site has ground
// (Decision "What is not there is not shown").
import { useModule } from '../../../views/modules.ts'
import { SHOW_SELECT } from '../../../views/show/ShowControls.tsx'
import { TERRAIN_SHOWS, useTerrainView, type TerrainShow } from './terrainView.ts'

export function TerrainViewRow() {
  const on = useModule('terrain').on
  const terrain = useTerrainView((s) => s.show)
  const setTerrain = useTerrainView((s) => s.setShow)
  if (!on) return null
  return (
    <div role="group" aria-label="Terrain view" data-tour="terrain-show" className="flex shrink-0 items-center gap-1.5">
      <select
        aria-label="Terrain"
        title={TERRAIN_SHOWS.find((t) => t.key === terrain)!.title}
        value={terrain}
        onChange={(e) => setTerrain(e.target.value as TerrainShow)}
        className={SHOW_SELECT}
      >
        {TERRAIN_SHOWS.map((t) => (
          <option key={t.key} value={t.key} disabled={t.off}>
            {t.label}
          </option>
        ))}
      </select>
    </div>
  )
}
