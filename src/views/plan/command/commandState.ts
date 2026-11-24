// What the active tool tells the command line (port of Plaza-Practiko `vistas/planta/iman/comandoEstado.ts`): its
// name, what it expects, the context to read what is typed, and what to do with it. A tool registers on mount and
// clears on unmount. The tools also leave here the last snapped pointer point: a bare distance goes towards it.
import { create } from 'zustand'
import type { Point } from '../../../model/schema.ts'
import type { Command, CommandContext } from './command.ts'

export interface Registration {
  /** "Mass", "Ruler", "Dimension"… */
  tool: string
  /** What it expects now: "First point", "Next point"… */
  prompt: string
  /** What can be typed in this step, short. */
  help: string
  /** The context when applying (it reads the stroke and the cursor of that moment). */
  context(): CommandContext
  /** Reads the text its own way, in place of the command line's language (a command that takes one kind of number, whole modules). */
  parse?(text: string): Command
  /** Applies what was typed. `empty` is Enter without text (close or finish). False: it could not. */
  apply(c: Command): boolean
  /** Escape with an empty field. */
  cancel(): void
  /** Backspace with an empty field: removes the last point. */
  back?(): void
  /** One value finishes it (an edit of what is selected): the field lets go of the focus after it applies, so the
   *  app's keys (Ctrl+Z, Delete, Escape) work again. A tool that places points keeps it for the next one. */
  oneShot?: boolean
}

export const useCommand = create<{
  registration: Registration | null
  /** The fixed angle of "<a" (degrees), until the next point. */
  angle: number | null
  /** The last snapped point under the pointer, from the tool that is drawing. */
  cursor: Point | null
  register(r: Registration | null): void
  fixAngle(degrees: number | null): void
  setCursor(p: Point | null): void
}>()((set) => ({
  registration: null,
  angle: null,
  cursor: null,
  register: (registration) => set(registration ? { registration } : { registration: null, angle: null }),
  fixAngle: (angle) => set({ angle }),
  setCursor: (cursor) => set({ cursor }),
}))
