// What is selected, to see and edit (IZA's SelectionCard pattern; frame ported from Plaza-Practiko
// `vistas/paneles/TarjetaSeleccion.tsx`): a mass (its program, its size and, with a corner picked, that corner),
// several masses (Decision "Multi-selection": the values they share, — where they differ; an edit goes to all of
// them) or a dimension (its length, which moves the geometry, its offset and its ends). Each has a lock in its header (Decision
// "Locks, typed measures, levels"). Every field sends a pure action through store.apply (one undo step each).
// The padlock is CAD's (Phase AS.3): a locked mass is reached from its row in a tree alone, and every field of it is disabled
// with its reason as the title, all but the padlock, which unlocks it; with several, one locked, the fields that would change
// a locked one are disabled and the padlock reads Unlock. A dimension's lock is another thing: it fixes its length (moving
// one of its masses drags the other), and its header says *Fixed length*.
// Decisions "Layout by function", "Properties in the panel" and "Workspace layout":
//   panel → the left panel's Properties tab (Layers · Blocks · Properties; a wide screen); nothing selected, the active building's settings,
//           as Revit's Properties shows the view's when nothing is picked
//   glass → a card over the viewport, where the panels are sheets (below 880 px); nothing selected, no card
// In the Graph workspace a picked rule or relation shows here too (Decision "Graph mode"; graph/RuleProperties.tsx).
// A road, a gate, an existing road or a parking lot (Decision "Lot tool") picked on the plan or in Layers shows here too,
// in every step (Decision "Steps change the tools"). What is picked comes through the bridge (`plan/mix.ts`: `usePickedRefs`), whichever store holds it; a locked
// street, lot or gate shows its fields read-only with the reason (`Lockable`).
// A row of Layers picked (Phase AS.3, Decision "Settings by what is picked"; layers/LayerProperties.tsx): the settings of what the row
// is, in the panel; the card over the viewport shows nothing for a row. The objects picked through their own stores keep their branches.
// Compact (Decision "Compact Properties"; the user: "compact the Properties panel"): a mass's measures two by two, its
// building, level and area on one row, its actions a row of icons (each named in its tooltip).
import { useMemo, type ReactNode } from 'react'
import { runCommand } from '../commands/index.ts'
import { titleWith } from '../commands/shortcuts.ts'
import type { IconName } from '../controls/Icon.tsx'
import { massIsLocked } from '../../kinds/locked.ts'
import type { DimensionAnchor, Footprint, Id } from '../../model/schema.ts'
import { maxRadius, turnAt } from '../../engine/geom/contour.ts'
import { buildingOf, buildingOfLevel } from '../../engine/buildings.ts'
import { levelOf, massHeight } from '../../engine/levels.ts'
import { actions } from '../../state/actions/index.ts'
import { useApp } from '../../state/store.ts'
import { useRenameField } from '../editing/rename.ts'
import { removeShapeCorner, setShapeRadius } from '../editing/shape/shapeState.ts'
import { Button, NumberField, Section, SelectField, TextField } from '../controls/fields.tsx'
import { Icon } from '../controls/Icon.tsx'
import { m2 } from '../format.ts'
import { duplicateSelection } from '../plan/clipboard.ts'
import { typeDimensionLength } from '../plan/dimensions/typeLength.ts'
import { letGoKind, usePickedRefs } from '../plan/mix.ts'
import { LOCKED_TITLE } from '../layers/locks.ts'
import { RelationProperties, RuleProperties } from '../graph/RuleProperties.tsx'
import { useGraph } from '../graph/graphState.ts'
import { BuildingProperties } from './BuildingProperties.tsx'
import { Note } from '../layout/Note.tsx'
import { DockSection } from '../../modules/docks/views/DockSection.tsx'
import { CopySection } from '../../modules/warehouse/views/CopySection.tsx'
import { HoleSection } from './HoleSection.tsx'
import { NoteProperties } from './NoteProperties.tsx'
import { ReferenceLineProperties } from './ReferenceLineProperties.tsx'
import { RoadProperties } from './RoadProperties.tsx'
import { GateProperties } from './AccessSection.tsx'
import { ExistingRoadProperties } from './ExistingRoadProperties.tsx'
import { LayerProperties, useLayerRowPicked } from '../layers/LayerProperties.tsx'
import { LotProperties } from '../../modules/parking/views/LotProperties.tsx'
import { t as tr } from '../../i18n/idioma.ts' // mixed-use-mvp

