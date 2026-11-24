// What a person calls a reference line and a note (Phase AS.5): the words `state/settle.ts` says a padlock in, and the rows of Layers and
// Properties will read. A reference line has no name of its own: it is *Reference line N*, N its place among the project's. A note's name
// is its text: its first words. Pure.

/** *Reference line 3*: `index` is its place in `Project.referenceLines`, counted from 0. */
export const referenceLineName = (index: number): string => `Reference line ${index + 1}`

/** How many words, and at most how many characters, of a note's text name it. */
const NAME_WORDS = 4
const NAME_CHARS = 24

/** The lines of a note's text, as written (an empty line stays one): split on `\r\n`, `\r` or `\n`. The plan draws them, the CAD plan writes them. */
export const noteLines = (text: string): string[] => text.split(/\r\n|\r|\n/)

/** A note's name: the first words of the first line of its text, cut with "…" when that line has more; *Note* when it says nothing. */
export function noteName(text: string): string {
  const words = (text.split('\n').find((l) => l.trim() !== '') ?? '').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return 'Note'
  const first = words.slice(0, NAME_WORDS).join(' ')
  if (first.length > NAME_CHARS) return `${first.slice(0, NAME_CHARS)}…`
  return words.length > NAME_WORDS ? `${first}…` : first
}
