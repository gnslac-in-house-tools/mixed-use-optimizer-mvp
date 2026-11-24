// mixed-use-mvp: el idioma de la interfaz. Lo que viene de GIM está escrito en inglés; `t` lo traduce con el
// diccionario (es.ts) cuando el idioma es español, y deja en inglés lo que el diccionario no trae. Se traduce donde
// se pinta el texto (menús, comandos, campos, paneles, KPIs), no en los datos, así que los tests y las reglas de GIM
// siguen leyendo el inglés. El idioma es del navegador (localStorage), no del proyecto. Al cambiarlo, la app se vuelve
// a montar (main.tsx), así que `t` no necesita suscribirse.
import { create } from 'zustand'
import { ES } from './es.ts'

export type Idioma = 'es' | 'en'
const LLAVE = 'gfit-idioma'

function guardado(): Idioma {
  try {
    const v = localStorage.getItem(LLAVE)
    return v === 'en' ? 'en' : 'es'
  } catch {
    return 'es'
  }
}

export const useIdioma = create<{ idioma: Idioma; poner: (i: Idioma) => void }>((set) => ({
  idioma: guardado(),
  poner: (idioma) => {
    try {
      localStorage.setItem(LLAVE, idioma)
    } catch {
      // sin almacenamiento: vale solo para esta sesión
    }
    set({ idioma })
  },
}))

/** El texto en el idioma de la interfaz: su traducción si el idioma es español y el diccionario la trae. */
export function t(texto: string): string {
  return useIdioma.getState().idioma === 'es' ? (ES[texto] ?? texto) : texto
}
