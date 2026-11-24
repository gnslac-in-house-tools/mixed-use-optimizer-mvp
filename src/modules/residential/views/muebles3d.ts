// Muebles de presentación: cada tipo se arma con unas cuantas cajas y cilindros (cabecera, cojines, patas, puertas,
// tarja…) y se funde en UNA geometría con color por vértice, que se hace una vez por tipo y se comparte. Así cada
// mueble cuesta una malla y sus aristas, con un solo material para todos. Marco local: x a lo ancho (w), z a lo
// hondo (d) con el respaldo en z = −d/2 (el lado +y del plano) y el frente en z = +d/2; y = 0 es el piso.
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { CATALOGO } from '../engine/catalogo'

const C = {
  madera: '#c8b59c',
  maderaOsc: '#a38d76',
  tela: '#b8bbbd',
  telaOsc: '#9fa3a6',
  colchon: '#f3f1ec',
  edredon: '#cdd5db',
  almohada: '#fbfbf9',
  blanco: '#f1f0ec',
  porcelana: '#fafaf8',
  gabinete: '#e8e6e1',
  cubierta: '#d6d0c6',
  oscuro: '#3b3e41',
  metal: '#a2a7ab',
  agua: '#cfe3ea',
  libros: ['#b9c4c9', '#d4c5ae', '#a9b3a4', '#c9b3ad', '#9fa8b3'],
}

type Parte = THREE.BufferGeometry

function pintar(g: THREE.BufferGeometry, color: string): THREE.BufferGeometry {
  const g2 = g.index ? g.toNonIndexed() : g
  const c = new THREE.Color(color)
  const n = g2.getAttribute('position').count
  const arr = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b }
  g2.setAttribute('color', new THREE.BufferAttribute(arr, 3))
  g2.deleteAttribute('uv')
  return g2
}

/** caja de w × h × d con el centro de su base en (x, y0, z) */
function caja(w: number, h: number, d: number, x: number, y0: number, z: number, color: string): Parte {
  const g = new THREE.BoxGeometry(w, h, d)
  g.translate(x, y0 + h / 2, z)
  return pintar(g, color)
}

/** cilindro vertical de radio r (escalado en z por `sz`), con su base en (x, y0, z) */
function cil(r: number, h: number, x: number, y0: number, z: number, color: string, seg = 14, sz = 1): Parte {
  const g = new THREE.CylinderGeometry(r, r, h, seg)
  g.scale(1, 1, sz)
  g.translate(x, y0 + h / 2, z)
  return pintar(g, color)
}

/** cilindro acostado mirando al frente (+z), como el ojo de una lavadora */
function disco(r: number, grosor: number, x: number, y: number, z: number, color: string, seg = 16): Parte {
  const g = new THREE.CylinderGeometry(r, r, grosor, seg)
  g.rotateX(Math.PI / 2)
  g.translate(x, y, z)
  return pintar(g, color)
}

/** cuatro patas cuadradas metidas `m` desde las esquinas de w × d */
function patas(w: number, d: number, h: number, lado: number, m: number, color: string, y0 = 0): Parte[] {
  const x = w / 2 - m - lado / 2, z = d / 2 - m - lado / 2
  return [[-x, -z], [x, -z], [-x, z], [x, z]].map(([px, pz]) => caja(lado, h, lado, px, y0, pz, color))
}

