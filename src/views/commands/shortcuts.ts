// The keys of the commands (Project C, AS.1; spec "Shortcuts"): the defaults are on the commands (`key`), the user's are
// here, kept per browser under `gfit.shortcuts` as `{ [commandId]: string[] }`: only what differs from the defaults, an
// empty list meaning no key at all. An id that no longer exists is never asked for, so it is ignored on read; a malformed
// entry is dropped; a blocked or broken storage is the defaults for the session (and a change made then lasts the session).
//   keysOf(id)                the command's keys now: the user's, else its defaults, each as `chordOf` spells it
//   commandForKey(chord, p)   the command that has that chord in that place (the first in the registry's order), among the
//                             commands offered now, in one pass over them
//   setKeys(id, keys)         gives a command its keys (an entry that is exactly the defaults is not kept)
//   resetKeys(id?)            back to the default of one command, or of all
//   keysFor(c, user?)         `keysOf` for a command at hand (and the user's keys a render already holds)
//   defaultKeysOf(id)         the command's default keys; differsFromDefault(id) whether the user changed them
//   conflictsOf(id, chord)    the other commands that have `chord` in a place `id` also answers in (the user's keys counted;
//                             every command the registry was given, offered in this project or not)
//   giveKey(id, chord, take)  `chord` becomes the command's only key; with `take`, the commands of `conflictsOf` lose it (the
//                             others of their keys stay) in the same write: the shortcuts window (ShortcutsWindow.tsx) calls it
//   keyHint(id)               the first key as a title writes it, '' for none: `title: \`Move (${keyHint(...)})\``
//   keyOrMenu(id, menu)       the first key for a sentence ("Ctrl+Z undoes it"), or `menu` ("Edit › Undo") when it has none
//   titleWith(text, id)       "Move (M)", or just "Move" when the command has no key
//   detailOf(id)              `{ detail: 'Ctrl+D' }` for a menu row, or nothing when the command has no key
// The dispatcher (dispatch.ts) asks `commandForKey`; every title and menu detail asks `keysOf`.
import { create } from 'zustand'
import { chordLabel, normalizeChord } from './keys.ts'
import { commands, everyCommand, knownCommand } from './registry.ts'
import type { Command, Place } from './types.ts'
import { t as tr } from '../../i18n/idioma.ts' // mixed-use-mvp

export const SHORTCUTS_KEY = 'gfit.shortcuts'

type UserKeys = Record<string, string[]>

/** What the storage holds, as far as it is well formed. */
function read(): UserKeys {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(SHORTCUTS_KEY) ?? 'null')
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
    const out: UserKeys = {}
    for (const [id, keys] of Object.entries(raw)) if (Array.isArray(keys) && keys.every((k) => typeof k === 'string')) out[id] = keys.map(normalizeChord)
    return out
  } catch {
    return {}
  }
}

export const useShortcutsStore = create<{ user: UserKeys }>()(() => ({ user: read() }))

/** Reads the storage again (a reload does this once; tests do it to see what was kept). */
export function loadShortcuts(): void {
  useShortcutsStore.setState({ user: read() })
}

function keep(user: UserKeys): void {
  useShortcutsStore.setState({ user })
  try {
    localStorage.setItem(SHORTCUTS_KEY, JSON.stringify(user))
  } catch {
    // blocked storage: the change lasts this session
  }
}

const defaultsOfCommand = (c: Command | undefined): string[] => (Array.isArray(c?.key) ? c.key : c?.key ? [c.key] : []).map(normalizeChord)

/** The command's default keys; a command another project offers (Dock, in a project without docks) has its own. */
export const defaultKeysOf = (id: string): string[] => defaultsOfCommand(knownCommand(id))

/** The command's keys now: the user's, else its defaults. */
export function keysOf(id: string): string[] {
  return useShortcutsStore.getState().user[id] ?? defaultKeysOf(id)
}

/** As `keysOf`, for a command at hand (a list of every command does not look each one up again). */
export const keysFor = (c: Command, user: UserKeys = useShortcutsStore.getState().user): string[] => user[c.id] ?? defaultsOfCommand(c)

/** Where a command answers; absent: a project. */
const placesOf = (c: { where?: Place[] }): Place[] => c.where ?? ['project']

/** The command that has `chord` in `place`; none when nobody does. */
export function commandForKey(chord: string, place: Place): Command | undefined {
  const c = normalizeChord(chord)
  const user = useShortcutsStore.getState().user
  return commands().find((cmd) => placesOf(cmd).includes(place) && keysFor(cmd, user).includes(c))
}

/** `user` with the command's keys set; exactly the defaults is no entry at all. */
function withKeys(user: UserKeys, id: string, keys: string[]): UserKeys {
  const next = keys.map(normalizeChord)
  const out = { ...user }
  const def = defaultKeysOf(id)
  if (next.length === def.length && next.every((k, i) => k === def[i])) delete out[id]
  else out[id] = next
  return out
}

/** Gives a command its keys; what is its default is not kept. */
export function setKeys(id: string, keys: string[]): void {
  keep(withKeys(useShortcutsStore.getState().user, id, keys))
}

/** Whether the user changed the command's keys (they are not its defaults). */
export const differsFromDefault = (id: string): boolean => id in useShortcutsStore.getState().user

/** The other commands that have `chord` in a place `id` also answers in: two that never answer in the same place may share a
 *  key. Every command counts, offered in this project or not: a key given here meets what another project offers. */
export function conflictsOf(id: string, chord: string): Command[] {
  const c = normalizeChord(chord)
  const all = everyCommand()
  const mine = all.find((o) => o.id === id)
  if (!mine) return []
  const places = placesOf(mine)
  const user = useShortcutsStore.getState().user
  return all.filter((o) => o.id !== id && placesOf(o).some((p) => places.includes(p)) && keysFor(o, user).includes(c))
}

/** `chord` is the command's only key; with `take` the commands that had it in a shared place lose it, keeping their other keys. */
export function giveKey(id: string, chord: string, take = false): void {
  const c = normalizeChord(chord)
  let user = useShortcutsStore.getState().user
  if (take) for (const o of conflictsOf(id, c)) user = withKeys(user, o.id, keysOf(o.id).filter((k) => k !== c))
  keep(withKeys(user, id, [c]))
}

/** One command back to its default keys, or every one. */
export function resetKeys(id?: string): void {
  if (id === undefined) return keep({})
  const user = { ...useShortcutsStore.getState().user }
  delete user[id]
  keep(user)
}

/** The command's first key, as a title writes it; '' for none. */
export const keyHint = (id: string): string => chordLabel(keysOf(id)[0])

/** The command's first key for a sentence a notice or a title says ("Ctrl+Z undoes it"); its place in the menu when it has no key. */
export const keyOrMenu = (id: string, menu: string): string => keyHint(id) || menu

/** "Move (M)": `text` with its command's key in brackets, as the titles of the tools' buttons say it; no key, no brackets. */
export function titleWith(text: string, id: string): string {
  const k = keyHint(id)
  return k ? `${tr(text)} (${k})` : tr(text)
}

/** A menu row's `detail` (the key at its right) for a command: spread it into the row; none when the command has no key. */
export function detailOf(id: string): { detail?: string } {
  const k = keyHint(id)
  return k ? { detail: k } : {}
}
