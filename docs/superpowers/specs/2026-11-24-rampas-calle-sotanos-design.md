# Rampas de la calle a los sótanos: diseño

## Para qué

En la demo, el estacionamiento tiene que leerse completo: se entra desde la calle, se baja al sótano 1 y de ahí a los demás. Hoy hay una sola rampa de un nivel en el «sótano tipo», puesta en el lado más largo del sótano sin saber dónde está la calle. En 3D solo aparece como una losa plana en el primer sótano.

## Objetivos

1. **La rampa mira a la calle.** Arranca en la orilla del sótano más cercana a la calle dibujada con *Existing road* (`site.existingRoads`).
2. **Rampas apiladas.** La misma rampa recta (en el mismo lugar de la planta tipo) en cada sótano: la del S(k+1) sube al S(k) y la del S1 sube al nivel de calle. Para pasar de una a otra, el auto llega por la boca alta, sigue por el pasillo y toma la siguiente por la boca baja. Esto ya es lo que dibuja la planta tipo.
3. **3D inclinado.** Cada sótano lleva su rampa inclinada, del piso de ese sótano al piso del nivel de arriba. La del S1 termina a nivel de calle, en la fachada que da a la calle.
4. **Planta baja.** La huella de la rampa del S1 se resta del nivel de calle del edificio antes de que GFit acomode ahí comercio o departamentos, y se dibuja en la planta de ese nivel.

## Fuera de alcance

- Rampas en tijera, helicoidales o fuera de la huella (descartadas: ver Enfoques).
- Una planta distinta por sótano. Sigue habiendo una sola planta tipo.
- Fila de espera, caseta o pluma en la entrada.
- Calles de la red de la opción (`streets`). Solo cuentan las calles existentes del sitio.

## Lo que no puede pasar

- Que la rampa vuelva a salirse del contorno (lo arreglado en `deb3f4d` se mantiene, con su aviso cuando las bocas no caben).
- Que un departamento o local quede encima de la rampa en planta baja.
- Que `derivar` se vuelva notablemente más lento: el acomodo de cajones se calcula una sola vez, como hoy.

## Enfoques

Considerados (el usuario eligió el 1):

1. **Apiladas (elegido).** Encaja con la planta tipo, y el motor ya deja libre la huella de la rampa. Lo único nuevo es el 3D inclinado y restar la huella en planta baja.
2. **Tijera.** El sentido se alterna en cada nivel. Pide una planta distinta por sótano y dos lugares de rampa: mucho trabajo, y en la demo no se nota.
3. **Entrada fuera del edificio.** La rampa del S1 va en la franja entre la fachada y la calle. GIM no modela esa franja y, con el edificio en el límite del predio, no cabe.

## Cómo (lo decidido)

- **El lado de la calle (decisión del usuario: A).** Se toman las líneas de `existingRoads(site)` (`src/engine/circulation/streets.ts`). De las aristas del contorno mayor del sótano, se elige la más cercana a cualquier calle (distancia entre el punto medio de la arista y la polilínea de la calle). Solo cuentan las aristas en las que caben la rampa y una boca: `largo + 6`; si ninguna cabe, la más larga de las cercanas. Esa arista reemplaza a la «más larga» de `tRampa`: el conjunto se centra en ella igual que ahora.
- **Sin calle dibujada.** Se queda como hoy (lado más largo) y aparece el aviso «Dibuja la calle (Existing road) para orientar la entrada del estacionamiento».
- **Hacia dónde sube.** El motor decide el sentido: corre la rampa hacia el lado con más largo libre, y el extremo alto es el del final (`alto = [0, 1, 1, 0]` en `rampa()`). No se invierte nada. Como la rampa es paralela y su lado largo está sobre la orilla de la calle, los dos extremos quedan en la fachada.
- **Salida a la calle (decisión mía).** La rampa del S1 llega a nivel de calle en su boca alta, un cuadro de 6 × 6 m pegado a la fachada. Esa boca es la salida: el auto da vuelta y sale de frente a la calle. En la planta baja se restan la rampa **y** su boca alta. La boca baja queda en el S1 y no se resta.
- **3D.** `Residencial3d.tsx` y `sotano3d.ts` dibujan la huella de la rampa como una losa inclinada en cada sótano k (1..n), de `z0s − 3.3·k` en el extremo bajo a `z0s − 3.3·(k−1)` en el alto. Las bocas quedan planas en su nivel. La boca alta del S1 queda a nivel de calle. En la vista de sótano (`piso === 'sotano'`, un solo valor que muestra el S1) se dibujan la rampa del S1 y, debajo, las de los demás sótanos. No se agrega un selector S1…Sn (decisión mía: es trabajo aparte en `piso.ts` y la barra de pisos, y la demo no lo necesita).
- **Planta baja (decisión mía).** Restar la rampa cambia **solo** dónde caben los departamentos y locales. No cambia la huella del edificio, la excavación, `fpA` ni la ocupación del POT. Por eso no se resta en `sections`: en modo masa, el contorno del sótano y `fp` salen de esos cortes, y restar ahí haría un hueco en el sótano y cambiaría los costos. Se resta en el acomodo de unidades del nivel de calle, después de `massBuilding`. El plan define el punto exacto en GFit (un parche anotado en `VENDOR.md` si hace falta). Si en algún momento hay que copiar los anillos de un corte, se copia el arreglo: hoy todas las alturas comparten el mismo.
- **Planta.** `CapaResidencial.tsx` dibuja la rampa y su boca alta en la planta del nivel de calle con el rótulo «Rampa ↓» (en el sótano sigue «Rampa ↑»).
- **Distancia a la calle (decisión mía).** Se mide al eje dibujado de la calle (`road.points`), no a sus orillas. Es más simple, y con calles de ancho normal da la misma arista.
- **Caché.** La firma de la caché de `derivar` agrega `site.existingRoads`. Sin eso, al dibujar o mover una calle la rampa no se mueve.

## Lo que queda al constructor

- Cómo se representa la inclinación en `Estacionamiento.plano`: lo más simple es guardar para la rampa su extremo bajo y su extremo alto (dos aristas), además del anillo.
- La distancia arista–calle: un helper puro y testeable en `src/modules/residential/engine/`.
- Si las calles existentes cruzan el edificio, se toma la distancia igual; no hace falta validar.

## Pruebas

- `derivar`: con una calle existente al sur de la torre, la rampa queda sobre la orilla sur. Con la calle al norte, sobre la norte. Sin calle, en el lado más largo y con el aviso.
- `derivar`: ningún departamento ni local de planta baja se encima con la huella de la rampa (área de intersección < 0.01 m²).
- `derivar`: la excavación, el contorno del sótano y la ocupación no cambian por la rampa (son iguales con y sin calle dibujada).
- `derivar`: al agregar una calle existente al proyecto, el resultado cambia (la caché no devuelve el viejo).
- 3D: con n sótanos se dibujan n rampas, y la del sótano k va de `z0s − 3.3·k` a `z0s − 3.3·(k−1)`.
- Recorrido en el navegador: dibujar una calle con *Existing road* junto a la barra de 48.6 × 16.2 y ver la planta baja, el sótano y el 3D.
