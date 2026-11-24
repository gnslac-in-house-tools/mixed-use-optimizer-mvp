# Pieza 1 · GIM con la tipología «Uso mixto»: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El repo pasa a ser GFit GIM con una tipología «Uso mixto» y un módulo `residential`. Al modelar una masa, el motor de GFit genera niveles, plantas tipo y departamentos con los muros sobre los módulos de la retícula, más columnas en los cruces de ejes y las cifras en KPIs y Resumen.

**Architecture:** GIM (`b7909184`) se copia completo como base. El módulo `src/modules/residential/` trae el motor de GFit copiado tal cual (más un parche de módulos de unidad) y un adaptador puro, `derivar`, que convierte las masas derivadas de GIM (`DerivedMass`) en sólidos del modo `mass` de GFit, con sus cortes prismáticos, y corre `calcOption`. Las vistas del módulo se enganchan como lo hacen los andenes: importándose en `PlanSvg.tsx`, en la escena 3D y en el Resumen.

**Tech Stack:** el de GIM: React 19, R3F 9, drei 10, three 0.186, zustand 5, zod 4, Tailwind 3, Vite, Vitest, Playwright para el recorrido.

**Spec:** `docs/superpowers/specs/2026-11-23-pieza-1-base-gim-uso-mixto-design.md`

## Global Constraints

- **Base:** GIM `C:\Users\gramo\OneDrive\Escritorio\Gensler - Local Respositories\gfit-generative-information-modeler` @ `b7909184`.
- **GFit:** `C:\dev\mixed-use-optimizer\engine\gfit` (= `gfit-mixed-use-rhino/panel@267efea`, con el parche `setLevelOverride`). Se copia sin reescribir.
- **Retícula de la tipología:** `{ x: 8.1, y: 8.1, modules: 3 }`, es decir, módulo de 2.7 m.
- **Entrepisos:** Vivienda 3.0 m, Comercio 4.5 m.
- **Colores de tipo:** estudio `#F4C3C5`, 1 rec. `#5BB58C`, 2 rec. `#A99BE6`, 3 rec. `#EE9362`.
- **Columnas:** cuadros de 0.5 m, solo en los cruces de crujía (cada 8.1 m), dentro de la huella y fuera de huecos y núcleos.
- **Cambios al núcleo de GIM**, cada uno anotado en `VENDOR.md` con su razón:
  - una línea en `ProjectSchema`;
  - el registro en `typologies/index.ts` y en `modules/index.ts`;
  - los ganchos de vista en `PlanSvg.tsx`, la escena, `Overview.tsx` y las propiedades del edificio.
- **Parches a GFit:** van marcados `mixed-use-mvp patch` y se anotan en `VENDOR.md`.
- **Idioma:** lo de GIM queda en inglés y lo nuevo se escribe en español.
- **Servidor:** puerto 5180. Antes de `npm run dev` se cierran los demás servidores de desarrollo.
- **Commits:** cada uno termina con `Claude-Session: https://claude.ai/code/session_01K75ASjbUYGDpr95zRPvTkE`.

## Review Focus

1. **Huella en L, con hueco o con un lado que no cae en la retícula:** las unidades siguen en módulos, sin unidades fuera de la placa, y el remanente se avisa. Test en Task 5.
2. **Masa demasiado angosta para dos bandas más pasillo:** cero unidades y un aviso legible; nunca un error. Test en Task 5.
3. **Retícula girada o con el origen movido:** los muros caen sobre las líneas de módulo en el marco de la retícula, no en x/y del plano. Test en Task 5.
4. **Un tipo sin anchos que sean múltiplo del módulo** (retícula cambiada a 10 × 10 m en 4 módulos, es decir, 2.5 m): se toma el múltiplo más cercano y se avisa, sin perder el tipo. Test en Task 4.
5. **Dos edificios u opciones:** `derivar` corre por edificio y solo con las masas de ese edificio en la opción en vista. Test en Task 5.

---

