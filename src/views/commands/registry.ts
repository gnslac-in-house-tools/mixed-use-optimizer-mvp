// The commands' registry (Project C, AS.1; spec "One rule for the whole project"): every command of the app is defined
// once and registered here; the top menu, the keys and the buttons that stay read it by id. This file only holds and
// serves them, it defines none:
//   register(list)         adds commands; a second command with an id is refused (a definition's mistake) unless it is
//                          the very same object, which is a no-op
//   registerList(menu, f, every?)  a place in a menu whose commands depend on the project (New … project: one per
//                          typology): `f` is called whenever the registry is read and its commands stand where it was
//                          registered. `every` says all the commands `f` could ever give, offered now or not (a module's
//                          tools in a typology without the module): the keys read them (everyCommand), the menu does not
//   commands()             every command in registration order (`dev` ones only in development); commandOf(id) one.
//                          A list's item that cannot stand (an id taken, outside its menu) is left out and said once on the
//                          console: a menu is never lost to it
//   everyCommand()         every command the registry was given, offered or not, for the keys alone (a key given here
//                          meets a command another project offers); knownCommand(id) one of them
//   runCommand(id)         runs one when it is enabled; false when it is missing or says why not
//                          A window's own command (`window`: the Rules window's and the block editor's keys) stands in no menu:
//                          menuEntries and menusFor leave it out, the bar's and the phone's sheet with them
//   menuEntries(path)      the registry as `Menu` (views/controls/Menu.tsx) wants a menu: items in registration order, a
//                          command with a longer `menu` path becomes a sub-menu at its first command, `separatorBefore`
//                          a separator, `enabled()` a string a disabled row with that title, `checked()` a tick, the first
//                          key the row's `detail` (the user's, else the default); read when the menu opens
//   menusFor(place)        the menus with a command answering in a place (the menu bar shows those)
// Hot reload: the definitions are plain data (`registerFile()`, `registerEdit()`, … in their files) and `registerAll()`
// (index.ts) is the one place that registers them, after `resetRegistry()`: evaluating index.ts again (Vite's hot reload,
// a test) rebuilds the registry from nothing instead of throwing on its own ids.
import type { MenuEntry } from '../controls/Menu.tsx'
import { chordLabel } from './keys.ts'
import { keysFor } from './shortcuts.ts'
import type { Command, Place } from './types.ts'

/** The top menu, left to right: the first of every command's `menu`. */
export const MENUS = ['File', 'Edit', 'View', 'Site', 'Design', 'Tools', 'Help'] as const

type Slot = { command: Command } | { menu: string[]; list: () => Command[]; every?: () => Command[] }
let slots: Slot[] = []

/** Adds commands to the registry; throws on an id that is taken by another definition. */
export function register(list: Command[]): void {
  const taken = new Map<string, Command>()
  for (const s of slots) if ('command' in s) taken.set(s.command.id, s.command)
  const fresh: Command[] = []
  for (const c of list) {
    const had = taken.get(c.id)
    if (had === c) continue
    if (had) throw new Error(`Command "${c.id}" is registered twice`)
    taken.set(c.id, c)
    fresh.push(c)
  }
  for (const command of fresh) slots.push({ command })
}

/** A place in `menu` for commands that depend on the project: `list` is called whenever the registry is read. `every` is
 *  all the commands it could give whatever the project (the keys read those); absent, what `list` gives now. */
export function registerList(menu: string[], list: () => Command[], every?: () => Command[]): void {
  slots.push({ menu, list, every })
}

/** What has been said on the console already: a bad item of a list is said once, not at every render. */
const said = new Set<string>()
function say(message: string): void {
  if (said.has(message)) return
  said.add(message)
  console.error(message)
}

/** Empties the registry (index.ts's `registerAll` starts with it; tests). */
export function resetRegistry(): void {
  slots = []
  said.clear()
}

const developing = (): boolean => import.meta.env.DEV

/** Every command, in registration order (a list's commands where it was registered). The registered ones cannot repeat an
 *  id (`register` refuses); a list's item that does, or that is outside the menu its list stands in, is a definition's
 *  mistake that must not take the menu down at every render: it is left out and said once. */
