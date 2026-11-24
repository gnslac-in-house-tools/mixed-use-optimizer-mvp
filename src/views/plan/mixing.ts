// While a pick adds to a mix (Decision "Mixed selection"), the stores' "one kind at a time" subscriptions stand aside.
// Alone in a file with no imports: every store reads it, and `mix.ts` (which reads every store) re-exports it.

/** Cross-store picks in progress: the stores' "one kind at a time" subscriptions stand aside. */
export const mixing: { on: boolean } = { on: false }

/** Runs `f` with the one-kind-at-a-time subscriptions standing aside. */
export function together(f: () => void): void {
  const was = mixing.on
  mixing.on = true
  try {
    f()
  } finally {
    mixing.on = was
  }
}