### Task 1: GIM como base del repo

**Files:**
- Delete: `ui/marco/**`, `ui/App.tsx`, `ui/main.tsx`, `ui/app.css`, `ui/store.ts`, `ui/Catalogo.tsx`, `ui/styles/**`, `ui/vite-env.d.ts`, `ui/tresd/Escena.tsx`, `ui/tresd/Luces.tsx`, `ui/tresd/Suelo.tsx`, `ui/tresd/useEncuadre.ts`, `index.html`, `vite.config.ts`, `tsconfig.json`, `tailwind.config.js`, `postcss.config.js`, `package.json`, `package-lock.json`.
- Move (git mv): `engine/catalogo.ts` → `src/modules/residential/engine/catalogo.ts`; `engine/catalogo.test.ts` → `src/modules/residential/__tests__/catalogo.test.ts`; `ui/tresd/Unidad3d.tsx`, `ui/tresd/geometria3d.ts` y `ui/tresd/muebles3d.ts` (de los que depende `Unidad3d`) → `src/modules/residential/views/`; `ui/PlanMini.tsx` → `src/modules/residential/views/PlanMini.tsx`.
- Move: `engine/gfit/**` → `src/modules/residential/engine/gfit/**`, conservando `src/` y `test/`. La copia de la pieza 1 tiene solo cuartos; en el Step 3 se reemplaza por la completa.
- Create, copiados de GIM `b7909184`: `src/**`, `public/**`, `index.html`, `vite.config.ts`, `vitest.setup.ts`, `tsconfig*.json`, `tailwind.config.js`, `postcss.config.js`, `package.json`, `package-lock.json`, `commitlint.config.js`. No se copian `node_modules`, `dist`, `graphify-out`, `.git` ni `docs`.
- Modify: `vite.config.ts` (puerto 5180 con `strictPort`), `README.md`, `VENDOR.md`.

**Interfaces:**
- Produces: un repo que arranca como GIM; `src/modules/residential/` con el motor de GFit completo y el catálogo, todavía sin registrar.

- [ ] **Step 1:** Copiar los archivos de GIM listados arriba, excepto `node_modules`, `dist` y `graphify-out`. Usar `robocopy /E /XD node_modules dist graphify-out .git docs`.
- [ ] **Step 2:** Hacer los movimientos de archivos del catálogo listados arriba. Corregir sus imports a rutas relativas dentro de `src/modules/residential/`.
- [ ] **Step 3:** Reemplazar `src/modules/residential/engine/gfit` por la copia completa de `C:\dev\mixed-use-optimizer\engine\gfit`: `src/` y `test/`, sin `node_modules`.
- [ ] **Step 4:** Ajustar el `include` de Vitest en `vite.config.ts` para que corra también `src/modules/residential/**/*.test.ts` (incluido `engine/gfit/test/*.test.ts`), y el puerto a `server: { port: 5180, strictPort: true }`. Si el plugin de llaves compartidas (`server/`) exige carpetas que no se copiaron, copiar `server/` también y anotarlo.
- [ ] **Step 5:** `npm install`.
- [ ] **Step 6:** Correr `npx tsc -b --noEmit`. Esperado: sin errores. Los tests de GFit que importan `node:fs` usan su `test/node-fs.d.ts`; si `tsc -b` no lo ve, agregarlo al `include` del tsconfig de la app.
- [ ] **Step 7:** Correr `npx vitest run`. Esperado: verdes los tests de GIM, los 150 de GFit y los 5 de `catalogo.test.ts`. Anotar en `VENDOR.md` la cuenta exacta.
- [ ] **Step 8:** Cerrar los servidores de desarrollo abiertos y correr `npm run dev`. Esperado: `http://localhost:5180` muestra el Home de GIM.
- [ ] **Step 9:** Reescribir `VENDOR.md`: la base GIM (`b7909184`), GFit (`267efea` vía `mixed-use-optimizer`), el catálogo de la pieza 1 y las piezas de Praktico que se van con el marco recreado. Reescribir `README.md`: qué es, cómo correrlo y la tabla de piezas.
- [ ] **Step 10:** Commit: `feat: GIM como base del repo, con el motor de GFit y el catálogo en el módulo residencial`.

