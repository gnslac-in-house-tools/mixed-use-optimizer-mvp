# Calificación por palancas: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La calificación −2…+2 por palanca de `mixed-use-optimizer`, con métricas como fórmulas que Ramón define. Se ve en la barra de KPIs, en una pestaña del Resumen y en una ventana de reglas.

**Architecture:**
- Todo lo puro vive en `src/modules/residential/engine/calificacion/`: evaluador de fórmulas, reglas, calificación y datos del proyecto.
- Las vistas viven en `src/modules/residential/views/calificacion/`.
- El núcleo de GIM se toca en 5 puntos, cada uno anotado en `VENDOR.md`: `ui.ts`, `SummaryPanel.tsx`, `Dialogs.tsx`, `commands/design.ts` y `KpiStrip.tsx`.
- Las reglas viven en `Project.residential.calificacion`; se editan con `useApp.apply`, así que se deshacen y se guardan.

**Tech Stack:** TypeScript, React 19, zustand, zod, Tailwind con los tokens de GIM, vitest y Testing Library. No se agregan dependencias.

**Spec:** `docs/superpowers/specs/2026-11-23-calificacion-palancas-design.md`. La maqueta aprobada, `maqueta/index.html` (en el worktree, sin commit), es la referencia visual de cada vista: ábrela con `python -m http.server 5181` desde `maqueta/`.

## Global Constraints

- **Rama y carpeta:** rama `calificacion-palancas` en el worktree `C:\dev\mixed-use-optimizer-mvp-calif`. Antes de empezar, `git rebase pieza-1-base-gim`.
- **Dependencias de la pieza 1:**
  - Task 4 en adelante necesita `derivar` (pieza 1, Task 5) y `RESIDENTIAL_KPIS` (pieza 1, Task 6) en `pieza-1-base-gim`.
  - Si no existen todavía, se hacen las Tasks 1 a 3 y se espera.
- **Idioma:** lo nuevo va en español: identificadores del módulo, textos y comentarios. Lo de GIM se queda en inglés.
- **Núcleo de GIM:** solo los 5 puntos del spec §7. Cada uno lleva su línea en `VENDOR.md` («calificación: <qué> — <por qué>»).
- **Fórmulas:** nunca `eval` ni `Function`.
- **Ayuda (GIM, Decision «Help»):** umbrales, porqué, fórmula y fuente van ocultos. Salen en tarjeta al pasar el cursor o con el foco, y en línea solo con `useUi.help`.
- **Copy exacto** (del spec y la maqueta):
  - «Calificación», «provisional», «sin datos», «sin referencia: una sola opción»;
  - «Reglas de calificación…», «Restablecer», «Importar Excel…» (desactivado, tooltip «Por decidir»);
  - «Aplicar», «Cancelar», «+ Variable», «Quitar»;
  - los modos: «Mayor es mejor», «Menor es mejor», «Sobre la mediana», «Bajo la mediana».
- **Colores:** `--status-within` compensa, `--status-over` penaliza, `ink-secondary` neutral. Las bandas −2…+2 van con `#efc3be #f7e0dd #e5e5ea #d5ebda #b3dbbd`.
- **Verificación:** `npm run typecheck` y `npm test` en verde al cerrar cada task.

## Review Focus

1. **División entre cero o proyecto vacío** (`m2_vendibles = 0`): la fórmula da `null` con «no da un número», nunca `Infinity` ni `NaN` en pantalla. Lo prueba la Task 1.
2. **Proyecto sin masas de Vivienda ni Comercio, o tipología sin el módulo:** la pestaña muestra su estado vacío, los KPIs `calif-*` leen `null` («—») y nada lanza. Lo prueban las Tasks 3 y 5.
3. **Una palanca sin variables, o todos los pesos en 0:** la palanca sale «sin datos» y el puntaje «—» con `n = 0`, sin dividir entre cero. Lo prueba la Task 2.
4. **Un proyecto guardado sin `calificacion`, o con `steps` de largo distinto de 4:** carga con las reglas de inicio; el esquema rechaza lo inválido y no rompe la carga. Lo prueba la Task 2.
5. **Abrir la ventana, editar y Cancelar (o Esc, o clic afuera):** el proyecto queda igual. Aplicar es un solo paso de undo. Lo prueba la Task 7.