export function Properties({ surface }: { surface: 'panel' | 'glass' }) {
  // what is picked, of any kind, through the bridge: the first of each kind is the one shown (the masses: one, or several together)
  const picked = usePickedRefs()
  const first = (kind: string): string | null => picked.find((r) => r.kind === kind)?.id ?? null
  const masses = picked.filter((r) => r.kind === 'mass')
  const massId = masses.length === 1 ? masses[0].id : null
  const several = masses.length > 1
  const dimId = first('dimension')
  const building = useApp((s) => buildingOfLevel(s.project, s.level))
  const pickedRule = useGraph((s) => s.rule)
  const pickedRelation = useGraph((s) => s.relation)
  const ruleId = useApp((s) => (s.project.rules?.some((r) => r.id === pickedRule) ? pickedRule : null))
  const relationId = useApp((s) => (s.derived.relations.some((r) => r.id === pickedRelation) ? pickedRelation : null))
  // a road picked on the plan (Decision "Exterior circulation")
  const roadId = first('street')
  const gateId = first('gate')
  const existingId = first('existing-road')
  const rowPicked = useLayerRowPicked()
  const lotId = first('lot')
  const guideId = first('reference-line')
  const noteId = first('note')
  const glass = surface === 'glass'
  // secondary text: on glass it needs the darker glass ink, over whatever colour is behind
  const muted = glass ? 'text-ink-glass' : 'text-ink-secondary'
  const frame = (child: ReactNode) => (
    <div
      role="region"
      aria-label="Properties"
      className={
        glass
          ? 'glass pointer-events-auto flex max-h-[calc(100dvh-180px)] w-72 flex-col gap-3 overflow-y-auto overscroll-contain p-4 phone:max-h-[45dvh] phone:w-auto'
          : 'flex flex-col gap-3'
      }
    >
      {child}
    </div>
  )

  if (rowPicked && !glass && massId === null && dimId === null && !several) return frame(<LayerProperties muted={muted} />)
  if (gateId !== null && massId === null && dimId === null && !several) return frame(<GateProperties id={gateId} muted={muted} />)
  if (existingId !== null && massId === null && dimId === null && !several) return frame(<ExistingRoadProperties id={existingId} muted={muted} answersRename={!glass} />)
  if (lotId !== null && massId === null && dimId === null && !several) return frame(<LotProperties id={lotId} muted={muted} answersRename={!glass} />)
  if (guideId !== null && massId === null && dimId === null && !several) return frame(<ReferenceLineProperties id={guideId} muted={muted} />)
  // a note's text is its name: its field answers Rename here (the card over the viewport leaves it to the panel's)
  if (noteId !== null && massId === null && dimId === null && !several) return frame(<NoteProperties id={noteId} muted={muted} answersRename={!glass} />)

  if ((relationId !== null || ruleId !== null) && massId === null && !several)
    return (
      <div
        role="region"
        aria-label="Properties"
        className={
          glass
            ? 'glass pointer-events-auto flex max-h-[calc(100dvh-180px)] w-72 flex-col gap-3 overflow-y-auto overscroll-contain p-4 phone:max-h-[45dvh] phone:w-auto'
            : 'flex flex-col gap-3'
        }
      >
        {ruleId !== null ? <RuleProperties id={ruleId} muted={muted} /> : <RelationProperties id={relationId!} muted={muted} />}
      </div>
    )

  if (roadId !== null && massId === null && dimId === null && !several)
    return (
      <div
        role="region"
        aria-label="Properties"
        className={
          glass
            ? 'glass pointer-events-auto flex max-h-[calc(100dvh-180px)] w-72 flex-col gap-3 overflow-y-auto overscroll-contain p-4 phone:max-h-[45dvh] phone:w-auto'
            : 'flex flex-col gap-3'
        }
      >
        <RoadProperties id={roadId} muted={muted} />
      </div>
    )

  if (massId === null && dimId === null && !several) {
    if (glass) return null
    // the panel's header says Properties (Decision "Properties in the panel")
    return (
      <div role="region" aria-label="Properties" className="flex flex-col gap-2">
        {building ? (
          <BuildingProperties building={building} heading="properties" />
        ) : (
          <p className="select-text text-caption text-ink-secondary">{tr("Select a mass or a dimension to see and edit it here.")}</p>
        )}
      </div>
    )
  }
  return (
    <div
      role="region"
      aria-label="Properties"
      className={
        glass
          ? 'glass pointer-events-auto flex max-h-[calc(100dvh-180px)] w-72 flex-col gap-3 overflow-y-auto overscroll-contain p-4 phone:max-h-[45dvh] phone:w-auto'
          : 'flex flex-col gap-3'
      }
    >
      {several ? (
        <GroupProperties muted={muted} />
      ) : massId !== null ? (
        <MassProperties id={massId} muted={muted} answersRename={!glass} />
      ) : (
        <DimensionProperties id={dimId!} muted={muted} />
      )}
    </div>
  )
}

