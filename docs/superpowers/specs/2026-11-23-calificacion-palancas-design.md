# Calificación por palancas en el panel derecho — diseño corto

Fecha: 2026-11-23 · Rama: `calificacion-palancas` (worktree `C:\dev\mixed-use-optimizer-mvp-calif`)

## Intención

Ramón quiere traer de `mixed-use-optimizer` (e6b1a81) la calificación de −2 a +2 por palanca: la penalización (negativo) y la compensación (positivo) de cada decisión del proyecto. Debe verse compacta en el panel derecho, y cada cifra tiene que decir **de dónde sale** (su fuente normativa o de mercado) y **por qué** se calificó así (el umbral o la referencia contra la que se comparó).

## Qué se porta

- `engine/rating.ts`: `rateVariable`, `leverScores`, `score` y `median`. Los modos `higher`, `vsMedianHigher`, `vsMedianLower` y `basements` se copian sin cambios de lógica.
- `fixtures/rating-rules.json`:
  - Las 8 variables, sus umbrales y su `legalRef`.
  - Pesos 1 por palanca.
  - `source`: «SPEC_DEMO §5 · umbrales provisionales hasta recibir Variables_Herramienta_Optimizacion_Residencial.xlsx».
  - Se copia tal cual y sigue marcado `provisional`.
- Las 5 palancas: m² vendibles, precio de producto, velocidad de venta, costo de obra y plazo/riesgo.

## Enfoques

| | Enfoque | Costo | Elegido |
|---|---|---|---|
| A | Pestaña propia «Calificación» en el riel del panel derecho | 2 líneas al núcleo (`SUMMARY_TABS`, `SummaryPanel`), anotadas en `VENDOR.md` | **Sí**: siempre a un clic, y es un set de reglas con fuente propia que no se mezcla con las cifras |
| B | Pestaña de plugin | No toca el núcleo | No: no vive en el riel, se abre desde el panel izquierdo y se pierde |
| C | Sección dentro de Overview | No toca el núcleo | No: Overview ya carga «Uso mixto» de la pieza 1; con 5 palancas, 8 variables y fuentes deja de ser compacto |

Una sola pestaña, no varias: el puntaje es uno, y partirlo por palanca obligaría a saltar de pestaña para entender un número.

## Diseño

**Motor** (`src/modules/residential/engine/calificacion.ts` y `reglasCalificacion.ts`), puro y con tests:

- `metricasDe(resultado)` lleva lo que da `derivar` (pieza 1) a las métricas de la app anterior:
  - `far_ratio` = índice usado / índice permitido (`siteRules`).
  - `efficiency` = m² vendibles / m² brutos.
  - `mix_fit` = ajuste de la mezcla real a la objetivo (la fórmula `mixFit` de `adapter.ts`).
  - El resto (`revenue_per_m2`, `share_under_cap`, `cost_per_m2`, `parking_cost_per_unit`, `basements`) queda `null` hasta que exista su dato. Si la pieza 1 ya trae ingreso o costo (el KPI «margen»), se conectan.
- `calificar(opciones)`: las medianas de los modos `vsMedian*` se toman de las opciones del proyecto (`EvaluationResult.options` de GIM) que tengan esa métrica. Si hay menos de 2, la variable sale «sin referencia».

**Cambio respecto a la app anterior (decisión de Claude):**

- Una variable sin dato **no cuenta en el promedio de su palanca**.
- Una palanca sin ninguna variable con dato sale «sin datos» y **no entra al puntaje**.
- El puntaje dice sobre cuántas palancas se calculó (por ejemplo, «sobre 2 de 5 palancas»).

En la app anterior, una variable sin dato entraba como 0. Eso jalaba el promedio hacia neutral y hacía pasar la falta de datos por un resultado.

**Pestaña «Calificación»** (`src/modules/residential/views/Calificacion.tsx`), con los componentes y tokens de GIM:

```
Calificación                         provisional
Puntaje  +2    sobre 2 de 5 palancas
Σ calificación × peso
─────────────────────────────────────────────
▸ m² vendibles         ×1   [+1]
    Uso del índice   0.88   +1   ≥0.85 → +1   POT · índice de edificabilidad
    Eficiencia       0.72   +1   ≥0.70 → +1   NRD-2 · núcleo y circulación
▸ Precio de producto   ×1   [+1]
▸ Velocidad de venta   ×1   sin datos
▸ Costo de obra        ×1   sin datos
▸ Plazo / riesgo       ×1   sin datos
─────────────────────────────────────────────
Fuente: SPEC_DEMO §5 · umbrales provisionales…
```

- Cada palanca es una fila con su peso y una ficha −2…+2: rojo para negativo (penaliza), verde para positivo (compensa), gris para 0 o sin datos.
- Desplegada, cada variable muestra su valor, su calificación, la base de la calificación (el umbral que alcanzó o «+3.1 % vs mediana») y su fuente.
- El tooltip de la ficha da la escala completa de umbrales (+2/+1/0/−1/−2).
- Textos en español: lo nuevo se escribe en español, según la decisión de la pieza 1.

**Núcleo:**

- `SUMMARY_TABS` gana `{ key: 'calificacion', label: 'Calificación', icon: 'target' }`, o el ícono más cercano que ya exista.
- `SummaryPanel` gana su rama.
- Los dos cambios se anotan en `VENDOR.md`.

## Metas, no metas, anti-metas

- **Metas:**
  - Ver de un vistazo qué palancas penalizan o compensan.
  - Ver de dónde sale cada número y por qué.
  - Que la pestaña se actualice sola al editar el proyecto.
- **No metas, por ahora:**
  - Editar pesos o umbrales en la app. Quedan en código, con pesos en 1.
  - Ordenar opciones por puntaje (la vista Compare de GIM ya compara).
  - Cargar el Excel de variables.
- **Anti-metas:**
  - Mostrar un puntaje que parezca firme cuando sale de pocas variables o de umbrales provisionales.
  - Tocar el núcleo de GIM más allá de las 2 líneas.

## Restricciones y orden

- Se construye sobre el commit de la reestructura de la otra sesión (`src/modules/residential/`, `derivar`). Hasta que exista, este worktree solo lleva el diseño y el plan.
- Al integrar: rebase de `calificacion-palancas` sobre `pieza-1-base-gim` y merge.

## Lo que queda al constructor

- El ícono exacto.
- Cómo leer el índice permitido de `siteRules`.
- Los nombres de campo de `derivar` (dependen de la pieza 1).
