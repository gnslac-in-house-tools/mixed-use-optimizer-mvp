// Los textos del editor de departamentos: cuentas en singular o plural y el tamaño del nombre de cada recinto.

/** «1 puerta», «3 puertas». */
export const cuenta = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/** m: el tamaño de letra de siempre, el más chico con el que el área aún se lee y el ancho de una letra (en su tamaño) */
const FS = 0.32, FS_AREA = 0.16, LETRA = 0.55

/**
 * El tamaño del nombre de un recinto de `ancho` × `alto` m: el de siempre, o menos para que el nombre quepa en el 85 %
 * del ancho y sus dos renglones (nombre y área) en el 70 % del alto. Muy chico, el área se calla.
 */
export function rotuloRecinto(nombre: string, ancho: number, alto: number): { fs: number; conArea: boolean } {
  const fs = Math.min(FS, (ancho * 0.85) / (Math.max(1, nombre.length) * LETRA), (alto * 0.7) / 2.1)
  return { fs, conArea: fs >= FS_AREA }
}
