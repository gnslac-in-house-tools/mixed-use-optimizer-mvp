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

## GFit (`gfit-mixed-use-rhino/panel@267efea`, vía `C:\dev\mixed-use-optimizer\engine\gfit`)

Copia completa de `src/` y `test/` en `src/modules/residential/engine/gfit/`, con el parche `setLevelOverride` que
ya traía `mixed-use-optimizer`. Reemplaza la copia parcial (solo cuartos, con shims de `host/protocol.ts` y
`model/state.ts`) de la pieza anterior.

### Parches (`mixed-use-mvp patch`)

| Archivo | Cambio | Razón |
|---|---|---|
| `test/*.test.ts` | Primera línea: `import { test, expect, … } from 'vitest'` | GIM corre Vitest sin `globals`; así no se toca su configuración |

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
