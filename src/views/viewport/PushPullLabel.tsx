// mixed-use-mvp: the height handle's drag (scene/HeightHandle.tsx), top centre over the viewport while it lasts.
import { usePushPull } from '../scene/pushPull.ts'

export function PushPullLabel() {
  const label = usePushPull((s) => s.label)
  if (!label) return null
  return (
    <div className="glass pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-pill px-3 py-1 text-label tabular-nums text-ink" data-height-handle>
      {label}
    </div>
  )
}
