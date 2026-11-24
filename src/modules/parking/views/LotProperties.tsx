// A picked parking lot in Properties (Decision "Lot tool"): its name; where it stands (against which wall, or free, and
// *Free it from the wall*) and its rotation (a free lot's own; an anchored one's its wall's, not editable: Decision
// "Lot turn and snap"); its length (*Whole wall* or *Set*, from the corner where the wall starts) and its rows (*To
// the limit* or *Set*), the metres beside them; its sizes (the standards', or its own); its entrance (either end of its
// aisles, and whether a street reaches it: *Connect* draws one); what it holds, and its warnings. Every field is one
// verb through `actions` (one undo step).
import type { Lot } from '../../../model/schema.ts'
import { useApp } from '../../../state/store.ts'
import { useRenameField } from '../../../views/editing/rename.ts'
import { lockedFirst } from '../../../views/layers/locks.ts'
import { Lockable } from '../../../views/panels/Lockable.tsx'
import { Button, NumberField, TextField } from '../../../views/controls/fields.tsx'
import { Segmented } from '../../../views/controls/Segmented.tsx'
import { connect } from '../../../views/plan/circulation/connectCommand.ts'
import { useShown } from '../../../views/viewport/look.ts'
import { depthOf, SETBACK, type DerivedLot } from '../engine/lots.ts'
import { changeLot, lotOf, removePickedLot } from './lotState.ts'

const m = (x: number) => `${(Math.round(x * 10) / 10).toLocaleString('en-US')} m`

/** `answersRename`: its name field answers Rename (F2) here; off for the card over the viewport, which leaves it to the panel's. */
export function LotProperties({ id, muted, answersRename = true }: { id: string; muted: string; answersRename?: boolean }) {
  const l = useShown((s) => s.derived.circulation.lots.find((x) => x.id === id))
  const lot = useApp((s) => lotOf(s.project, s.option, id))
  const wallName = useApp((s) => (l?.anchor ? s.derived.masses[l.anchor.massId]?.name : undefined))
  // the Issues, not a list filtered here: a list made anew on each read would never settle
  const all = useApp((s) => s.derived.issues)
  const nameField = useRenameField('lot', id, answersRename)
  if (!l || !lot) return null
  const issues = all.filter((i) => i.code === 'lot' && i.message.includes(l.name))
  const row = (label: string, value: string) => (
    <div className="flex justify-between gap-3 text-body">
      <span className={`text-label ${muted}`}>{label}</span>
      <span className="select-text text-right font-medium tabular-nums">{value}</span>
    </div>
  )
  const area = l.length * l.depth

  return (
    <div className="flex flex-col gap-3" aria-label="Parking lot">
      {/* a locked lot (the padlock is CAD's): every field is read-only and says why */}
      <Lockable locked={lot.locked === true} muted={muted}>
      <TextField label="Name" inputRef={nameField} value={lot.name} onCommit={(v) => changeLot(id, { name: v })} />
      <section className="flex flex-col gap-2" aria-label="Where">
        <h3 className={`text-label ${muted}`}>Where</h3>
        {l.anchor ? (
          <>
            {row('Against', `${wallName ?? 'A mass'} · ${l.anchor.facing} wall`)}
            <Button onClick={() => changeLot(id, { anchor: null, rect: freed(l), rows: null })}>Free it from the wall</Button>
            <NumberField label="Rotation" unit="°" decimals={1} disabled title={ANCHORED_TURN} value={angleOf(l)} onCommit={() => {}} />
          </>
        ) : (
          <>
            <p className={`select-text text-caption ${muted}`}>Free. Dropped against a wall, it is anchored there and follows it.</p>
            {lot.rect && <NumberField label="Rotation" unit="°" decimals={1} value={lot.rect.rotation} onCommit={(v) => changeLot(id, { rect: { ...lot.rect!, rotation: degrees(v) } })} />}
          </>
        )}
      </section>
      {lot.anchor ? <AnchoredFields l={l} lot={lot} muted={muted} /> : row('Size', `${m(l.length)} × ${m(l.depth)} · ${l.rows} ${l.rows === 1 ? 'row' : 'rows'}`)}
      <Sizes l={l} lot={lot} muted={muted} />
      <section className="flex flex-col gap-2" aria-label="Entrance">
        <h3 className={`text-label ${muted}`}>Entrance</h3>
        <Segmented<'start' | 'end'>
          kind="toggle"
          label="Its entrance"
          stretch
          value={l.entrance.end}
          onChange={(k) => changeLot(id, { entry: k })}
          options={[
            { key: 'start', label: l.entrance.names[0] },
            { key: 'end', label: l.entrance.names[1] },
          ]}
        />
        {l.reached ? (
          <p className={`select-text text-caption ${muted}`}>A street reaches it.</p>
        ) : (
          <>
            <p className="select-text text-caption text-status-over">No street reaches it: a warning. Connect draws one, as to a truck court.</p>
            <Button onClick={connect}>Connect</Button>
          </>
        )}
      </section>
      <section className="flex flex-col gap-1.5" aria-label="What it holds">
        {row('Car stalls', l.stalls.length.toLocaleString('en-US'))}
        {row('Area', `${Math.round(area).toLocaleString('en-US')} m²`)}
      </section>
      {issues
        .filter((i) => !i.message.startsWith('No street'))
        .map((i) => (
          <p key={i.message} className="text-caption text-status-over">
            {i.message}
          </p>
        ))}
      <Button title={lot.locked === true ? lockedFirst(1, 'lot') : undefined} onClick={() => removePickedLot()}>Delete {lot.name}</Button>
      </Lockable>
    </div>
  )
}