/**
 * The name with its sign, the lock and ×, which lets go of the selection. The lock of a mass is the padlock (`what`: the name
 * in its label and title); a dimension's is its fixed length, so it says `lock`: its own label and the title for each state.
 */
function Header(props: {
  sign: ReactNode
  title: string
  what: string
  locked: boolean
  onLock(): void
  onClear(): void
  muted: string
  lock?: { label: string; on: string; off: string }
}) {
  const { locked, muted } = props
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        {props.sign}
        <span className="truncate text-headline">{props.title}</span>
      </div>
      <div className="-mr-1 -mt-0.5 flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          aria-label={props.lock?.label ?? `Lock ${props.what}`}
          aria-pressed={locked}
          title={props.lock ? (locked ? props.lock.on : props.lock.off) : locked ? `Locked: unlock the ${props.what} to change it` : `Lock the ${props.what}`}
          className={`pressable grid h-6 w-6 place-items-center rounded-pill ${locked ? 'bg-fill text-ink' : `hover:bg-hover hover:text-ink ${muted}`}`}
          onClick={props.onLock}
        >
          <Icon name={locked ? 'lock' : 'unlock'} className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="Clear selection"
          title="Clear selection (Esc)"
          className={`pressable grid h-6 w-6 place-items-center rounded-pill hover:bg-hover hover:text-ink ${muted}`}
          onClick={props.onClear}
        >
          <Icon name="close" className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

function MassProperties({ id, muted, answersRename }: { id: Id; muted: string; answersRename: boolean }) {
  const vertex = useApp((s) => s.selection.vertex)
  const mass = useApp((s) => s.project.masses.find((m) => m.id === id))
  const height = useApp((s) => {
    const m = s.project.masses.find((x) => x.id === id)
    return m ? massHeight(s.project, m) : 0
  })
  const area = useApp((s) => s.derived.masses[id]?.area)
  const levelName = useApp((s) => {
    const m = s.project.masses.find((x) => x.id === id)
    return m ? levelOf(s.project, m).name : ''
  })
  // its building, as text: assigning is Layers' (the Buildings branch; Decision "Buildings layout")
  const buildingName = useApp((s) => {
    const m = s.project.masses.find((x) => x.id === id)
    return m ? buildingOf(s.project, m).name : ''
  })
  // a warehouse copy's mass (Decision "Warehouse copies"): its figures are its type's, its overrides in its own section
  const copyOf = useApp((s) => {
    const m = s.project.masses.find((x) => x.id === id)
    const b = m?.part !== undefined ? buildingOf(s.project, m) : null
    return b?.warehouse ? b.id : null
  })
  const programs = useApp((s) => s.project.programs)
  const locked = useApp((s) => {
    const m = s.project.masses.find((x) => x.id === id)
    return m !== undefined && massIsLocked(s.project, m)
  })
  const apply = useApp((s) => s.apply)
  const select = useApp((s) => s.select)
  // Rename (F2, the menu): the name field takes the focus with its text selected (the panel's; the card over the viewport leaves it)
  const nameField = useRenameField('mass', id, answersRename)
  if (!mass) return null
  const program = programs.find((p) => p.id === mass.programId)
  // a locked mass is not changed (the padlock is CAD's): its fields say why, as their title
  const why = locked ? LOCKED_TITLE : undefined
  const f = mass.footprint
  // port of Practiko's duplicarMasa: the copy is selected, and the plan goes to its level
  const copyToLevel = (direction: 1 | -1) => {
    let copy: Id | null = null
    apply((p) => {
      const r = actions.copyMassToLevel(p, id, direction)
      copy = r?.id ?? null
      return r?.project ?? p
    })
    if (copy) select(copy)
  }
  const setRect = (patch: Partial<Extract<Footprint, { kind: 'rect' }>>) =>
    apply((p) => (f.kind === 'rect' ? actions.updateMass(p, id, { footprint: { ...f, ...patch } }) : p))

  return (
    <>
      <Header
        sign={<span aria-hidden className="h-3 w-3 shrink-0 rounded-[4px]" style={{ background: program?.color ?? 'var(--fill)' }} />}
        title={mass.name}
        what="mass"
        locked={locked}
        onLock={() => apply((p) => actions.toggleMassLock(p, id))}
        onClear={() => select(null)}
        muted={muted}
      />

      <div className="flex flex-col gap-2">
        <TextField label="Name" inputRef={nameField} value={mass.name} disabled={locked} title={why} onCommit={(v) => apply((p) => actions.updateMass(p, id, { name: v }))} />
        {!copyOf && (
          <SelectField
            label="Program"
            value={mass.programId ?? ''}
            options={[{ value: '', label: '—' }, ...programs.map((p) => ({ value: p.id, label: p.name }))]}
            disabled={locked}
            title={why}
            onCommit={(v) => apply((p) => actions.updateMass(p, id, { programId: v || null }))}
          />
        )}
        {!copyOf && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {f.kind === 'rect' && (
              <>
                <NumberField narrow label="Width" unit="m" min={1} disabled={locked} title={why} value={f.width} onCommit={(v) => setRect({ width: v })} />
                <NumberField narrow label="Depth" unit="m" min={1} disabled={locked} title={why} value={f.depth} onCommit={(v) => setRect({ depth: v })} />
                <NumberField narrow label="Rotation" unit="°" disabled={locked} title={why} value={f.rotation} onCommit={(v) => setRect({ rotation: v })} />
              </>
            )}
            <NumberField
              narrow
              label="Height"
              unit="m"
              min={1}
              disabled={locked}
              title={why}
              value={height}
              onCommit={(v) => apply((p) => actions.updateMass(p, id, { height: v }))}
            />
          </div>
        )}
        {!copyOf && f.kind !== 'rect' && <p className={`select-text text-caption ${muted}`}>Free shape · {f.contour.vertices.length} corners</p>}
        <Facts building={buildingName} level={levelName} area={area === undefined ? '—' : m2(area)} muted={muted} />
      </div>
      {copyOf && <CopySection buildingId={copyOf} />}
      {/* its docks are its own as much as its shape: read only while it is locked (a disabled fieldset disables every control in it) */}
      {!copyOf && (
        <fieldset disabled={locked} title={why} className="m-0 min-w-0 border-0 p-0">
          <DockSection id={id} muted={muted} />
        </fieldset>
      )}
      {!copyOf && <HoleSection id={id} locked={locked} muted={muted} />}

      <Actions
        items={[
          { icon: 'rotate', label: 'Rotate 90°', title: why ?? titleWith('Rotate 90°', 'edit.rotate90'), disabled: locked, onClick: () => void runCommand('edit.rotate90') },
          { icon: 'duplicate', label: 'Duplicate', title: titleWith('Duplicate: a copy 5 m beside it', 'edit.duplicate'), onClick: duplicateSelection },
          { icon: 'copyUp', label: 'Copy up', title: copyOf ? BLOCK_LEVELS : 'Copy up: on the first level above where it overlaps nothing (a new level if there is none)', disabled: !!copyOf, onClick: () => copyToLevel(1) },
          { icon: 'copyDown', label: 'Copy down', title: copyOf ? BLOCK_LEVELS : 'Copy down: on the first level below where it overlaps nothing (a new basement if there is none)', disabled: !!copyOf, onClick: () => copyToLevel(-1) },
          { icon: 'trash', label: 'Delete', title: why ?? 'Delete', disabled: locked, onClick: () => apply((p) => actions.removeMass(p, id)) },
        ]}
      />
      <p className={`select-text text-caption ${muted}`}>
        {copyOf
          ? 'A block: its walls and grid are its type’s until you reshape it here; then it is a variant.'
          : locked
          ? 'Locked: it is seen, not picked on the plan, and not changed. Unlock it here to change it.'
          : `Drag a wall or a corner to resize. Double-click a wall to add a corner${f.kind === 'rect' ? ' (it becomes a free shape)' : ''}.`}
      </p>
      {/* a corner picked: its radius and Delete, a block's too (its outline is free since D.2; the corner is read on its face) */}
      {vertex !== null && <CornerSection id={id} vertex={vertex} locked={locked} muted={muted} />}
    </>
  )
}

