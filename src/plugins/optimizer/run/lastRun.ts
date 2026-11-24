// The app's last runs, kept in this browser's IndexedDB by project and by stage (saved.ts; Decisions "Last run kept",
// "Stage options"). Loaded with the plugin's button and tabs, so a plugin that is off keeps nothing and loads nothing.
// Leaving the page saves what is waiting to be saved.
import { currentProject, subscribeProject } from '../../host.ts'
import { indexedShelf, keepRuns } from './saved.ts'
import { useRun, type StageRef } from './store.ts'

const kept = typeof indexedDB !== 'undefined' ? keepRuns(useRun, indexedShelf(), { current: currentProject, subscribe: subscribeProject }) : null
if (kept) addEventListener('pagehide', kept.flush)

/** A stage's last run back in the tabs, if this browser kept it: whether it came. */
export const restoreStageRun = (ref: StageRef): Promise<boolean> => kept?.restoreStage(ref) ?? Promise.resolve(false)