function cama(w: number, d: number): Parte[] {
  const p: Parte[] = []
  const back = -d / 2
  p.push(caja(w, 0.26, d - 0.04, 0, 0.04, 0.02, C.madera)) // base
  p.push(...patas(w, d - 0.04, 0.04, 0.06, 0.04, C.maderaOsc).map((g) => g.translate(0, 0, 0.02)))
  p.push(caja(w + 0.04, 0.95, 0.06, 0, 0, back + 0.03, C.maderaOsc)) // cabecera
  p.push(caja(w - 0.06, 0.2, d - 0.12, 0, 0.3, 0.04, C.colchon)) // colchón
  const nAlm = w > 1.2 ? 2 : 1
  const aw = Math.min(0.62, (w - 0.2) / nAlm - 0.04)
  for (let i = 0; i < nAlm; i++) {
    const x = nAlm === 1 ? 0 : (i === 0 ? -1 : 1) * (aw / 2 + 0.03)
    p.push(caja(aw, 0.12, 0.36, x, 0.5, back + 0.32, C.almohada))
  }
  const largoEd = (d - 0.12) * 0.64
  p.push(caja(w + 0.02, 0.05, largoEd, 0, 0.48, d / 2 - 0.02 - largoEd / 2, C.edredon)) // edredón
  p.push(caja(w + 0.02, 0.06, 0.3, 0, 0.5, d / 2 - 0.02 - largoEd + 0.15, C.blanco)) // doblez
  return p
}

function sofa(w: number, d: number, plazas: number): Parte[] {
  const p: Parte[] = []
  const brazo = 0.16, resp = 0.2
  p.push(caja(w, 0.08, d, 0, 0, 0, C.oscuro)) // zoclo
  p.push(caja(w, 0.3, d, 0, 0.08, 0, C.telaOsc)) // base
  p.push(caja(w, 0.42, resp, 0, 0.38, -d / 2 + resp / 2, C.telaOsc)) // respaldo
  p.push(caja(brazo, 0.24, d, -w / 2 + brazo / 2, 0.38, 0, C.telaOsc))
  p.push(caja(brazo, 0.24, d, w / 2 - brazo / 2, 0.38, 0, C.telaOsc))
  const libre = w - 2 * brazo, cw = libre / plazas
  for (let i = 0; i < plazas; i++) {
    const x = -libre / 2 + cw * (i + 0.5)
    p.push(caja(cw - 0.02, 0.12, d - resp - 0.04, x, 0.38, resp / 2, C.tela)) // asiento
    p.push(caja(cw - 0.04, 0.36, 0.14, x, 0.5, -d / 2 + resp + 0.07, C.tela)) // cojín de respaldo
  }
  return p
}

function mesa(w: number, d: number, h: number, tabla = 0.04, color = C.madera): Parte[] {
  return [caja(w, tabla, d, 0, h - tabla, 0, color), ...patas(w, d, h - tabla, 0.05, 0.05, C.maderaOsc)]
}

function silla(w: number, d: number): Parte[] {
  const p: Parte[] = [...patas(w - 0.04, d - 0.04, 0.43, 0.035, 0.0, C.maderaOsc)]
  p.push(caja(w - 0.02, 0.04, d - 0.02, 0, 0.43, 0, C.madera))
  p.push(caja(w - 0.02, 0.36, 0.035, 0, 0.5, -d / 2 + 0.03, C.madera)) // respaldo
  p.push(caja(0.035, 0.08, 0.035, -w / 2 + 0.03, 0.47, -d / 2 + 0.03, C.maderaOsc))
  p.push(caja(0.035, 0.08, 0.035, w / 2 - 0.03, 0.47, -d / 2 + 0.03, C.maderaOsc))
  return p
}

function closet(w: number, d: number): Parte[] {
  const p: Parte[] = [caja(w, 2.2, d - 0.02, 0, 0, -0.01, C.gabinete)]
  const n = Math.max(2, Math.round(w / 0.55))
  const pw = w / n
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + pw * (i + 0.5)
    p.push(caja(pw - 0.012, 2.14, 0.02, x, 0.04, d / 2 - 0.01, C.blanco))
    const hx = x + (i % 2 === 0 ? 1 : -1) * (pw / 2 - 0.06)
    p.push(caja(0.015, 0.3, 0.025, hx, 0.95, d / 2 + 0.01, C.metal))
  }
  return p
}