---

### Task 1: Evaluador de fórmulas

**Files:**
- Create: `src/modules/residential/engine/calificacion/formula.ts`
- Test: `src/modules/residential/__tests__/formula.test.ts`

**Interfaces:**
- Produces:
  - `type Datos = Record<string, number | null>`
  - `type ResultadoFormula = { v: number } | { v: null; falta: string[] } | { err: string }`
  - `evaluarFormula(formula: string, datos: Datos): ResultadoFormula`
  - `nombresDe(formula: string): string[]`

- [ ] **Step 1: Write the failing tests** (`describe('evaluarFormula')`):
  - `('indice_usado / indice_permitido', { indice_usado: 3.52, indice_permitido: 4 })` → `{ v: 0.88 }` (toBeCloseTo).
  - Precedencia y paréntesis: `'2 + 3 * (4 - 1)'` → `{ v: 11 }`; `'-a + 1'` con `a: 2` → `{ v: -1 }`.
  - Nombre desconocido: `'costo * foo'` → `{ err: '«foo» no es un dato del proyecto' }`.
  - Dato faltante: `'costo_parking / unidades'` con `costo_parking: null, unidades: 28` → `{ v: null, falta: ['costo_parking'] }`.
  - Incompleta: `'a /'` → `{ err: 'fórmula incompleta' }`; vacía: `''` → `{ err: 'vacía' }`.
  - Carácter no permitido: `'a; alert(1)'` → `{ err: 'solo + − × ÷ ( ) y nombres' }`.
  - División entre cero: `'a / b'` con `b: 0` → `{ err: 'no da un número' }`.
  - `nombresDe('ingreso / m2_vendibles')` → `['ingreso', 'm2_vendibles']`.
- [ ] **Step 2:** `npx vitest run src/modules/residential/__tests__/formula.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `evaluarFormula` y `nombresDe` en `formula.ts`:
  - un tokenizador (números con `.`, nombres `[A-Za-z_]\w*`, `+ - * / ( )`);
  - un parser de descenso recursivo (expr → term → factor, con menos unario);
  - los nombres desconocidos se revisan antes de evaluar, y los nulos llenan `falta`;
  - un resultado no finito da `'no da un número'`.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(residential): evaluador de fórmulas de la calificación`.

### Task 2: Reglas, esquema y calificación

**Files:**
- Create: `src/modules/residential/engine/calificacion/reglas.ts`, `src/modules/residential/engine/calificacion/calificar.ts`
- Modify: `src/modules/residential/engine/schema.ts` (`ResidentialSchema` gana `calificacion` opcional)
- Test: `src/modules/residential/__tests__/calificar.test.ts`

**Interfaces:**
- Consumes: `evaluarFormula`, `Datos` (Task 1).
- Produces:
  - `type Palanca = 'm2_vendibles' | 'precio_producto' | 'velocidad_venta' | 'costo_obra' | 'plazo_riesgo'`, con `PALANCAS: Palanca[]` en ese orden y `PALANCA_ES: Record<Palanca, string>` («m² vendibles», «Precio de producto», «Velocidad de venta», «Costo de obra», «Plazo / riesgo»).
  - `type Modo = 'higher' | 'lower' | 'vsMedianHigher' | 'vsMedianLower'`, con `MODO_ES` = los 4 textos de Global Constraints.
  - `CalificacionSchema` (zod) y `type Reglas = { provisional: boolean; source: string; weights: Record<Palanca, number>; variables: Variable[] }`.
    - `Variable = { id; label; lever: Palanca; formula; mode: Modo; steps: [n|null, n|null, n|null, n|null]; unit; legalRef }`.
    - `weights` ≥ 0; `steps` es una tupla de 4.
  - `REGLAS_INICIO: Reglas`: las 8 variables, fórmulas, umbrales, unidades y fuentes del spec y de `INICIO()` en la maqueta. Sótanos va con `mode: 'lower', steps: [null, null, 1, 2]`. `source` es la de SPEC_DEMO §5 y `provisional: true`.
  - `reglasDe(p: Project): Reglas`: `p.residential?.calificacion` o `REGLAS_INICIO`.
  - `validarVariable(v: Variable): string | null`: los textos de `validar()` en la maqueta.
  - `type Rating = -2 | -1 | 0 | 1 | 2`
  - `type Traza = { variable: Variable; valor: number | null; rating: Rating | null; porque: string; mediana?: number; rel?: number; err?: boolean }`
  - `type Calificacion = { palancas: { palanca: Palanca; rating: Rating | null; peso: number; trazas: Traza[] }[]; puntaje: number | null; n: number; nVars: number; nTot: number }`
  - `calificar(reglas: Reglas, enUso: Datos, otras: Datos[]): Calificacion`

