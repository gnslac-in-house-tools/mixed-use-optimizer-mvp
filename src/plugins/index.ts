// The core's only door to the plugins (Decision "Optimizer plugin"): the frame imports this file and nothing else
// under plugins/ (a test checks it); the engine, the model and the state never import plugins at all.
export { COMING_SOON, PLUGINS } from './registry.ts'
export { heldBack, isSoon, modeOf, usePluginModes } from './settings.ts'
export {
  isPluginTab,
  PluginCategories,
  useHasPluginActions,
  PluginTabPanel,
  pluginTabLabel,
  PluginWidePane,
  PluginWindowView,
  pluginWindowOf,
  usePluginTabs,
  useWidePane,
  useWideTab,
  WIDE_SHARE,
  type RibbonParts,
} from './slots.tsx'
export type { Plugin, PluginAction, PluginActionProps, PluginMode, PluginTab, PluginTabKey, PluginTabProps, PluginWindow, PluginWindowKey } from './types.ts'
