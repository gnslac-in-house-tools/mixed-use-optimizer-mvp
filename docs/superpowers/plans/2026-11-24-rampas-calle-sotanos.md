# Rampas de la calle a los sótanos: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La rampa del sótano mira a la calle dibujada, se apila en cada sótano inclinada en 3D, y la del S1 sale a nivel de calle y le quita su lugar a la planta baja.

**Architecture:**
- La elección del lado y la rampa viven en `derivar.ts` (`tRampa` ya existe, de `deb3f4d`).
- GFit recibe un parche chico: `calcOption` acepta obstáculos de planta baja por edificio.
- Las vistas (`sotano3d.ts`, `Residencial3d.tsx`, `CapaResidencial.tsx`) leen un campo nuevo, `plano.rampa`.

**Tech Stack:** TypeScript, React, three.js, Vitest + Testing Library, Clipper (vía `gfit/src/model/geom.ts`).

**Spec:** `docs/superpowers/specs/2026-11-24-rampas-calle-sotanos-design.md`

## Global Constraints

- Rampa de doble sentido de 6 m (`RAMPA`), bocas de 6 m (`PASILLO_SOTANO`), entrepiso de sótano 3.3 m (`ENTREPISO_SOTANO`), pendiente del motor (largo 22 m para un sótano).
- La rampa nunca se sale del contorno (tests `(l2b)` y `(l2c)` de `derivar.test.ts` siguen verdes).
- La rampa en planta baja **no** cambia `fp`, `fpA`, la excavación ni la ocupación del POT: solo dónde caben las unidades y el área neta del nivel de calle.
- Las calles son `p.site.existingRoads`; la distancia se mide a su eje (`road.points`).
- Aviso sin calle, exacto: «Dibuja la calle (Existing road) para orientar la entrada del estacionamiento».
- Rótulos: «Rampa ↓» en la planta de calle; «Rampa ↑» en el sótano (ya existe).
- Cada cambio a GFit se anota en `VENDOR.md`. Textos y comentarios en español.
- Suite completa con `npx vitest run --maxWorkers=4` (sin el límite hay timeouts intermitentes por carga en tests de UI de GIM).

## Review Focus

- **Calle paralela a una orilla corta** (la torre con la calle al oriente): la orilla de 16.2 no da para 22 + 6. Se espera que la rampa vaya en la orilla larga más cercana a la calle, no en la corta. → test `(r3)` en Task 1.
- **Varias calles** (esquina): gana la orilla más cercana a cualquiera de ellas. → test `(r4)` en Task 1.
- **Planta baja de comercio** (sin layout de unidades): su área neta baja por la huella de la rampa, y su `plateA` no cambia. → test `(r8)` en Task 3.
- **0 sótanos** (el usuario los fija en 0): no hay rampa, no se resta nada en planta baja y no sale el aviso de calle. → test `(r9)` en Task 3.
- **Mover la calle** con el proyecto ya derivado: la caché no devuelve la rampa vieja. → test `(r5)` en Task 1.

---

### Task 1: La rampa mira a la calle

**Files:**
- Modify: `src/modules/residential/engine/derivar.ts` (`tRampa`, la llamada en `calcular`, la `firma`, `avisos0`)
- Test: `src/modules/residential/__tests__/derivar.test.ts`

**Interfaces:**
- Produces: `tRampa(contorno: Shape, boca: number, largo: number, calles?: Pt[][]): { t: number; cabe: boolean; lado: number; sinCalle: boolean }`. `sinCalle` es `true` cuando `calles` está vacío o no viene.
- Produces: `distanciaACalle(a: Pt, b: Pt, calles: Pt[][]): number`, exportada de `derivar.ts`: la distancia del punto medio de `ab` a la polilínea más cercana.

