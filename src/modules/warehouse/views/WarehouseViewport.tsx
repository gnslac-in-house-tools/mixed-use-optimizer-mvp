// The Warehouse workspace's viewport (Decision "Warehouse layout"): the type picked, alone, without the site, as the
// top bar's View says: its plan, its 3D (loaded lazily) or both side by side. Without a type, how to start one.
import { lazy, Suspense } from 'react'
import { usePhone } from '../../../views/layout/media.ts'
import { useUi } from '../../../views/layout/ui.ts'
import { Button } from '../../../views/controls/fields.tsx'
import { newType } from './commands.ts'
import { WarehousePlan } from './WarehousePlan.tsx'
import { useCurrentType, useGenerated } from './warehouseState.ts'

const WarehouseScene = lazy(() => import('./WarehouseScene.tsx').then((m) => ({ default: m.WarehouseScene })))

export function WarehouseViewport() {
  const t = useCurrentType()
  const g = useGenerated(t)
  const chosen = useUi((s) => s.view)
  const phone = usePhone()
  const view = phone && chosen === 'split' ? 'plan' : chosen
  if (!g)
    return (
      <div className="grid h-full place-items-center">
        <div className="flex flex-col items-center gap-3 text-body text-ink-secondary">
          No warehouse type yet.
          <Button onClick={newType}>New warehouse type</Button>
        </div>
      </div>
    )
  return (
    <div className="flex h-full min-h-0">
      {view !== '3d' && (
        <div className={`relative min-w-0 overflow-hidden ${view === 'split' ? 'w-1/2 border-r border-separator' : 'flex-1'}`}>
          <WarehousePlan key={t!.id} t={t!} g={g} />
        </div>
      )}
      {view !== 'plan' && (
        <div className="relative min-w-0 flex-1">
          <Suspense fallback={<div className="grid h-full place-items-center text-body text-ink-secondary">Loading the 3D view…</div>}>
            <WarehouseScene g={g} />
          </Suspense>
        </div>
      )}
    </div>
  )
}
