// The keys, pure (Project C, AS.1; spec "Shortcuts"): no store, no DOM beyond the event it is given.
//   chordOf(e)         the chord an event is, as the registry spells it: 'Ctrl+Shift+S', 'M', 'F3', 'Shift+R', 'Alt+1',
//                      'Del', '?'. Modifiers come in one order (Ctrl, Alt, Shift); Cmd counts as Ctrl; a letter is upper
//                      case whatever Shift or CapsLock do; a symbol is its own character, Shift not written (`?` is '?',
//                      not 'Shift+/'); a modifier alone is null. AltGr (Ctrl and Alt together, or the AltGraph state)
//                      that gives a printable symbol is that symbol (a Spanish keyboard types @ and # so); Alt+digit and
//                      Alt+letter go by the physical key (`code`), as a Mac types ¡ and å there.
//   normalizeChord(s)  a chord written by hand ('ctrl+shift+s') in the same spelling; the key `+` is written `Plus` after a
//                      modifier ('Ctrl+Plus', typed 'Ctrl++') and is '+' alone (Shift is how it is typed, as with any symbol)
//   chordLabel(chord)  what a title or a menu shows ('' for no key; 'Ctrl+Plus' reads 'Ctrl++')
//   RESERVED           the keys no command may take, each with its reason (the shortcuts window refuses them)
//   LOCAL_KEYS         the keys that belong to what is on screen, not to a command, by the file that listens to them:
//                      the guard in `__tests__/dispatch.test.tsx` fails when a view listens to `keydown` and its file is
//                      not named here
// The dispatcher (dispatch.ts) turns an event into a chord and the registry (shortcuts.ts) into a command.

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'OS', 'Fn', 'NumLock', 'ScrollLock'])

/** A key's name in a chord, by `KeyboardEvent.key`. */
const NAMED: Record<string, string> = {
  Delete: 'Del',
  Escape: 'Esc',
  ' ': 'Space',
  Spacebar: 'Space',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
}

/** What `normalizeChord` reads back: any spelling of a named key to the chord's own. */
const BY_NAME: Record<string, string> = {
  delete: 'Del',
  del: 'Del',
  escape: 'Esc',
  esc: 'Esc',
  space: 'Space',
  backspace: 'Backspace',
  enter: 'Enter',
  tab: 'Tab',
  up: 'Up',
  down: 'Down',
  left: 'Left',
  right: 'Right',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown',
  insert: 'Insert',
}

const isLetter = (k: string) => /^\p{L}$/u.test(k)

/** The chord an event is; null for a modifier alone. */
export function chordOf(e: KeyboardEvent): string | null {
  const key = e.key
  if (!key || MODIFIER_KEYS.has(key)) return null
  const printable = key.length === 1
  const ctrl = e.ctrlKey || e.metaKey
  const gr = typeof e.getModifierState === 'function' && e.getModifierState('AltGraph')
  // AltGr (it arrives as Ctrl+Alt on Windows) giving a character: that character, not a chord (@ and # on a Spanish keyboard)
  if (printable && key !== ' ' && (gr || (ctrl && e.altKey && !/^[A-Za-z0-9]$/.test(key)))) return isLetter(key) ? key.toUpperCase() : key
  let name: string
  if (e.altKey && /^Key[A-Z]$/.test(e.code ?? '')) name = e.code.slice(3)
  else if (e.altKey && /^Digit[0-9]$/.test(e.code ?? '')) name = e.code.slice(5)
  else if (NAMED[key]) name = NAMED[key]
  else if (printable) name = isLetter(key) ? key.toUpperCase() : key
  else name = key // Enter, Tab, Backspace, F1…F12, Home, End…
  // Shift is written for a letter, a digit and a named key; a symbol (`?`, `#`) already carries it
  const symbol = name.length === 1 && /^[^\p{L}\p{N}]$/u.test(name)
  const mods = [ctrl && 'Ctrl', e.altKey && 'Alt', e.shiftKey && !symbol && 'Shift'].filter(Boolean)
  // `+` after a modifier would be read as the separator: it is written Plus there
  if (name === '+' && mods.length > 0) name = 'Plus'
  return [...mods, name].join('+')
}

/** A chord written by hand ('ctrl+shift+s', 'Shift+Ctrl+S', 'delete', 'Ctrl++') in the spelling `chordOf` gives. */
export function normalizeChord(chord: string): string {
  // the key `+` ends the chord ('+', 'Ctrl++', 'Shift++'): the separator before it is not part of the key
  const plus = chord.endsWith('+')
  const parts = (plus ? chord.slice(0, -1) : chord).split('+').map((p) => p.trim())
  const rawName = plus ? '+' : (parts.pop() ?? '')
  const lower = parts.map((p) => p.toLowerCase())
  const mod = (...names: string[]) => lower.some((m) => names.includes(m))
  const ctrl = mod('ctrl', 'control', 'cmd', 'meta') && 'Ctrl'
  const alt = mod('alt', 'option') && 'Alt'
  // a symbol carries its Shift (as `chordOf` writes it): '+' alone, 'Plus' after a modifier
  if (rawName === '+' || rawName.toLowerCase() === 'plus') return ctrl || alt ? [ctrl, alt, 'Plus'].filter(Boolean).join('+') : '+'
  const name = BY_NAME[rawName.toLowerCase()] ?? (/^f\d{1,2}$/i.test(rawName) ? rawName.toUpperCase() : rawName.length === 1 && isLetter(rawName) ? rawName.toUpperCase() : rawName)
  return [ctrl, alt, mod('shift') && 'Shift', name].filter(Boolean).join('+')
}

