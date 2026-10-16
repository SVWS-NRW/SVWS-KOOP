import { describe, it, expect } from 'vitest'
import { pruefeKonsistenz, fachkombinationSchluessel, type Quelldaten, type GostJahrgangDaten } from './konsistenz'

function gost(jahrgang: string, abiturjahr: number, teil: Partial<GostJahrgangDaten> = {}): GostJahrgangDaten {
  return {
    abiturjahr, jahrgang, hatZusatzkursGE: true, beginnZusatzkursGE: 'Q2.1', hatZusatzkursSW: true, beginnZusatzkursSW: 'Q2.1',
    faecher: [{ kuerzel: 'D', istMoeglichAbiLK: true, istMoeglichAbiGK: true, wochenstundenQualifikationsphase: 3 }],
    fachkombinationen: [],
    ...teil,
  }
}

function schule(nr: number, teil: Partial<Quelldaten> = {}): Quelldaten {
  return {
    nr,
    schulNr: 100000 + nr,
    schulname: `Schule ${nr}`,
    abschnitt: { schuljahr: 2026, abschnitt: 1 },
    jahrgaenge: ['10', 'EF', 'Q1', 'Q2'].map(k => ({ kuerzel: k, idJahrgang: 1, idSchulgliederung: 2, anzahlRestabschnitte: 6, folgejahrgang: null })),
    klassen: { 10: ['10A'], EF: ['EF'], Q1: ['Q1'], Q2: ['Q2'] },
    faecher: [{ kuerzel: 'D', kuerzelStatistik: 'D', bezeichnung: 'Deutsch', istOberstufenFach: true, istFremdsprache: false, aufgabenfeld: '1', bilingualeSprache: null }],
    gostJahrgaenge: [gost('10', 2030), gost('EF', 2029), gost('Q1', 2028), gost('Q2', 2027)],
    erzieherarten: ['Mutter', 'Vater'],
    schulkatalog: [1, 2, 3].filter(p => p !== nr).map(p => ({ schulnummerStatistik: String(100000 + p), kuerzel: String(p) })),
    lehrerKuerzel: ['MÜL'],
    ...teil,
  }
}