export function commands(): Command[] {
  const all: Command[] = []
  const seen = new Set<string>()
  for (const s of slots) {
    const list = 'list' in s
    for (const c of list ? s.list() : [s.command]) {
      if (list && !s.menu.every((m, i) => c.menu[i] === m)) {
        say(`Command "${c.id}" is not in the menu its list stands in (${s.menu.join(' > ')}): left out`)
        continue
      }
      if (seen.has(c.id)) {
        say(`Command "${c.id}" is registered twice: the later one is left out`)
        continue
      }
      seen.add(c.id)
      all.push(c)
    }
  }
  return developing() ? all : all.filter((c) => !c.dev)
}

/** Every command the registry was given, offered or not (a module's tools in a typology without the module): for the
 *  keys alone, so a key given to one command meets a command another project offers. The menu reads `commands()`. */
export function everyCommand(): Command[] {
  const all: Command[] = []
  const seen = new Set<string>()
  for (const s of slots) {
    for (const c of 'list' in s ? (s.every ?? s.list)() : [s.command]) {
      if (seen.has(c.id)) continue
      seen.add(c.id)
      all.push(c)
    }
  }
  return developing() ? all : all.filter((c) => !c.dev)
}

export const commandOf = (id: string): Command | undefined => commands().find((c) => c.id === id)

/** One command by its id, offered now or not. */
export function knownCommand(id: string): Command | undefined {
  const own = slots.find((s): s is { command: Command } => 'command' in s && s.command.id === id)
  if (own) return developing() || !own.command.dev ? own.command : undefined
  return everyCommand().find((c) => c.id === id)
}

/** Runs `c` when it is enabled; false when it says why not. */
function run(c: Command): boolean {
  if ((c.enabled?.() ?? true) !== true) return false
  void c.run()
  return true
}

/** Runs a command by its id: false when it is missing or not enabled (nothing runs then). */
export function runCommand(id: string): boolean {
  const c = commandOf(id)
  return c ? run(c) : false
}

type Leaf = Extract<MenuEntry, { onSelect(): void }>

function leaf(c: Command): Leaf {
  const why = c.enabled?.() ?? true
  // the user's keys when they gave some (an empty list: none), else the defaults
  const first = chordLabel(keysFor(c)[0]) || undefined
  return {
    key: c.id,
    label: typeof c.label === 'function' ? c.label() : c.label,
    ...(first && { detail: first }),
    ...(why !== true && { disabled: true, title: why }),
    ...(c.checked && { checked: c.checked() }),
    onSelect: () => void run(c),
  }
}

/** The menus that have at least one command answering in `place`, in the bar's order: a menu with none there is not shown. */
export function menusFor(place: Place): string[] {
  const all = commands().filter((c) => !c.window)
  return MENUS.filter((m) => all.some((c) => c.menu[0] === m && (c.where ?? ['project']).includes(place)))
}

/** The entries of the menu at `path`, from `all`: commands at it, and a sub-menu where commands go deeper. */
function build(all: Command[], path: string[]): MenuEntry[] {
  type Item = { sep: boolean; entry: () => MenuEntry }
  const items: Item[] = []
  const subs = new Set<string>()
  for (const c of all) {
    if (!path.every((p, i) => c.menu[i] === p)) continue
    if (c.menu.length === path.length) items.push({ sep: !!c.separatorBefore, entry: () => leaf(c) })
    else {
      const name = c.menu[path.length]
      if (subs.has(name)) continue
      subs.add(name)
      const items2 = build(all, [...path, name])
      items.push({ sep: !!c.separatorBefore, entry: () => ({ key: name, label: name, items: items2 }) })
    }
  }
  const out: MenuEntry[] = []
  for (const it of items) {
    if (it.sep && out.length > 0) out.push('separator')
    out.push(it.entry())
  }
  return out
}

/** The registry as `Menu` wants the menu at `path` (['File'], or ['File', 'Export'] for a sub-menu); read when it opens. */
export function menuEntries(path: string[]): MenuEntry[] {
  return build(commands().filter((c) => !c.window), path)
}