- [ ] **Step 1: Write the failing tests** en `describe('derivar')`, con un helper `conCalle(p, puntos: Point[])` que agrega `site.existingRoads = [{ id: 'r1', points, stretches: [{ left: 4, right: 4 }] }]` (una pareja por tramo):
  - `(r1)` torre `caso()` con calle al sur (`y = -10`, de x −20 a 60): todos los vértices de `plano.rampas[0]` tienen `y < 6.01` (la rampa de 6 m pegada a la orilla `y = 0`).
  - `(r2)` misma torre con calle al norte (`y = 26`): todos los vértices de `plano.rampas[0]` tienen `y > 16.2 − 6.01`.
  - `(r3)` calle al oriente (`x = 45`, de y −20 a 40): la rampa va en una orilla larga (`y = 0` o `y = 16.2`), no en `x = 32.4` (`rampas[0]` mide 22 en x).
  - `(r4)` calle al sur y otra al norte, la del norte más cerca (`y = 20` contra `y = −30`): la rampa queda en la orilla norte.
  - `(r5)` `derivar(caso())` y luego `derivar(conCalle(caso(), norte))`: el segundo trae la rampa al norte (la caché no la repite).
  - `(r6)` sin calles: `d.avisos` incluye exacto «Dibuja la calle (Existing road) para orientar la entrada del estacionamiento». Con calle: no lo incluye.
- [ ] **Step 2:** `npx vitest run src/modules/residential/__tests__/derivar.test.ts`. Esperado: FAIL `(r2)`, `(r4)`, `(r5)` y `(r6)` (la orilla sur puede salir por casualidad).
- [ ] **Step 3: Implement.**
  - Lado: candidatas, las aristas del contorno mayor con `L ≥ largo + boca`; si ninguna, todas. Con calles, gana la de menor `distanciaACalle`; si empatan (±0.01), la más larga. Sin calles, la más larga, como hoy.
  - El centrado y `cabe` siguen como están.
  - En `calcular`: `calles = (p.site.existingRoads ?? []).map((r) => r.points.map((q) => [q.x, q.y]))`, que se pasa a `tRampa`. Si `sinCalle` y `sotanos > 0`, el aviso va a `avisos0`.
  - En la `firma`: agregar `p.site.existingRoads ?? []`.
- [ ] **Step 4:** Correr el archivo. Esperado: PASS, incluidos `(l2b)` y `(l2c)`.
- [ ] **Step 5: Commit** `feat(residential): la rampa del sótano mira a la calle dibujada`.

### Task 2: La inclinación de la rampa en el plano

**Files:**
- Modify: `src/modules/residential/engine/gfit/src/parking/adapter.ts` (`BasementLayout`, `out`)
- Modify: `src/modules/residential/engine/derivar.ts` (`Estacionamiento['plano']`, `calcular`)
- Modify: `VENDOR.md`
- Test: `src/modules/residential/__tests__/derivar.test.ts`

**Interfaces:**
- Produces (adapter): `BasementLayout.rampsHigh?: number[][]`: por rampa, la fracción 0..1 de altura en cada vértice de su anillo (de `r.rampas3d[k].puntos[i][2] / 3.3`, o de `rampas_alto` si llega por ahí).
- Produces (derivar): `Estacionamiento['plano'].rampa: { huella: Ring; alto: number[]; bocaAlta: Ring[] } | null`.
  - `huella` = `lay.ramps[0]`.
  - `alto` = `rampsHigh[0]`.
  - `bocaAlta` = la boca cuyo centro está más cerca de los vértices con `alto = 1`, recortada al contorno igual que hoy (puede quedar en varios anillos o en ninguno).
  - Sin rampa, `null`. `plano.rampas` no cambia.

