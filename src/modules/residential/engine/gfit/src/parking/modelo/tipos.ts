export type Id = string
export interface Punto {
  x: number
  y: number
}

export interface Vertice extends Punto {
  r: number // radio de esquina (m), 0 = viva
  rFijo: boolean // si es fijo, una edición que no le deja espacio se bloquea en vez de reducirlo
}
export interface Contorno {
  vertices: Vertice[] // antihorario, sin repetir el primero
  arcos?: Record<number, number> // lado i (de vertices[i] a vertices[i+1]) en arco: valor = bulge (tan(θ/4)), con signo
}

export interface Nivel {
  id: Id
  nombre: string
  cota: number
  altura: number
}

export interface Rampa {
  t: number
  ancho: number
  largo: number | null // null = calculado con la pendiente, las transiciones y el desnivel
  paralela: boolean
  pendiente?: number // fracción de la parte central (por omisión 0.15)
  transicion?: number // m de cada transición, a la mitad de la pendiente (sin dato = 0, como antes)
  alineacion?: 'orilla' | 'pasillo' // 'pasillo': el acomodo de su zona se alinea para que la boca dé a un pasillo
  destino?: 'arriba' | 'abajo' // nivel al que llega (por omisión 'arriba'); ahí deja su llegada
}
// t: parámetro 0..1 sobre el perímetro del contorno de la masa; la boca se pega a la orilla

/** Entrada y salida de autos desde la calle, en una orilla de la masa (spec circulaciones §6.4). */
export interface AccesoVehicular {
  id: Id
  t: number // 0..1 sobre el perímetro, como las rampas
  ancho: number
  fila: number // autos en fila de espera (6 m cada uno) hacia adentro, sin cajones
  caseta: boolean
  flecha?: FlechaAcceso // la flecha de la planta; sin dato, entra
}

/**
 * La flecha de un acceso desde la calle (spec flechas de los accesos): sin dato entra (hacia adentro); 'sale' la
 * invierte, 'ambos' lleva punta en los dos extremos y 'ninguna' la oculta. Es dibujo: la red de acceso no cambia.
 */
export type FlechaAcceso = 'sale' | 'ambos' | 'ninguna'

/**
 * El sentido de un pasillo puesto a mano (spec interacción §16.5): manda en el pasillo que contiene el punto `p` (el
 * centro de su eje al ponerlo). `sentido` es hacia dónde se circula (vector unitario) o null, doble sentido.
 */
export interface FlechaSentido {
  p: Punto
  sentido: Punto | null
}

/**
 * Una calle de estacionamiento puesta a mano (spec calles y cotas §5): su eje (polilínea abierta de 2 o más puntos) y su
 * ancho (sin dato, el `anchoPasillo` de la masa). Los cajones salen solos a sus dos lados.
 */
export interface CalleCajones {
  id: Id
  puntos: Punto[]
  ancho?: number
}

export interface ParamsCajones {
  angulo: number | null // null = busca el mejor
  anchoCajon: number
  largoCajon: number
  anchoPasillo: number
  retiro: number
  cruceCada: number
  cabeceras: boolean
  exigirAcceso: boolean
  rampas: Rampa[]
  accesos?: AccesoVehicular[] // desde la calle; con uno en el proyecto manda la red de conexión global
  accesibles?: ParamsAccesibles // sin dato = sin cajones accesibles
  columnas?: boolean // una columna en cada cruce de los ejes estructurales del proyecto (spec circulaciones §5.3)
  anguloCajon?: 90 | 60 | 45 // cajones en batería (spec circulaciones §5.5); sin dato, 90
  sentido?: 'doble' | 'unico' // sentido de los pasillos; sin dato, doble
  flechas?: FlechaSentido[] // el sentido puesto a mano en algunos pasillos (spec interacción §16.5)
  radioExterior?: number // m; radios de giro de la revisión (spec circulaciones §5.4); sin dato, 7.5 y 4.5
  radioInterior?: number
  /**
   * Cómo se acomodan (spec interacción §16.1): 'reticula' la de siempre; 'circuito' crujías en las orillas (la exterior
   * y la de cada hueco) con un pasillo en anillo; 'auto' (sin dato) circuito si la masa tiene hueco (las rampas no
   * cambian la elección: §16.4); 'calles' las calles de `calles`, puestas a mano (spec calles y cotas §5).
   */
  disposicion?: 'auto' | 'reticula' | 'circuito' | 'calles'
  calles?: CalleCajones[] // con disposicion 'calles'; sin ella se guardan pero no se usan
  pisos: number // niveles con esta misma planta (entrada Niveles del .gh)
}