/** Why a block's hall is not copied to another level (a block is a building of its own: Phase D.2 leaves it out). */
const BLOCK_LEVELS = 'A block is a building of its own: Duplicate makes another block; its levels are its building’s'

/** A mass's building, level and area on one row (Decision "Compact Properties"). */
function Facts({ building, level, area, muted }: { building: string; level: string; area: string; muted: string }) {
  return (
    <dl aria-label="Where it is" className="grid grid-cols-[1fr_auto_auto] gap-x-4 text-body">
      {(
        [
          ['Building', building],
          ['Level', level],
          ['Area', area],
        ] as const
      ).map(([label, value]) => (
        <div key={label} className="flex min-w-0 flex-col">
          <dt className={`text-caption ${muted}`}>{label}</dt>
          <dd className="select-text truncate font-medium tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** A selection's actions as a row of icons, each named (its accessible name and its tooltip). */
function Actions({ items }: { items: { icon: IconName; label: string; title: string; disabled?: boolean; onClick(): void }[] }) {
  return (
    <div role="group" aria-label="Actions" className="flex gap-1">
      {items.map((a) => (
        <button
          key={a.label}
          type="button"
          aria-label={a.label}
          title={a.title}
          disabled={a.disabled}
          onClick={a.onClick}
          className="grid h-row w-9 place-items-center rounded-control bg-fill text-ink hover:bg-hover disabled:text-ink-tertiary disabled:hover:bg-fill"
        >
          <Icon name={a.icon} className="h-4 w-4" />
        </button>
      ))}
    </div>
  )
}

/** The value every item shares, or null when they differ. */
function shared<T>(values: T[]): T | null {
  return values.length > 0 && values.every((v) => v === values[0]) ? values[0] : null
}

const MIXED = '__mixed'

/** Several masses: what they share, and edits that go to all of them (one undo step each). */
function GroupProperties({ muted }: { muted: string }) {
  const ids = useApp((s) => s.selection.massIds)
  const project = useApp((s) => s.project)
  const derived = useApp((s) => s.derived)
  const apply = useApp((s) => s.apply)
  const select = useApp((s) => s.select)
  const masses = project.masses.filter((m) => ids.includes(m.id))
  if (masses.length === 0) return null
  const anyLocked = masses.some((m) => massIsLocked(project, m))
  // one locked among them: what would change it is disabled, and the padlock reads Unlock (it takes the lock off them all)
  const why = anyLocked ? LOCKED_TITLE : undefined
  const programId = shared(masses.map((m) => m.programId))
  const sameProgram = masses.every((m) => m.programId === masses[0].programId)
  const height = shared(masses.map((m) => massHeight(project, m)))
  const levelName = shared(masses.map((m) => levelOf(project, m).name))
  const buildingName = shared(masses.map((m) => buildingOf(project, m).name))
  const area = masses.reduce((sum, m) => sum + (derived.masses[m.id]?.area ?? 0), 0)

  return (
    <>
      <Header
        sign={<Icon name="mass" className={`h-4 w-4 shrink-0 ${muted}`} />}
        title={`${masses.length} masses`}
        what="masses"
        locked={anyLocked}
        onLock={() => apply((p) => actions.lockMasses(p, ids, !anyLocked))}
        onClear={() => select(null)}
        muted={muted}
      />
      <div className="flex flex-col gap-2">
        <SelectField
          label="Program"
          value={sameProgram ? (programId ?? '') : MIXED}
          options={[
            ...(sameProgram ? [] : [{ value: MIXED, label: 'Mixed' }]),
            { value: '', label: '—' },
            ...project.programs.map((p) => ({ value: p.id, label: p.name })),
          ]}
          disabled={anyLocked}
          title={why}
          onCommit={(v) => v !== MIXED && apply((p) => actions.updateMasses(p, ids, { programId: v || null }))}
        />
        <NumberField
          label="Height"
          unit="m"
          min={1}
          disabled={anyLocked}
          title={why}
          value={height}
          onCommit={(v) => apply((p) => actions.updateMasses(p, ids, { height: v }))}
        />
        <Facts building={buildingName ?? '—'} level={levelName ?? '—'} area={m2(area)} muted={muted} />
      </div>
      <Actions
        items={[
          { icon: 'rotate', label: 'Rotate 90°', title: why ?? titleWith('Rotate 90° around their centre', 'edit.rotate90'), disabled: anyLocked, onClick: () => void runCommand('edit.rotate90') },
          { icon: 'duplicate', label: 'Duplicate', title: titleWith('Duplicate: a copy 5 m beside them', 'edit.duplicate'), onClick: duplicateSelection },
          { icon: 'trash', label: 'Delete', title: why ?? 'Delete', disabled: anyLocked, onClick: () => apply((p) => actions.removeMasses(p, ids)) },
        ]}
      />
      {anyLocked ? (
        <p className={`select-text text-caption ${muted}`}>{tr("Some are locked: unlock them (the padlock) to change the group.")}</p>
      ) : (
        <Note className={`text-caption ${muted}`}>{tr("Drag one to move them all. Shift+click adds or takes out a mass; click one alone to edit its shape.")}</Note>
      )}
    </>
  )
}

/** The selected corner: its radius (rounding a rect's corner makes it a free shape) and delete. */
function CornerSection({ id, vertex, locked, muted }: { id: Id; vertex: number; locked: boolean; muted: string }) {
  const select = useApp((s) => s.select)
  const project = useApp((s) => s.project)
  // the outline the shape engine reads: a mass's footprint, a block's face (corner `vertex` is where its wall `vertex` starts)
  const ref = { kind: 'mass', id }
  const c = useMemo(() => actions.shapeOf(project, ref)?.contour ?? null, [project, id]) // eslint-disable-line react-hooks/exhaustive-deps
  const v = c?.vertices[vertex]
  if (!c || !v) return null
  const max = maxRadius(c, vertex)
  // a corner on a straight line (just added) or next to an arc edge has nothing to round
  const roundable = Number.isFinite(max) && Math.abs(turnAt(c, vertex)) > 1e-6
  return (
    <div className="border-t border-separator pt-3">
      <Section title={`Corner ${vertex + 1}`}>
        {roundable ? (
          <>
            <NumberField
              label="Radius"
              unit="m"
              min={0}
              disabled={locked}
              value={v.r}
              onCommit={(r) => setShapeRadius(ref, vertex, r)}
            />
            <p className={`select-text text-caption ${muted}`}>Fits up to {max.toFixed(2)} m</p>
          </>
        ) : (
          <Note className={`text-caption ${muted}`}>{tr("A straight corner: drag it off the wall to shape it, then round it.")}</Note>
        )}
        <div className="flex gap-2">
          <Button
            title={titleWith('Delete corner', 'edit.delete')}
            disabled={locked || c.vertices.length <= 3}
            onClick={() => {
              removeShapeCorner(ref, vertex)
              select(id)
            }}
          >
            {tr("Delete corner")}
          </Button>
        </div>
      </Section>
    </div>
  )
}

/** A hand-drawn dimension: typing its length moves the geometry; the offset moves its line; its ends say what they
 *  follow. */
function DimensionProperties({ id, muted }: { id: Id; muted: string }) {
  const d = useApp((s) => s.project.dimensions?.find((x) => x.id === id))
  const masses = useApp((s) => s.project.masses)
  const apply = useApp((s) => s.apply)
  if (!d) return null
  const locked = d.locked === true
  const length = Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y)
  const end = (k: DimensionAnchor | undefined) => {
    if (!k) return 'a free point'
    return `${masses.find((m) => m.id === k.massId)?.name ?? '—'} · corner ${k.vertex + 1}`
  }

  return (
    <>
      <Header
        sign={<Icon name="dimension" className={`h-4 w-4 shrink-0 ${muted}`} />}
        title="Dimension"
        what="dimension"
        locked={locked}
        // its lock fixes its length: it is not the padlock, and does not say so
        lock={{
          label: 'Fixed length',
          on: 'Its length is kept: moving one of its masses drags the other. Click to free its length',
          off: 'Fix its length: moving one of its masses drags the other',
        }}
        onLock={() => apply((p) => actions.toggleDimensionLock(p, id))}
        onClear={() => letGoKind('dimension')}
        muted={muted}
      />
      <div className="flex flex-col gap-2">
        <NumberField label="Length" unit="m" min={0.001} disabled={locked} title={locked ? 'Its length is fixed: free it to type another' : undefined} value={length} onCommit={(v) => typeDimensionLength(id, v)} />
        <NumberField label="Offset" unit="m" value={d.offset} onCommit={(v) => apply((p) => actions.setDimensionOffset(p, id, v))} />
        <div className="flex justify-between gap-3">
          <span className={`text-label ${muted}`}>{tr("From")}</span>
          <span className="truncate text-label">{end(d.anchorA)}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className={`text-label ${muted}`}>{tr("To")}</span>
          <span className="truncate text-label">{end(d.anchorB)}</span>
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          title={titleWith('Delete', 'edit.delete')}
          onClick={() => {
            apply((p) => actions.removeDimension(p, id))
            letGoKind('dimension')
          }}
        >
          {tr("Delete")}
        </Button>
      </div>
      <p className={`select-text text-caption ${muted}`}>
        {locked
          ? 'Its length is fixed: moving one of its masses drags the other along; an edit that would change it is refused.'
          : 'Typing the length moves the geometry: one mass stretches, or the mass at its end moves. Ends on a corner follow it.'}
      </p>
    </>
  )
}
