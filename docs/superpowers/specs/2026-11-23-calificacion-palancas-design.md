# Calificación por palancas — diseño

Fecha: 2026-11-24 (revisa el diseño corto del 2026-11-23) · Rama: `calificacion-palancas` (worktree `C:\dev\mixed-use-optimizer-mvp-calif`) · Maqueta aprobada: `maqueta/index.html` del worktree (desechable, sin commit)

## Intención

Ramón quiere traer de `mixed-use-optimizer` (e6b1a81) la calificación de −2 a +2 por palanca, que penaliza (negativo) o compensa (positivo) cada decisión del proyecto. Lo que pide:

- verla siempre, en la barra de KPIs;
- verla compacta y con aire en el panel derecho;
- saber de cada cifra **de dónde sale** (su fuente) y **por qué** se calificó así (el umbral o la referencia);
- **definir él mismo las reglas** (fórmulas, rangos, pesos y fuentes) en una ventana como las de Brief y Rules de GIM, a la manera del Excel de variables que ya existía.

## Qué se porta y qué cambia

De `engine/rating.ts` y `fixtures/rating-rules.json` se portan:

- `median`, `byHigher`, `byLower`, la calificación por variable, el promedio por palanca y el puntaje (Σ calificación × peso);
- las 5 palancas: m² vendibles, precio de producto, velocidad de venta, costo de obra y plazo/riesgo;
- las 8 variables con sus umbrales, `legalRef` y `source`, y los pesos en 1.

Cambios, todos vistos en la maqueta:

1. **La métrica es una fórmula** sobre los datos del proyecto (`ingreso / m2_vendibles`). Antes era un id fijo en código. Ramón las edita.
2. **Cuatro modos**: mayor es mejor, menor es mejor, sobre la mediana, bajo la mediana. Sótanos deja su tabla fija y pasa a «menor es mejor» con umbrales `[—, —, 1, 2]`, que califica igual (≤1 → 0, 2 → −1, ≥3 → −2). Un umbral vacío (`null`) es un escalón que no aplica.
3. **Sin dato no cuenta.** Una variable sin dato queda fuera del promedio de su palanca. Una palanca sin dato, o con peso 0, queda fuera del puntaje. El puntaje dice sobre cuántas palancas se calculó. En la app anterior entraban como 0.
4. **Mediana entre las opciones del proyecto.** Los modos de mediana evalúan la misma fórmula en cada opción con dato. Con menos de 2 opciones, la variable sale «sin referencia».

## Enfoques (elegido A, 2026-11-23)

| | Enfoque | Elegido |
|---|---|---|
| A | Pestaña propia «Calificación» en el riel del panel derecho | **Sí**: siempre a un clic; es un set de reglas con fuente propia |
| B | Pestaña de plugin | No: no vive en el riel |
| C | Sección dentro de Overview | No: Overview ya carga «Uso mixto»; deja de ser compacto |

## Diseño

### 1. Datos para las fórmulas (motor, puro)

`datosCalificacion(p, optionId)` suma `derivar` (pieza 1, Task 5) sobre los edificios de la opción y da un registro de nombre → número o `null`:

| Nombre | De dónde | Pieza |
|---|---|---|
| `m2_vendibles` | Σ `totals.nsa` | 1 |
| `m2_brutos` | Σ `totals.gfa` | 1 |
| `indice_usado` | Σ `gfa` / área del predio | 1 |
| `indice_permitido` | la `zoning.far` con que corre `derivar` | 1 |
| `ajuste_mezcla` | `mixFit(mezcla objetivo, mezcla real)` de `adapter.ts` (0 a 1) | 1 |
| `unidades` | Σ `totals.units` | 1 |
| `cajones` | Σ `totals.req` | 1 |
| `ingreso` | Σ `totals.revenue` | 1 |
| `costo` | Σ `totals.cost` | 1 |
| `unidades_bajo_tope` | unidades bajo el tope FAPRIVI | 2 (`null`) |
| `costo_parking` | costo de los sótanos | 2 (`null`) |
| `sotanos` | niveles de sótano | 2 (`null`) |

