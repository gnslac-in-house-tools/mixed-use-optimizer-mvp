# VENDOR · código copiado y cambios a lo copiado

La integración futura a GIM depende de que los cambios al núcleo sean pocos. Cada uno se anota aquí con su razón.

## La base: GFit GIM (`gfit-generative-information-modeler@b7909184`)

Se copió tal cual: `src/`, `public/`, `server/`, `mcp/`, `index.html`, `state-graph.html`, `vite.config.ts`,
`vitest.setup.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `tailwind.config.js`,
`postcss.config.js`, `commitlint.config.js`, `package.json` y `package-lock.json`.

No se copiaron `node_modules`, `dist`, `graphify-out`, `.git`, `docs`, `resources` (archivos de muestra
confidenciales), `.env` (llaves), `CLAUDE.md`, `DAILY-NOTES.md` ni `README.md`.

`server/` y `mcp/` se quedan: `vite.config.ts` importa `server/sharedKeys.ts`, `server/usage.ts` y
`server/versions.ts`, y los tests de GIM (`src/api/**`) importan `server/` y `mcp/`.

### Cambios al núcleo de GIM

| Archivo | Cambio | Razón |
|---|---|---|
| `vite.config.ts` | `server: { port: 5180, strictPort: true }` | El puerto del proyecto; con `strictPort` falla en vez de tomar otro |
| `.gitignore` | Las entradas de GIM (`.env`, `.gfit-usage/`, `.gfit-bridge/`) más `evidence/` | Llaves locales y capturas fuera de git |
| `src/views/viewport/Viewport.tsx` | `<BarraPisos />` (de `modules/residential/views`) junto a las barras flotantes, fuera de una mirada | La barra de pisos de uso mixto: elegir qué piso (o el sótano) dibujan la planta y el 3D. No pinta nada fuera de Uso mixto |
| `src/views/layout/ui.ts`, `src/views/panels/SummaryPanel.tsx`, `src/views/layout/Dialogs.tsx` | La pestaña «Departamentos» (`departamentos`, el `Catalogo` del módulo) en el riel del panel derecho, y la ventana «Departamento» (`unidad`, `VentanaUnidad`) en el marco de ventanas de GIM | Pieza 3, primera vuelta: el catálogo y el editor de departamentos, como hizo la calificación con su pestaña y su ventana |
| `src/api/tools/index.ts` | `guardarPlan` y `borrarPlan` en `LEFT_OUT`, con su razón | Los verbos del catálogo de departamentos se usan desde su pestaña y su ventana; el agente queda fuera de esta pieza |
| `src/model/schema.ts`, `src/engine/types.ts`, `src/engine/derive.ts`, `src/engine/massing/checks.ts` | `Program.nested?` (opcional), copiado a `DerivedMass.nested`; `checkOverlap` no marca traslape entre dos masas del mismo edificio si una es `nested`. El Núcleo de Uso mixto es `nested: true` | El núcleo va dentro de su torre: sin esto cada proyecto típico salía con el error rojo de traslape. Genérico (cualquier tipología puede marcar un programa así); fuera del mismo edificio, o sin la marca, el traslape sigue igual |
| `src/model/schema.ts` | `residential: ResidentialSchema.optional()` en `ProjectSchema`, y su import de `modules/residential/engine/schema.ts` | Los datos del módulo (usos de programa, tipos, parámetros por edificio), como `warehouseTypes`. Opcional: sin migración. El esquema va en `engine/` porque las fronteras de GIM solo dejan importar el `engine/` de un módulo, y solo importa zod (sin ciclo) |
| `src/typologies/types.ts` | Campo opcional `extra?(programs): Partial<Project>` | Lo que un módulo agrega a un proyecto nuevo (Uso mixto: `residential`) |
| `src/typologies/index.ts` | `mixedUse` en `TYPOLOGIES`; `newProject` agrega `t.extra?.(programs)` | Registro de la tipología |
| `src/modules/index.ts` | `residential` en `MODULES` | Registro del módulo |
| `src/state/actions/index.ts` | `residential` (`modules/residential/actions.ts`: `setParams`) en `actions` | Los verbos de un módulo entran por aquí, trazados, y así al historial de deshacer |
| `src/views/plan/PlanSvg.tsx` | `<CapaResidencial />` sobre las masas, bajo sus etiquetas | La planta tipo, las unidades por tipo, el núcleo y las columnas |
| `src/views/scene/Scene.tsx` | `<Residencial3d />` en la escena principal | Las losas por nivel derivado y las columnas |
| `src/views/stats/Overview.tsx` | `<ResumenResidencial />` al final del Resumen | La sección «Uso mixto» |
| `src/views/panels/BuildingProperties.tsx` | `<PropiedadesResidencial buildingId />` | Fondo, pasillo, mezcla y semilla del edificio |
| `src/api/tools/index.ts` | `setParams` en `LEFT_OUT`, con su razón | GIM exige que cada verbo sea una herramienta del agente o se excluya; el agente queda fuera de esta pieza |
| `src/views/plan/tools/DrawMass.tsx` | Si la tipología ofrece `residential`, Dibujar llama a `addMass` (masa libre en el edificio del nivel elegido) en vez de `drawBlock` | En GIM, «Draw makes a block»: cada trazo sería un block de bodega con su propio edificio. Uso mixto necesita la torre, el podio y el núcleo en un mismo edificio. Decisión de Ramón, 2026-11-24 |
| `src/typologies/__tests__/typologies.test.ts` | «Toda tipología ofrece warehouse» excluye `mixed-use` | Uso mixto dibuja masas libres y solo ofrece `residential` |
| `src/modules/__tests__/catalog.test.ts` | «Con todo, todo módulo está encendido» excluye `residential` | El proyecto de prueba es el demo industrial, que no ofrece `residential` |
| `src/modules/__tests__/catalog.test.ts` | «Los KPIs y medidas encendidos son todo el catálogo» descuenta los `res-*` | En el demo industrial el módulo residencial está apagado (Tarea 6) |
| `src/modules/__tests__/catalog.test.ts` | calificación: esas dos listas descuentan también los `calif-*` | Son KPIs del módulo residencial, apagado en el demo industrial |
| `src/views/layout/ui.ts` | calificación: `SummaryTab` y `SUMMARY_TABS` ganan `calificacion` («Calificación», icono `sliders`); `Dialog` gana `calificacion` | La pestaña de la calificación por palancas en el Resumen; su botón «Editar reglas…» abre la ventana de reglas (Tarea 7 de la calificación) |
| `src/views/panels/SummaryPanel.tsx` | calificación: la rama `tab === 'calificacion'` → `<Calificacion />` | La pestaña dibuja el componente del módulo, como Overview dibuja `<ResumenResidencial />` |
| `src/views/layout/__tests__/areas.test.tsx`, `frame.test.tsx` | La pestaña «Departamentos» al final del riel del Resumen (pieza 3) |
| `src/views/stats/KpiStrip.tsx` | calificación: con el módulo residencial, el interruptor «KPIs: Calificación · Proyecto» al inicio de la barra; los ids según el juego (`idsDeLaBarra`); la celda de un `calif-*` la dibuja `<CeldaCalificacion />`, cuyo clic abre la pestaña con la palanca | La calificación siempre a la vista (spec §4 y §7.5); la lógica vive en `modules/residential/views/calificacion/`, como la celda de Issues abre su pestaña |
| `src/views/layout/Dialogs.tsx` | calificación: la rama `dialog === 'calificacion'` → `<VentanaReglas />` en el `Frame` de siempre, con el título «Reglas de calificación» | La ventana de reglas de la calificación (spec §6 y §7.3): se cierra con ✕, Esc o un clic afuera, como Brief y Rules |
| `src/views/commands/design.ts` | calificación: `design.calificacion` «Reglas de calificación…» en el menú Design, tras Rules…; desactivado sin `project.residential` («Only with the Uso mixto typology») | La ventana de reglas se abre desde Design (spec §6 y §7.4) |
| `src/views/commands/__tests__/viewSiteDesignTools.test.tsx`, `src/views/commands/__tests__/registry.test.ts` | calificación: el menú Design lleva `design.calificacion` «Reglas de calificación…» tras «Rules…» | El comando nuevo de Design |
| `src/api/tools/index.ts` | calificación: `setCalificacion` en `LEFT_OUT`, con su razón | El verbo de la ventana de reglas vive en `modules/residential/actions.ts`; el agente queda fuera de esta pieza |

## GFit (`gfit-mixed-use-rhino/panel@267efea`, vía `C:\dev\mixed-use-optimizer\engine\gfit`)

Copia completa de `src/` y `test/` en `src/modules/residential/engine/gfit/`, con el parche `setLevelOverride` que
ya traía `mixed-use-optimizer`. Reemplaza la copia parcial (solo cuartos, con shims de `host/protocol.ts` y
`model/state.ts`) de la pieza anterior.

### Parches (`mixed-use-mvp patch`)

| Archivo | Cambio | Razón |
|---|---|---|
| `test/*.test.ts` | Primera línea: `import { test, expect, … } from 'vitest'` | GIM corre Vitest sin `globals`; así no se toca su configuración |
| `src/**/*.ts`, `test/*.test.ts` | Los imports relativos llevan `.ts` (154 imports en 41 archivos, cambio mecánico) | `tsconfig.node.json` de GIM (nodenext, incluye `mcp/`) llega a GFit por la tipología y exige extensiones |
| `src/layout/level.ts` | `setUnitModule({ origin, u, step } \| null)` y `avisosModulo()`. Con el módulo puesto: `widthsOf` da los múltiplos del módulo dentro de `[wMin, wMax]` (en la rejilla de 0.3 m de la banda; sin ninguno, el menor desde `wMin`, con aviso); cada tramo de banda se recorta a líneas de módulo en el eje de la retícula que sigue su fachada (lo recortado es el «remanente» del nivel, con aviso), y las unidades de punta ya no crecen sobre lo que sobra. Con `null`, GFit queda exactamente como antes | Los muros entre departamentos caen sobre los módulos de la retícula (cada 2.7 m). El solver de banda ya estira las unidades para llenar su tramo: con tramos y anchos en módulos, el estiramiento es 1 |
| `src/layout/level.ts` | Los avisos del módulo que salen al resolver un nivel van también en su `issues` (`solveLevel` envuelve a `solveLevel0`); `moduloUnidad()` da el módulo puesto | Un nivel que sale del caché conserva sus avisos |
| `src/layout/level.ts` | `ModuloUnidad.bay` (la crujía en u y v), `golpesColumna` y `ordenColumnas`: con la crujía puesta, los anchos que el solver de banda eligió para un tramo se reordenan para que el mayor número de muros entre departamentos caiga en las líneas de columnas (el orden original si ninguno mejora; mismos anchos, misma mezcla) | Las columnas ajustan los anchos: los muros buscan las columnas. Un orden nuevo solo se toma si no baja la nota del solver (el producto de su `bias` por unidad y lugar: reglas de esquina, de núcleo y de apilado) |
| `src/layout/building.ts` | El módulo (`moduloUnidad()`) entra en la llave del caché de niveles | Si no, la misma placa sobre una retícula movida reutilizaba la planta vieja (test (j) de `derivar`) |
| `src/model/blocks.ts` | `lobbyH` 0 quiere decir sin lobby (`cutBlocks`) | En Uso mixto cada placa de vivienda lleva departamentos: con lobby, una masa de un nivel en el suelo no daba ninguno (se vio en el recorrido) |

## Del MVP anterior (catálogo de unidades)

Se mudaron al módulo residencial y no se usan hasta la pieza 3:

| Antes | Ahora |
|---|---|
| `engine/catalogo.ts`, `engine/catalogo.test.ts` | `src/modules/residential/engine/catalogo.ts`, `src/modules/residential/__tests__/catalogo.test.ts` (con el import de `vitest`) |
| `ui/tresd/Unidad3d.tsx`, `ui/tresd/geometria3d.ts`, `ui/tresd/muebles3d.ts` | `src/modules/residential/views/` |
| `ui/PlanMini.tsx` | `src/modules/residential/views/PlanMini.tsx` |

`catalogo.ts` vino de `mixed-use-optimizer@e6b1a81` (`engine/muebles.ts`, `engine/plantaEditada.ts#recintos`,
`ui/presets.ts`, `ui/marca.ts`). `geometria3d.ts` (solo `extruir`) vino de Plaza Praktico
(`202609_Plaza-Practiko@258a5b4`, `app/src/vistas/tresd`).

Se borró el marco recreado (`ui/marco`, `ui/App.tsx`, los estilos y el estado) porque GIM trae el real. Con él se
fueron las piezas de Praktico que solo usaba el visor del catálogo: `Escena.tsx`, `Luces.tsx`, `Suelo.tsx` y
`useEncuadre.ts`.

## Documentos de GIM

`docs/ARCHITECTURE.md`, `docs/tour.md` y `docs/mcp.md` se copiaron de GIM porque sus tests los leen
(`src/kinds/__tests__/registry.test.ts`, `src/views/tour/__tests__/texts.test.tsx`). El resto de `docs/` de GIM no se copió.

## Tests

Tras la Tarea 1: 5634 tests en 486 archivos. Del módulo residencial, 155 (150 de GFit y 5 del catálogo).
Con la suite completa en esta máquina, tres tests de GIM con interfaz (`shortcutsWindow`, `saveReview`,
`shapeHandles`) pueden pasar de su límite de 5 s por carga; solos pasan (92/92).

### Más tests de GIM que enumeran tipologías, comandos o campos (Tarea 2)

| Test | Cambio |
|---|---|
| `src/views/editing/__tests__/noPlainMass.test.ts` | `DrawMass.tsx` en sus excepciones de `addMass`, con su razón |
| `src/views/commands/__tests__/registry.test.ts`, `fileEditHelp.test.tsx` | El comando `file.new.mixed-use` |
| `src/views/home/__tests__/home.test.tsx` | «Uso mixto» en los tipos de proyecto de Create new |
| `src/model/__tests__/schema.test.ts` | `residential` en las claves del JSON Schema |
| `src/views/layout/__tests__/areas.test.tsx` | La pestaña «Departamentos» al final del riel del Resumen (pieza 3) |

La tipología lleva `plugins.optimizer` vacío (`templates: []`, `stages: []`): GIM exige datos del optimizador en
toda tipología (`circulation.test.ts`) y el optimizador queda fuera de esta pieza.