- [ ] **Step 1: Write the failing tests**:
  - **Port de la app anterior:**
    - `uso_indice = 0.88` → +1, `porque === '≥ 0.85'`;
    - `0.5` → −2, con `porque` «no alcanza 0.60»;
    - sótanos 2 → −1, sótanos 1 → 0, sótanos 3 → −2.
  - **Mediana:** `precio_m2` con ingresos/m² 1860 (en uso), 1780 y 1820 (otras) → `rel ≈ +0.022`, +1, `mediana === 1820`. Sin otras opciones → `rating: null`, `porque: 'sin referencia: una sola opción'`.
  - **Sin dato no cuenta:** con `ingreso: null`, la palanca precio_producto promedia solo `ajuste_mezcla`. Con todo `null` en una palanca, esa palanca da `rating: null` y no entra a `n`.
  - **Pesos:** con todos los pesos en 0 → `puntaje: null, n: 0`. Una palanca sin variables → `rating: null`.
  - **Esquema:**
    - `CalificacionSchema.safeParse` rechaza `steps` de largo 3 y un peso negativo;
    - `reglasDe` de un proyecto sin `calificacion` es `REGLAS_INICIO`;
    - `ProjectSchema.parse` de un proyecto con `residential` sin `calificacion` pasa.
  - **Validación:**
    - `validarVariable` con `mode: 'higher', steps: [0.95, 0.99, 0.75, 0.6]` da «los umbrales deben ir de mayor a menor (+2 → −1)»;
    - con `[null, null, null, null]` da «pon al menos un umbral».
- [ ] **Step 2:** Run `npx vitest run src/modules/residential/__tests__/calificar.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `reglas.ts` (esquema, inicio, `reglasDe`, `validarVariable`) y `calificar.ts`, portando `byHigher`, `byLower`, `median` y `clamp` de `mixed-use-optimizer/engine/rating.ts`:
  - un escalón `null` se salta;
  - `porque` usa los formatos de `rateVariable` en la maqueta;
  - la palanca es `clamp(round(promedio de las trazas con rating))`;
  - `puntaje` es Σ rating × peso de las palancas con `rating != null && peso > 0`, o `null` si no hay ninguna.
- [ ] **Step 4:** Run it. Expected: PASS. También `npm run typecheck` en verde (el esquema del proyecto sigue cargando).
- [ ] **Step 5:** Commit: `feat(residential): reglas y calificación por palancas`.

### Task 3: Datos del proyecto para las fórmulas

**Files:**
- Create: `src/modules/residential/engine/calificacion/datos.ts`
- Test: `src/modules/residential/__tests__/datosCalificacion.test.ts`

**Interfaces:**
- Consumes: `derivar(p, buildingId, optionId)` y `Derivado` (pieza 1, Task 5); `calificar`, `reglasDe` (Task 2).
- Produces:
  - `DATOS_CALIFICACION: { k: string; label: string; pieza: 1 | 2 }[]`: los 12 nombres del spec §1, en ese orden.
  - `datosCalificacion(p: Project, optionId: Id): Datos`
  - `calificacionDe(p: Project, optionId?: Id): Calificacion`: `calificar(reglasDe(p), datos de la opción, datos de las demás opciones con masas residenciales)`, memoizado por `(p, optionId)` con un `WeakMap` sobre `p`.
  - `mixFit(objetivo: Record<string, number>, real: Record<string, number>): number`: copia de `mixed-use-optimizer/engine/adapter.ts`.

- [ ] **Step 1: Write the failing tests**, con el proyecto del caso (a) de la pieza 1, Task 5 (una masa de Vivienda de 32.4 × 16.2 × 30 m con núcleo):
  - `datosCalificacion(p, opt).m2_vendibles === Σ derivar(...).totals.nsa`; lo mismo para `m2_brutos`, `unidades`, `cajones`, `ingreso` y `costo`.
  - `indice_permitido` es la `far` de zonificación que usa `derivar`, y `indice_usado` es GFA / área del predio.
  - `unidades_bajo_tope`, `costo_parking` y `sotanos` son `null`.
  - `mixFit({ a: 50, b: 50 }, { a: 0.5, b: 0.5 }) === 1` y `mixFit({ a: 100 }, { b: 1 }) === 0`.
  - Un proyecto sin masas residenciales da todo `null`; `calificacionDe` da `puntaje: null` y no lanza.
  - Con una segunda opción que copia la primera, `precio_m2` califica 0 (rel 0).
- [ ] **Step 2:** Run `npx vitest run src/modules/residential/__tests__/datosCalificacion.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `datos.ts`:
  - suma `derivar` sobre los edificios de la opción;
  - si `Derivado` no trae la zonificación, agrega `zoning: Zoning` a `Derivado` en `derivar.ts` (un campo, no cambia la lógica) y anótalo en el reporte para la pieza 1.