### Task 2: Datos del módulo, tipología «Uso mixto» y registro

**Files:**
- Create: `src/modules/residential/schema.ts`, `src/modules/residential/defaults.ts`, `src/modules/residential/module.ts`, `src/typologies/mixedUse.ts`.
- Modify: `src/model/schema.ts` (una línea en `ProjectSchema`), `src/typologies/index.ts` (`TYPOLOGIES`), `src/modules/index.ts` (`MODULES`).
- Test: `src/modules/residential/__tests__/tipologia.test.ts`.

**Interfaces:**
- Produces:
  - `ResidentialSchema` (zod) y `type Residential = { usos: Record<Id, { uso: 'vivienda' | 'comercio' | 'nucleo'; entrepiso: number }>; tipos: UnitType[]; edificios: Record<Id, ParamsEdificio> }`
  - `type ParamsEdificio = { fondo: number; pasillo: number; mezcla: Record<string, number>; semilla: number }`
  - `RESIDENTIAL0(programIds: { vivienda: Id; comercio: Id; nucleo: Id }): Residential` en `defaults.ts`
  - `paramsDe(p: Project, buildingId: Id): ParamsEdificio`, que da los valores por defecto si el edificio no tiene los suyos: fondo 8.1, pasillo 1.8, la mezcla de GFit y semilla 1
  - `residential: Module` (id `'residential'`, label `'Uso mixto'`)
  - `mixedUse: Typology` (id `'mixed-use'`)

- [ ] **Step 1: Write the failing test** `tipologia.test.ts`:
  - `newProject('mixed-use')` pasa `ProjectSchema.parse`.
  - `p.grid` tiene `x === 8.1`, `y === 8.1` y `modules === 3`.
  - Los programas son exactamente Vivienda, Comercio y Núcleo; `p.residential.usos[idVivienda]` es `{ uso: 'vivienda', entrepiso: 3.0 }` y el de Comercio es `{ uso: 'comercio', entrepiso: 4.5 }`.
  - `p.residential.tipos.map((t) => t.id)` es `['studio', 'br1', 'br2', 'br3']`, con los colores de Global Constraints.
  - `modulesOf('mixed-use')` incluye `'residential'` y no incluye `'warehouse'`, `'docks'`, `'terrain'` ni `'parking'`.
  - `residential.present(newProject('mixed-use'))` es `false`; tras agregar una masa de Vivienda es `true`.
- [ ] **Step 2:** `npx vitest run src/modules/residential/__tests__/tipologia.test.ts`. Esperado: FAIL, `Unknown typology: mixed-use`.
- [ ] **Step 3:** Implementar:
  - el esquema y `RESIDENTIAL0`;
  - `residential: ResidentialSchema.optional()` en `ProjectSchema`;
  - `mixedUse`, con `programs` (Vivienda, Comercio y Núcleo; colores de `PROGRAM_COLORS` de `mixed-use-optimizer/ui/marca.ts`: `res #B5DBB6`, `ret #B9A3DC`, núcleo `#8C8C8C`), `modules: ['residential']`, `grid`, `levelHeight: 3.0`, `siteRules` del proyecto demo de `mixed-use-optimizer/fixtures/proyecto-demo.json` y `kpis: []` (Task 7 los llena);
  - el registro en `TYPOLOGIES` y `MODULES`;
  - `newProject` en `typologies/index.ts` agrega `residential: RESIDENTIAL0(...)` cuando la tipología es `'mixed-use'`. Se hace con un campo opcional `extra?(programs): Partial<Project>` en `Typology` (otra línea de núcleo, que también se anota).
