import { describe, it, expect } from 'vitest'
import {
  abschnittZumHalbjahr, bestimmeKursort, blockungsKursName, hatNote, konfigVermerk, lehrkraefteInSchule, mischeFachwahl, pruefeStand,
} from './rueckspielung'

describe('abschnittZumHalbjahr', () => {
  it('bestimmt Schuljahr und Abschnitt', () => {
    expect(abschnittZumHalbjahr(2028, 2)).toEqual({ schuljahr: 2026, abschnitt: 1 }) // Q1.1
    expect(abschnittZumHalbjahr(2028, 3)).toEqual({ schuljahr: 2026, abschnitt: 2 }) // Q1.2
    expect(abschnittZumHalbjahr(2030, 0)).toEqual({ schuljahr: 2027, abschnitt: 1 }) // EF.1 der heutigen 10
  })
})

describe('blockungsKursName', () => {
  it('bildet das Kürzel wie beim Aktivieren', () => {
    expect(blockungsKursName('D', 1, 1, '')).toBe('D-LK1')
    expect(blockungsKursName('M', 2, 3, 'a')).toBe('M-GK3a')
  })
})

describe('bestimmeKursort', () => {
  it('liest die Schule aus dem Suffix der Lehrkräfte', () => {
    expect(bestimmeKursort(['BALS-1'])).toEqual({ art: 'schule', nr: 1 })
    expect(bestimmeKursort(['BALS-2', 'MEY-2'])).toEqual({ art: 'schule', nr: 2 })
  })

  it('meldet Sonderfälle als unklar', () => {
    expect(bestimmeKursort([])).toMatchObject({ art: 'unklar', grund: 'ohne Lehrkraft' })
    expect(bestimmeKursort(['BALS-1', 'MEY-2'])).toMatchObject({ art: 'unklar' })
    expect(bestimmeKursort(['OHNE'])).toMatchObject({ art: 'unklar' })
  })
})

describe('lehrkraefteInSchule', () => {
  const schulLehrer = new Map([['BALS', 10], ['MEY', 11]])
  const platzhalter = new Map([[2, 99]])

  it('ordnet eigene Lehrkräfte über das Kürzel ohne Suffix zu', () => {
    expect(lehrkraefteInSchule('BALS-1', ['MEY-1', 'NEU-1'], 1, 1, schulLehrer, platzhalter))
      .toEqual({ lehrer: 10, weitere: [11], fehlend: ['NEU'] })
  })

  it('setzt bei Kursen der Partnerschule deren Platzhalter', () => {
    expect(lehrkraefteInSchule('MEY-2', ['XY-2'], 2, 1, schulLehrer, platzhalter)).toEqual({ lehrer: 99, weitere: [], fehlend: [] })
  })

  it('lässt die Lehrkraft leer, wenn ein unklarer Kurs der eigenen Schule zugeordnet wird', () => {
    expect(lehrkraefteInSchule(null, [], 1, 1, schulLehrer, platzhalter)).toEqual({ lehrer: null, weitere: [], fehlend: [] })
  })
})

describe('mischeFachwahl', () => {
  const schule = { halbjahre: ['S', 'S', 'S', 'S', 'S', 'M'], abiturFach: null, idReferenzfach: null }

  it('behält vergangene Halbjahre der Schule und übernimmt ab dem ersten Halbjahr die KOOP-DB', () => {
    const koop = { halbjahre: [null, null, 'LK', 'LK', 'LK', 'LK'], abiturFach: 2, idReferenzfach: null }
    expect(mischeFachwahl(schule, koop, 2)).toEqual({ halbjahre: ['S', 'S', 'LK', 'LK', 'LK', 'LK'], abiturFach: 2 })
  })

  it('meldet keine Änderung, wenn alles gleich ist', () => {
    expect(mischeFachwahl(schule, { ...schule, halbjahre: [null, null, 'S', 'S', 'S', 'M'] }, 2)).toBeNull()
  })

  it('leert ein Fach ab dem ersten Halbjahr, wenn es in der KOOP-DB nicht mehr gewählt ist', () => {
    expect(mischeFachwahl(schule, null, 2)).toEqual({ halbjahre: ['S', 'S', null, null, null, null], abiturFach: null })
  })

  it('legt ein neu gewähltes Fach an', () => {
    expect(mischeFachwahl(null, { halbjahre: [null, null, 'M', 'M', null, null], abiturFach: null, idReferenzfach: null }, 2))
      .toEqual({ halbjahre: [null, null, 'M', 'M', null, null], abiturFach: null })
  })
})

describe('Noten, Stand und Vermerke', () => {
  it('erkennt eingetragene Noten', () => {
    expect(hatNote('')).toBe(false)
    expect(hatNote('AT')).toBe(false)
    expect(hatNote(null)).toBe(false)
    expect(hatNote('2+')).toBe(true)
  })

  it('prüft, ob das KOOP-Backup neuer ist als die letzte Rückspielung', () => {
    const letzte = { zeitpunkt: '2026-10-20T10:00:00Z', stand: '2026-10-18T14:00:00.000Z', koopSchema: 'koop', bereiche: [] }
    expect(pruefeStand(null, letzte)).toBe('ohneStand')
    expect(pruefeStand('2026-10-18T14:00:00.000Z', letzte)).toBe('veraltet')
    expect(pruefeStand('2026-11-02T09:00:00.000Z', letzte)).toBe('ok')
    expect(pruefeStand('2026-11-02T09:00:00.000Z', null)).toBe('ok')
  })

  it('bildet den Schlüssel des Vermerks', () => {
    expect(konfigVermerk(2028, 3)).toBe('rueckspielung.2028.3')
  })
})