Con esto, hoy tienen dato 5 de las 8 variables:

- uso del índice, eficiencia y ajuste a la mezcla;
- ingreso y costo por m², cuando hay 2 o más opciones.

### 2. Reglas (datos del proyecto, del módulo)

- `ResidentialSchema` gana `calificacion` opcional. Ausente, se usan las reglas de inicio (SPEC_DEMO §5). Contiene:
  - `provisional`, `source`, `weights` por palanca;
  - `variables[]`: `{ id, label, lever, formula, mode, steps: [n|null ×4], unit, legalRef }`.
- Al vivir dentro del dato del módulo, no toca `ProjectSchema`.
- Se guarda con el proyecto y se deshace con el undo de GIM, como cualquier edición.

### 3. Evaluador de fórmulas

- Solo acepta números, `+ − * / ( )`, espacios y los nombres de la tabla.
- Se tokeniza y se evalúa con un parser propio de descenso recursivo, **sin `eval` ni `Function`**.
- Errores en palabras: «“foo” no es un dato del proyecto», «fórmula incompleta», «no da un número».
- Si un nombre no tiene dato, el resultado es `null` y dice cuál falta.

### 4. Barra de KPIs

El módulo registra estos KPIs (`KpiDef`, `area: 'massing'`, `aim: false`):

- `calif-puntaje`;
- `calif-m2_vendibles`, `calif-precio_producto`, `calif-velocidad_venta`, `calif-costo_obra`, `calif-plazo_riesgo`.

**Interruptor «KPIs: Calificación · Proyecto»** al inicio de la barra:

- **Calificación** (por defecto): `calif-puntaje` grande, las 5 palancas e Issues.
- **Proyecto**: los `kpis` del proyecto, como hoy, con `calif-puntaje` como una celda más.
- Es estado de vista: se guarda en el navegador y no en el proyecto.

**La celda de calificación** sigue el patrón de GIM (nombre, cifra, línea; el punto de estado es el único color):

- Puntaje: `+1` con una mini barra divergente de lo que aporta cada palanca; la línea dice «compensa · 5 de 5 palancas · provisional».
- Palanca: su calificación con la escala de 5 puntos; la línea dice «2 de 2 variables · ×1».
- Al hacer clic se abre la pestaña Calificación, con esa palanca desplegada (como Issues abre la suya).

### 5. Pestaña «Calificación» (panel derecho)

- **Encabezado:** título, etiqueta «provisional» y botón de ajustes que abre la ventana de reglas.
- **Tarjeta de puntaje:** el número, la barra divergente y «sobre N de 5 palancas · M de 8 variables».
- **Una fila por palanca** (40 px, separadas por una línea): nombre, ×peso, escala de 5 puntos (−2…+2) con el punto en su color, y su valor. Se despliega con clic.
- **Una variable por fila** al desplegar: nombre, valor y calificación, y una barra de 5 bandas (rojo → gris → verde) con el marcador de hoy.
- **Lo demás va oculto** (GIM, Decision «Help»): umbrales, porqué, fórmula y fuente.
  - Al pasar el cursor o con el foco, salen en una tarjeta a la izquierda del panel.
  - Con el **?** de GIM encendido, salen en línea.
- **Pie:** «Fuente: …» y «Editar reglas…».

### 6. Ventana «Reglas de calificación»

Es una ventana sobre la app con el fondo oscurecido (Decision «Brief and Rules as windows»). Se cierra con ✕, Esc o un clic afuera. Se abre desde:

- **Design → Reglas de calificación…**;
- el botón de ajustes y «Editar reglas…» de la pestaña.

Edita una copia; **Aplicar** la escribe en el proyecto y **Cancelar** la descarta.

**A la izquierda, la lista:**

