# Pieza 1 · GIM con la tipología «Uso mixto»: masa, retícula y niveles que respetan los ejes

Fecha: 2026-11-23 · Rama: `pieza-1-base-gim` · Repo: `mixed-use-optimizer-mvp`

## Intención

Ramón quiere una herramienta de uso mixto y residencial que **se pueda integrar después a GFit GIM**. Por ahora vive en un repo aparte. La regla que manda sobre todo es **escribir el mínimo código nuevo**: reutilizar GIM (marco, modelado, retícula, 3D) y los motores ya probados (GFit de `mixed-use-optimizer` / `gfit-mixed-use-rhino`, y el estacionamiento de Plaza Praktico) para que salga rápido.

El proyecto completo va en cuatro piezas, en este orden:

1. **Esta:** GIM como base, con una tipología «Uso mixto». Se modela la masa, y la app genera niveles, plantas tipo y departamentos con los muros sobre la retícula estructural.
2. Sótanos de estacionamiento con el motor de cajones de Praktico, regidos por la misma retícula.
3. Blocks habitacionales: catálogo de departamentos con lapicito y editor (recintos, puertas, ventanas, pasillos, grafo apagable y cotas fijas o movibles), sobre el patrón de blocks por pasos de las bodegas de GIM.
4. El reconfigurador de plantas, que estira los blocks respetando lo fijo.

Esta pieza sienta la base sobre la que caen las otras tres.

## Metas

- El repo arranca como GIM (`gfit-generative-information-modeler@b7909184`), con su marco, menús, herramientas, retícula, niveles, 3D, tests y estilos. Se usa tal cual, no se recrea.
- Hay una tipología nueva, **«Uso mixto»** (`typologies/mixedUse.ts`), y un módulo nuevo, **`residential`** (`modules/residential/`), registrados con los mecanismos de GIM (`typologies/index.ts`, `modules/index.ts`).
- Un proyecto nuevo de uso mixto trae:
  - los programas Vivienda, Comercio y Núcleo, cada uno con su color y su altura de entrepiso;
  - una retícula de **8.1 × 8.1 m en 3 módulos** (2.7 m, el ancho de un cajón);
  - los cuatro tipos de departamento de GFit (estudio, 1, 2 y 3 rec.).
- Se modela con las herramientas de GIM sin cambios: dibujar masa, hueco, esquina, chaflán, dividir, unir, mover, copiar, girar, reflejar, arreglo, alinear, cotas tecleadas e imán a la retícula.
- Por cada edificio, el módulo residencial corre el motor de GFit sobre sus masas y deriva los niveles, las plantas tipo con su núcleo, las unidades y el cálculo (GFA, m² vendibles, unidades por tipo, mezcla, cajones requeridos, costo, ingreso y margen).
- **Los muros entre departamentos caen sobre los módulos de la retícula** (cada 2.7 m). Los anchos van en pasos de módulo: estudio 5.4, 1 rec. 8.1, 2 rec. 10.8, 3 rec. 13.5 m, más los intermedios que el rango de cada tipo permita.
- **Columnas** en cada cruce de ejes dentro de la huella, en planta y en 3D, en toda la altura del edificio.
- Las cifras salen en la barra de KPIs de GIM (KPIs del módulo) y en su Resumen.
- Los tests de GIM siguen en verde. Lo nuevo trae sus propios tests.

## No metas (en esta pieza)

- Sótanos y cajones (pieza 2). Aquí solo se calculan los **cajones requeridos**.
- Entrar a un departamento, editarlo, el grafo, puertas y ventanas (pieza 3).
- Reconfigurar plantas (pieza 4).
- Traducir al español. Lo que viene de GIM se queda en inglés; **lo nuevo (tipología y módulo residencial) se escribe en español**. La traducción completa es una pasada aparte al final.
- Optimizador, agente, Speckle, exportaciones nuevas.

## Anti-metas: sería un fracaso aunque funcione

- Reescribir algo que GIM o GFit ya hacen: herramientas, retícula, 3D, cálculo, WFC de cuartos.
- Tocar el núcleo de GIM más allá de los puntos de registro (`typologies/index.ts`, `modules/index.ts`) y los ganchos de vista inevitables. Cada cambio al núcleo se anota en `VENDOR.md` con su razón, porque la integración futura depende de que sean pocos.
- Que al mover un vértice la planta tarde lo bastante para estorbar al modelar. GIM y Praktico ya resuelven el cálculo pesado con caché o con un Worker; se sigue su patrón.

## Restricciones

- Stack de GIM: React 19, R3F 9, drei 10, three 0.186, zustand 5, zod 4, Tailwind 3, Vite y Vitest. Las versiones se toman de su `package.json`.
- El motor de GFit se copia de `C:\dev\mixed-use-optimizer\engine\gfit` (que es `gfit-mixed-use-rhino/panel@267efea`), con su único parche `setLevelOverride` y sus 150 tests, dentro del módulo (`modules/residential/engine/gfit/`). No se reescribe.
- Los módulos de GIM son puros (`module.ts` lo exige): el motor del módulo no importa React ni el store.
- Puerto del servidor: 5180. Antes de levantarlo se cierran los demás servidores de desarrollo (preferencia de Ramón).

