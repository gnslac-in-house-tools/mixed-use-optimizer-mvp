# VENDOR · código copiado

## De mixed-use-optimizer (`C:\dev\mixed-use-optimizer@e6b1a81`)

| Origen | Destino | Cambios |
|---|---|---|
| `engine/gfit/src/model/{geom,program}.ts`, `engine/gfit/src/layout/{rooms,rng}.ts` | igual | Ninguno |
| `engine/gfit/test/rooms.test.ts` | igual | Ninguno (11 tests en verde) |
| `engine/muebles.ts` (CATALOGO, amueblar, huella, planNuevo, coincidencia), `engine/plantaEditada.ts#recintos`, `ui/presets.ts`, `ui/marca.ts` | `engine/catalogo.ts` | Solo lo que usa el catálogo. `limpio` usa una versión local en lugar de `tidy` de GIM. La Biblioteca GFit prueba +0.3 y +0.6 m cuando el WFC no llena un ancho (antes, el 3 rec. compacto de 12.0 m quedaba como un solo recinto) |
| `ui/Catalogo.tsx#PlanMini`, `ui/Furniture.tsx` | `ui/PlanMini.tsx` | Sin interacción (arrastrar o elegir) |
| `ui/Catalogo.tsx` | `ui/Catalogo.tsx` | Sin planta: no hay asignar, arrastrar ni coincidencia con una unidad |

Shims, que no vienen de GFit: `engine/gfit/src/host/protocol.ts` (solo `Pt` y `Ring`) y `engine/gfit/src/model/state.ts` (la forma mínima de `State`).

## De Plaza Praktico (`202609_Plaza-Practiko@258a5b4`, `app/src/vistas/tresd`)

| Origen | Destino | Cambios |
|---|---|---|
| `Luces.tsx`, `useEncuadre.ts` | `ui/tresd/` | Ninguno |
| `geometria3d.ts` | `ui/tresd/geometria3d.ts` | Solo `extruir` y sus ayudas |
| `Suelo.tsx` | `ui/tresd/Suelo.tsx` | Sin el mapa de fondo |
| `Escena.tsx` | `ui/tresd/Escena.tsx` | Solo el visor: Canvas, luces, suelo, órbita y encuadre. Encuadrar lo pide el marco (`encuadre.ir`). No trae soltar, captura ni «ir a». El tamaño mínimo baja de 50 m a 12 m |

Las versiones de React (19), R3F (9), drei (10) y three (0.186) son las de Praktico.

## De GFit GIM (`gfit-generative-information-modeler@b7909184`): el marco de la interfaz

| Origen | Destino | Cambios |
|---|---|---|
| `src/styles/tokens.css`, `src/styles/global.css`, `tailwind.config.js`, `postcss.config.js` | `ui/styles/`, raíz | Solo `content` de Tailwind apunta a `ui/` |
| Los íconos (los trazos de cada `<svg>` de 16 × 16), copiados del DOM de GIM en ejecución | `ui/marco/iconos.ts` | Ninguno |
| `App.tsx` (rejilla), `layout/TopBar.tsx` + `MenuBar.tsx`, `stats/KpiStrip.tsx`, `layout/PanelColumn.tsx`, `layout/PanelTabs.tsx`, `layout/PanelRail.tsx`, `tools/ToolStrip.tsx`, `viewport/DraftingBar.tsx`, `viewport/Viewport.tsx`, `panels/SummaryPanel.tsx`, `controls/{Icon,BarButtons,Segmented}.tsx`, `layout/ui.ts` | `ui/App.tsx`, `ui/marco/*` | Se reescribieron con las mismas clases y la misma estructura, pero sin el registro de comandos, el arrastre de barras, las hojas para pantallas angostas ni el teléfono. Los menús y las herramientas son los de GIM, traducidos. Los que todavía no aplican se ven atenuados («por decidir») |

Ojo: en los tokens de GIM, la escala de espaciado `1–8` son tokens (4, 8, 12, 16, 24, 32, 48 y 64 px), no la escala de Tailwind. Por ejemplo, `h-7` mide 48 px. Para la altura de una fila se usa `h-row`.
