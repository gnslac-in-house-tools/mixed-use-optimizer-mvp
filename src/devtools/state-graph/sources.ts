// The app's own source text, for the module map. Vite re-runs this glob on every save and when a file is added or
// deleted, and hot-updates the page: the map follows the code with no step to remember.
// Tests and the dev tool itself are left out: the map is about the app.
export const sources: Record<string, string> = import.meta.glob<string>(
  ['/src/**/*.{ts,tsx}', '!/src/**/__tests__/**', '!/src/devtools/**', '!/src/**/*.d.ts'],
  { query: '?raw', import: 'default', eager: true },
)