function cocina(w: number, d: number): Parte[] {
  const p: Parte[] = []
  p.push(caja(w, 0.1, d - 0.08, 0, 0, -0.04, C.oscuro)) // zoclo
  p.push(caja(w, 0.76, d - 0.04, 0, 0.1, -0.02, C.gabinete))
  p.push(caja(w + 0.02, 0.04, d + 0.02, 0, 0.86, 0, C.cubierta)) // cubierta
  const n = Math.max(2, Math.round(w / 0.6)), pw = w / n
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + pw * (i + 0.5)
    p.push(caja(pw - 0.012, 0.72, 0.02, x, 0.12, d / 2 - 0.01, C.blanco))
    p.push(caja(pw * 0.4, 0.015, 0.025, x, 0.78, d / 2 + 0.01, C.metal))
  }
  // tarja a un tercio, parrilla al otro tercio
  p.push(caja(0.55, 0.012, 0.4, -w / 6, 0.9, 0.02, C.metal))
  p.push(caja(0.47, 0.014, 0.32, -w / 6, 0.9, 0.02, C.oscuro))
  p.push(cil(0.012, 0.28, -w / 6, 0.9, -d / 2 + 0.07, C.metal, 8))
  p.push(caja(0.012, 0.012, 0.16, -w / 6, 1.16, -d / 2 + 0.14, C.metal))
  p.push(caja(0.6, 0.012, 0.5, w / 4, 0.9, 0, C.oscuro))
  for (const [dx, dz] of [[-0.14, -0.12], [0.14, -0.12], [-0.14, 0.12], [0.14, 0.12]]) p.push(cil(0.07, 0.008, w / 4 + dx, 0.912, dz, C.metal, 12))
  return p
}

function refri(w: number, d: number): Parte[] {
  const p: Parte[] = [caja(w - 0.02, 1.8, d - 0.04, 0, 0, -0.02, C.blanco)]
  p.push(caja(w - 0.03, 1.1, 0.03, 0, 0.02, d / 2 - 0.02, C.porcelana)) // puerta abajo
  p.push(caja(w - 0.03, 0.64, 0.03, 0, 1.14, d / 2 - 0.02, C.porcelana)) // puerta arriba
  p.push(caja(0.02, 0.5, 0.03, -w / 2 + 0.08, 0.5, d / 2 + 0.01, C.metal))
  p.push(caja(0.02, 0.3, 0.03, -w / 2 + 0.08, 1.2, d / 2 + 0.01, C.metal))
  return p
}

function tv(w: number, d: number): Parte[] {
  const p: Parte[] = [caja(w, 0.45, d, 0, 0.06, 0, C.madera), ...patas(w, d, 0.06, 0.04, 0.05, C.oscuro)]
  p.push(caja(w / 2 - 0.01, 0.37, 0.015, -w / 4, 0.1, d / 2, C.maderaOsc))
  p.push(caja(w / 2 - 0.01, 0.37, 0.015, w / 4, 0.1, d / 2, C.maderaOsc))
  const tw = Math.min(1.25, w - 0.2)
  p.push(caja(0.28, 0.02, 0.18, 0, 0.51, -0.02, C.oscuro))
  p.push(caja(0.06, 0.08, 0.04, 0, 0.53, -0.04, C.oscuro))
  p.push(caja(tw, 0.72, 0.04, 0, 0.6, -0.04, C.oscuro))
  return p
}

function wc(w: number, d: number): Parte[] {
  const back = -d / 2
  return [
    caja(w - 0.02, 0.38, 0.18, 0, 0.4, back + 0.09, C.porcelana), // tanque
    caja(w, 0.03, 0.2, 0, 0.78, back + 0.1, C.blanco),
    cil(0.12, 0.3, 0, 0, back + 0.36, C.porcelana, 14, 1.2), // pie
    cil(w / 2 - 0.01, 0.1, 0, 0.3, back + 0.42, C.porcelana, 16, 1.35), // taza
    cil(w / 2 - 0.01, 0.025, 0, 0.4, back + 0.43, C.blanco, 16, 1.35), // asiento
  ]
}