- [ ] **Step 4:** Run it. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(residential): datos del proyecto para la calificación`.

### Task 4: KPIs de la calificación

**Files:**
- Create: `src/modules/residential/kpisCalificacion.ts`
- Modify: `src/modules/residential/module.ts` (`kpis: (p) => [...RESIDENTIAL_KPIS, ...KPIS_CALIFICACION]`)
- Test: `src/modules/residential/__tests__/kpisCalificacion.test.ts`

**Interfaces:**
- Consumes: `calificacionDe` (Task 3); `KpiDef` de `src/engine/kpis.ts`.
- Produces:
  - `KPIS_CALIFICACION: KpiDef[]`: `calif-puntaje` y `calif-<palanca>` por cada una de las 5 palancas. Todos con `unit: 'count'`, `area: 'massing'`, `aim: false` y `help` con la fuente del set.
  - `status` de `calif-puntaje`: `within` si > 0, `over` si < 0, `null` si 0 o sin dato.
  - `JUEGO_CALIFICACION = ['calif-puntaje', ...5 palancas, 'issues']`
  - `esKpiCalificacion(id: string): boolean`

- [ ] **Step 1: Write the failing test**:
  - con el proyecto de Task 3, `readKpi('calif-puntaje', p, derive(p))?.value === calificacionDe(p).puntaje`, y el de cada palanca es su `rating`;
  - sin masas, todos `null`;
  - `JUEGO_CALIFICACION` tiene 7 ids en ese orden.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3: Implement** `kpisCalificacion.ts` y la línea de `module.ts`.
- [ ] **Step 4:** Run it. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(residential): KPIs de la calificación`.

### Task 5: Pestaña «Calificación» del Resumen

**Files:**
- Create:
  - `src/modules/residential/views/calificacion/Calificacion.tsx`
  - `src/modules/residential/views/calificacion/piezas.tsx` (`Puntos`, `BarraSuma`, `BarraBandas`, `Valor`, `DetalleVariable`)
  - `src/modules/residential/views/calificacion/useCalificacion.ts`
- Modify:
  - `src/views/layout/ui.ts`: `SummaryTab` y `SUMMARY_TABS` ganan `{ key: 'calificacion', label: 'Calificación', icon: <el más cercano a barras en controls/iconos> }`; se agrega `useCalificacionUi` (palancas abiertas) o se pone en el módulo;
  - `src/views/panels/SummaryPanel.tsx`: `{tab === 'calificacion' && <Calificacion />}`;
  - `VENDOR.md`.
- Test: `src/modules/residential/__tests__/calificacionTab.test.tsx`

**Interfaces:**
- Consumes: `calificacionDe`, `PALANCA_ES`, `reglasDe`; `useApp` (`project`, `option`); `useUi` (`help`, `setSummaryTab`, `openDialog`).
- Produces:
  - `useCalificacion(): Calificacion`
  - `<Puntos rating />`, `<BarraSuma calificacion clase? />`, `<BarraBandas traza />`, `<Valor rating />`, que reusan la Task 6 y la Task 7;
  - `abrirPalanca(p: Palanca)` (store de palancas abiertas), que usa la Task 6.

