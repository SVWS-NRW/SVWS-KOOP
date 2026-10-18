import { describe, it, expect } from 'vitest'
import {
  katalogSchluessel, fehlendeKatalogEintraege, ordneKatalogZu, bereiteSchuelerStammdatenVor, bereiteErzieherVor,
  bereiteTelefonVor, gruppiereErzieher, koopKlasse, bereiteLehrerVor, istPlatzhalter, Protokoll, vergangeneHalbjahre, fachwahlFuerKoop,
  fachwahlPruefsumme, erstesHalbjahr, konfigFachwahlen, istUebernahmeSchueler,
  type KatalogZuordnungen,
} from './uebernahme'

function kataloge(teil: Partial<KatalogZuordnungen> = {}): KatalogZuordnungen {
  return {
    erzieherarten: new Map([[5, 50]]), telefonarten: new Map([[1, 10]]), religionen: new Map([[1, 7]]),
    orte: new Map([[757, 4711]]), fahrschuelerarten: new Map(), haltestellen: new Map(), ...teil,
  }
}

describe('Kataloge', () => {
  it('ordnet Orte über PLZ und Ortsname, Religionen über den Statistik-Schlüssel zu', () => {
    expect(katalogSchluessel('orte', { plz: '42103', ortsname: ' Wuppertal ' })).toBe('42103|wuppertal')
    expect(katalogSchluessel('religionen', { idReligion: 2000, bezeichnung: 'ev.' })).toBe('stat:2000')
    expect(katalogSchluessel('religionen', { idReligion: null, bezeichnung: 'Sonstige' })).toBe('bez:sonstige')
    expect(katalogSchluessel('erzieherarten', { bezeichnung: 'Mutter' })).toBe('mutter')
  })

  it('findet fehlende Einträge der Vereinigung, jeden nur einmal', () => {
    const fehlend = fehlendeKatalogEintraege('erzieherarten',
      [[{ bezeichnung: 'Mutter' }, { bezeichnung: 'Onkel' }], [{ bezeichnung: 'onkel' }, { bezeichnung: 'Pflegeeltern' }]],
      [{ bezeichnung: 'Mutter' }])
    expect(fehlend.map(e => e.bezeichnung)).toEqual(['Onkel', 'Pflegeeltern'])
  })

  it('ordnet IDs der Quell-DB den IDs der KOOP-DB zu', () => {
    const z = ordneKatalogZu('telefonarten', [{ id: 1, bezeichnung: 'Eltern' }, { id: 2, bezeichnung: 'Oma' }], [{ id: 9, bezeichnung: 'eltern' }])
    expect([...z]).toEqual([[1, 9]])
  })
})

describe('bereiteSchuelerStammdatenVor', () => {
  it('übersetzt Katalog-IDs und setzt Stammschule und Quell-ID', () => {
    const p = bereiteSchuelerStammdatenVor({
      id: 10053, idSchuljahresabschnitt: 1, foto: 'x', nachname: 'Mann', religionID: 1, wohnortID: 757, ortsteilID: 3,
      haltestelleID: 9, idStaatsangehoerigkeit: 68069085, istDuplikat: false, externeSchulNr: null, idSchuelerausweis: '7031855868',
    }, kataloge(), 192806, 10053)
    expect(p).toEqual({
      nachname: 'Mann', religionID: 7, wohnortID: 4711, ortsteilID: null, fahrschuelerArtID: null, haltestelleID: null,
      idStaatsangehoerigkeit: 68069085, externeSchulNr: '192806', idSchuelerausweis: '10053',
    })
  })
})

describe('Erzieher und Telefonnummern', () => {
  it('gruppiert Erzieher derselben Datenbankzeile', () => {
    const g = gruppiereErzieher([{ id: 786912 }, { id: 786911 }, { id: 786921 }])
    expect(g.map(x => x.map(e => e.id))).toEqual([[786911, 786912], [786921]])
  })

  it('übersetzt Erzieherart, Telefonart und Wohnort', () => {
    expect(bereiteErzieherVor({ id: 1, idSchueler: 2, idErzieherArt: 5, wohnortID: 757, ortsteilID: 1, nachname: 'Mann' }, kataloge()))
      .toEqual({ idErzieherArt: 50, wohnortID: 4711, ortsteilID: null, nachname: 'Mann' })
    expect(bereiteTelefonVor({ id: 1, idSchueler: 2, idTelefonArt: 1, telefonnummer: '0123' }, kataloge()))
      .toEqual({ idTelefonArt: 10, telefonnummer: '0123' })
  })
})