/** What a title or a menu shows for a chord; no chord, nothing. */
export const chordLabel = (chord: string | undefined): string => (chord ?? '').replace(/(.)Plus$/, '$1+')

/** A key no command may take, by the chord itself or a test; `why` is what the shortcuts window says. */
export interface Reserved {
  chord?: string
  test?(chord: string): boolean
  /** The key or keys as the window's note names them. */
  name: string
  why: string
}

export const RESERVED: Reserved[] = [
  { chord: 'Esc', name: 'Esc', why: 'Escape belongs to what is on screen: it closes a window, lets a tool go, ends a look' },
  { chord: 'Enter', name: 'Enter', why: 'Enter finishes what a tool is drawing and confirms a field' },
  { chord: 'Tab', name: 'Tab', why: 'Tab moves between fields and is a tool’s own while it draws' },
  { chord: 'Shift+Tab', name: 'Shift+Tab', why: 'Shift+Tab moves between fields and is a tool’s own while it draws' },
  { chord: 'Space', name: 'Space', why: 'Space held pans the plan; with Street in hand it turns the street’s side' },
  { chord: 'F10', name: 'F10', why: 'F10 puts the focus on the menu bar' },
  { test: (c) => ['Up', 'Down', 'Left', 'Right', 'Shift+Up', 'Shift+Down', 'Shift+Left', 'Shift+Right'].includes(c), name: 'The arrows', why: 'The arrows move through menus, lists and fields' },
  { test: (c) => /^[0-9]$/.test(c), name: 'The digits', why: 'The digits are typed into the command line while a tool draws' },
  { test: (c) => ['#', '@', '<', '.', '-', '+'].includes(c), name: '# @ < . - +', why: 'These characters are typed into the command line (# @ < . - +)' },
  { test: (c) => ['Ctrl+N', 'Ctrl+T', 'Ctrl+W', 'Ctrl+Tab', 'Ctrl+Shift+Tab', 'Ctrl+Shift+N', 'Ctrl+Shift+T', 'Ctrl+Shift+W'].includes(c), name: 'Ctrl+N, Ctrl+T, Ctrl+W, Ctrl+Tab', why: 'The browser keeps this key (new window or tab, close tab, next tab)' },
  { test: (c) => ['F5', 'F11', 'F12', 'Ctrl+F5', 'Ctrl+R', 'Ctrl+Shift+R'].includes(c), name: 'F5, F11, F12, Ctrl+R', why: 'The browser keeps this key (reload, full screen of the page, its tools)' },
  { test: (c) => /^Ctrl\+[1-9]$/.test(c) || ['Ctrl+PageUp', 'Ctrl+PageDown', 'Ctrl+Shift+PageUp', 'Ctrl+Shift+PageDown'].includes(c), name: 'Ctrl+1…9, Ctrl+PageUp, Ctrl+PageDown', why: 'The browser keeps this key (go to a tab, the next or the previous tab); the page may never receive it' },
  { test: (c) => ['Ctrl+Shift+Del', 'Alt+F4'].includes(c), name: 'Ctrl+Shift+Delete, Alt+F4', why: 'The browser or the system keeps this key (clear the browsing data, close the window)' },
  { test: (c) => ['Ctrl+Plus', 'Ctrl+=', 'Ctrl+-', 'Ctrl+0'].includes(c), name: 'Ctrl+Plus, Ctrl+-, Ctrl+0', why: 'The browser keeps this key (the page zoom)' },
]

/** Why a chord may not be a command’s key; null when it may. */
export function reservedReason(chord: string): string | null {
  const c = normalizeChord(chord)
  for (const r of RESERVED) if (r.chord === c || r.test?.(c)) return r.why
  return null
}

/** A key that belongs to what is on screen, not to a command: the file that listens to it, which keys, why. */
export interface LocalKey {
  /** Path from `src/` of the file that listens (or, for keys on elements, a description). */
  file: string
  keys: string
  why: string
}

