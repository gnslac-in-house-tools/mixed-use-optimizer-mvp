// The warnings chip, bottom right of the viewport (port of Plaza-Practiko `vistas/paneles/ChipAvisos.tsx`): in view
// whenever derive() reports issues, red when one is an error. It says no more than their count (Decision "Issues, one
// list"; the user: "this one should not give me information, only highlight, in red, to find where the problem is in
// the viewport"): pressed, every place with issues is marked in red on the plan (IssueMarkers.tsx `IssueHighlight`);
// pressed again, the marks go. What they are and how to settle them is the Summary's Issues tab. The count can shrink
// to the icon alone (a preference of whoever looks, in the View menu); figures and issues do not change.
import { useEffect } from 'react'
import { Icon } from '../controls/Icon.tsx'
import { useIssueFocus } from '../plan/issueMarkers.ts'
import { useWarningsPref } from './warningsPref.ts'
import { useApp } from '../../state/store.ts'

export function WarningsChip() {
  const issues = useApp((s) => s.derived.issues)
  const visible = useWarningsPref((s) => s.visible)
  const on = useIssueFocus((s) => s.highlight)
  const none = issues.length === 0
  // nothing left to mark: the marks go with the chip
  useEffect(() => {
    if (none && useIssueFocus.getState().highlight) useIssueFocus.setState({ highlight: false })
  }, [none])
  if (none) return null
  const errors = issues.filter((i) => i.severity === 'error').length
  const text = issues.length === 1 ? '1 issue' : `${issues.length} issues`
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={text}
      title={on ? 'Hide the red marks' : `${text}: a click marks where they are in red (what they are: the Summary's Issues)`}
      className={`pressable pointer-events-auto glass flex items-center gap-1.5 rounded-pill px-3 py-1 text-body font-medium shadow-control ${errors > 0 ? 'text-status-over' : 'text-ink'} ${
        on ? 'ring-2 ring-status-over' : ''
      }`}
      onClick={() => useIssueFocus.setState({ highlight: !on })}
    >
      <Icon name="warning" className="h-3.5 w-3.5" />
      {visible && text}
    </button>
  )
}
