// The Summary's Issues tab, the one place that says what is wrong and how to settle it (Decision "Issues, one list";
// the user: "maybe the only source of information about issues should be Issues, and the ! with their own messages"):
//   ▶ Solve all     the masses the brief still asks for, placed by their rules, then every mass slides to meet the
//                   rules (solveOption; S too). The tools have no Solve
//   the issues      by what they are about (the brief, the rules, the massing, the circulation, the site), each with
//                   its message (a click goes to it: its masses selected, the plan pointed at it, its marker picked)
//                   and what settles it: its own ▶ Solve (canSolve), *Update brief* (the brief follows the design,
//                   that program alone; Decision "Brief issues"), *Edit the rule*. The same in every step (Decision
//                   "Steps change the tools")
// A marker clicked on the plan picks its place's issues here: they stand out and scroll into view.
import { useEffect, useMemo } from 'react'
import type { Issue, IssueCode } from '../../engine/types.ts'
import { useApp } from '../../state/store.ts'
import { titleWith } from '../commands/shortcuts.ts'
import { Icon } from '../controls/Icon.tsx'
import { solveOption } from '../graph/GraphTools.tsx'
import { issueKey, pickIssues, useIssueFocus } from '../plan/issueMarkers.ts'
import { briefFor, canSolve, editRule, NOTHING_TO_SOLVE, solveOne } from '../stats/issueCommands.ts'
import { goToIssue } from '../viewport/goTo.ts'
import { t as tr } from '../../i18n/idioma.ts' // mixed-use-mvp

const GROUPS: { title: string; codes: IssueCode[] }[] = [
  { title: 'Brief and design', codes: ['brief'] },
  { title: 'Rules', codes: ['relation'] },
  { title: 'Massing', codes: ['invalid-geometry', 'outside-buildable', 'overlap', 'coverage-exceeded', 'range'] },
  { title: 'Circulation', codes: ['gate', 'access', 'court', 'road', 'parking', 'lot'] },
  { title: 'Terrain', codes: ['terrain'] },
  { title: 'Site', codes: ['no-site'] },
]

const SMALL = 'pressable h-6 rounded-control px-2 text-caption'

export function IssuesTab() {
  const issues = useApp((s) => s.derived.issues)
  const masses = useApp((s) => s.derived.masses)
  const picked = useIssueFocus((s) => s.key)
  const n = useIssueFocus((s) => s.n)
  const keyed = useMemo(() => issues.map((issue) => ({ issue, key: issueKey(issue, masses) })), [issues, masses])
  const errors = issues.filter((i) => i.severity === 'error').length
  const any = issues.some(canSolve)

  // a place picked on the plan: its first issue comes into view
  useEffect(() => {
    if (picked === null) return
    const first = [...document.querySelectorAll<HTMLElement>('[data-issue-place]')].find((el) => el.dataset.issuePlace === picked)
    first?.scrollIntoView?.({ block: 'nearest' })
  }, [picked, n])

  return (
    <section aria-label="Issues" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <p className={`text-caption ${issues.length === 0 ? 'text-status-within' : errors ? 'text-status-over' : 'text-ink-secondary'}`}>
          {issues.length === 0 ? 'All rules met.' : `${issues.length === 1 ? '1 issue' : `${issues.length} issues`}${errors ? ` · ${errors === 1 ? '1 error' : `${errors} errors`}` : ''}`}
        </p>
        <button
          type="button"
          disabled={!any}
          title={any ? titleWith('Solve all: place the masses the brief still asks for and slide every mass to meet the rules (the smaller of two moves, the biggest stays)', 'design.solve') : NOTHING_TO_SOLVE}
          onClick={solveOption}
          className="pressable flex h-7 shrink-0 items-center gap-1.5 rounded-control bg-ink pl-2 pr-3 text-label font-semibold text-on-ink shadow-control hover:opacity-90 disabled:cursor-default disabled:opacity-40"
        >
          <Icon name="play" className="h-3.5 w-3.5" />
          {tr("Solve all")}
        </button>
      </div>
      {GROUPS.map((g) => {
        const list = keyed.filter((x) => g.codes.includes(x.issue.code))
        if (list.length === 0) return null
        return (
          <section key={g.title} aria-label={g.title} className="flex flex-col gap-2">
            <h3 className="text-label font-semibold text-ink">{g.title}</h3>
            <ul className="flex flex-col gap-1.5">
              {list.map(({ issue, key }, k) => (
                <IssueItem key={`${issue.code}-${issue.massIds.join()}-${k}`} issue={issue} place={key} picked={key !== null && key === picked} />
              ))}
            </ul>
          </section>
        )
      })}
    </section>
  )
}

function IssueItem({ issue, place, picked }: { issue: Issue; place: string | null; picked: boolean }) {
  const error = issue.severity === 'error'
  const goes = issue.massIds.length > 0 || issue.at !== undefined
  const solvable = canSolve(issue)
  const actions = solvable || issue.code === 'brief' || issue.rule !== undefined
  return (
    <li
      data-issue-place={place ?? undefined}
      aria-current={picked ? 'true' : undefined}
      className={`flex flex-col gap-1.5 rounded-control border p-2 ${picked ? 'border-status-over bg-hover' : 'border-separator'}`}
    >
      <div className="flex items-start gap-1.5">
        <Icon name="warning" className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${error ? 'text-status-over' : 'text-ink-secondary'}`} />
        {goes ? (
          <button
            type="button"
            title="Go to it"
            onClick={() => {
              goToIssue(issue)
              pickIssues(place)
            }}
            className={`text-left text-caption hover:underline ${error ? 'text-status-over' : 'text-ink'}`}
          >
            {issue.message}
          </button>
        ) : (
          <p className="text-caption text-ink">{issue.message}</p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap gap-1 pl-5">
          {solvable && (
            <button
              type="button"
              title={issue.code === 'brief' ? 'Place the masses the brief still asks for, where its rules ask' : 'Move its masses to settle it; the rest stay where they are'}
              onClick={() => solveOne(issue)}
              className={`${SMALL} flex items-center gap-1 bg-ink pl-1.5 font-semibold text-on-ink hover:opacity-90`}
            >
              <Icon name="play" className="h-3 w-3" />
              {tr("Solve")}
            </button>
          )}
          {issue.code === 'brief' && (
            <button type="button" title="The brief asks for what the option has, for this program" onClick={() => briefFor(issue)} className={`${SMALL} bg-fill text-ink hover:bg-hover`}>
              {tr("Update brief")}
            </button>
          )}
          {issue.rule !== undefined && (
            <button type="button" title="The Rules step, with the rule picked" onClick={() => editRule(issue)} className={`${SMALL} bg-fill text-ink hover:bg-hover`}>
              {tr("Edit the rule")}
            </button>
          )}
        </div>
      )}
    </li>
  )
}
