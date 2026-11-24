// Connect (Decision "Streets layout", ST.7): one click, nothing asked. Each truck court no truck gate reaches gets its
// shortest way to a gate or to the network, drawn as streets of the trucks' type (`actions.connectStreets`); a toast
// says how many segments it drew, the courts it reached, the gates it joined and the parking lots it reached (their ways
// of the cars' type, Decision "Lot tool"), or why it drew none. One undo step.
import { actions } from '../../../state/actions/index.ts'
import { useApp } from '../../../state/store.ts'
import { keyOrMenu } from '../../commands/shortcuts.ts'
import { useToast } from '../../layout/toast.ts'

/** What Connect does, as plain text: the strip's button adds its key. */
export const CONNECT_HINT = 'Connect: each truck court with no way to a truck gate gets the shortest one, drawn as streets of the trucks’ type; then edit them by hand'

const courts = (n: number) => `${n} ${n === 1 ? 'court' : 'courts'}`
const lots = (n: number) => `${n} ${n === 1 ? 'parking lot' : 'parking lots'}`

/** Connects the courts of the option on the plan; what it says, said. */
export function connect(): void {
  const s = useApp.getState()
  let said = ''
  s.apply((p) => {
    const r = actions.connectStreets(p, s.option)
    const lost = r.left + r.lotsLeft
    const none = lost ? `no way found for ${[r.left ? courts(r.left) : '', r.lotsLeft ? lots(r.lotsLeft) : ''].filter(Boolean).join(' and ')}: draw ${lost === 1 ? 'it' : 'them'} with Street` : ''
    const did = [r.linked ? `${courts(r.linked)} reached` : '', r.gates ? `${r.gates} ${r.gates === 1 ? 'gate' : 'gates'} joined` : '', r.lots ? `${lots(r.lots)} reached` : ''].filter(Boolean).join(', ')
    said =
      r.segments > 0
        ? `Connect drew ${r.segments} ${r.segments === 1 ? 'segment' : 'segments'}: ${did}${none ? `; ${none}` : ''}. ${keyOrMenu('edit.undo', 'Edit › Undo')} undoes it.`
        : lost > 0
          ? `Connect drew nothing: ${none} (a truck gate first, if there is none).`
          : `Every truck court already has its way to a truck gate${s.project.options.find((o) => o.id === s.option)?.lots?.length ? ', and every parking lot its street' : ''}.`
    return r.project
  })
  if (said) useToast.getState().show('info', said)
}
