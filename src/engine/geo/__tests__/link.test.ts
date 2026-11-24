// Ported from Plaza-Practiko `vistas/mapa/__tests__/teselas.test.ts` (latLonDeEnlace, esEnlaceCorto).
import { describe, expect, it } from 'vitest'
import { isShortLink, latLonFromLink } from '../link.ts'

describe('latLonFromLink', () => {
  it('reads the @lat,lon of a Google Maps link', () => {
    expect(latLonFromLink('https://www.google.com/maps/place/Alajuela/@10.0163,-84.2116,17z/data=!3m1')).toEqual({ lat: 10.0163, lon: -84.2116 })
  })
  it('reads "lat, lon" with or without a space', () => {
    expect(latLonFromLink('10.0163, -84.2116')).toEqual({ lat: 10.0163, lon: -84.2116 })
    expect(latLonFromLink('  10.0163,-84.2116 ')).toEqual({ lat: 10.0163, lon: -84.2116 })
  })
  it('reads the !3d…!4d… form of long links', () => {
    expect(latLonFromLink('https://www.google.com/maps/place/X/data=!3m1!4b1!4m6!3d19.4326!4d-99.1332')).toEqual({ lat: 19.4326, lon: -99.1332 })
  })
  it('reads a pair with decimal commas', () => {
    expect(latLonFromLink('10,0163, -84,2116')).toEqual({ lat: 10.0163, lon: -84.2116 })
    expect(latLonFromLink('10,0163; -84,2116')).toEqual({ lat: 10.0163, lon: -84.2116 })
    expect(latLonFromLink('10,0163 -84,2116')).toEqual({ lat: 10.0163, lon: -84.2116 })
  })
  it('knows Google Maps’ short links', () => {
    expect(isShortLink('https://maps.app.goo.gl/abc123')).toBe(true)
    expect(isShortLink('https://goo.gl/maps/xyz')).toBe(true)
    expect(isShortLink('https://www.google.com/maps/@10,-84,17z')).toBe(false)
  })
  it('null for rubbish or coordinates out of range', () => {
    expect(latLonFromLink('hello')).toBeNull()
    expect(latLonFromLink('')).toBeNull()
    expect(latLonFromLink('95, 10')).toBeNull()
    expect(latLonFromLink('10, 200')).toBeNull()
    expect(latLonFromLink('https://maps.app.goo.gl/abc123')).toBeNull()
  })
})
