// The modules' verbs in the one right-click menu (Phase AS.4, Decision "One menu"): a module registers the runners of its kinds' verbs from
// its own `views/` (the warehouse: *Edit in the block editor* and *Save to the library* on a mass that is a block, a block of the Blocks tab, and the parts of a block in
// the block editor), and this file loads them,
// as `src/views/` may import a module's `views/` and nothing else of it (`modules/__tests__/boundaries.test.ts`). The registry says whether
// a module's verb is listed (`kinds/index.ts`: only while the typology offers the module); the runner says what it does.
import '../../../modules/warehouse/views/menuVerbs.ts'
import '../../../modules/warehouse/views/blockMenu.ts'
import '../../../modules/warehouse/views/partsMenu.ts'