## Enfoques considerados

| | Enfoque | A favor | En contra |
|---|---|---|---|
| **A (elegido)** | Partir de GIM completo y agregar la tipología y el módulo residencial | Marco, modelado, retícula, 3D y tests reales. Es lo que menos código nuevo pide y deja la integración a GIM casi hecha | La base es grande (~101 mil líneas) y en inglés; lo industrial queda apagado, no borrado |
| B | Seguir en el repo chico y copiar piezas de GIM | Código chico y en español | Cada herramienta arrastra el esquema, el store y la vista de GIM; terminaríamos reescribiendo su pegamento |
| C | Modelado propio simple | — | Contradice «como si modelara en Rhino» |

Ramón eligió **A**.

## Lo que decidió Ramón

- Enfoque A, en este repo.
- La retícula **rige**: muros entre departamentos sobre los módulos de 2.7 m, no solo columnas.
- Idioma: inglés por ahora (lo de GIM), español en lo nuevo, y la traducción completa al final.
- Compatibilidad con GIM para integrarlo después; reutilizar motores de GIM, GFit y Praktico; mínimo código nuevo.

## Diseño

### 1. La base

- Se copia `src/`, `public/`, `index.html` y las configuraciones (Vite, Tailwind, PostCSS, tsconfig y Vitest) de GIM `b7909184`. Lo de servidor (`server/`, `mcp/`, llaves compartidas) entra solo si Vite lo exige para arrancar; si no, se quita su plugin de `vite.config.ts` y se anota.
- Lo de la pieza anterior que se conserva y se muda:
  - `engine/catalogo.ts` y sus tests → `modules/residential/engine/catalogo.ts`. Se usa en la pieza 3 y no se borra.
  - `ui/tresd/Unidad3d.tsx` y `ui/PlanMini.tsx` → `modules/residential/views/`. Tampoco se borran: son para la pieza 3.
  - El marco recreado (`ui/marco`, `ui/App.tsx` y lo demás) se elimina, porque GIM trae el real.
- La app arranca en el Home de GIM. «Create new» ofrece «Uso mixto» junto a «Industrial».

### 2. Tipología «Uso mixto» (`typologies/mixedUse.ts`)

- `programs`:
  - Vivienda: built, color de vivienda, entrepiso 3.0 m.
  - Comercio: built, entrepiso 4.5 m.
  - Núcleo: built, no vendible.
  - Áreas abiertas, como las tenga la tipología en blanco.
- `modules: ['residential']`. Bodegas, andenes, terreno y lotes quedan fuera, y por la regla de GIM («What is not there is not shown») sus herramientas no aparecen.
- `grid: { x: 8.1, y: 8.1, modules: 3 }`.
- `kpis`: GFA, m² vendibles, unidades, mezcla, cajones requeridos y margen (ids del módulo).
- `levelHeight`: 3.0.
- `siteRules`: índice, altura y ocupación, con los valores del proyecto demo de `mixed-use-optimizer` (marcados provisionales).

### 3. Módulo `residential` (`modules/residential/`)

**Datos del módulo.** Se sigue el patrón de bodegas, que guarda sus datos en un campo opcional del proyecto (`warehouseTypes`). El proyecto gana un campo opcional `residential` (zod, definido en `modules/residential/schema.ts`), con:

- el uso de cada programa: `usos: { [programId]: { uso: 'vivienda' | 'comercio' | 'nucleo', entrepiso: number } }`;
- los tipos de departamento (los `UnitType` de GFit);
- por edificio: profundidad de unidad, ancho de pasillo, mezcla objetivo y semilla.

Esto pide **un solo cambio al núcleo**: una línea en `ProjectSchema` (`residential: ResidentialSchema.optional()`), anotada en `VENDOR.md`. Por ser opcional, no hace falta migración. No se toca `PROGRAM_KINDS`: el uso de cada programa vive en los datos del módulo. Se descarta la bolsa `plugins` porque GIM la reserva para plugins, no para módulos.

`module.ts` declara `present(p)` (el proyecto tiene alguna masa de Vivienda o Comercio), `kpis(p)`, `measures: []`, `params: []` y `kinds` vacío por ahora (los blocks llegan en la pieza 3).

**Motor (`engine/`), puro:**