export const LOCAL_KEYS: LocalKey[] = [
  { file: 'views/useShortcuts.ts', keys: 'Escape (the mount of the dispatcher too)', why: 'ends a look, drops an access tool, lets go of what is picked, closes a window: what Escape undoes depends on what is on screen' },
  { file: 'views/plan/tools/common.tsx', keys: 'Enter, Escape, Tab, Shift+Tab, Space, Shift+Space, Delete, Backspace, Ctrl+Z (capture phase)', why: 'a tool that draws finishes, cancels, steps its side or removes its last point; heard first so the project’s keys do not also act' },
  { file: 'views/plan/tools/Ruler.tsx', keys: 'Escape (capture phase)', why: 'clears the measurement, or turns the ruler off, before the plan clears its selection' },
  { file: 'views/plan/tools/standingPreview.ts', keys: 'the commands that edit the project while a Move, Copy, Rotate, Mirror, Array or Align preview stands (capture phase)', why: 'a half-made move must not be made a step by another command; they are swallowed until it ends' },
  { file: 'views/plan/useDrag.ts', keys: 'Escape, Delete, Backspace, Ctrl+Z, Ctrl+Y during a drag (capture phase)', why: 'mid-drag Escape cancels it, and the delete and undo keys must not act on the project under it' },
  { file: 'views/plan/command/CommandLine.tsx', keys: 'digits and # @ < . - + while a tool draws, and x while Array is on (capture phase)', why: 'the command line takes the characters of a typed distance, point, angle or count (x5)' },
  { file: 'views/editing/dimension/typed.ts', keys: 'digits and . , - + @ # <, Backspace, Enter, Escape while a typed drag stands (capture phase, never in a field)', why: 'the typed dimension takes the number of the handle being dragged or just dragged, in the plan and in the block editor, before any command or tool hears the key; it stands only until the next action' },
  { file: 'views/plan/usePlanCamera.ts', keys: 'Space held, Escape on a window being drawn', why: 'Space turns a drag into a pan; Escape drops a selection window' },
  { file: 'modules/warehouse/views/WarehousePlan.tsx', keys: 'Delete, Backspace, Shift+F on the block editor’s plan', why: 'Delete removes what the block editor’s plan has picked (docks, courts, holes, column lines) or the corner picked on its shape handles; Shift+F chamfers the corner picked, as the Chamfer tool’s key does on the site' },
  { file: 'modules/warehouse/views/BlockDimensions.tsx', keys: 'Delete, Backspace on a picked block dimension', why: 'removes the block plan’s picked dimension' },
  { file: 'modules/terrain/views/HeightsLayer.tsx', keys: 'Escape', why: 'leaves the contour-height tool' },
  { file: 'views/plan/grid/GridToolLayer.tsx', keys: 'Escape', why: 'drops the grid pivot drag, or the tool' },
  { file: 'views/plan/site/PlaceLayer.tsx', keys: 'Escape', why: 'drops the map being placed, or the tool' },
  { file: 'views/plan/site/ImportBar.tsx', keys: 'Escape', why: 'cancels the import being chosen' },
  { file: 'views/plan/site/SurveyWindow.tsx', keys: 'Escape', why: 'cancels the survey import window' },
  { file: 'views/stats/Overview.tsx', keys: 'Escape', why: 'lets go of what the Overview has isolated' },
  { file: 'views/compare/Compare.tsx', keys: 'Escape', why: 'closes Compare' },
  { file: 'views/home/Home.tsx', keys: 'Escape', why: 'lets go of the project picked on Home' },
  { file: 'views/layout/PanelColumn.tsx', keys: 'Escape', why: 'closes a panel’s sheet on a phone' },
  { file: 'views/layout/MenuBar.tsx', keys: 'Alt pressed and released alone, F10, Escape in the phone’s menu sheet (capture phase)', why: 'the menu bar takes the focus with them (Alt with another key is a command’s, as Alt+1), and its sheet closes on Escape' },
  { file: 'views/commands/ShortcutsWindow.tsx', keys: 'every key while the window waits for one (capture phase); Escape to close it', why: 'the next key is the one being given, so no command runs and Escape cancels the waiting before it closes the window' },
  { file: 'views/layout/Toast.tsx', keys: 'Escape (capture phase)', why: 'cancels the inline confirmation before anything else hears it' },
  { file: 'views/controls/Menu.tsx', keys: 'arrows, Home, End, Enter, Space, Escape (capture phase)', why: 'the menus’ own keys: walking rows and sub-menus, picking, closing' },
  { file: 'views/controls/MoreMenu.tsx', keys: 'Escape (capture phase)', why: 'closes the ⋯ menu' },
  { file: 'views/controls/useCloseOutside.ts', keys: 'Escape (capture phase)', why: 'closes a floating box and stops there, so the plan keeps its selection' },
  { file: 'views/viewport/BarMenu.tsx', keys: 'Escape', why: 'closes a bar’s menu' },
  { file: 'any element’s onKeyDown', keys: 'Enter, Escape, arrows, Tab on a focused control', why: 'a key on an element is that control’s by nature: fields, tabs, rows, lists, dialogs (the guard scans window listeners only)' },
]
