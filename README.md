# Mixed-use optimizer · MVP

Una herramienta de uso mixto y residencial que parte de **GFit GIM** para integrarse después a él. Se reutiliza GIM
(marco, modelado, retícula, niveles, 3D), el motor de GFit y, más adelante, el estacionamiento de Plaza Praktico. Lo
que viene de GIM se queda en inglés; lo nuevo se escribe en español.

## Piezas

| # | Pieza | Estado |
|---|---|---|
| 1 | GIM como base, con la tipología «Uso mixto»: masa, retícula de 8.1 m en módulos de 2.7 m, niveles, plantas tipo y departamentos con los muros sobre la retícula, columnas y KPIs | Hecha |
| 2 | Sótanos de estacionamiento con el motor de cajones de Praktico (el de GFit), bajo la huella | Primera vuelta: sótanos que pide el programa (o los fijados), sus cajones en planta y 3D, su costo, y la rampa hacia la calle dibujada, apilada e inclinada |
| 3 | Blocks habitacionales: catálogo de departamentos con editor (recintos, puertas, ventanas, pasillos y cotas fijas o movibles) | Primera vuelta: pestaña Departamentos y ventana Departamento |
| 4 | El reconfigurador de plantas, que estira los blocks respetando lo fijo | Primera vuelta: el plano de Mi biblioteca sustituye al de GFit en las plantas y se estira respetando sus cotas fijas, con muebles |

## Correr

```powershell
npm install
npm run dev        # http://localhost:5180
```

## Un proyecto de uso mixto

1. En el Home, **New project** → *Project types* **Uso mixto** → **Create project**. Trae los programas Vivienda
   (entrepiso 3.0 m), Comercio (4.5 m) y Núcleo, la retícula de 8.1 × 8.1 m en 3 módulos de 2.7 m y los cinco KPIs.
2. Dibuja con **B** (o Dibujar): un arrastre, o las cotas tecleadas (`0,0` Enter y luego `32.4x16.2` Enter). En Uso
   mixto cada trazo es una masa libre del edificio del nivel elegido, así que la torre, su podio y su núcleo quedan
   juntos. El programa del siguiente trazo se elige en el ▾ del grupo Massing.
3. La altura de la masa (Properties › Height) da los niveles: `floor(altura / entrepiso)` por masa. Un podio de
   Comercio se dibuja en L1 y la torre en un nivel encima.
4. Por edificio, el módulo residencial corre GFit y muestra:
   - **en planta**, la planta tipo de las masas del nivel elegido, con las unidades por tipo (estudio, 1, 2 y 3 rec.)
     y sus muros entre departamentos sobre los módulos de 2.7 m, el pasillo, el núcleo y las columnas de 0.5 m en cada
     cruce de crujía;
   - **en 3D**, una losa por nivel derivado y las columnas en toda la altura;
   - **en el Resumen**, la sección «Uso mixto»: niveles por uso, unidades por tipo, la mezcla real contra la objetivo,
     el cálculo (área, vendible, cajones, ingreso, costo, margen) y los avisos;
   - **en la barra de KPIs**, Área construida, Área vendible, Departamentos, Cajones requeridos y Margen.
5. Las Properties del edificio llevan el fondo de unidad, el ancho de pasillo, la mezcla objetivo y la semilla.

6. **Pisos y estacionamiento.** La barra de pisos (abajo a la izquierda del viewport) elige **Tipo**, cada nivel o el
   sótano (**S1–n**): la planta dibuja ese piso con sus departamentos, o el sótano con los cajones y pasillos del motor;
   el 3D pasa a Ghosted y muestra los departamentos por color y los sótanos bajo el suelo. Los sótanos son los que pide
   el programa (hasta 5) o los fijados en Properties; ahí también van el precio tope y el terreno.
   La rampa de doble sentido se pone en la orilla que mira a la calle dibujada con *Existing road* (sin calle, en la más
   larga, con un aviso). Se apila en cada sótano, inclinada en 3D, y la del S1 sale a la calle por la planta baja, donde
   deja libre su lugar («Rampa ↓»).
7. **Columnas.** Con la retícula, los anchos de cada tramo se ordenan para que los muros entre departamentos caigan en
   las columnas (8.1 m), sin cambiar la mezcla.
8. **Calificación.** Con el estacionamiento y el precio por departamento, las cinco palancas tienen valor aun con una
   sola opción (la regla de inicio «Costo entre ingreso» califica el costo sin mediana).
9. **Departamentos** (pestaña del panel derecho): ✎ en un plano de la Biblioteca GFit lo copia a Mi biblioteca y abre
   la ventana **Departamento**: arrastrar un muro (o teclear su cota) estira los recintos de sus dos lados; el candado
   fija una cota, que viaja entera con su muro; **Puerta** y **Ventana** se ponen con un clic; **Recinto** cambia el uso
   (también a Pasillo); el grafo de adyacencias se prende y se apaga; el 3D de la unidad va a la derecha.

Recorridos en el navegador (con `npm run dev` arriba): `node scripts/recorrido.mjs` (pieza 1), `node scripts/recorrido-demo.mjs` (pisos, sótano, 3D) `node scripts/recorrido-editor.mjs` (editor) y `node scripts/recorrido-rampas.mjs` (rampas y calle). Dejan capturas en `evidence/`.

## Verificar

```powershell
npm run typecheck
npm test
```

Al cerrar la pieza 1: `tsc -b` limpio y 5734 tests en 493 archivos (GIM, los 155 de GFit con los 5 del parche de
módulos, los 5 del catálogo y 32 del módulo residencial). En esta máquina, con la suite completa en paralelo, algún test
de interfaz de GIM puede pasar de su límite de 5 s; solo, pasa.

## Estructura

| Carpeta | Qué hay |
|---|---|
| `src/` | GIM (`b7909184`). Ver `VENDOR.md` para lo copiado y cada cambio a su núcleo |
| `src/modules/residential/` | El módulo nuevo de uso mixto |
| `src/modules/residential/engine/gfit/` | El motor de GFit, copiado completo con sus tests |
| `src/modules/residential/engine/catalogo.ts` | El catálogo de unidades de la pieza anterior (para la pieza 3) |
| `src/modules/residential/views/` | `Unidad3d`, `muebles3d`, `geometria3d` y `PlanMini` de la pieza anterior (para la pieza 3) |