- [ ] **Step 4:** Correr el test. Esperado: PASS. Correr `npx vitest run` completo. Esperado: verde. Si un test de GIM enumera tipologías, actualizarlo y anotarlo.
- [ ] **Step 5:** Commit: `feat(residential): tipología Uso mixto y datos del módulo`.

### Task 3: Columnas sobre la retícula

**Files:**
- Create: `src/modules/residential/engine/columnas.ts`
- Test: `src/modules/residential/__tests__/columnas.test.ts`

**Interfaces:**
- Consumes: `gridOf`, `toGrid`, `toPlan` y `gridLines` de `src/engine/grid/index.ts`; `DerivedMass` de `src/engine/types.ts`; `pointInPolygon` de `src/engine/geom/polygon.ts`.
- Produces: `columnas(g: Grid, masas: DerivedMass[], nucleos: Polygon[]): Point[]`, el centro de cada columna (sin repetir) en coordenadas de plano.

- [ ] **Step 1: Write the failing test**:
  - Con la retícula `{x: 8.1, y: 8.1, modules: 3, origin: {x: 0, y: 0}, angle: 0}` y una masa de 32.4 × 16.2 desde el origen, da 15 columnas (5 × 3), todas con `x % 8.1 ≈ 0` e `y % 8.1 ≈ 0`.
  - Con un núcleo de 8.1 × 8.1 en el centro, quedan fuera las columnas estrictamente dentro del núcleo; las de su borde se conservan.
  - Con un hueco, se quitan las que caen dentro.
  - Con la retícula girada 30°, cada columna, pasada por `toGrid`, cae en múltiplos de 8.1 (tolerancia 1e-6).
- [ ] **Step 2:** Correr. Esperado: FAIL, módulo no encontrado.
- [ ] **Step 3:** Implementar con `gridLines(g, extent, base, { modules: false })` de cada eje y las intersecciones dentro de `polygon` y fuera de `holes`. «Dentro» incluye el borde, con tolerancia `ON_LINE`.
- [ ] **Step 4:** Correr. Esperado: PASS.
- [ ] **Step 5:** Commit: `feat(residential): columnas en los cruces de la retícula`.

### Task 4: Parche de GFit, unidades en módulos

**Files:**
- Modify: `src/modules/residential/engine/gfit/src/layout/level.ts` (`widthsOf` y el tendido de tramos) y, si hace falta, `layout/plate.ts` (`runsOf`).
- Test: `src/modules/residential/engine/gfit/test/modulo.test.ts`

**Interfaces:**
- Produces:
  - `type ModuloUnidad = { origin: Pt; u: Pt; step: number }`: el origen y el eje x de la retícula, con el paso del módulo en m.
  - `setUnitModule(m: ModuloUnidad | null): void`, exportado de `layout/level.ts`. Con `null`, GFit se comporta exactamente como antes.
  - `avisosModulo(): string[]`: los avisos de la última corrida (tipo sin múltiplo, remanente por tramo).

- [ ] **Step 1: Write the failing test**:
  - Con `setUnitModule({ origin: [0, 0], u: [1, 0], step: 2.7 })`, `widthsOf` del tipo `br2` (9.6–11.4) es `[10.8]`, el de `studio` (4.2–6.0) es `[5.4]` y el de `br3` (12.0–14.4) es `[13.5]`.
  - Con `step: 2.5` y un tipo de 6.0–6.9, `widthsOf` es `[7.5]` (el múltiplo más cercano a `wMin` por arriba) y `avisosModulo()` contiene «sin ancho en módulos».
  - Con `null`, `widthsOf(br2)` es igual a la salida original (de 0.6 en 0.6).
  - `layoutLevel` en una placa de 32.4 × 16.2 con núcleo central, fondo 8.1… da unidades cuyos vértices sobre la fachada proyectados al eje `u` son múltiplos de 2.7 (tolerancia 0.01).
  - El mismo caso con la retícula desplazada 1.0 m en x da vértices en `1.0 + k·2.7`.
  - Los tests originales de GFit siguen en verde.
