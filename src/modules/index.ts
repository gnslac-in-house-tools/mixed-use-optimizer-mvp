// The only list of modules (Decision "Modules"), as typologies/index.ts is of typologies and plugins/registry.ts of
// plugins. Adding a module = a folder with its `module.ts` + one line here. The rest of the app reads them through
// catalog.ts, never from here.
import { core } from './core/module.ts'
import { docks } from './docks/module.ts'
import { parking } from './parking/module.ts'
import { residential } from './residential/module.ts'
import { terrain } from './terrain/module.ts'
import type { Module } from './types.ts'
import { warehouse } from './warehouse/module.ts'

export const MODULES: Module[] = [core, warehouse, docks, terrain, parking, residential]
