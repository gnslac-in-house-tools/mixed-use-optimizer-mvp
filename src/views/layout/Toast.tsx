// The floating notice, bottom centre, above the drafting bar. Port of Plaza-Practiko `vistas/paneles/Toast.tsx`.
// Errors stay until closed; info goes away by itself. A pending confirmation (Cancel / Continue) takes its place until
// it is answered. An edit a lock refused (the store's `refusal`) shows here too; a dimension's fixed length shows the
// dimensions, so the reason is seen.
import { useEffect, useRef } from 'react'
import { useApp } from '../../state/store.ts'
import { LOCKED_DIMENSION } from '../../state/dimensionAnchors.ts'
import { Icon } from '../controls/Icon.tsx'
import { DIMENSIONS } from '../layers/keys.ts'
import { useLayerView } from '../layers/layerView.ts'
import { useToast } from './toast.ts'
import { t as tr } from '../../i18n/idioma.ts' // mixed-use-mvp

const INFO_MS = 5000
const ACTION_MS = 9000
const LAYER = 'pointer-events-none fixed inset-x-0 bottom-20 z-[80] flex justify-center px-4 phone:bottom-[calc(5rem+env(safe-area-inset-bottom))]'

export function Toast() {
  const toast = useToast((s) => s.toast)
  const close = useToast((s) => s.close)
  const confirmation = useToast((s) => s.confirmation)

  const refusal = useApp((s) => s.refusal)
  useEffect(() => {
    if (!refusal) return
    useToast.getState().show('info', refusal.text)
    if (refusal.text === LOCKED_DIMENSION) useLayerView.getState().setHidden([DIMENSIONS], false)
  }, [refusal])

  useEffect(() => {
    if (toast?.kind !== 'info') return
    // one with a question stays a little longer, to be read and answered
    const t = setTimeout(close, toast.action ? ACTION_MS : INFO_MS)
    return () => clearTimeout(t)
  }, [toast, close])

  if (confirmation) return <Confirmation />
  if (!toast) return null
  const error = toast.kind === 'error'
  return (
    <div className={LAYER}>
      <div
        key={toast.id}
        role={error ? 'alert' : 'status'}
        className="panel sheet-up pointer-events-auto flex max-w-[40rem] items-start gap-3 py-3 pl-4 pr-2 shadow-sheet"
      >
        {error && <Icon name="warning" className="mt-0.5 h-4 w-4 shrink-0 text-status-over" />}
        <p className="min-w-0 flex-1 select-text text-body">{toast.text}</p>
        {toast.action && (
          <button
            type="button"
            className="pressable -my-1 shrink-0 rounded-control px-2.5 py-1 text-label font-medium hover:bg-hover"
            onClick={() => {
              close()
              toast.action!.run()
            }}
          >
            {toast.action.label}
          </button>
        )}
        <button
          type="button"
          aria-label="Close notice"
          className="pressable -my-1 grid h-[1.75rem] w-[1.75rem] shrink-0 place-items-center rounded-pill text-ink-segment hover:bg-hover hover:text-ink phone:h-10 phone:w-10"
          onClick={close}
        >
          <Icon name="close" className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

/** The inline confirmation, without window.confirm. The focus goes to Cancel; Escape cancels too. */
function Confirmation() {
  const confirmation = useToast((s) => s.confirmation)
  const closeConfirmation = useToast((s) => s.closeConfirmation)
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    cancelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // the Escape is the confirmation's: the plan does not also clear the selection
      e.preventDefault()
      e.stopPropagation()
      closeConfirmation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [confirmation, closeConfirmation])

  if (!confirmation) return null
  return (
    <div className={LAYER}>
      <div
        key={confirmation.id}
        role="alertdialog"
        aria-modal="true"
        aria-label="Confirm"
        aria-describedby="confirmation-text"
        className="panel sheet-up pointer-events-auto flex max-w-[40rem] flex-wrap items-center gap-3 py-3 pl-4 pr-3 shadow-sheet"
      >
        <p id="confirmation-text" className="min-w-0 flex-1 text-body">
          {confirmation.text}
        </p>
        <div className="flex shrink-0 gap-2">
          <button ref={cancelRef} type="button" className="pressable rounded-control px-3 py-1.5 text-label font-medium hover:bg-hover" onClick={closeConfirmation}>
            {tr("Cancel")}
          </button>
          {confirmation.other && (
            <button
              type="button"
              className="pressable rounded-control px-3 py-1.5 text-label font-medium hover:bg-hover"
              onClick={() => {
                closeConfirmation()
                confirmation.other!.run()
              }}
            >
              {confirmation.other.label}
            </button>
          )}
          <button
            type="button"
            className="pressable rounded-control bg-ink px-3 py-1.5 text-label font-medium text-on-ink"
            onClick={() => {
              closeConfirmation()
              confirmation.onContinue()
            }}
          >
            {confirmation.label ?? 'Continue'}
          </button>
        </div>
      </div>
    </div>
  )
}