/** Why an anchored lot's rotation is not its own (Decision "Lot turn and snap"). */
const ANCHORED_TURN = 'An anchored lot turns with its wall: turn the mass, or Free it from the wall to turn the lot on its own'

/** An angle in [0, 360), as a mass's rotation is kept. */
const degrees = (a: number) => ((a % 360) + 360) % 360

/** The way its rows run, in degrees counter-clockwise from east (a free lot's rotation), in [0, 360). */
const angleOf = (l: DerivedLot) => degrees((Math.atan2(l.frame.along.y, l.frame.along.x) * 180) / Math.PI)

/** An anchored lot freed: the rectangle it stands on now. */
function freed(l: DerivedLot): NonNullable<Lot['rect']> {
  const f = l.frame
  const w = f.a1 - f.a0
  const d = f.v1 - f.v0
  const mid = { a: (f.a0 + f.a1) / 2, v: (f.v0 + f.v1) / 2 }
  const center = { x: f.start.x + f.along.x * mid.a + f.out.x * mid.v, y: f.start.y + f.along.y * mid.a + f.out.y * mid.v }
  return { center, width: w, depth: d, rotation: angleOf(l) }
}

function AnchoredFields({ l, lot, muted }: { l: DerivedLot; lot: Lot; muted: string }) {
  const a = lot.anchor!
  const whole = a.length === undefined && a.from === undefined
  const id = lot.id
  const { from: _, length: __, ...side } = a
  return (
    <>
      <section className="flex flex-col gap-2" aria-label="Length">
        <h3 className={`text-label ${muted}`}>Length</h3>
        <Segmented<'whole' | 'set'>
          kind="toggle"
          label="Its length"
          stretch
          value={whole ? 'whole' : 'set'}
          onChange={(k) => changeLot(id, { anchor: k === 'whole' ? side : { ...side, from: l.frame.a0, length: l.length } })}
          options={[
            { key: 'whole', label: 'Whole wall' },
            { key: 'set', label: 'Set' },
          ]}
        />
        {whole ? (
          <p className={`select-text text-caption ${muted}`}>{m(l.length)}: it follows the wall.</p>
        ) : (
          <>
            <NumberField label="Length" unit="m" min={l.sizes.stallWidth} value={l.length} onCommit={(v) => changeLot(id, { anchor: { ...side, from: l.frame.a0, length: v } })} />
            <NumberField label="From its corner" unit="m" min={0} value={l.frame.a0} onCommit={(v) => changeLot(id, { anchor: { ...side, from: v, length: l.length } })} />
          </>
        )}
      </section>
      <section className="flex flex-col gap-2" aria-label="Rows">
        <h3 className={`text-label ${muted}`}>Rows</h3>
        <Segmented<'limit' | 'set'>
          kind="toggle"
          label="Its rows"
          stretch
          value={lot.rows === undefined ? 'limit' : 'set'}
          onChange={(k) => changeLot(id, { rows: k === 'limit' ? null : Math.max(1, l.rows) })}
          options={[
            { key: 'limit', label: 'To the limit' },
            { key: 'set', label: 'Set' },
          ]}
        />
        {lot.rows !== undefined && <NumberField label="Rows" min={1} decimals={0} value={lot.rows} onCommit={(v) => changeLot(id, { rows: Math.max(1, Math.round(v)) })} />}
        <p className={`select-text text-caption ${muted}`}>
          {l.rows} {l.rows === 1 ? 'row' : 'rows'}, {m(depthOf(l.rows, l.sizes))} deep{l.fits !== null ? `; ${l.fits} fit ${l.stop === SETBACK ? 'to' : 'before'} ${l.stop}` : ''}. Two rows share an aisle.
        </p>
      </section>
    </>
  )
}

function Sizes({ l, lot, muted }: { l: DerivedLot; lot: Lot; muted: string }) {
  const id = lot.id
  const set = (k: 'stallWidth' | 'stallDepth' | 'aisleWidth', v: number) => changeLot(id, { sizes: { ...lot.sizes, [k]: v } })
  return (
    <section className="flex flex-col gap-2" aria-label="Sizes">
      <h3 className={`text-label ${muted}`}>Sizes</h3>
      <NumberField label="Stall width" unit="m" min={2} value={l.sizes.stallWidth} narrow onCommit={(v) => set('stallWidth', v)} />
      <NumberField label="Stall depth" unit="m" min={3} value={l.sizes.stallDepth} narrow onCommit={(v) => set('stallDepth', v)} />
      <NumberField label="Aisle width" unit="m" min={3} value={l.sizes.aisleWidth} narrow onCommit={(v) => set('aisleWidth', v)} />
      {lot.sizes ? (
        <Button onClick={() => changeLot(id, { sizes: null })}>The standards again</Button>
      ) : (
        <p className={`select-text text-caption ${muted}`}>The project’s standards (Brief › Circulation).</p>
      )}
    </section>
  )
}
