// A building's settings (Decisions "Buildings panel", "Workspace layout"; Phase AS.3: of the building it is given, the active one's
// with nothing picked or any building's row picked in Layers): name, colour, *Context*, level
// height, its levels, its bays while the option stands on a grid (Phase G.2b, BuildingGridSection.tsx), its platform while
// the site has ground (Decision "Platforms") and its actions. On a wide screen they are in Properties when nothing is selected, as Revit's
// Properties shows the view's when nothing is picked (the tree's building menu has *Properties*, which opens them);
// below 880 px, where Properties is a card over the viewport, they stay in the Buildings tab under the tree.
import { BUILDING_COLORS } from '../../model/buildingColors.ts'
import type { Building } from '../../model/schema.ts'
import { useApp } from '../../state/store.ts'
import { Button, NumberField, TextField } from '../controls/fields.tsx'
import { BuildingGridSection } from './BuildingGridSection.tsx'
import { BuildingLevels } from './BuildingLevels.tsx'
import { Lockable } from './Lockable.tsx'
import { PlatformSection } from '../../modules/terrain/views/PlatformSection.tsx'
import { PropiedadesResidencial } from '../../modules/residential/views/PropiedadesResidencial.tsx' // mixed-use-mvp
import {
  deleteBuilding,
  makeUnique,
  optionsShowing,
  removeFromOption,
  updateBuilding,
  whyNotDelete,
  whyNotRemoveFromOption,
} from './buildingCommands.ts'

/**
 * The settings of the building it is given (never "the active one": Layers picks any building's row). `heading`: Properties names
 * the building in its header (a headline, with nothing picked); the Buildings tab under a small title; `none`, the caller has
 * written the header (Properties of a building's or a level's row in Layers).
 */
export function BuildingProperties({ building: b, heading }: { building: Building; heading: 'properties' | 'tab' | 'none' }) {
  const project = useApp((s) => s.project)
  const optionId = useApp((s) => s.option)
  const option = project.options.find((o) => o.id === optionId)
  const linked = optionsShowing(project, b.id).length > 1
  const notRemove = whyNotRemoveFromOption(project, optionId, b)
  const notDelete = whyNotDelete(project, b)

  return (
    <section aria-label={heading === 'none' ? `Building ${b.name}` : 'Active building'} className="flex flex-col gap-3">
      {heading === 'none' ? null : heading === 'properties' ? (
        <div className="flex flex-col gap-0.5">
          <div className="flex min-w-0 items-center gap-2">
            <span aria-hidden className="h-3 w-3 shrink-0 rounded-pill" style={{ background: b.color }} />
            <span className="truncate text-headline">{b.name}</span>
          </div>
          <span className="text-caption text-ink-secondary">
            The active building{option ? ` in ${option.name}` : ''}. Select a mass or a dimension to see it here instead.
          </span>
        </div>
      ) : (
        <h2 className="text-label text-ink-secondary">Active building</h2>
      )}
      {/* a locked building (the padlock is CAD's: Layers' row takes it off) holds its name, colour, levels, grid and platform, and every mass in it: read-only, with the reason */}
      <Lockable locked={b.locked === true} muted="text-ink-secondary">
        {/* key: another building's name, not this one's draft */}
        <TextField key={b.id} label="Name" value={b.name} onCommit={(v) => updateBuilding(b.id, { name: v })} />
        <div className="flex items-center justify-between gap-3">
          <span className="text-label text-ink-secondary">Colour</span>
          <div role="radiogroup" aria-label="Colour" className="flex flex-wrap justify-end gap-1">
            {BUILDING_COLORS.map((c, i) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={b.color === c}
                aria-label={`Colour ${i + 1}`}
                onClick={() => updateBuilding(b.id, { color: c })}
                className={`pressable h-4 w-4 rounded-pill ${b.color === c ? 'ring-2 ring-ink ring-offset-1 ring-offset-panel' : ''}`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
        <label className="flex items-start justify-between gap-3" title="Drawn grey, left out of the KPIs, the Summary and its own checks">
          <span className="flex flex-col">
            <span className="text-label text-ink-secondary">Context</span>
            <span className="text-caption text-ink-tertiary">Surroundings: drawn, not counted</span>
          </span>
          <input type="checkbox" className="mt-1 h-4 w-4 accent-ink" checked={b.context === true} onChange={(e) => updateBuilding(b.id, { context: e.target.checked })} />
        </label>
        <NumberField key={`${b.id}-h`} label="Level height" unit="m" min={0.5} value={b.levelHeight} onCommit={(v) => updateBuilding(b.id, { levelHeight: v })} />
        <BuildingLevels building={b} />
        <BuildingGridSection building={b} />
        <PlatformSection building={b} />
        <PropiedadesResidencial buildingId={b.id} />
        <div className="flex flex-wrap gap-2">
          {linked && option && (
            <Button title={`${option.name} gets its own copy; the other options keep this one`} onClick={() => makeUnique(b)}>
              Make unique in {option.name}
            </Button>
          )}
          {/* in no other option, taking it out would delete it: Delete is that (Decision "No loose buildings") */}
          {linked && option && (
            <Button title={notRemove ?? `${option.name} stops showing it; it stays in the other options`} disabled={notRemove !== null} onClick={() => removeFromOption(b)}>
              Remove from {option.name}
            </Button>
          )}
          <Button title={notDelete ?? `Delete ${b.name}, its levels and masses, from every option`} disabled={notDelete !== null} onClick={() => deleteBuilding(b)}>
            Delete
          </Button>
        </div>
      </Lockable>
    </section>
  )
}
