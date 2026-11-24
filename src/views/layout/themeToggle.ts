// The ☾ of Home's welcome: one press goes to the other theme of what shows (on System, the system's), as a choice that is
// remembered. The top bar has no such button any more: View › Theme (System, Light, Dark) is the menu's.
import { useShownTheme } from './theme.ts'
import { useUi } from './ui.ts'

export function useThemeToggle() {
  const theme = useUi((s) => s.theme)
  const shown = useShownTheme(theme)
  const dark = shown === 'dark'
  return { dark, title: dark ? 'Light mode' : 'Dark mode', toggle: () => useUi.getState().setTheme(dark ? 'light' : 'dark') }
}
