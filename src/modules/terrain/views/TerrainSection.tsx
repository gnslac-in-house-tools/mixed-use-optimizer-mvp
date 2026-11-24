// The Terrain section of Properties (the Terrain row of Layers; it was the Site tab's) (Decision "Terrain layout"), after Site rules: what the ground is (the file and its
// layers, how many contours and where their heights come from, the points, the range of heights, the interval) and
// *Remove terrain* (one undo step); *Ground*, as triangulated or smoothed (the default; Decision "Terrain smoothing");
// *3D heights*, how many times the 3D draws them (the viewer's, Decision "Vertical exaggeration"; it left the drafting bar);
// the platforms' parameters (Decision "Platforms"): how far a court stands below its
// platform (the standards' dock height), how far a building's platforms may differ (*Max. step*, E.4a), the banks'
// run over rise at the platforms' edges (*Banks 1 :* n, E.5).
import { standardsOf } from '../../../engine/circulation/standards.ts'
import { heightsOf, smoothingOf } from '../engine/index.ts'
import { actions } from '../../../state/actions/index.ts'
import { useApp } from '../../../state/store.ts'
import { Button, NumberField, Section, Total } from '../../../views/controls/fields.tsx'
import { Segmented } from '../../../views/controls/Segmented.tsx'
import { heightText } from './terrainDraw.ts'
import { EXAGGERATIONS, useTerrainView } from './terrainView.ts'
import { t as tr } from '../../../i18n/idioma.ts' // mixed-use-mvp

export function TerrainSection() {
  const terrain = useApp((s) => s.project.site.terrain)
  const standards = useApp((s) => s.project.standards)
  const apply = useApp((s) => s.apply)
  const exaggeration = useTerrainView((s) => s.exaggeration)
  const setExaggeration = useTerrainView((s) => s.setExaggeration)
  const shown = useTerrainView((s) => s.show !== 'off')
  if (!terrain)
    return (
      <Section title="Terrain">
        <p className="select-text text-caption text-ink-secondary">No ground yet: Import a DXF or a CSV with its contours or points (Site › Import).</p>
      </Section>
    )
  const h = heightsOf(terrain)
  const count = (from: string | null) => h.from.filter((f) => f === from).length
  const known = [...h.z.filter((z): z is number => z !== null), ...terrain.points.map((p) => p.z)]
  const low = known.reduce((a, z) => Math.min(a, z), Infinity)
  const high = known.reduce((a, z) => Math.max(a, z), -Infinity)
  const from = [
    count('file') ? `${count('file')} from the file` : '',
    count('given') ? `${count('given')} given` : '',
    count('counted') ? `${count('counted')} counted` : '',
    count(null) ? `${count(null)} without a height` : '',
  ].filter(Boolean)
  return (
    <Section title="Terrain">
      <dl aria-label="Terrain figures" className="flex flex-col gap-1.5">
        {terrain.source && <Total label="File" value={terrain.source.file} />}
        <Total label="Contours" value={terrain.contours.length.toLocaleString('en-US')} />
        <Total label="Points" value={terrain.points.length.toLocaleString('en-US')} />
        <Total label="Heights" value={known.length ? `${heightText(low)}–${heightText(high)} m` : '—'} />
        <Total label="Interval" value={h.interval !== null ? `${heightText(h.interval)} m` : '—'} />
      </dl>
      {terrain.source && terrain.source.layers.length > 0 && (
        <p className="select-text text-caption text-ink-secondary">
          Layers: {terrain.source.layers.join(', ')}
        </p>
      )}
      {from.length > 0 && (
        <p className="select-text text-caption text-ink-secondary">
          Contours’ heights: {from.join(' · ')}
          {count(null) ? ` (Heights gives ${count(null) === 1 ? 'it' : 'them'} one)` : ''}.
        </p>
      )}
      {terrain.contours.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-caption text-ink-secondary">{tr("Ground")}</span>
          <Segmented
          kind="toggle"
          label="Ground"
          stretch
          value={smoothingOf(terrain)}
          options={[
            { key: 'off', label: 'As triangulated', title: 'Straight through the contours: where one bends, its flat triangles make terraces' },
            { key: 'surface', label: 'Smoothed', title: 'The flat triangles where a contour bends lifted or lowered towards the ground round them; the contours and points keep their heights' },
          ]}
          onChange={(k) => apply((p) => actions.setTerrainSmoothing(p, k))}
          />
        </div>
      )}
      <div className="flex flex-col gap-1">
        <span className="text-caption text-ink-secondary">3D heights</span>
        <Segmented
          kind="toggle"
          label="Vertical exaggeration"
          stretch
          value={String(exaggeration)}
          options={EXAGGERATIONS.map((k) => ({
            key: String(k),
            label: `×${k}`,
            disabled: !shown,
            title: shown ? (k === 1 ? 'As they are' : `The ground’s heights drawn ${k} times in the 3D (the platforms and what lies on them follow; the buildings keep their heights)`) : 'The terrain is hidden (Terrain, in the drafting bar)',
          }))}
          onChange={(k) => setExaggeration(Number(k))}
        />
      </div>
      <NumberField
        label="Court below its platform"
        unit="m"
        min={0}
        max={5}
        value={standardsOf({ standards }).dockHeight}
        onCommit={(v) => apply((p) => actions.updateStandards(p, { dockHeight: v }))}
      />
      <NumberField
        label="Max. step"
        unit="m"
        min={0.1}
        max={20}
        value={standardsOf({ standards }).maxStep}
        onCommit={(v) => apply((p) => actions.updateStandards(p, { maxStep: v }))}
      />
      <NumberField
        label="Banks 1 :"
        min={0.1}
        max={10}
        value={standardsOf({ standards }).bankRatio}
        onCommit={(v) => apply((p) => actions.updateStandards(p, { bankRatio: v }))}
      />
      <NumberField
        label="Max. road grade"
        unit="%"
        min={1}
        max={30}
        value={standardsOf({ standards }).maxGrade * 100}
        onCommit={(v) => apply((p) => actions.updateStandards(p, { maxGrade: v / 100 }))}
      />
      <div>
        <Button title="Remove the ground from the site (undo brings it back)" onClick={() => apply((p) => actions.setTerrain(p, null))}>
          {tr("Remove terrain")}
        </Button>
      </div>
    </Section>
  )
}
