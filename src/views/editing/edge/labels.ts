// The words of the On edge views (Phase D.3 task 10): what a slide's field calls what it drags, and what its refusal says.
export const SLIDE_WHAT = 'Slide'
export const SLIDE_HELP = 'whole modules · + towards the wall’s higher modules, − the other way'

export const COUNT_WHAT = 'Count'
export const COUNT_HELP = 'how many in all on the wall, a whole number'
export const WIDTH_WHAT = 'Width'
export const WIDTH_HELP = 'the width in metres'

/** What the field calls the elements being slid ("Slide · 2 docks"). */
export const slideName = (n: number, kind: string): string => `${n} ${kind}${n === 1 ? '' : 's'}`

/** A reason as a toast says it: a sentence. */
export const sentence = (reason: string): string => (/[.!?]$/.test(reason) ? reason : `${reason}.`)
