import { describe, it, expect } from 'vitest'
import { pruefeKonsistenz, hatFehler, HINWEIS_VEREINHEITLICHEN, type Quelldaten, type GostJahrgangDaten } from './konsistenz'

function gost(jahrgang: string, abiturjahr: number, teil: Partial<GostJahrgangDaten> = {}): GostJahrgangDaten {
  return {
    abiturjahr, jahrgang, hatZusatzkursGE: true, beginnZusatzkursGE: 'Q2.1', hatZusatzkursSW: true, beginnZusatzkursSW: 'Q2.1',
    faecher: [{ kuerzel: 'D', istMoeglichAbiLK: true, istMoeglichAbiGK: true, wochenstundenQualifikationsphase: 3 }],
    ...teil,
  }
}

function schule(nr: number, teil: Partial<Quelldaten> = {}): Quelldaten {
  return {
    nr,
    schulNr: 100000 + nr,
    koopSchulNr: 100000 + nr,
    schulname: `Schule ${nr}`,
    abschnitt: { schuljahr: 2026, abschnitt: 1 },
    jahrgaenge: ['10', 'EF', 'Q1', 'Q2'].map(k => ({ kuerzel: k, idJahrgang: 1, idSchulgliederung: 2, anzahlRestabschnitte: 6, folgejahrgang: null })),
    klassen: { 10: ['10A'], EF: ['EF'], Q1: ['Q1'], Q2: ['Q2'] },
    faecher: [{ kuerzel: 'D', kuerzelStatistik: 'D', bezeichnung: 'Deutsch', istOberstufenFach: true, istFremdsprache: false, aufgabenfeld: '1', bilingualeSprache: null }],
    gostJahrgaenge: [gost('10', 2030), gost('EF', 2029), gost('Q1', 2028), gost('Q2', 2027)],
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
    expect(a[0]).toMatchObject({ merkmal: 'Unterrichtssprache', korrigierbar: false, schwere: 'warnung' })
  })

  it('meldet fehlende Klassen und Fächer, aber keine Erzieherarten', () => {
    const a = pruefeKonsistenz([
      schule(1),
      schule(2, { klassen: { 10: ['10a', '10b'], EF: ['EF', 'EF2'], Q1: ['Q1'], Q2: ['Q2'] }, faecher: [] }),
    ])
    // Klassen der 10 werden nicht verglichen
    expect(a.map(x => x.objekt).sort()).toEqual(['Fach D', 'Klasse EF2 (Jahrgang EF)'])
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
    const a = pruefeKonsistenz([schule(1), schule(2), schule(3, { klassen: { 10: [], EF: [], Q1: ['Q1'], Q2: ['Q2'] } })])
    expect(a).toHaveLength(1)
    expect(a[0].werte).toEqual({ 1: 'ja', 2: 'ja', 3: undefined })
  })
})

describe('Fehler und Warnungen', () => {
  it('meldet Aufgabenfeld und Unterrichtssprache der Fächer nur als Warnung', () => {
    const s2 = schule(2)
    s2.faecher = s2.faecher.map(f => ({ ...f, aufgabenfeld: '3', bilingualeSprache: 'E' }))
    const a = pruefeKonsistenz([schule(1), s2])
    expect(a.map(x => `${x.merkmal}:${x.schwere}`).sort()).toEqual(['Aufgabenfeld:warnung', 'Unterrichtssprache:warnung'])
    expect(a.every(x => x.hinweis)).toBe(true)
    expect(hatFehler(a)).toBe(false)
  })

  it('meldet Bezeichnung und Einstellungen der Fächer der Abiturjahrgänge als Warnung zum Vereinheitlichen', () => {
    const s2 = schule(2)
    s2.faecher = s2.faecher.map(f => ({ ...f, bezeichnung: 'Deutsch (Sek II)' }))
    s2.gostJahrgaenge = s2.gostJahrgaenge.map(g => g.jahrgang === 'EF'
      ? { ...g, faecher: [{ kuerzel: 'D', istMoeglichAbiLK: false, istMoeglichAbiGK: true, wochenstundenQualifikationsphase: 3 }] }
      : g)
    const a = pruefeKonsistenz([schule(1), s2])
    expect(a.map(x => `${x.merkmal}:${x.schwere}`).sort()).toEqual(['Abitur LK möglich:warnung', 'Bezeichnung:warnung'])
    expect(a.every(x => x.hinweis === HINWEIS_VEREINHEITLICHEN)).toBe(true)
    expect(a.find(x => x.merkmal === 'Abitur LK möglich')!.korrigierbar).toBe(true)
  })

  it('meldet andere Abweichungen als Fehler', () => {
    const s2 = schule(2)
    s2.faecher = s2.faecher.map(f => ({ ...f, kuerzelStatistik: 'DX' }))
    const a = pruefeKonsistenz([schule(1), s2])
    expect(a[0].schwere).toBe('fehler')
    expect(hatFehler(a)).toBe(true)
  })
})

describe('Schulkatalog bei Testdaten', () => {
  // Beide Schulen haben 123456 aus dem Anonymisierungstool, in der KOOP-DB 123456 und 123457 (koopSchulnummern)
  const test = (nr: number, katalog: string[]) => schule(nr, {
    schulNr: 123456, koopSchulNr: 123455 + nr, schulkatalog: katalog.map(n => ({ schulnummerStatistik: n, kuerzel: `K${n}` })),
  })

  it('erkennt Partnerschulen an der Schulnummer in der KOOP-DB', () => {
    expect(pruefeKonsistenz([test(1, ['123457']), test(2, ['123456'])]).filter(a => a.bereich === 'schulkatalog')).toEqual([])
  })

  it('meldet einen Katalog, der nur die gemeinsame Testnummer enthält', () => {
    const a = pruefeKonsistenz([test(1, ['123456']), test(2, ['123456'])]).filter(x => x.bereich === 'schulkatalog')
    expect(a.map(x => x.objekt)).toEqual(['Partnerschule 123457 im Katalog von Schule 1'])
  })
})