function lavabo(w: number, d: number): Parte[] {
  return [
    caja(w - 0.04, 0.74, d - 0.04, 0, 0.08, -0.02, C.gabinete),
    caja(w - 0.06, 0.66, 0.02, 0, 0.1, d / 2 - 0.03, C.blanco),
    caja(w, 0.04, d, 0, 0.82, 0, C.cubierta),
    cil(0.17, 0.02, 0, 0.855, 0.03, C.porcelana, 18, 0.8),
    cil(0.13, 0.008, 0, 0.872, 0.03, C.agua, 18, 0.8),
    cil(0.015, 0.2, 0, 0.86, -d / 2 + 0.06, C.metal, 8),
    caja(0.02, 0.02, 0.1, 0, 1.04, -d / 2 + 0.1, C.metal),
  ]
}

function regadera(w: number, d: number): Parte[] {
  const back = -d / 2
  return [
    caja(w, 0.05, d, 0, 0, 0, C.porcelana),
    caja(w - 0.1, 0.006, d - 0.1, 0, 0.05, 0, C.agua),
    cil(0.04, 0.006, 0, 0.056, 0, C.metal, 10),
    // mezcladora y regadera de mano en el muro, bajo el corte de 1.2 m de Presentación
    caja(0.14, 0.06, 0.04, 0, 0.9, back + 0.02, C.metal),
    cil(0.012, 0.2, 0.1, 0.9, back + 0.03, C.metal, 8),
    cil(0.028, 0.14, 0.1, 1.06, back + 0.045, C.metal, 10),
    // mampara: un perfil al frente, sin vidrio (el vidrio pediría otro material)
    caja(0.025, 1.1, 0.025, -w / 2 + 0.02, 0.05, d / 2 - 0.02, C.metal),
    caja(w - 0.02, 0.025, 0.025, 0, 1.125, d / 2 - 0.02, C.metal),
  ]
}

function lavadora(w: number, d: number): Parte[] {
  return [
    caja(w - 0.02, 0.85, d - 0.04, 0, 0, -0.02, C.blanco),
    caja(w - 0.02, 0.12, 0.02, 0, 0.71, d / 2 - 0.02, C.porcelana),
    disco(0.2, 0.03, 0, 0.42, d / 2 - 0.01, C.metal, 18),
    disco(0.15, 0.04, 0, 0.42, d / 2, C.oscuro, 18),
    disco(0.03, 0.03, w / 2 - 0.1, 0.77, d / 2 - 0.005, C.metal, 10),
  ]
}

function escritorio(w: number, d: number): Parte[] {
  const p: Parte[] = [caja(w, 0.035, d, 0, 0.715, 0, C.madera)]
  p.push(caja(0.04, 0.715, d - 0.06, -w / 2 + 0.03, 0, 0, C.maderaOsc))
  p.push(caja(0.4, 0.6, d - 0.08, w / 2 - 0.24, 0.1, 0, C.gabinete)) // cajonera
  p.push(caja(0.04, 0.715, d - 0.06, w / 2 - 0.03, 0, 0, C.maderaOsc))
  p.push(caja(w - 0.08, 0.3, 0.02, 0, 0.4, -d / 2 + 0.04, C.maderaOsc)) // faldón
  p.push(caja(0.34, 0.015, 0.24, -0.15, 0.75, 0.06, C.metal)) // laptop
  p.push(caja(0.34, 0.22, 0.012, -0.15, 0.765, -0.07, C.oscuro)) // pantalla
  return p
}

function estante(w: number, d: number): Parte[] {
  const H = 1.8, t = 0.025
  const p: Parte[] = [
    caja(t, H, d, -w / 2 + t / 2, 0, 0, C.madera),
    caja(t, H, d, w / 2 - t / 2, 0, 0, C.madera),
    caja(w, H, 0.01, 0, 0, -d / 2 + 0.005, C.maderaOsc),
  ]
  const niveles = 5
  for (let i = 0; i <= niveles; i++) p.push(caja(w - 2 * t, t, d - 0.01, 0, i === niveles ? H - t : (i * H) / niveles, 0.005, C.madera))
  // libros en tres repisas, en tonos apagados
  let k = 0
  for (const nivel of [1, 2, 3]) {
    let x = -w / 2 + t + 0.04
    const y0 = (nivel * H) / niveles + t
    const fin = w / 2 - t - (nivel === 2 ? 0.4 : 0.15)
    while (x < fin - 0.05) {
      const bw = 0.03 + ((k * 7) % 4) * 0.01, bh = 0.2 + ((k * 5) % 3) * 0.035
      p.push(caja(bw, bh, d - 0.1, x + bw / 2, y0, 0.02, C.libros[k % C.libros.length]))
      x += bw + 0.004
      k++
    }
  }
  return p
}