describe('pruefeKonsistenz', () => {
  it('meldet nichts bei gleichen Schulen', () => {
    expect(pruefeKonsistenz([schule(1), schule(2)])).toEqual([])
  })

  it('meldet abweichenden Schuljahresabschnitt', () => {
    const a = pruefeKonsistenz([schule(1), schule(2, { abschnitt: { schuljahr: 2026, abschnitt: 2 } })])
    expect(a).toHaveLength(1)
    expect(a[0].bereich).toBe('abschnitt')
  })

  it('vergleicht bei Jahrgängen nur, ob sie vorhanden sind', () => {
    const s2 = schule(2)
    // Schulgliederung und Statistik-Jahrgang dürfen sich je nach Schulform unterscheiden
    s2.jahrgaenge = s2.jahrgaenge.filter(j => j.kuerzel !== '10').map(j => ({ ...j, idSchulgliederung: 9, idJahrgang: 7, anzahlRestabschnitte: 2 }))
    const a = pruefeKonsistenz([schule(1), s2])
    expect(a).toHaveLength(1)
    expect(a[0]).toMatchObject({ bereich: 'jahrgaenge', objekt: 'Jahrgang 10', merkmal: 'vorhanden', korrigierbar: false })
  })

  it('kennzeichnet die Unterrichtssprache der Oberstufenfächer als nicht korrigierbar', () => {
    const s2 = schule(2)
    s2.gostJahrgaenge = s2.gostJahrgaenge.map(g => g.jahrgang === 'EF'
      ? { ...g, faecher: [{ kuerzel: 'D', istMoeglichAbiLK: true, istMoeglichAbiGK: true, wochenstundenQualifikationsphase: 3, biliSprache: 'E' }] }
      : g)
    const a = pruefeKonsistenz([schule(1), s2])
    expect(a).toHaveLength(1)
    expect(a[0]).toMatchObject({ merkmal: 'Unterrichtssprache', korrigierbar: false })
  })

  it('meldet fehlende Klassen, Fächer und Erzieherarten', () => {
    const a = pruefeKonsistenz([
      schule(1),
      schule(2, { klassen: { 10: ['10A', '10B'], EF: ['EF'], Q1: ['Q1'], Q2: ['Q2'] }, faecher: [], erzieherarten: ['Mutter'] }),
    ])
    expect(a.map(x => x.objekt).sort()).toEqual(['Erzieherart „Vater“', 'Fach D', 'Klasse 10B (Jahrgang 10)'])
    expect(a.every(x => x.merkmal === 'vorhanden' && !x.korrigierbar)).toBe(true)
  })

  it('meldet fehlende Abiturjahrgänge nur einmal', () => {
    const a = pruefeKonsistenz([schule(1), schule(2, { gostJahrgaenge: [gost('EF', 2029), gost('Q1', 2028), gost('Q2', 2027)] })])
    expect(a).toHaveLength(1)
    expect(a[0]).toMatchObject({ bereich: 'abiturjahrgaenge', objekt: 'Abiturjahrgang (10)' })
  })

  it('meldet abweichende Fächer und Einstellungen eines Abiturjahrgangs', () => {
    const s2 = schule(2)
    s2.gostJahrgaenge = s2.gostJahrgaenge.map(g => g.jahrgang === 'EF'
      ? { ...g, hatZusatzkursSW: false, faecher: [{ kuerzel: 'D', istMoeglichAbiLK: false, istMoeglichAbiGK: true, wochenstundenQualifikationsphase: 3 }] }
      : g)
    const a = pruefeKonsistenz([schule(1), s2])
    expect(a.map(x => `${x.bereich}: ${x.objekt} / ${x.merkmal}`).sort()).toEqual([
      'gostFaecher: Fach D (EF) / Abitur LK möglich',
      'gostJahrgang: Abiturjahrgang (EF) / Zusatzkurs SW',
    ])
    expect(a.find(x => x.bereich === 'gostFaecher')!.korrektur).toEqual({ art: 'gostFach', jahrgang: 'EF', fachKuerzel: 'D', feld: 'istMoeglichAbiLK' })
  })

  it('meldet fehlende Partnerschulen im Schulkatalog und zu lange Lehrerkürzel', () => {
    const a = pruefeKonsistenz([
      schule(1, { schulkatalog: [{ schulnummerStatistik: '100002', kuerzel: null }], lehrerKuerzel: ['ABCDEFGHI'] }),
      schule(2, { schulkatalog: [] }),
    ])
    expect(a.map(x => `${x.bereich}: ${x.merkmal}`).sort()).toEqual([
      'lehrerkuerzel: länger als 8 Zeichen',
      'schulkatalog: Kürzel',
      'schulkatalog: vorhanden',
    ])
  })

  it('vergleicht drei Schulen', () => {
    const a = pruefeKonsistenz([schule(1), schule(2), schule(3, { erzieherarten: ['Mutter'] })])
    expect(a).toHaveLength(1)
    expect(a[0].werte).toEqual({ 1: 'ja', 2: 'ja', 3: undefined })
  })
})

describe('fachkombinationSchluessel', () => {
  it('ist unabhängig von IDs lesbar', () => {
    expect(fachkombinationSchluessel('PH', 'LK', 'M', 'LK', 1, [false, false, true, true, true, true]))
      .toBe('PH LK erfordert M LK (Q1.1,Q1.2,Q2.1,Q2.2)')
    expect(fachkombinationSchluessel('E5', null, 'E', null, 0, [true, true, false, false, false, false]))
      .toBe('E5 verbietet E (EF.1,EF.2)')
  })
})
