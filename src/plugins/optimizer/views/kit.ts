// What the optimizer's tabs share of their look, beyond the core's controls (views/controls/).

/** A native select in a panel row. */
export const selectClass = 'h-row rounded-control border border-separator bg-panel-sunken px-1.5 text-label text-ink outline-none focus:border-ink'

/** A run's time: m:ss. */
export const clock = (ms: number) => {
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
