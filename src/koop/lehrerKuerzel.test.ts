import { describe, it, expect } from 'vitest'
import { bildeKoopKuerzel, zerlegeKoopKuerzel, istQuellKuerzelZulaessig } from './lehrerKuerzel'

describe('bildeKoopKuerzel', () => {
  it('hängt die Nummer der Quellschule an', () => {
    expect(bildeKoopKuerzel('MÜL', 2)).toBe('MÜL-2')
    expect(bildeKoopKuerzel(' BALS ', 1)).toBe('BALS-1')
  })

  it('erlaubt Kürzel bis 8 Zeichen, damit das Ergebnis in 10 Zeichen passt', () => {
    expect(bildeKoopKuerzel('ABCDEFGH', 3)).toBe('ABCDEFGH-3')
    expect(() => bildeKoopKuerzel('ABCDEFGHI', 3)).toThrow()
  })

  it('lehnt leere Kürzel und ungültige Nummern ab', () => {
    expect(() => bildeKoopKuerzel('', 1)).toThrow()
    expect(() => bildeKoopKuerzel('MÜL', 0)).toThrow()
    expect(() => bildeKoopKuerzel('MÜL', 10)).toThrow()
    expect(() => bildeKoopKuerzel('MÜL', 1.5)).toThrow()
  })
})

describe('zerlegeKoopKuerzel', () => {
  it('liefert Kürzel und Nummer der Quellschule', () => {
    expect(zerlegeKoopKuerzel('BALS-1')).toEqual({ kuerzel: 'BALS', nr: 1 })
    expect(zerlegeKoopKuerzel('VAN-DER-2')).toEqual({ kuerzel: 'VAN-DER', nr: 2 })
  })

  it('liefert null für Kürzel ohne Suffix', () => {
    expect(zerlegeKoopKuerzel('BALS')).toBeNull()
    expect(zerlegeKoopKuerzel('BALS-')).toBeNull()
    expect(zerlegeKoopKuerzel('-1')).toBeNull()
  })

  it('ist die Umkehrung von bildeKoopKuerzel', () => {
    expect(zerlegeKoopKuerzel(bildeKoopKuerzel('MÜL', 3))).toEqual({ kuerzel: 'MÜL', nr: 3 })
  })
})

describe('istQuellKuerzelZulaessig', () => {
  it('prüft die Länge', () => {
    expect(istQuellKuerzelZulaessig('MÜL')).toBe(true)
    expect(istQuellKuerzelZulaessig('')).toBe(false)
    expect(istQuellKuerzelZulaessig('ABCDEFGHI')).toBe(false)
  })
})
