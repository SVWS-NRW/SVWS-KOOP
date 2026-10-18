import { describe, it, expect } from 'vitest'
import { blockungsLink, laufendesHalbjahr, pruefeSchulkatalog, werteAus, type StufenDaten } from './uebersicht'
import type { QuellInfo } from '@/models/Quelle'

const quellen: QuellInfo[] = [
  { nr: 1, schema: 'koop_ge', schulNr: 192806, koopSchulNr: 192806, schulname: 'GE' },
  { nr: 2, schema: 'koop_gy', schulNr: 168890, koopSchulNr: 168890, schulname: 'GY' },
]

describe('laufendesHalbjahr', () => {
  it('bestimmt das Halbjahr aus Abiturjahr und Abschnitt', () => {
    expect(laufendesHalbjahr(2028, 2026, 1)).toBe(2) // Q1.1
    expect(laufendesHalbjahr(2027, 2026, 2)).toBe(5) // Q2.2
    expect(laufendesHalbjahr(2029, 2026, 1)).toBe(0) // EF.1
  })

  it('plant für den Jahrgang 10 die kommende EF.1', () => {
    expect(laufendesHalbjahr(2030, 2026, 1)).toBe(0)
    expect(laufendesHalbjahr(2030, 2026, 2)).toBe(0)
  })
})

describe('blockungsLink', () => {
  it('verlinkt die Blockung mit aktivem Ergebnis im SVWS-Client', () => {
    expect(blockungsLink('https://server', 'kooptest', 1, { abiturjahr: 2028, halbjahr: 2, id: 2, idAktivesErgebnis: 4 }))
      .toBe('https://server/#/kooptest/1/gost/2028/kursplanung/2/2/4')
    expect(blockungsLink('https://server', 'kooptest', 1, { abiturjahr: 2028, halbjahr: 2, id: 2, idAktivesErgebnis: null }))
      .toBe('https://server/#/kooptest/1/gost/2028/kursplanung/2/2')
  })
})

describe('werteAus', () => {
  const blockung = { id: 2, name: 'B', abiturjahr: 2028, halbjahr: 2, istAktiv: true, anzahlErgebnisse: 1, idAktivesErgebnis: 4 }
  const stufen: StufenDaten[] = [
    {
      abiturjahr: 2028, jahrgang: 'Q1', laufendesHalbjahr: 2, blockungen: [blockung],
      schueler: [{ id: 1, externeSchulNr: '192806' }, { id: 2, externeSchulNr: '192806' }, { id: 3, externeSchulNr: '168890' }, { id: 4, externeSchulNr: null }],
      mitFachwahlen: new Set([1, 3]),
      kurse: [{ lehrer: [{ id: 10, wochenstunden: 3 }] }, { lehrer: [{ id: 10, wochenstunden: 5 }, { id: 20, wochenstunden: 5 }] }, { lehrer: [] }],
    },
    {
      abiturjahr: 2029, jahrgang: 'EF', laufendesHalbjahr: 0, blockungen: [{ ...blockung, id: 1, abiturjahr: 2029, halbjahr: 0, istAktiv: false }],
      schueler: [{ id: 5, externeSchulNr: '168890' }], mitFachwahlen: new Set(), kurse: [],
    },
  ]
  const lehrer = [
    { id: 10, kuerzel: 'MÜL-1', nachname: 'Müller', vorname: 'A', istSichtbar: true },
    { id: 20, kuerzel: 'MEY-2', nachname: 'Meyer', vorname: 'B', istSichtbar: true },
    { id: 30, kuerzel: 'ALT-2', nachname: 'Alt', vorname: 'C', istSichtbar: false },
  ]
  const u = werteAus(quellen, stufen, lehrer)

  it('zählt Schüler je Stufe und Schule', () => {
    expect(u.stufen[0]).toMatchObject({ jeSchule: { 1: 2, 2: 1 }, ohneStammschule: 1, gesamt: 4, ohneFachwahlen: 2, kurse: 3, kurseOhneLehrkraft: 1 })
    // Ohne aktive Blockung im laufenden Halbjahr gibt es keine Kurszahl
    expect(u.stufen[1]).toMatchObject({ jeSchule: { 1: 0, 2: 1 }, gesamt: 1, ohneFachwahlen: 1, kurse: null })
  })

  it('fasst die Schulen zusammen', () => {
    expect(u.schulen[0]).toMatchObject({ schuelerJeStufe: { Q1: 2, EF: 0 }, schueler: 2, ohneFachwahlen: 1, lehrkraefteAktiv: 1, lehrkraefteEntfernt: 0, kurse: 2, wochenstunden: 8 })
    expect(u.schulen[1]).toMatchObject({ schuelerJeStufe: { Q1: 1, EF: 1 }, schueler: 2, ohneFachwahlen: 1, lehrkraefteAktiv: 1, lehrkraefteEntfernt: 1, kurse: 1, wochenstunden: 5 })
  })

  it('ermittelt Kurse und Wochenstunden je Lehrkraft', () => {
    expect(u.lehrkraefte.map(l => [l.kuerzel, l.nr, l.kurse, l.wochenstunden, l.stufen])).toEqual([
      ['MÜL-1', 1, 2, 8, ['Q1']],
      ['MEY-2', 2, 1, 5, ['Q1']],
      ['ALT-2', 2, 0, 0, []],
    ])
  })
})

describe('pruefeSchulkatalog', () => {
  it('meldet fehlende Einträge und falsche Kürzel', () => {
    expect(pruefeSchulkatalog(quellen, [{ schulnummerStatistik: '192806', kuerzel: '1' }])).toEqual(['Schule 2 (168890) fehlt im Schulkatalog der KOOP-DB.'])
    expect(pruefeSchulkatalog(quellen, [{ schulnummerStatistik: '192806', kuerzel: 'GE' }, { schulnummerStatistik: '168890', kuerzel: '2' }]))
      .toEqual(['Schule 1 (192806) hat im Schulkatalog das Kürzel „GE“ statt „1“.'])
  })
})