- [ ] **Step 2:** Correr. Esperado: FAIL, `setUnitModule` no existe.
- [ ] **Step 3:** Implementar:
  - Con el módulo puesto, `widthsOf` devuelve los múltiplos de `step` dentro de `[wMin, wMax]`; si no hay ninguno, el menor múltiplo `≥ wMin`, y registra el aviso.
  - El tramo de banda se recorta para que su inicio y su fin, proyectados en `u` desde `origin`, caigan en múltiplos de `step`. Lo recortado se suma al aviso `remanente de X m en <nivel>`.
  - `Q = 0.3` sigue igual; 2.7 es múltiplo de 0.3. Si un `step` no lo es, se redondea el paso a la rejilla Q y se avisa.
  - Todo va marcado `mixed-use-mvp patch`.
- [ ] **Step 4:** Correr el test nuevo y `npx vitest run src/modules/residential/engine/gfit`. Esperado: PASS los 150 originales más los nuevos.
- [ ] **Step 5:** Anotar el parche en `VENDOR.md`. Commit: `feat(gfit): anchos de unidad y tramos sobre los módulos de la retícula`.

### Task 5: `derivar`, de las masas de GIM al resultado de GFit

**Files:**
- Create: `src/modules/residential/engine/derivar.ts`
- Test: `src/modules/residential/__tests__/derivar.test.ts`

**Interfaces:**
- Consumes: `derive(p, optionId)` de `src/engine/derive.ts` (sus `masses: DerivedMass[]`), `gridOf`, `paramsDe` (Task 2), `setUnitModule` y `avisosModulo` (Task 4), y de GFit `fresh`, `PROGS0`, `massBuilding`, `calcOption` y `layoutBuilding`.
- Produces:
  - `type Derivado = { totals: Totals; niveles: LevelResult[]; unidades: { nivel: number; unidad: PlacedUnit }[]; nucleos: Polygon[]; avisos: string[] }`
  - `derivar(p: Project, buildingId: Id, optionId?: Id | null): Derivado | null`: `null` si el edificio no tiene masas de Vivienda ni de Comercio en la opción. Es puro y memoizado por la firma de entrada (masas, retícula, usos, params y tipos), con 50 entradas como máximo.

- [ ] **Step 1: Write the failing test** sobre un proyecto `newProject('mixed-use')` con la retícula en el origen:
  - **(a)** Una masa de Vivienda de 32.4 × 16.2 m y 30 m de alto, más una masa de Núcleo de 8.1 × 5.4 m al centro. `derivar` da 10 niveles (30 / 3.0) y `totals.units > 0`. Todas las unidades tienen sus vértices sobre la fachada en múltiplos de 2.7 en x (tolerancia 0.01).
  - **(b)** Un podio de Comercio de 9 m bajo la torre da 2 niveles de `prog: 'ret'` abajo y los de Vivienda arriba.
  - **(c)** Sin masa de Núcleo, `avisos` contiene «núcleo automático».
  - **(d)** Una masa de 6 × 30 m da `totals.units === 0` y un aviso, sin lanzar error.
  - **(e)** Una huella en L con un hueco da unidades solo dentro de la placa menos el hueco, y cualquier remanente aparece en `avisos`.
  - **(f)** Con la retícula girada 30°, los vértices de fachada pasados por `toGrid` son múltiplos de 2.7.
  - **(g)** Con dos edificios, `derivar(p, 'b2')` solo ve las masas de `b2`.
  - **(h)** Desplazar la masa de (a) un módulo (2.7 m) en x conserva la regla de (a).
  - **(i)** Dos llamadas con el mismo proyecto devuelven el mismo objeto (memo).
