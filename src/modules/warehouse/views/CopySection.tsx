// A warehouse copy in Properties (Decision "Warehouse layout": "picked, Properties says Copy of Warehouse A and lets a
// figure be overridden: it reads Variant; Back to type takes the overrides away"): its type, the figures a copy may
// change (the hall's length and width, its height), each as the copy has it, and the type's beside it once changed
// (its docks are its block's, one a module: Decision "Elements by module"); Back to type, and Open type (the Warehouse
// step on it). Its shape is its type's: it moves and turns on the plan, its walls free, the module lines a snap (Decision "Block shape").
// Its own docks (Decision "Blocks on the site") never silent: the note says it no longer follows its type's.
import type { Id, OutlineCorner, WarehouseOverrides, WarehouseType } from '../../../model/schema.ts'
import { hallRuns, typeWith } from '../engine/generate.ts'
import { shapeNow } from '../engine/shape.ts'
import { useApp } from '../../../state/store.ts'
import { Button, Section } from '../../../views/controls/fields.tsx'
import { Note } from '../../../views/layout/Note.tsx'
import { useModule } from '../../../views/modules.ts'
import { backToType, openType, setOverrides } from './commands.ts'
import { LengthField } from './LengthField.tsx'
import { useLengths } from './units.ts'
import { t as tr } from '../../../i18n/idioma.ts' // mixed-use-mvp

/** The figures a copy may change, how they read and write its overrides. */
const FIGURES: {
  key: string
  label: string
  min: number
  read(t: WarehouseType): number | null
  write(o: WarehouseOverrides, t: WarehouseType, v: number | null): WarehouseOverrides
}[] = [
  {
    key: 'length',
    label: 'Length',
    min: 1,
    read: (t) => t.hall.length,
    write: (o, _t, v) => ({ ...o, hall: { ...o.hall, length: v ?? undefined } }),
  },
  {
    key: 'width',
    label: 'Width',
    min: 1,
    read: (t) => t.hall.width,
    write: (o, _t, v) => ({ ...o, hall: { ...o.hall, width: v ?? undefined } }),
  },
  {
    key: 'height',
    label: 'Height',
    min: 1,
    read: (t) => t.envelope.height,
    write: (o, _t, v) => ({ ...o, envelope: { ...o.envelope, height: v ?? undefined } }),
  },
]

/** Overrides without the keys left empty: nothing for a step that changes nothing. */
function clean(o: WarehouseOverrides): WarehouseOverrides {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined) continue
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const inner = Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined))
      if (Object.keys(inner).length) out[k] = inner
    } else out[k] = v
  }
  return out as WarehouseOverrides
}

/** Whether a copy's own outline is other than its type's drawn on its box (one its own docks came with is not). */
function moved(t: WarehouseType, o: WarehouseOverrides): boolean {
  const { morphology: _, elements: __, courts: ___, ...rest } = o
  const plain = typeWith(t, rest)
  const key = (c: OutlineCorner[] = []) => JSON.stringify(c.map((k) => [k.id, Math.round(k.x * 1e6), Math.round(k.y * 1e6), k.thickness ?? null, k.offset ?? null]))
  return key(o.morphology?.outline) !== key(shapeNow(plain, hallRuns(plain)).outline)
}

export function CopySection({ buildingId }: { buildingId: Id }) {
  const { text } = useLengths()
  const building = useApp((s) => s.project.buildings.find((b) => b.id === buildingId))
  const type = useApp((s) => s.project.warehouseTypes?.find((t) => t.id === building?.warehouse?.type))
  // its hall's own court depths (`Mass.courts`, the pill's): Back to type takes them away too
  const depths = useApp((s) => {
    const levels = new Set(building?.levels.map((l) => l.id))
    return s.project.masses.some((m) => levels.has(m.levelId) && m.part === 'hall' && !!m.courts?.length)
  })
  const { on } = useModule('warehouse')
  if (!on || !building?.warehouse || !type) return null
  const o = building.warehouse.overrides ?? {}
  const variant = Object.keys(o).length > 0
  const mine = typeWith(type, o)
  const figures = [
    ...FIGURES.filter((f) => f.read(mine) !== f.read(type)).map((f) => `${f.label}: ${text(f.read(type) ?? 0)} in the type`),
    // its own outline (Decision "Block shape"): its inner walls moved in this copy, not the one its own docks came with
    ...(o.morphology?.outline && moved(type, o) ? ['its inner walls moved'] : []),
  ].join(' · ')
  return (
    <Section title={variant ? `Variant of ${type.name}` : `Copy of ${type.name}`}>
      <div data-copy={buildingId} className="grid grid-cols-2 gap-x-4 gap-y-2">
        {FIGURES.map((f) => {
          const v = f.read(mine)
          const typeValue = f.read(type)
          if (v === null && typeValue === null) return null
          return (
            <LengthField
              key={f.key}
              narrow
              label={f.label}
              min={f.min}
              value={v}
              onCommit={(x) => {
                // the type's own value takes the override away
                setOverrides(buildingId, clean(f.write(o, type, x === typeValue ? null : x)))
              }}
            />
          )
        })}
      </div>
      {variant && figures && <p className="select-text text-caption text-ink-tertiary">{figures}</p>}
      {/* its own docks bring its shape and courts with them (one bundle, Decision "Elements by module"): never silent */}
      {o.elements ? (
        <>
          <p className="select-text text-caption text-ink-tertiary">{tr("Own docks: doesn't follow its type")}</p>
          <p className="select-text text-caption text-ink-tertiary">{tr("Its outline, holes, zones and courts stay as they are too, until Back to type")}</p>
        </>
      ) : (
        o.courts && <p className="select-text text-caption text-ink-tertiary">{tr("Own courts")}</p>
      )}
      <div className="flex gap-2">
        <Button tour="back-to-type" disabled={!variant && !depths} title="Its figures, its docks and its courts as its type's again" onClick={() => backToType(buildingId)}>
          {tr("Back to type")}
        </Button>
        <Button title={`The Program window, on ${type.name}`} onClick={() => openType(type.id)}>
          {tr("Open type")}
        </Button>
      </div>
      <Note className="text-caption text-ink-tertiary">{tr("Its shape is its type’s: move it and turn it on the plan. Its walls and corners are free, onto its module lines when you drag near them (Shift: free): the box’s past its range too (an Issue says so; the optimizer keeps to it), the others this copy’s own.")}</Note>
    </Section>
  )
}