- [ ] **Step 1: Write the failing test** `(r7)`: con `caso()`, `plano.rampa` existe, `alto` tiene 4 valores, dos en 0 y dos en 1, y los dos vértices altos están del mismo lado del centro de la huella. `bocaAlta` toca esos dos vértices (distancia < 0.01 a algún vértice de `bocaAlta`, o a su recorte).
- [ ] **Step 2:** Correr. Esperado: FAIL, `plano.rampa` es `undefined`.
- [ ] **Step 3: Implement.** Se anota en `VENDOR.md`: «adapter: `rampsHigh`, la altura relativa de cada vértice de la rampa».
- [ ] **Step 4:** Correr el archivo. Esperado: PASS.
- [ ] **Step 5: Commit** `feat(residential): el plano del sótano sabe qué extremo de la rampa sube`.

### Task 3: La rampa del S1 le quita su lugar a la planta baja

**Files:**
- Modify: `src/modules/residential/engine/gfit/src/model/calc.ts` (`ModelCtx`, `calcOption`)
- Modify: `src/modules/residential/engine/derivar.ts` (la segunda llamada a `calcOption`)
- Modify: `VENDOR.md`
- Test: `src/modules/residential/__tests__/derivar.test.ts`

**Interfaces:**
- Consumes: `plano.rampa` (Task 2).
- Produces: `ModelCtx.plantaBaja?: Map<string, Shape>`, obstáculos por id de edificio. En `calcOption`, después de `massBuilding` y antes de `calcBuilding`: cada nivel con `num === 1` del edificio recibe `cores = union([cores, obst])`, y `net`/`sell` se recalculan con la fórmula de `blocks.ts` (`net = lobby ? 0 : area(difference(shape, cores))`, `sell = net · eff / 100`). `fp`, `fpA`, `plateA` y `basements` no se tocan.

- [ ] **Step 1: Write the failing tests:**
  - `(r8)` el podio de comercio del test `(b)` (`masa('comercio', TORRE, 9)`, vivienda en `'l2'`, núcleo de 39) con calle al sur, contra el mismo sin calle: el `net` del nivel `num === 1` baja al menos `area(huella) − 0.5`; su `plateA` y `totals.fpA` son iguales.
  - `(r8b)` torre `caso()` solo de vivienda con calle al sur: ninguna unidad del nivel `num === 1` (`layout.units[].shape`) se encima con `toShape([huella, ...bocaAlta])` (área < 0.01), y `totals.fpA` sigue siendo `32.4 × 16.2` (±0.5): la rampa no cambia la huella ni, por lo tanto, la excavación.
  - `(r9)` con `sotanos: 0` en los parámetros del edificio: `plano.rampa` es `null`, el `net` del nivel 1 es igual al de sin calle, y no sale el aviso de calle.
- [ ] **Step 2:** Correr. Esperado: FAIL `(r8)` y `(r8b)`.
- [ ] **Step 3: Implement.** En `derivar`, cuando `sotanos > 0 && plano.rampa`, se pasa `plantaBaja: new Map([[buildingId, toShape([plano.rampa.huella, ...plano.rampa.bocaAlta])]])` a la segunda `calcOption`. Se anota en `VENDOR.md`: «calc: `ModelCtx.plantaBaja`, obstáculos del nivel de calle (la rampa del estacionamiento)».
- [ ] **Step 4:** Correr el archivo y `npx vitest run src/modules/residential`. Esperado: PASS.
- [ ] **Step 5: Commit** `feat(residential): la rampa del primer sótano sale a la calle por la planta baja`.

### Task 4: Rampas inclinadas en 3D, una por sótano

**Files:**
- Modify: `src/modules/residential/views/sotano3d.ts`
- Modify: `src/modules/residential/views/Residencial3d.tsx:105-108` (la rampa plana)
- Test: `src/modules/residential/__tests__/muros3d.test.ts` (o uno nuevo, `rampas3d.test.ts`, junto a él)

**Interfaces:**
- Consumes: `plano.rampa` (Task 2).
- Produces: `rampas3d(plano: Estacionamiento['plano'], z0s: number, sotanos: number): { key: string; geometry: THREE.BufferGeometry; color: string }[]` en `sotano3d.ts`. Por sótano k (1..n), la huella como losa de 0.06 m con la cara de abajo en `z = z0s − 3.3·k + alto[i]·3.3` en cada vértice. La `bocaAlta` se dibuja plana en `z0s − 3.3·(k−1)`; la del S1 queda en `z0s`.