describe('Klassen und Lehrkräfte', () => {
  it('legt Schüler der 10 in die Klasse 10', () => {
    expect(koopKlasse('10', '10a')).toBe('10')
    expect(koopKlasse('EF', 'EF')).toBe('EF')
  })

  it('ergänzt das Lehrerkürzel um die Nummer der Quellschule', () => {
    const l = bereiteLehrerVor({ id: 71, kuerzel: 'ABRA', kuerzelStatistik: 'ABRA', nachname: 'Abraham', wohnortID: 757, foto: null, leitungsfunktionen: [] }, 2, kataloge())
    expect(l).toEqual({ kuerzel: 'ABRA-2', nachname: 'Abraham', wohnortID: 4711, ortsteilID: null })
  })

  it('erkennt Platzhalter-Lehrkräfte', () => {
    const katalog = new Set(['EKG'])
    expect(istPlatzhalter({ kuerzel: 'EKG', istRelevantFuerStatistik: false }, katalog)).toBe(true)
    expect(istPlatzhalter({ kuerzel: 'EKG', istRelevantFuerStatistik: true }, katalog)).toBe(false)
    expect(istPlatzhalter({ kuerzel: 'MÜL', istRelevantFuerStatistik: false }, katalog)).toBe(false)
  })
})

describe('Protokoll', () => {
  it('zählt Einträge je Art', () => {
    const p = new Protokoll()
    p.add('neu', 'Schüler', 'a'); p.add('neu', 'Schüler', 'b'); p.add('fehler', 'Schüler', 'c')
    expect(p.anzahl('neu')).toBe(2)
    expect(p.anzahl('fehler')).toBe(1)
  })
})

describe('Fachwahlen', () => {
  it('bestimmt die vergangenen Halbjahre', () => {
    expect(vergangeneHalbjahre('10', 1)).toEqual([])
    expect(vergangeneHalbjahre('EF', 1)).toEqual([])
    expect(vergangeneHalbjahre('EF', 2)).toEqual([0])
    expect(vergangeneHalbjahre('Q1', 1)).toEqual([0, 1])
    expect(vergangeneHalbjahre('Q2', 2)).toEqual([0, 1, 2, 3, 4])
  })

  it('leert vergangene Halbjahre und meldet, wie viele entfernt wurden', () => {
    const r = fachwahlFuerKoop({ halbjahre: ['S', 'S', 'LK', 'LK', 'LK', 'LK'], abiturFach: 1, idReferenzfach: null }, 'Q1', 1)
    expect(r).toEqual({ wahl: { halbjahre: [null, null, 'LK', 'LK', 'LK', 'LK'], abiturFach: 1, idReferenzfach: null }, entfernt: 2 })
  })

  it('liefert null, wenn nach dem Leeren nichts mehr gewählt ist', () => {
    expect(fachwahlFuerKoop({ halbjahre: ['M', 'M', null, null, null, null], abiturFach: null, idReferenzfach: null }, 'Q1', 1)).toBeNull()
  })
})

describe('istUebernahmeSchueler', () => {
  it('übernimmt Jahrgänge 10 bis Q2 mit Status Aufnahme, Aktiv, Beurlaubt', () => {
    expect(istUebernahmeSchueler({ jahrgang: 'Q1', status: 3 })).toBe(true)
    expect(istUebernahmeSchueler({ jahrgang: '09', status: 2 })).toBe(false)
    expect(istUebernahmeSchueler({ jahrgang: 'EF', status: 9 })).toBe(false)
  })
})

describe('fachwahlPruefsumme', () => {
  const d = { kuerzel: 'D', halbjahre: ['S', 'S', 'S', 'S', 'S', 'S'], abiturFach: null }
  const m = { kuerzel: 'M', halbjahre: ['S', 'S', 'LK', 'LK', 'LK', 'LK'], abiturFach: 1 }

  it('hängt nicht von der Reihenfolge der Fächer ab', () => {
    expect(fachwahlPruefsumme([d, m], 2)).toBe(fachwahlPruefsumme([m, d], 2))
    expect(fachwahlPruefsumme([d, m], 2)).toMatch(/^[0-9a-f]{8}$/)
  })

  it('erkennt Änderungen ab dem ersten Halbjahr, nicht davor', () => {
    const basis = fachwahlPruefsumme([d, m], 2)
    expect(fachwahlPruefsumme([d, { ...m, halbjahre: ['M', 'M', 'LK', 'LK', 'LK', 'LK'] }], 2)).toBe(basis)
    expect(fachwahlPruefsumme([d, { ...m, halbjahre: ['S', 'S', 'LK', 'LK', 'LK', 'S'] }], 2)).not.toBe(basis)
    expect(fachwahlPruefsumme([d, { ...m, abiturFach: 2 }], 2)).not.toBe(basis)
  })

  it('lässt Fächer ohne Wahl ab dem ersten Halbjahr weg', () => {
    const nurEF = { kuerzel: 'PH', halbjahre: ['M', 'M', null, null, null, null], abiturFach: null }
    expect(fachwahlPruefsumme([d, nurEF], 2)).toBe(fachwahlPruefsumme([d], 2))
    expect(fachwahlPruefsumme([d, nurEF], 0)).not.toBe(fachwahlPruefsumme([d], 0))
  })

  it('bestimmt das erste Halbjahr und den Schlüssel', () => {
    expect(erstesHalbjahr('Q1', 1)).toBe(2)
    expect(erstesHalbjahr('10', 2)).toBe(0)
    expect(konfigFachwahlen(192806)).toBe('fachwahlen.192806')
  })
})