export interface ElementoAlberca {
  id: Id
  tipo: 'alberca'
  centro: Punto
  rotacion: number // grados
  largo: number
  ancho: number
  andador: number // m; el andador es el borde libre alrededor
}

export interface Banda {
  tipo: 'unidades' | 'circulacion'
  fondo?: number | 'resto'
  fondo_min?: number
  fondo_max?: number
  ancho?: number
}

export type AlineacionBandas = 'centrada' | 'izquierda' | 'derecha' | 'borde'

/** Disposición del pasillo de locales (spec circulaciones §4.3): se traduce a bandas al subdividir. */
export type PasilloLocales = 'central' | 'lateral' | 'doble' | 'sin' | 'espalda' | 'circuito'
export interface DisposicionLocales {
  pasillo: PasilloLocales
  lado: 'izquierda' | 'derecha' // orilla de arranque del pasillo lateral o del frente sin pasillo
}

// Mismo formato JSON que la regla de Trama (archivo/plantillas/base.json), más la disposición
export interface ReglasPrograma {
  bandas?: {
    alineacion: AlineacionBandas
    secuencia: Banda[]
    secuencia_angosta?: Banda[]
    alineacion_angosta?: AlineacionBandas
  }
  disposicion?: DisposicionLocales
  esquinas?: 'esquina' | 'cunas' // en la vuelta de un quiebre: un local de esquina (omisión en la app) o cuñas
  mezcla?: { tipo: string; area: number; proporcion: number }[]
  reparto?: { modo: 'llenar' | 'objetivo'; cantidad: number; orden: 'agrupado' | 'alternado' }
  frente_min?: number
  frente_max?: number
  residuo_min?: number
  ejes?: { tolerancia: number; medios_ejes: boolean }
  cortes?: CortesLocales
}

/**
 * Cómo caen las divisiones entre locales (spec circulaciones §4.5): a escuadra con la directriz (hoy), paralelas a
 * un ángulo (en grados, o a escuadra con la orilla más larga de la masa o de la zona) o en los ejes estructurales.
 */
export interface CortesLocales {
  modo: 'directriz' | 'paralelos' | 'ejes'
  angulo?: number | 'orilla'
}

/** Una línea que parte la masa en zonas (spec circulaciones §5.1): de orilla a orilla. */
export interface CorteZona {
  id: Id
  puntos: Punto[] // polilínea de 2 o más puntos
  liga: boolean // deja un pasillo sobre el corte que une las dos zonas
}

/** Lo propio de una zona; se liga a la zona por un punto dentro de ella, no por su índice. */
export interface AjusteZona {
  id: Id
  semilla: Punto
  angulo?: number | 'auto' | 'orilla' // cajones: buscar, paralelo a la orilla más larga de la zona o fijo (grados)
}

export interface ZonasMasa {
  cortes: CorteZona[]
  ajustes: AjusteZona[]
}

/**
 * Una división entre locales dibujada a mano: los puntos que puso la persona usuaria. Al derivar, cada extremo se
 * prolonga hasta la orilla de la masa o hasta una división anterior, así que parte la masa de lado a lado.
 */
export interface DivisionLocal {
  id: Id
  puntos: Punto[] // polilínea de 2 o más puntos
}

/** Lo que es una pieza de las divisiones a mano; se liga a la pieza por un punto dentro de ella. */
export interface UsoPieza {
  id: Id
  semilla: Punto
  uso: 'local' | 'pasillo'
  tipo?: string // del local: un tipo de la mezcla del programa (sin dato, el primero)
}

/**
 * Un pasillo pegado a una orilla de la masa: la franja de `ancho` m que sigue toda la curva de la orilla más cercana a
 * `ancla` (un punto sobre ella). Se recalcula al derivar, así que sigue a la orilla si el contorno cambia.
 */