- [ ] **Step 2:** Correr. Esperado: FAIL.
- [ ] **Step 3:** Implementar:
  - `State` de GFit con `fresh()`: `progs` con `res.fh` igual al entrepiso de Vivienda y `ret.fh` igual al de Comercio, `unitTypes = p.residential.tipos`, y el edificio con `mode: 'mass'`, `typH` y `lobbyH` iguales al entrepiso de Vivienda, `unitDepth = fondo`, `corridor = pasillo`, `mix = mezcla`, `seed = semilla`, `basements: 0` y `groundAt: null`.
  - Por cada `DerivedMass` del edificio con uso vivienda o comercio: un `GeomObj` `kind: 'brep'` con `rings` (polígono más huecos) y `bbox` z de `span`, y un `Block { id, prog: 'res' | 'ret' }`.
  - Las masas de uso núcleo van en `links.core` como curvas.
  - Los cortes: para cada `needs` de la primera llamada a `massBuilding`, el corte de un prisma a cualquier z dentro de su `span` es su polígono más sus huecos. Se llena `sections` y se vuelve a llamar.
  - Antes de calcular, `setUnitModule` con el origen, el eje y el paso de la retícula (`x / modules`); después, `setUnitModule(null)` en un `finally`.
  - Los avisos se juntan de `Massed.issues`, `LevelLayout.issues` y `avisosModulo()`, traducidos al español los de GFit que se muestren («No cores, using an automatic core» pasa a «Sin núcleo: se usa un núcleo automático»).
- [ ] **Step 4:** Correr. Esperado: PASS. Medir `derivar` del caso (a) con `performance.now()` en el test: si pasa de 30 ms, anotarlo en el reporte (no falla el test).
- [ ] **Step 5:** Commit: `feat(residential): derivar, de las masas de GIM al motor de GFit con la retícula`.

### Task 6: KPIs del módulo

**Files:**
- Create: `src/modules/residential/kpis.ts`
- Modify: `src/modules/residential/module.ts` (`kpis`), `src/typologies/mixedUse.ts` (`kpis`)
- Test: `src/modules/residential/__tests__/kpis.test.ts`

**Interfaces:**
- Consumes: `derivar` (Task 5), `KpiDef` de `src/engine/kpis.ts`.
- Produces: `RESIDENTIAL_KPIS: KpiDef[]`, que suma `derivar` sobre los edificios de la opción en vista, con estos ids:

  | id | Unidad | Lee |
  |---|---|---|
  | `res-gfa` | `m2` | `gfa` |
  | `res-vendible` | `m2` | `nsa` |
  | `res-unidades` | `count` | `units` |
  | `res-cajones` | `count` | `req` |
  | `res-margen` | `pct` | `(revenue − cost − land) / revenue × 100`; `null` si `revenue` es 0 |

  Todos con `area: 'massing'`.

- [ ] **Step 1: Write the failing test**: con el proyecto del caso (a) de Task 5, `readKpi` de cada id es igual al campo de `derivar(p, 'b1').totals` que indica la tabla. Sin masas, todos dan `null`. El proyecto nuevo de uso mixto trae `kpis` igual a los cinco ids, en ese orden.
- [ ] **Step 2:** Correr. Esperado: FAIL.
- [ ] **Step 3:** Implementar los cinco `KpiDef`, con `label` en español («Área construida», «Área vendible», «Departamentos», «Cajones requeridos», «Margen») y su `help`.
- [ ] **Step 4:** Correr. Esperado: PASS.
- [ ] **Step 5:** Commit: `feat(residential): KPIs de uso mixto`.

La mezcla no va como KPI, porque `KpiUnit` no tiene una cifra que la represente: va en el Resumen (Task 7). Es una diferencia con el spec y se anota en el reporte final.

### Task 7: Vistas: capa de planta, 3D, Resumen y propiedades del edificio

**Files:**
- Create: `src/modules/residential/views/CapaResidencial.tsx` (planta), `src/modules/residential/views/Residencial3d.tsx` (escena), `src/modules/residential/views/ResumenResidencial.tsx`, `src/modules/residential/views/PropiedadesResidencial.tsx`, `src/modules/residential/views/useDerivado.ts`.
- Modify (un import y un elemento cada uno): `src/views/plan/PlanSvg.tsx`, `src/views/scene/Scene.tsx`, `src/views/stats/Overview.tsx` y `src/views/panels/BuildingProperties.tsx`.
- Test: `src/modules/residential/__tests__/vistas.test.tsx`.

