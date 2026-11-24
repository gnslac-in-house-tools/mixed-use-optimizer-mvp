// A building's Platform in Properties (Decisions "Terrain layout", "Platforms"), while the terrain module is on (the site
// has ground): the level it stands on, Balanced (shown) or Typed; its cut and fill in the active option, its banks' among them (E.5), and
// Balance with banks (the level typed that evens them with its banks: Decision "Balance with banks"); the
// buildings it shares the platform with (✕: its own again); its steps, each with its masses, its level (typed, or
// balanced again) and ✕ to undo it.
import type { Building, Id } from '../../../model/schema.ts'
import type { DerivedPlatform } from '../../../engine/types.ts'
import { useApp } from '../../../state/store.ts'
import { Icon } from '../../../views/controls/Icon.tsx'
import { Button, NumberField, Total } from '../../../views/controls/fields.tsx'
import { Segmented } from '../../../views/controls/Segmented.tsx'
import { useModule } from '../../../views/modules.ts'
import { heightText } from './terrainDraw.ts'
import { balanceWithBanks, joinedWith, ownPlatform, removeStep, setPlatformLevel, setStepLevel } from './platformCommands.ts'

const m3 = (v: number) => `≈ ${Math.round(v).toLocaleString('en-US')} m³`
const level = (z: number | null) => (z === null ? '—' : `${heightText(z)} m`)

/** Its banks' cut and fill, and Balance with banks: the balanced level is its masses' and courts' alone. */
function Banks({ x }: { x: DerivedPlatform }) {
  if (x.banks.cut + x.banks.fill <= 0) return null
  const left = x.fill - x.cut
  return (
    <div className="flex flex-col gap-1.5">
      <p className="select-text text-caption text-ink-secondary">
        Its banks: cut {m3(x.banks.cut)} · fill {m3(x.banks.fill)}, in the figures above.
      </p>
      {Math.abs(left) >= 1 && (
        <Button title={`Type the level at which its cut and fill balance with its banks (${left > 0 ? 'fill' : 'cut'} is over by ${m3(Math.abs(left))} now)`} onClick={() => balanceWithBanks(x.id)}>
          Balance with banks
        </Button>
      )}
    </div>
  )
}

/** A small text button in a row (Balanced again, ✕). */
function RowButton({ label, title, onClick, icon }: { label: string; title: string; onClick(): void; icon?: 'close' }) {
  return (
    <button type="button" aria-label={label} title={title} onClick={onClick} className="pressable grid h-row min-w-[1.75rem] place-items-center rounded-control px-1.5 text-caption text-ink-secondary hover:bg-hover hover:text-ink">
      {icon ? <Icon name={icon} className="h-3 w-3" /> : label}
    </button>
  )
}

function Step({ x, names }: { x: DerivedPlatform; names: (ids: Id[]) => string }) {
  return (
    <div data-step={x.id} className="flex flex-col gap-1 rounded-control bg-panel-sunken px-2 py-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-label text-ink">{names(x.massIds)}</span>
        <RowButton label={`Undo the step of ${names(x.massIds)}`} title="Back onto the building’s platform" icon="close" onClick={() => removeStep(x.id)} />
      </div>
      <NumberField key={`${x.id}:${x.typed}`} label={x.typed ? 'Level (typed)' : 'Level (balanced)'} unit="m" value={x.level} onCommit={(v) => setStepLevel(x.id, v)} />
      <div className="flex items-center justify-between gap-2 text-caption text-ink-secondary">
        <span className="select-text tabular-nums">
          Cut {m3(x.cut)} · Fill {m3(x.fill)}
        </span>
        {x.typed && <RowButton label="Balanced" title={`Back to the level that balances its cut and fill (${level(x.balanced)})`} onClick={() => setStepLevel(x.id, null)} />}
      </div>
      <Banks x={x} />
    </div>
  )
}

export function PlatformSection({ building: b }: { building: Building }) {
  const project = useApp((s) => s.project)
  const earthwork = useApp((s) => s.derived.earthwork)
  const { on } = useModule('terrain')
  if (!on || b.context) return null
  const own = earthwork?.platforms.find((x) => !x.step && x.buildingIds.includes(b.id))
  const steps = earthwork?.platforms.filter((x) => x.step && x.buildingIds[0] === b.id) ?? []
  const shared = joinedWith(project, b)
  const names = (ids: Id[]) => ids.map((id) => project.masses.find((m) => m.id === id)?.name ?? id).join(', ')
  return (
    <section aria-label="Platform" data-tour="platform" className="flex flex-col gap-2">
      <h2 className="text-label text-ink-secondary">Platform</h2>
      {!own ? (
        <p className="select-text text-caption text-ink-secondary">No masses of it in this option on the ground: its platform shows once they are.</p>
      ) : (
        <>
          <Segmented
            kind="toggle"
            label="Platform level"
            stretch
            value={own.typed ? 'typed' : 'balanced'}
            options={[
              { key: 'balanced', label: 'Balanced', title: 'The level that balances its cut and fill' },
              { key: 'typed', label: 'Typed', title: 'A level of your own' },
            ]}
            onChange={(k) => {
              if (k === 'balanced') setPlatformLevel(b.id, null)
              else if (!own.typed && own.level !== null) setPlatformLevel(b.id, Math.round(own.level * 100) / 100)
            }}
          />
          <NumberField
            key={`${b.id}:${own.typed}`}
            label="Level"
            unit="m"
            value={own.level}
            disabled={!own.typed}
            onCommit={(v) => setPlatformLevel(b.id, v)}
          />
          <dl aria-label="Platform figures" className="flex flex-col gap-1.5">
            {own.typed && <Total label="Balanced at" value={level(own.balanced)} />}
            <Total label="Cut" value={m3(own.cut)} />
            <Total label="Fill" value={m3(own.fill)} />
          </dl>
          <Banks x={own} />
        </>
      )}
      {shared.length > 0 && (
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 text-caption text-ink-secondary">
            Joined with <span className="text-ink">{shared.map((x) => x.name).join(', ')}</span>
          </span>
          <RowButton label="Own platform" title={`${b.name} leaves the shared platform: one of its own`} icon="close" onClick={() => ownPlatform(b.id)} />
        </div>
      )}
      {steps.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-caption text-ink-secondary">Steps</span>
          {steps.map((x) => (
            <Step key={x.id} x={x} names={names} />
          ))}
        </div>
      )}
      {own && shared.length === 0 && steps.length === 0 && (
        <p className="select-text text-caption text-ink-secondary">Join another building’s platform, or step masses onto their own, from the right-click menus.</p>
      )}
    </section>
  )
}