export interface PasilloOrilla {
  id: Id
  ancla: Punto
  ancho: number
  /** Si va alrededor de un hueco de la masa (spec interacción §16.3): su índice en `masa.huecos`. */
  hueco?: number
}

/** Cómo se parten los locales de la masa: a mano (las divisiones que se dibujan) o con la regla automática. */
export interface DivisionesLocales {
  modo: 'manual' | 'auto'
  lineas: DivisionLocal[]
  usos: UsoPieza[]
  pasillos?: PasilloOrilla[] // a mano: van antes que las divisiones y ninguna división los parte
}

export interface Masa {
  id: Id
  nivelId: Id
  nombre: string
  contorno: Contorno
  altura: number | null // null = la del nivel
  programaId: Id | null // null = sin programa
  reglas?: Partial<ReglasPrograma> // sobrescribe las del programa solo en esta masa
  cajones?: ParamsCajones // solo si el programa es de modo 'cajones'
  directriz?: Punto[] // polilínea opcional para locales
  directrizModo?: 'eje' | 'recta' // sin directriz dibujada: eje medio con quiebres (omisión) o la recta de siempre
  elementos: ElementoAlberca[]
  zonas?: ZonasMasa // zonas con su propia orientación (cajones) o directriz (locales)
  divisiones?: DivisionesLocales // locales: sin dato, la regla automática (como antes de las divisiones a mano)
  traslape?: boolean // puede estar dentro o encima de otras masas del nivel sin que sea choque (spec interacción §5)
  huecos?: Contorno[] // vacíos dentro de la masa (spec interacción §8): un patio, un núcleo vacío de estacionamiento
}

export type Modo = 'locales' | 'cajones' | 'alberca' | 'libre'
export type Tipo = 'construido' | 'exterior'
/** Volumen: se extruye con la altura de la masa. Superficie: sin altura, una losa a la cota del nivel (una explanada). */
export type Forma = 'volumen' | 'superficie'

export interface Programa {
  id: Id
  nombre: string
  color: string
  modo: Modo
  tipo: Tipo
  forma?: Forma // sin dato, volumen (spec interacción §7)
  reglas: ReglasPrograma // locales: bandas, mezcla, reparto (formato de Trama, §8)
  m2PorCajon: number | null // null = no genera demanda de cajones
  factorRentable: number // 0..1
  costoM2: number // construcción, por m² construido
  rentaM2Mes: number // por m² rentable
  /** Renta mensual de un local (interfaz v2 §6): con valor > 0, el ingreso de sus masas es n locales × esto, no m² × rentaM2Mes. */
  rentaPorLocalMes?: number
  ejemplo: boolean // valores de ejemplo: se rotulan "ejemplo — reemplazar"
  /** Descartado de las cifras (spec programa fuera de cifras): sus masas no cuentan en m², dinero, cajones ni COS. */
  fueraDeCifras?: boolean
}

export interface MapaSitio {
  lat: number
  lon: number
  zoom: number
  fuente: 'osm' | 'satelite'
  imagen: string // dataURL
  anchoM: number
  altoM: number
  centro: Punto
  rotacion: number
  bloqueado: boolean
  atribucion: string
}

export interface Sitio {
  terreno: Contorno | null // capa Terreno
  cotaTerreno: number
  mapa: MapaSitio | null // §11
}

/** Núcleo de circulación vertical (spec circulaciones §7): atraviesa niveles, por eso vive en el proyecto. */
export type TipoNucleo = 'escalera' | 'elevador' | 'montacargas' | 'escalera_electrica' | 'rampa_peatonal'

export interface Nucleo {
  id: Id
  nombre: string // "N1"
  tipo: TipoNucleo
  centro: Punto
  rotacion: number // grados; el largo va en la dirección de la rotación
  largo: number
  ancho: number
  niveles: Id[] // por dónde pasa (al menos uno)
}

/** Cajones accesibles (spec circulaciones §5.6): 1 de cada `cada`, al menos `minimo`, con franja de `franja` m. */
export interface ParamsAccesibles {
  cada: number
  minimo: number
  franja: number
}