- por palanca: su peso (− / +) y la barra con su % del puntaje;
- sus variables: nombre, fórmula en gris y calificación de hoy, o ⚠ si tiene error;
- «+ Variable» dentro de cada palanca;
- al pie, la fuente del set y el interruptor «Umbrales provisionales».

**A la derecha, la variable elegida:**

- El nombre como título editable. Debajo, Palanca, Unidad y «Fuente · de dónde sale», cada uno con su etiqueta. Botón Quitar.
- **Tarjeta Fórmula:**
  - el campo grande, evaluado mientras se escribe;
  - el resultado de **Hoy** al lado;
  - el mensaje de error o de dato faltante;
  - los chips de los datos (un clic inserta en el cursor; los de la pieza 2 se ven punteados).
- **Tarjeta Cómo se califica:**
  - el selector de los cuatro modos;
  - las 5 bandas (−2 penaliza … +2 compensa) con el marcador de hoy;
  - los 4 umbrales editables bajo cada borde («+1 desde» o «+1 hasta»), en % cuando el modo es de mediana o la unidad es %;
  - una frase que resume («Hoy vale 0.88 → +1 (≥ 0.85)»).
- **Validación al salir de cada campo:**
  - umbrales fuera de orden o fórmula con error ponen la frase en rojo y marcan la variable en la lista;
  - el pie dice cuántas variables tienen error, y Aplicar queda desactivado hasta corregirlas.
- **Restablecer** vuelve a SPEC_DEMO §5.
- **Importar Excel…** existe desactivado, con el tooltip «Por decidir».

### 7. Cambios al núcleo de GIM

Cada uno va con una línea en `VENDOR.md`:

1. `views/layout/ui.ts`: `SummaryTab` y `SUMMARY_TABS` ganan `calificacion`; `Dialog` gana `calificacion`.
2. `views/panels/SummaryPanel.tsx`: su rama.
3. `views/layout/Dialogs.tsx`: su rama.
4. `views/commands/design.ts`: «Reglas de calificación…» en el menú Design.
5. `views/stats/KpiStrip.tsx`:
   - el interruptor de juego de KPIs;
   - el juego «Calificación» como lista de ids;
   - la celda de los ids `calif-*` dibujada por el componente del módulo, como hoy hace con Issues;
   - el clic que abre la pestaña.

## Metas, no metas, anti-metas

- **Metas:**
  - La calificación siempre a la vista.
  - Saber de dónde sale y por qué cada número.
  - Ramón define fórmulas, rangos, pesos y fuentes dentro de la app.
  - Se actualiza sola al editar el proyecto.
- **No metas, por ahora:**
  - Importar el Excel (el botón queda desactivado).
  - Ordenar las opciones por puntaje (Compare de GIM ya compara).
  - Funciones en las fórmulas (`min`, `max`, `si`).
  - Traducir lo de GIM.
- **Anti-metas:**
  - Un puntaje que parezca firme cuando sale de pocas variables o de umbrales provisionales.
  - Textos de ayuda siempre visibles (la regla «Help» de GIM).
  - Evaluar fórmulas con `eval`.
  - Tocar el núcleo más allá de los 5 puntos listados.

## Restricciones y orden

- Depende de la pieza 1:
  - de `derivar` (Task 5) para los datos;
  - de los KPIs del módulo (Task 6), que esta rama extiende.
- La parte pura (evaluador, calificación, reglas y esquema) se puede hacer ya, con datos de prueba. La parte que lee `derivar` espera a que exista.
- Al integrar: rebase de `calificacion-palancas` sobre `pieza-1-base-gim` y merge.

## Lo que queda al constructor

- El ícono de la pestaña: el más cercano en `controls/iconos`.
- El nombre exacto del store del interruptor de KPIs.
- Cómo expone `derivar` la `zoning.far`. Si no la expone, se agrega a `Derivado`, coordinándolo con la pieza 1.
