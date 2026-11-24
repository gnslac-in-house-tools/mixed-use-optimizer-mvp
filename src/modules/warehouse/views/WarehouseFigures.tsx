// The warehouse type's figures (Decision "Warehouse layout"), the right panel of the Warehouse workspace: its size and
// bays, its area, its columns, its walls, its elements, and how many copies stand on the site. Read-only.
import { figuresOf } from '../engine/figures.ts'
import { useApp } from '../../../state/store.ts'
import { Section, Total } from '../../../views/controls/fields.tsx'
import { Note } from '../../../views/layout/Note.tsx'
import { useModule } from '../../../views/modules.ts'
import { baysInWords } from './summary.ts'
import { useLengths } from './units.ts'
import { useCurrentType, useGenerated } from './warehouseState.ts'
import { t as tr } from '../../../i18n/idioma.ts' // mixed-use-mvp

export function WarehouseFigures() {
  const t = useCurrentType()
  const g = useGenerated(t)
  const copies = useApp((s) => (t ? s.project.buildings.filter((b) => b.warehouse?.type === t.id).length : 0))
  const { on } = useModule('warehouse')
  const { num, unit, whole, area } = useLengths()
  if (!on) return null
  if (!t || !g) return <p className="text-body text-ink-secondary">{tr("No warehouse type yet.")}</p>
  const f = figuresOf(g)
  return (
    <div className="flex flex-col gap-6" data-warehouse-figures>
      <Section title={t.name}>
        <dl className="flex flex-col gap-1.5">
          <Total label="Size" value={`${num(f.length)} × ${num(f.width)} ${unit}`} />
          <Total label="Bays" value={`${f.bays.x} × ${f.bays.y}`} />
          <Total label="Footprint" value={area(f.area)} />
          <Total label="Copies on the site" value={String(copies)} />
        </dl>
        <Note className="text-caption text-ink-tertiary">
          Along the length: {baysInWords(g.runs.x, unit)}. Along the width: {baysInWords(g.runs.y, unit)}.
        </Note>
      </Section>
      <Section title="Structure and envelope">
        <dl className="flex flex-col gap-1.5">
          <Total label="Columns" value={String(f.columns)} />
          <Total label="Wall" value={whole(f.wallLength)} />
          <Total label="Wall area" value={area(f.wallArea)} />
        </dl>
      </Section>
      <Section title="Shape and elements">
        <dl className="flex flex-col gap-1.5">
          <Total label="Edges" value={String(f.edges)} />
          <Total label="Holes" value={String(f.holes)} />
          <Total label="Docks" value={String(f.docks)} />
          <Total label="Level doors" value={String(f.doors)} />
          <Total label="Pattern marks" value={String(f.marks)} />
        </dl>
      </Section>
    </div>
  )
}