- [ ] **Step 1: Write the failing tests** (render de `<App />` con un proyecto de uso mixto con masas, como en `stats.test.tsx`):
  - El riel del Resumen tiene la pestaña «Calificación». Al abrirla se ve el puntaje y las 5 palancas, cada una con `aria-label` «<Palanca>: <+1|sin datos>, peso 1».
  - Con `help: false` no hay texto «Fuente» en el panel. Al hacer `hover` o `focus` sobre una variable, aparece un `role="tooltip"` con «Por qué», «Fórmula» y «Fuente».
  - Con `useUi.setState({ help: true })`, «Fuente» está en línea.
  - Un clic en una palanca alterna `aria-expanded`.
  - Sin masas residenciales: «sin datos» en el puntaje y ningún error.
  - El botón «Editar reglas…» llama `openDialog('calificacion')` (la ventana llega en la Task 7; aquí basta el spy).
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3: Implement** según la maqueta (`renderPanel`, `bullet`, `dots`, `sumbar`), con los tokens y clases de GIM:
  - filas de palanca de 40 px con separadores, y el puntaje en una tarjeta `panel-sunken`;
  - la tarjeta flotante como portal en `document.body`, a la izquierda del panel;
  - en `ui.ts` y `SummaryPanel.tsx`, solo la línea de cada uno, más su entrada en `VENDOR.md`.
- [ ] **Step 4:** Run it plus `npm test`. Expected: PASS (los tests de GIM que listan `SUMMARY_TABS` se actualizan y se anotan).
- [ ] **Step 5:** Commit: `feat(residential): pestaña Calificación en el Resumen`.

### Task 6: Barra de KPIs con el juego «Calificación»

**Files:**
- Create: `src/modules/residential/views/calificacion/CeldaCalificacion.tsx`, `src/modules/residential/views/calificacion/juegoKpis.ts`
- Modify: `src/views/stats/KpiStrip.tsx`, `VENDOR.md`
- Test: `src/modules/residential/__tests__/kpisBarra.test.tsx`

**Interfaces:**
- Consumes: `JUEGO_CALIFICACION`, `esKpiCalificacion` (Task 4); `Puntos`, `BarraSuma`, `abrirPalanca` (Task 5); `chosenKpis`, `readKpi`.
- Produces:
  - `useJuegoKpis: zustand<{ juego: 'calificacion' | 'proyecto'; setJuego }>`, que se guarda en `localStorage` con la clave `muo.kpiJuego` y vale `'calificacion'` por defecto;
  - `<CeldaCalificacion kpi: KpiValue />`.

- [ ] **Step 1: Write the failing tests**:
  - Con un proyecto que ofrece el módulo residencial, la barra tiene el grupo «KPIs» con «Calificación» (presionado) y «Proyecto», y muestra 7 celdas: puntaje, 5 palancas e Issues.
  - Al pulsar «Proyecto», muestra los `kpis` del proyecto más `calif-puntaje`; recargar el store conserva la elección.
  - Clic en la celda de una palanca → `useUi.summaryTab === 'calificacion'` y esa palanca abierta.
  - En una tipología sin el módulo (Warehouse), no hay interruptor y la barra es la de siempre.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3: Implement**:
  - en `KpiStrip.tsx`:
    - el interruptor (solo si `modulesOf(project)` incluye `residential`);
    - la lista de ids según el juego;
    - `Wrap = esKpiCalificacion(k.id) ? CeldaCalificacion : …`, como hoy con Issues;
  - la celda sigue la maqueta (`renderKpis`): punto de estado, cifra con signo, mini barra o escala de puntos, y la línea «compensa · N de 5 palancas · provisional» o «N de M variables · ×peso»;
  - anotar en `VENDOR.md`.