**Interfaces:**
- Consumes: `derivar`, `columnas`, `paramsDe`; el store de GIM (`useApp`: proyecto, opción en vista, nivel elegido); `modulesOf` o `catalog.ts` para mostrarse solo cuando la tipología ofrece `residential`.
- Produces: `useDerivado(buildingId: Id): Derivado | null`, el hook memoizado que comparten las cuatro vistas.

- [ ] **Step 1: Write the failing test** con Testing Library y el proyecto del caso (a):
  - `CapaResidencial` dentro de un `<svg>` dibuja un `path` por unidad del nivel elegido, con `data-tipo` igual al id del tipo y su color de Global Constraints, y un `rect` por columna (`data-columna`) de 0.5 m.
  - `ResumenResidencial` muestra los niveles por uso, las unidades por tipo, la mezcla real contra la objetivo y el cálculo.
  - En un proyecto `newProject('industrial')`, ninguna de las cuatro vistas renderiza nada.
- [ ] **Step 2:** Correr. Esperado: FAIL.
- [ ] **Step 3:** Implementar:
  - **Capa de planta:** unidades por tipo, pasillo, núcleo y columnas, debajo de las manijas de masa, para no estorbar la edición. Usa el nivel elegido en GIM; si es uno sin unidades (podio), solo dibuja columnas.
  - **3D:** losas de 0.2 m por nivel derivado, con el color del programa, y columnas como prismas de 0.5 × 0.5 desde z0 hasta el tope.
  - **Resumen:** una sección «Uso mixto» con el patrón de secciones de `Overview.tsx`.
  - **Propiedades:** fondo, pasillo, mezcla por tipo (debe sumar 100) y semilla, con `controls/fields.tsx`. Se escriben en `p.residential.edificios[buildingId]` con una acción pura en `src/modules/residential/actions.ts`, `setParams(p, buildingId, parcial): Project`, para que entre al historial de deshacer de GIM.
- [ ] **Step 4:** Correr el test y `npx vitest run` completo. Esperado: PASS.
- [ ] **Step 5:** Commit: `feat(residential): capa de planta, 3D, Resumen y propiedades`.

### Task 8: Recorrido en el navegador, documentación y cierre

**Files:**
- Create: `e2e/uso-mixto.spec.ts` (Playwright, si GIM ya lo tiene configurado; si no, un script en `scripts/recorrido.mjs` con Playwright de `C:\dev\mixed-use-optimizer\node_modules`).
- Modify: `README.md`, `VENDOR.md`.

- [ ] **Step 1:** Cerrar los servidores de desarrollo abiertos y correr `npm run dev` en 5180.
- [ ] **Step 2:** Hacer el recorrido:
  1. Home → Create new → «Uso mixto»;
  2. dibujar una masa de Vivienda de 32.4 × 16.2 m con las cotas tecleadas de GIM;
  3. dibujar el núcleo;
  4. ver las unidades sobre los módulos, las columnas y los KPIs con valores;
  5. pasar a 3D y ver losas y columnas.

  Guardar capturas en `evidence/pieza-1/` (fuera de git, agregado a `.gitignore`).
- [ ] **Step 3:** Revisar las capturas. Esperado: muros alineados con la retícula, sin errores en consola.
- [ ] **Step 4:** Actualizar `README.md`: cómo crear un proyecto de uso mixto y qué hace. Completar `VENDOR.md` con todos los cambios al núcleo de GIM y a GFit.
- [ ] **Step 5:** `npx tsc -b --noEmit` y `npx vitest run`. Esperado: limpio y verde, con las cuentas anotadas en `README.md`.
- [ ] **Step 6:** Commit: `docs: pieza 1 terminada, recorrido y registro de cambios`.
