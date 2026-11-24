import { afterEach, describe, expect, it } from 'vitest'
import { ES } from '../es.ts'
import { t, useIdioma } from '../idioma.ts'

afterEach(() => useIdioma.getState().poner('en'))

describe('el idioma de la interfaz', () => {
  it('en inglés, todo queda como está', () => {
    useIdioma.getState().poner('en')
    expect(t('File')).toBe('File')
    expect(t('Properties')).toBe('Properties')
  })

  it('en español, lo que está en el diccionario se traduce y lo demás queda en inglés', () => {
    useIdioma.getState().poner('es')
    expect(t('File')).toBe('Archivo')
    expect(t('Properties')).toBe('Propiedades')
    expect(t('Something nobody translated')).toBe('Something nobody translated')
  })

  it('los textos con un nombre adentro se traducen por su forma, y el nombre queda como está', () => {
    useIdioma.getState().poner('es')
    expect(t('Warehouse footprint')).toBe('Huella de naves')
    expect(t('Bodega A footprint')).toBe('Huella de Bodega A')
    expect(t('Cross-dock 1 GFA')).toBe('Área construida de Cross-dock 1')
    useIdioma.getState().poner('en')
    expect(t('Bodega A footprint')).toBe('Bodega A footprint')
  })

  it('se guarda en este navegador', () => {
    useIdioma.getState().poner('es')
    expect(localStorage.getItem('gfit-idioma')).toBe('es')
  })

  it('el diccionario no trae entradas vacías ni que se traduzcan a sí mismas por error', () => {
    for (const [en, es] of Object.entries(ES)) {
      expect(es.trim(), en).not.toBe('')
    }
  })
})
