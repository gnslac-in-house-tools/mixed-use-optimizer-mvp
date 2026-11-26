# Blocks residenciales: modelar un proyecto de departamentos tal cual

Fecha: 2026-11-26 · Rama: `main` · Repo: `mixed-use-optimizer-mvp`

## Por qué

Ramón quiere poder reproducir en la app el proyecto de un compañero, tal cual: sus tres tipologías (85 m², 105 m² y
150 m² en esquina) acomodadas piso por piso como en su plano (barras de departamentos, piso 2-3, piso 4 y el de arriba),
con núcleos que tengan escaleras y elevadores. Hoy GFit acomoda los departamentos solo (un solver con una mezcla y una
semilla), el editor de departamentos vive en una ventana aparte, nada se toca en la planta ni en el 3D, y el núcleo es
una caja gris que además queda bajo la etiqueta de la masa («Vivienda 1 1,881 m²»).

Lo pidió así: editar en la planta y en el 3D (muros, recintos, muebles, puertas, ventanas), que el cambio se replique en
los departamentos del mismo tipo o quede como variante de uno solo («como los Blocks de industrial»), mover los núcleos y
lo que llevan dentro (escaleras, elevador). Dejó fuera el optimizador, el agente, el IFC y las pruebas con usuarios.

## Lo que falta (análisis)

| Hace falta | Hoy |
|---|---|
| Las tipologías del compañero, con sus recintos (salón, habitación principal, habitación, vestíbulo, baño, cuarto de lavado, walk-in closet, terraza) | Hay planos de Mi biblioteca, pero solo rectangulares; los recintos de lavado, walk-in y terraza existen en GFit pero no en el catálogo |
| Un departamento en L (la de 150 en esquina) | `PlanCatalogo` es un rectángulo `w × d` |
| Poner cada departamento donde va, piso por piso | GFit los pone solo; no se puede elegir cuál va dónde |
| Moverlos, girarlos, reflejarlos, copiarlos, estirarlos en planta y 3D | Nada de eso existe para departamentos (sí para masas) |
| Editar el interior en planta y en 3D, para el tipo o solo para uno (variante) | Solo en la ventana «Departamento», y siempre para el tipo |
| Pisos distintos (2-3 iguales, 4 distinto, el de arriba distinto) | Sí: niveles de GIM con ×N y masas por nivel |
| Núcleos con escaleras, elevadores, ductos y vestíbulo, que se muevan y cuyos elementos se muevan | Caja gris sin detalle |
| Que la etiqueta de la masa no tape la planta | La etiqueta de «Vivienda 1» cae sobre el núcleo |

## Enfoques considerados

1. **Departamentos como masas de GIM ligadas a un plano (elegido).** Cada departamento es una masa (programa
   «Departamento», anidada en la planta) con un enlace a su plano de Mi biblioteca. GIM ya sabe seleccionar, mover,
   girar, reflejar, copiar, agrupar, bloquear y estirar masas en planta, y moverlas con el gumball en 3D; el módulo
   residencial lee de la huella de cada una dónde está, hacia dónde mira, si está reflejada y cuánto mide, y dibuja su
   interior. Es lo más barato y lo más parecido a los Blocks: el plano es el tipo, la masa es la copia, y la copia puede
   tener su variante.
2. **Copias de tipo como las naves (Building.warehouse).** En industrial cada copia es un edificio entero; un piso de
   uso mixto tiene 20 o 30 departamentos y GFit calcula por edificio. No encaja.
3. **Un acomodo manual guardado aparte (lista de unidades por nivel).** Habría que escribir selección, arrastre, giro,
   copia y deshacer para algo que no es masa: es rehacer lo que GIM ya tiene.

## Diseño

### Datos

- `PlanCatalogo.contorno?: Ring` — el contorno del departamento en su marco cuando no es el rectángulo `w × d` (la L).
  Sin él, el rectángulo. `estirar` lo lleva con los recintos.
- `Mass.depto?: { plan: string; variante?: PlanCatalogo }` (núcleo de GIM, anotado en VENDOR) — la masa es un
  departamento del plano `plan` de Mi biblioteca; `variante`, el plano propio de esa unidad cuando se editó solo ella.
  Va en la masa para que copiar, reflejar y deshacer lo lleven solos.
- `Mass.nucleo?: { elementos: ElementoNucleo[] }` — el detalle de un núcleo: cada elemento (`escalera`, `elevador`,
  `ducto`, `vestibulo`) con su rectángulo y su giro en el marco del núcleo. Sin él, se acomodan solos por el tamaño
  del núcleo.
- Un programa «Departamento» (uso `depto`, anidado) en la tipología Uso mixto.

### Dónde está cada departamento

De la huella de la masa (como `placeOf` de las naves): el marco (origen, eje de la fachada, giro), si está reflejada y su
ancho y fondo. Si la huella es un rectángulo de otro tamaño (alguien jaló un lado en la planta), el plano se estira a
ese tamaño respetando sus cotas fijas: así se mueve el muro entre dos departamentos.

### Cálculo

En los niveles donde hay masas de departamento, `derivar` le da a GFit ese acomodo (`setLevelOverride`, el parche que ya
existe) en lugar del suyo: las cuentas, el ingreso, los cajones que piden y la calificación salen de lo que se dibujó.
Donde no hay, GFit acomoda como hoy. **Fijar acomodo** convierte lo que GFit propone en un nivel en masas de
departamento (cada una ligada al plano de Mi biblioteca que mejor le queda, como hoy la pieza 4) para editar desde ahí.

### Edición

- **Planta:** con un departamento elegido, sus muros interiores se arrastran, sus muebles se arrastran y giran, se ponen
  y quitan puertas y ventanas, y se cambia el uso de un recinto. Arriba un selector **Editar: Tipo · Esta unidad**;
  en «Esta unidad» el cambio crea la variante; **Volver al tipo** la quita.
- **3D:** lo mismo sobre el piso del departamento: arrastrar muros y muebles sobre su plano.
- **Núcleo:** se mueve como masa; elegido, sus elementos se arrastran y giran; se dibujan escaleras (huellas y
  flecha), elevadores (cabina con su cruz), ductos (achurados) y vestíbulo, en planta y en 3D, en lugar de la caja gris.
- La etiqueta de la masa de vivienda deja de tapar la planta cuando se dibujan sus departamentos.

### Las tipologías y el proyecto de referencia

- Tres planos en el catálogo inicial de Uso mixto: **Tipología 85 m²** (10.86 × 7.88 m), **Tipología 105 m²**
  (13.30 × 7.90 m) y **Tipología 150 m² esquina** (en L, dentro de 12.9 × 14.0 m), con sus recintos medidos de la
  lámina del compañero (56.7 px/m en la lámina ampliada).
- Un proyecto de muestra que reproduce el plano: barras de departamentos, piso 2-3, piso 4 y el de arriba, con sus
  núcleos.

## Fuera

Optimizador, agente, IFC, pruebas con usuarios. Departamentos con contornos curvos.

## Lo que decide quien construye

Los nombres internos, los colores de los elementos del núcleo, el tamaño de las manijas y cómo se dibujan las escaleras.

## Fases

1. Tipologías: contorno en L, recintos nuevos, los tres planos.
2. Departamentos como masas: enlace, marco desde la huella, interior en planta y 3D, cálculo con su acomodo, Fijar acomodo,
   colocar uno desde el catálogo.
3. Editar el interior en planta, para el tipo o la unidad (variantes).
4. Editar en 3D.
5. Núcleos con detalle.
6. El proyecto de referencia.
