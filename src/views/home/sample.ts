// What changes while the sample project is open (Decisions "Sample project", "Plugin lock"): the agent is held back
// (its button greyed: not in this demo) and, as it opens, the tour is offered. A project of the user's has neither.
import { usePluginModes } from '../../plugins/index.ts'
import { SAMPLE_ID } from '../../state/sample.ts'
import { useApp } from '../../state/store.ts'
import { useTour } from '../tour/tour.ts'

export const AGENT_LOCK = 'The agent is not available in this demo: GFit models by hand and with the optimizer here.'

/** Holds the agent back while the sample is open; returns the way to stop. */
export function followSample(): () => void {
  const hold = (id: string) => usePluginModes.getState().lock('agent', id === SAMPLE_ID ? AGENT_LOCK : null)
  hold(useApp.getState().project.id)
  return useApp.subscribe((s, prev) => {
    if (s.project.id === prev.project.id) return
    hold(s.project.id)
    // the sample tour ends with the sample; From zero makes and opens a project of its own, and goes on
    if (s.project.id !== SAMPLE_ID && useTour.getState().tutorial === 'tour') useTour.getState().exit()
  })
}
