// The module clicked on the map: what it exports and reads, who it imports and who imports it, how often it ran.
// While it is open, the log shows only the events that touched it.
import type { ModuleMap } from './map.ts'

export function ModuleCard({ map, id, heat, onClose }: { map: ModuleMap; id: string; heat: number; onClose(): void }) {
  const m = map.nodes.find((n) => n.id === id)
  if (!m) return null
  const imports = map.edges.filter((e) => e.from === id)
  const importedBy = map.edges.filter((e) => e.to === id)
  const list = (ids: { id: string; type: boolean }[]) =>
    ids.length === 0 ? '—' : ids.map((x) => <span key={x.id} className={`mr-2 inline-block ${x.type ? 'text-ink-tertiary' : ''}`}>{x.id}</span>)
  return (
    <section className="flex flex-col gap-1 border-b border-separator px-panel-pad py-3 text-caption">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="truncate text-label">{m.id}</h2>
        <button type="button" onClick={onClose} className="text-ink-tertiary hover:text-ink" aria-label="Close module">
          ✕
        </button>
      </div>
      <span className="text-ink-secondary">
        {m.lines} lines · in {heat} events{m.reads.length > 0 && ` · reads ${m.reads.join(', ')}`}
      </span>
      <span>
        <span className="text-ink-tertiary">Exports </span>
        {m.exports.join(', ') || '—'}
      </span>
      <span>
        <span className="text-ink-tertiary">Imports </span>
        {list(imports.map((e) => ({ id: e.to, type: e.typeOnly })))}
      </span>
      <span>
        <span className="text-ink-tertiary">Used by </span>
        {list(importedBy.map((e) => ({ id: e.from, type: e.typeOnly })))}
      </span>
    </section>
  )
}