- [ ] **Step 1: Write the failing test:** con `derivar(caso(), 'b1')` y `sotanos = 3`, `rampas3d(plano, 0, 3)` trae 3 losas de rampa. La caja de la losa k va de `−3.3·k` (±0.01) a `−3.3·(k−1) + 0.06` (±0.01). La caja de la de k = 1 llega a 0.06, no más.
- [ ] **Step 2:** Correr. Esperado: FAIL, `rampas3d` no existe.
- [ ] **Step 3: Implement** `rampas3d`. La geometría inclinada es un prisma de 8 vértices (4 de abajo con su z, 4 arriba con +0.06), con caras indexadas. En `Residencial3d.tsx`, la losa plana amarilla de la línea 107 se reemplaza por `rampas3d(e.plano, z0s, e.sotanos)` en todas las vistas, incluida `piso === 'sotano'`. En `detalleSotano`, la rampa plana (`plano.rampas`) deja de dibujar `plano.rampa.huella`, para que no haya dos rampas encimadas; las bocas siguen planas.
- [ ] **Step 4:** Correr el test y `npx vitest run src/modules/residential`. Esperado: PASS.
- [ ] **Step 5: Commit** `feat(residential): rampas inclinadas en 3D, una por sótano`.

### Task 5: La rampa en la planta del nivel de calle

**Files:**
- Modify: `src/modules/residential/views/CapaResidencial.tsx`
- Test: `src/modules/residential/__tests__/pisos.test.tsx`

**Interfaces:**
- Consumes: `plano.rampa` (Task 2). El nivel de calle es el de `d.niveles` con `num === 1`.

- [ ] **Step 1: Write the failing test**, con el patrón del test «un nivel elegido se dibuja en planta»: proyecto con calle y sótanos, piso elegido = índice del nivel `num === 1`. El contenedor trae `path[data-rampa-calle]` (huella + boca alta: `1 + bocaAlta.length` paths) y `text[data-rampa-rotulo]` con «Rampa ↓». Con otro nivel elegido, ninguno de los dos.
- [ ] **Step 2:** Correr. Esperado: FAIL.
- [ ] **Step 3: Implement** con el mismo color `RAMPA` y el mismo cálculo de centro del rótulo que ya usa el sótano. Se dibuja en el piso con `num === 1` y también en la planta tipo cuando esa planta es la del nivel 1.
- [ ] **Step 4:** Correr el test y el archivo. Esperado: PASS.
- [ ] **Step 5: Commit** `feat(residential): la rampa en la planta del nivel de calle`.

### Task 6: Recorrido, link y cierre

**Files:**
- Modify: `scripts/recorrido-demo.mjs` (si hace falta, un paso que dibuja una calle o carga un proyecto con `existingRoads`)
- Modify: `README.md` (una línea: la rampa sigue a la calle dibujada con *Existing road*)

- [ ] **Step 1:** Cerrar los servidores de desarrollo abiertos y correr `npm run dev` (5180). Barra de 48.6 × 16.2 con el núcleo en una punta, 2 sótanos y una calle al sur. Capturas de: la planta baja (rampa y «Rampa ↓», sin departamentos encima), el sótano y el 3D (dos rampas inclinadas apiladas). Después, mover la calle al norte y ver que la rampa cambia de orilla.
- [ ] **Step 2:** `npx tsc -b --noEmit` y `npx vitest run --maxWorkers=4`. Esperado: limpio y verde.
- [ ] **Step 3: Commit** `docs: rampas de la calle a los sótanos` y `git push`. Vigilar el run de Pages (`gh run list --limit 1`, que termine en success) y abrir https://gnslac-in-house-tools.github.io/mixed-use-optimizer-mvp/. Esperado: 200 y la app carga.
