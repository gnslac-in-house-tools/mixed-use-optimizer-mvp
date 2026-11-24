// The terrain editor's bar (terrainEditor.ts, Decision "Home libraries"): over the frame, under the top bar, while a
// terrain uploaded to Home is imported as a site — its name, *Save to library* and *Close* (back to Home).
import { useApp } from '../../state/store.ts'
import { closeTerrainEditor, saveEditedTerrain, terrainReady, useTerrainEditor } from './terrainEditor.ts'
import { t as tr } from '../../i18n/idioma.ts' // mixed-use-mvp

export function TerrainEditorBar() {
  const open = useTerrainEditor((s) => s.open)
  const name = useTerrainEditor((s) => s.name)
  const ready = useApp((s) => terrainReady(s.project))
  if (!open) return null
  return (
    <div role="region" aria-label="Terrain editor" className="panel fixed left-1/2 top-16 z-40 flex -translate-x-1/2 items-center gap-2 px-3 py-2 shadow-sheet">
      <span className="whitespace-nowrap text-caption font-semibold uppercase tracking-wide text-ink-secondary">{tr("Terrain editor")}</span>
      <input
        aria-label="Terrain name"
        value={name}
        onChange={(e) => useTerrainEditor.setState({ name: e.target.value })}
        className="h-[2rem] w-56 select-text rounded-control bg-fill px-2.5 text-label text-ink outline-none"
      />
      <button
        type="button"
        disabled={!ready}
        title={ready ? 'Keep this terrain in this browser’s library' : 'Finish the import first: its boundary picked, or its contours'}
        onClick={saveEditedTerrain}
        className="pressable flex h-[2rem] items-center whitespace-nowrap rounded-control bg-ink px-3 text-label font-semibold text-on-ink hover:opacity-90 disabled:opacity-40"
      >
        {tr("Save to library")}
      </button>
      <button
        type="button"
        title="Back to Home’s terrains"
        onClick={closeTerrainEditor}
        className="pressable flex h-[2rem] items-center rounded-control px-3 text-label text-ink-secondary hover:bg-hover hover:text-ink"
      >
        {tr("Close")}
      </button>
    </div>
  )
}