export interface Calculadora {
  moneda: string // 'USD'
  ocupacion: number // 0..1
  margenCajones: number // cajones de más tolerados antes de "naranja"
  redondeo: 'arriba' | 'cercano' // cajones requeridos; 'arriba' por omisión
  usarAreaMedida: boolean // rentable = área de locales cuando la masa está subdividida
  recorridoMax?: number // m en línea recta de cajones y locales a una escalera (40 por omisión; parámetro, no norma)
}

export interface Proyecto {
  version: 1
  nombre: string
  niveles: Nivel[]
  masas: Masa[]
  programas: Programa[]
  sitio: Sitio
  calculadora: Calculadora
  reticula: number // paso de la retícula de edición (m), 1.0 por omisión
  nucleos?: Nucleo[] // circulación vertical
  ejes?: EjesEstructurales // la retícula estructural: columnas de cajones y divisiones de locales
  ficha?: Ficha // a quién corresponde el proyecto: sale en la presentación y en los planos
  presentacion?: ConfigPresentacion // qué diapositivas se muestran (spec presentación §5.2)
  planoTrabajo?: PlanoTrabajo // la retícula alineada a dos puntos (spec imán §7); sin él, la del norte
  acotaciones?: Acotacion[] // cotas a mano (spec cotas manuales §2); `cotas` no: `Nivel.cota` es la altura
  anotaciones?: Anotaciones // tamaño de rótulos y cotas en la planta (spec cotas manuales §4)
}

/** Una cota a mano (spec cotas manuales §2): la distancia de `a` a `b`, dibujada a `desfase` m de esa recta. */
export interface Acotacion {
  id: Id
  nivelId: Id
  a: Punto
  b: Punto
  /** Distancia con signo (m) de la línea de cota a la recta a→b: positiva a la izquierda de a→b. */
  desfase: number
  /** La esquina de la masa que sigue `a` (spec cotas Revit §2); `a` se guarda siempre al día. */
  anclaA?: AnclaCota
  anclaB?: AnclaCota
  /** El candado (spec cotas Revit §4): conserva su largo. */
  bloqueada?: boolean
}

/** Una esquina de una masa: el vértice `vertice` de su contorno. */
export interface AnclaCota {
  masaId: Id
  vertice: number
}

/** El tamaño de las anotaciones de la planta (spec cotas manuales §4). */
export interface Anotaciones {
  /** Multiplica la letra de rótulos y cotas; 1 por omisión. */
  escala: number
}

/** El plano de trabajo (spec imán §7): la retícula, Orto y las coordenadas van en sus ejes. */
export interface PlanoTrabajo {
  origen: Punto
  /** Grados, antihorario desde el eje X del mundo, en (−180, 180]. */
  angulo: number
}

/** Las diapositivas de la presentación, en su orden narrativo (spec presentación §5.1). */
export type TipoDiapositiva =
  | 'portada'
  | 'ubicacion'
  | 'vista3d'
  | 'cifras'
  | 'programas'
  | 'plantas'
  | 'versiones'
  | 'cierre'

export interface ConfigPresentacion {
  diapositivas: TipoDiapositiva[] // las marcadas, en el orden de TIPOS_DIAPOSITIVA
  niveles: Id[] | null // las plantas que van; null: los niveles con masas
}

/** Los datos del proyecto para la presentación y la cartela (spec presentación §4). Un campo vacío no se dibuja. */
export interface Ficha {
  cliente: string
  ubicacion: string
  numero: string // número de proyecto
  fase: string // «Test fit», «Esquema»…
  equipo: string[] // una persona por renglón («Nombre — rol»)
}

/**
 * Los ejes estructurales del proyecto (spec circulaciones §5.3): `nx` ejes numerados (1, 2, 3…) a cada `ex` m en
 * la dirección `angulo` desde `origen`, y `ny` ejes con letra (A, B, C…) a cada `ey` m a escuadra. La columna mide
 * `columna[0]` en la dirección de `angulo` por `columna[1]`.
 */
export interface EjesEstructurales {
  origen: Punto
  angulo: number // grados
  ex: number
  ey: number
  nx: number
  ny: number
  columna: [number, number]
}

export type Aviso = {
  nivel: 'error' | 'alerta' | 'info'
  codigo: string
  mensaje: string
  masaId?: Id
  punto?: Punto // dónde está el problema (un choque): el aviso lleva ahí
}