function buro(w: number, d: number): Parte[] {
  return [
    caja(w - 0.02, 0.46, d - 0.02, 0, 0.06, 0, C.madera),
    ...patas(w - 0.02, d - 0.02, 0.06, 0.03, 0.02, C.maderaOsc),
    caja(w, 0.03, d, 0, 0.52, 0, C.maderaOsc),
    caja(w - 0.06, 0.012, 0.01, 0, 0.32, d / 2, C.maderaOsc),
    cil(0.06, 0.02, 0.06, 0.55, -0.02, C.metal, 12), // lámpara
    cil(0.008, 0.26, 0.06, 0.57, -0.02, C.metal, 6),
    cil(0.1, 0.16, 0.06, 0.78, -0.02, C.almohada, 14),
  ]
}

function mesaRedonda(w: number): Parte[] {
  const r = w / 2
  return [cil(r * 0.5, 0.02, 0, 0, 0, C.oscuro, 16), cil(0.03, 0.7, 0, 0.02, 0, C.oscuro, 8), cil(r, 0.03, 0, 0.72, 0, C.madera, 20)]
}

function mesaCentro(w: number, d: number): Parte[] {
  return [...mesa(w, d, 0.4, 0.04), caja(w - 0.12, 0.02, d - 0.12, 0, 0.1, 0, C.maderaOsc)]
}

function sillon(w: number, d: number): Parte[] {
  return sofa(w, d, 1)
}

function armar(kind: string, w: number, d: number): Parte[] {
  if (kind.startsWith('cama-')) return cama(w, d)
  switch (kind) {
    case 'buro': return buro(w, d)
    case 'closet': return closet(w, d)
    case 'sofa': return sofa(w, d, 3)
    case 'sillon': return sillon(w, d)
    case 'mesa-centro': return mesaCentro(w, d)
    case 'tv': return tv(w, d)
    case 'comedor-4':
    case 'comedor-6': return mesa(w, d, 0.75, 0.04)
    case 'silla': return silla(w, d)
    case 'cocina': return cocina(w, d)
    case 'refri': return refri(w, d)
    case 'wc': return wc(w, d)
    case 'lavabo': return lavabo(w, d)
    case 'regadera': return regadera(w, d)
    case 'lavadora': return lavadora(w, d)
    case 'escritorio': return escritorio(w, d)
    case 'estante': return estante(w, d)
    case 'mesa-terraza': return mesaRedonda(w)
    default: return [caja(w, 0.6, d, 0, 0, 0, C.gabinete)]
  }
}

export interface ModeloMueble { geo: THREE.BufferGeometry; aristas: THREE.BufferGeometry }

const cache = new Map<string, ModeloMueble>()

/** La geometría fundida (y sus aristas) de un tipo de mueble; se hace una vez y se comparte entre todos. */
export function modeloMueble(kind: string): ModeloMueble {
  let m = cache.get(kind)
  if (!m) {
    const c = CATALOGO[kind] ?? { w: 0.5, d: 0.5 }
    const partes = armar(kind, c.w, c.d)
    const geo = mergeGeometries(partes, false)!
    partes.forEach((g) => g.dispose())
    geo.computeBoundingSphere()
    m = { geo, aristas: new THREE.EdgesGeometry(geo, 35) }
    cache.set(kind, m)
  }
  return m
}

/** Materiales compartidos por todos los muebles de presentación. */
export const MAT_MUEBLE = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })
export const MAT_ARISTA = new THREE.LineBasicMaterial({ color: '#141412', transparent: true, opacity: 0.28 })
