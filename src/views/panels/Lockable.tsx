// What the Properties of a locked street, lot or gate show (Phase AS.4 task 4, Decision "Padlocks by kind"; the padlock is CAD's, as a locked mass's card): every field of
// it read-only, its reason as the title (`LOCKED`, "Locked: unlock it in Layers", the notice the plan shows) and a line that says it. A disabled `fieldset` disables every
// control in it (a mass's dock section does the same). Nothing around an object that is not locked.
import type { ReactNode } from 'react'
import { LOCKED } from '../../model/picked.ts'

export function Lockable({ locked, muted, children }: { locked: boolean; muted: string; children: ReactNode }) {
  if (!locked) return <>{children}</>
  return (
    <>
      <p className={`select-text text-caption ${muted}`}>{LOCKED}. It is seen on the plan, not picked, and not changed.</p>
      <fieldset disabled title={LOCKED} className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0">
        {children}
      </fieldset>
    </>
  )
}