- `derivar(p, buildingId)` toma el edificio y sus masas, y regresa el resultado de GFit: niveles con su uso, plantas tipo con unidades y núcleo, totales y avisos. Es la versión GIM de `toGfit` + `calcOption` de `mixed-use-optimizer/engine/adapter.ts`.
- **Masa → GFit:**
  - Las masas de un edificio con programa Vivienda o Comercio forman la pila de niveles: cada masa aporta `floor(altura / entrepiso de su programa)` niveles a partir de su cota, con su huella (menos sus huecos) como placa.
  - Las masas con programa Núcleo son los núcleos de GFit. Sin núcleo dibujado, se usa `autoCore` de GFit y se avisa.
  - Si el modo «fp» de GFit no alcanza para varias masas apiladas, se usa su modo por masas (`links.mass`).
- **Retícula → unidades:**
  - La retícula de la opción (`gridOf`) se pasa al motor. Los anchos de cada tipo (`widthsOf`) pasan a ser múltiplos del módulo dentro de `[wMin, wMax]`; si un tipo no tiene ninguno, se toma el múltiplo más cercano y se avisa.
  - Cada tramo de banda (`runsOf`) se recorta para empezar y terminar en líneas de módulo. Lo que sobra en los extremos queda como «remanente», que se cuenta y se avisa; no se esconde.
  - Es el único cambio al motor de GFit, va marcado `mixed-use-mvp patch` y se anota en `VENDOR.md`, como el de `setLevelOverride`.
- **Columnas:** `columnas(p, buildingId)` da los cruces de ejes (crujías completas, sin módulos) dentro de la huella de cada masa, fuera de huecos y núcleos. Si GIM ya tiene esta función para las bodegas (paso «columns»), se reutiliza.
- **Caché:** el resultado se memoriza por la huella, los núcleos, la retícula y los parámetros, como hace `basementLayout`. Si una derivación pasa de ~30 ms en el proyecto demo, se mueve a un Worker con el patrón que GIM ya use.

**KPIs (`kpis.ts`):** se definen con el `KpiDef` de GIM y se leen de `derivar`.

**Vistas (`views/`):**

- En planta (la vista SVG de GIM): sobre el nivel elegido, las **unidades** coloreadas por tipo (paleta de la pieza 1: estudio `#F4C3C5`, 1 rec. `#5BB58C`, 2 rec. `#A99BE6`, 3 rec. `#EE9362`), el pasillo, el núcleo y las **columnas** como cuadros de 0.5 m. Se monta como capa con el mecanismo de GIM (como `LevelLayers` o `GraphLayer`); si ese mecanismo no permite capas de módulo, se agrega un solo gancho al núcleo y se anota.
- En 3D (la escena de GIM): los niveles derivados como losas, coloreados por programa, y las columnas.
- En el Resumen: una sección «Uso mixto» con niveles por uso, unidades por tipo, mezcla y cálculo.
- Parámetros del edificio (profundidad de unidad, ancho de pasillo y mezcla objetivo, con los valores por defecto de GFit) en Properties del edificio, con los campos de GIM (`controls/fields.tsx`).

### 4. Pruebas

- Los tests de GIM, en verde sin cambios (salvo los que nombren tipologías por lista; esos se actualizan y se anotan).
- Los 150 de GFit y los 16 de la pieza anterior, en verde.
- Nuevos:
  - la tipología crea un proyecto válido con su retícula;
  - en una huella rectangular de 32.4 × 16.2 m sobre la retícula, `derivar` da unidades cuyas orillas caen todas sobre líneas de módulo (tolerancia 1 cm);
  - las columnas son los cruces dentro de la huella y fuera del núcleo;
  - mover la huella un módulo cambia el resultado y conserva la regla;
  - los KPIs coinciden con los totales de GFit.
- Recorrido en navegador (Playwright, como en las piezas anteriores): crear «Uso mixto», dibujar una masa, ver unidades, columnas y KPIs, y pasar a 3D. Se guarda la captura.

## Lo que queda al constructor

- La traducción exacta de las masas de GIM a la entrada de GFit (modo «fp» o por masas) y cómo se reparten varias masas en un edificio.
- Cómo se engancha la capa de planta y la de 3D del módulo, preferentemente sin tocar el núcleo de GIM.
- Si `server/` y `mcp/` se quedan o se quitan para arrancar.
- Los colores exactos de Vivienda, Comercio y Núcleo (los de `PROGRAM_COLORS` de `mixed-use-optimizer` como punto de partida).

## Llamadas mías, para que Ramón las revise

- Los datos del módulo van en un campo opcional `residential` del proyecto, como hace bodegas. Es el único cambio al esquema de GIM.
- Entrepisos de 3.0 m (Vivienda) y 4.5 m (Comercio).
- El remanente de banda se cuenta y se avisa; no se reparte entre unidades, porque eso rompería los muros en los ejes.
- Las columnas van solo en los cruces de crujía (cada 8.1 m), no en cada módulo.
- `autoCore` de GFit cuando no hay núcleo dibujado, con aviso.
- `catalogo.ts`, `Unidad3d.tsx` y `PlanMini.tsx` se mudan al módulo sin usarse hasta la pieza 3.