- [ ] **Step 4:** Run it plus `npx vitest run src/views/stats`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(residential): juego de KPIs Calificación en la barra`.

### Task 7: Ventana «Reglas de calificación»

**Files:**
- Create:
  - `src/modules/residential/views/calificacion/VentanaReglas.tsx` (lista y editor)
  - `src/modules/residential/views/calificacion/EditorVariable.tsx` (fórmula, chips, modo, regla de bandas con umbrales, frase)
  - `src/modules/residential/state/calificacion.ts` (acción `setCalificacion(reglas): (p) => Project`)
- Modify:
  - `src/views/layout/ui.ts` (`Dialog` gana `'calificacion'`);
  - `src/views/layout/Dialogs.tsx` (su rama, con el título «Reglas de calificación»);
  - `src/views/commands/design.ts` (`{ id: 'design.calificacion', label: 'Reglas de calificación…', menu: ['Design'], run: () => useUi.getState().openDialog('calificacion'), enabled: módulo presente o 'Only with the Uso mixto typology' }`);
  - `VENDOR.md`.
- Test: `src/modules/residential/__tests__/ventanaReglas.test.tsx`

**Interfaces:**
- Consumes: `Reglas`, `REGLAS_INICIO`, `validarVariable`, `MODO_ES`, `PALANCA_ES` (Task 2); `evaluarFormula` (Task 1); `datosCalificacion`, `DATOS_CALIFICACION` (Task 3); `BarraBandas`, `Valor` (Task 5); `useApp.apply`.
- Produces: `<VentanaReglas />`, que edita un borrador local `Reglas` y llama `apply(setCalificacion(borrador))` solo al Aplicar.

- [ ] **Step 1: Write the failing tests**:
  - **Abrir y cerrar:** Design → «Reglas de calificación…» abre la ventana. ✕, Escape y clic en el fondo la cierran sin cambiar `useApp.project`; lo mismo «Cancelar» tras editar un nombre.
  - **Lista:** hay 5 palancas y 8 variables. Clic en «Costo por m² vendible» la muestra en el editor; su título es un input con ese valor.
  - **Fórmula en vivo:** al teclear ` * foo`, aparece ««foo» no es un dato del proyecto», la variable de la lista lleva ⚠, «Aplicar» queda desactivado y el pie dice «1 variable con error».
  - **Chips:** clic en `m2_brutos` con el cursor al final inserta ` m2_brutos`.
  - **Umbrales:** poner `0.99` en «+1 desde» de «Uso del índice» marca la frase con «Los umbrales deben ir de mayor a menor (+2 → −1).». En los modos de mediana, los campos muestran `%` y guardan el valor ÷ 100.
  - **Peso:** «+» sobre m² vendibles lo pasa a 1.5 y su barra dice 27%.
  - **Aplicar:** tras cambiar el peso, `useApp.getState().project.residential.calificacion.weights.m2_vendibles === 1.5`, un `undo` lo regresa, y el KPI `calif-puntaje` se recalcula.
  - **Otros:** «Restablecer» vuelve a `REGLAS_INICIO` en el borrador. «Importar Excel…» está desactivado.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3: Implement** según la maqueta (`renderSheet`):
  - la fórmula se reevalúa al teclear sin perder el cursor;
  - los demás campos se validan al salir (`change`);
  - para el marco, usar el `Frame` de `Dialogs.tsx` tal cual.
- [ ] **Step 4:** Run it plus `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(residential): ventana Reglas de calificación`.

### Task 8: Recorrido en navegador

**Files:**
- Create: `e2e/calificacion.spec.ts` (o, si el repo no tiene e2e, `scripts/recorrido-calificacion.mjs` con playwright-core, como en la pieza 1)

- [ ] **Step 1:** Escribir el recorrido:
  1. crear «Uso mixto» y dibujar una masa de Vivienda;
  2. ver el juego «Calificación» en la barra con un número;
  3. abrir la pestaña y pasar el cursor sobre «Uso del índice» (sale la tarjeta);
  4. abrir Design → Reglas de calificación…, cambiar el umbral +1 a 0.80 y Aplicar;
  5. ver que el KPI cambia;
  6. Ctrl+Z lo regresa.

  En cada paso se guarda una captura en `docs/superpowers/capturas/calificacion-*.png`.
- [ ] **Step 2:** Run it against `npm run dev` on a free port (not 5180). Expected: todos los pasos pasan y no hay errores en consola.
- [ ] **Step 3:** `npm run typecheck && npm test`. Expected: verde.
- [ ] **Step 4:** Commit: `test(residential): recorrido de la calificación`.
