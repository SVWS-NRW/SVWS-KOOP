import { describe, it, expect } from 'vitest'
import { statusText, vergleicheLehrkraefte, vergleicheSchueler, zuordnungenVon, type KoopSchueler, type QuellSchueler } from './nachladen'

function quelle(id: number, jahrgang: string, status = 2): QuellSchueler {
  return { id, nachname: `N${id}`, vorname: 'V', jahrgang, status }
}

function koop(id: number, schulNr: string | null, quellId: string | null, jahrgang = 'Q1'): KoopSchueler {
  return { id, nachname: `K${id}`, vorname: 'V', jahrgang, externeSchulNr: schulNr, idSchuelerausweis: quellId }
}

describe('vergleicheSchueler', () => {
  it('findet neue Schüler der betroffenen Jahrgänge mit passendem Status', () => {
    const { neu } = vergleicheSchueler(192806, [
      quelle(1, 'Q1'), quelle(2, '10', 0), quelle(3, '09'), quelle(4, 'EF', 8), quelle(5, 'Q2', 3), quelle(6, 'Q1'),
    ], [koop(100, '192806', '6')])
    expect(neu.map(s => s.id)).toEqual([1, 2, 5])
  })

  it('ordnet nur Schüler derselben Stammschule zu', () => {
    // Gleiche Quell-ID an einer anderen Schule zählt nicht als vorhanden
    const { neu } = vergleicheSchueler(192806, [quelle(6, 'Q1')], [koop(100, '168890', '6')])
    expect(neu.map(s => s.id)).toEqual([6])
  })

  it('meldet abgegangene Schüler mit Grund', () => {
    const { abgegangen } = vergleicheSchueler(192806, [quelle(1, 'Q1', 9), quelle(2, '09'), quelle(3, 'Q2')], [
      koop(101, '192806', '1'), koop(102, '192806', '2'), koop(103, '192806', '3'), koop(104, '192806', '4'),
      koop(105, '168890', '99'), koop(106, null, null),
    ])
    expect(abgegangen.map(a => [a.koop.id, a.grund])).toEqual([
      [101, 'Status Abgang'],
      [102, 'jetzt Jahrgang 09'],
      [104, 'nicht mehr in der Quell-DB'],
    ])
  })

  it('benennt Status aus dem Statistikkatalog', () => {
    expect(statusText(8)).toBe('Abschluss')
    expect(statusText(42)).toBe('Status 42')
  })
})

describe('vergleicheLehrkraefte', () => {
  const l = (id: number, kuerzel: string, istSichtbar = true) => ({ id, kuerzel, nachname: kuerzel, vorname: 'V', istSichtbar })
  const k = (id: number, kuerzel: string, istSichtbar = true) => ({ id, kuerzel, nachname: kuerzel, vorname: 'V', istSichtbar })

  it('findet neue aktive Lehrkräfte über das Kürzel mit Suffix', () => {
    const { neu } = vergleicheLehrkraefte(1, [l(1, 'MÜL'), l(2, 'TEST'), l(3, 'ALT', false)], [k(10, 'MÜL-1'), k(11, 'TEST-2')])
    expect(neu.map(x => x.kuerzel)).toEqual(['TEST'])
  })

  it('meldet Lehrkräfte dieser Schule, die fehlen oder nicht mehr aktiv sind', () => {
    const { abgegangen } = vergleicheLehrkraefte(1, [l(1, 'MÜL'), l(3, 'ALT', false)], [
      k(10, 'MÜL-1'), k(11, 'ALT-1'), k(12, 'WEG-1'), k(13, 'WEG-2'), k(14, 'OHNE'), k(15, 'ENTFERNT-1', false),
    ])
    expect(abgegangen.map(a => [a.koop.kuerzel, a.grund])).toEqual([
      ['ALT-1', 'in der Quell-DB nicht mehr aktiv'],
      ['WEG-1', 'nicht mehr in der Quell-DB'],
    ])
  })
})

describe('zuordnungenVon', () => {
  it('liefert die Kurszuordnungen der Schüler, Kurse über mehrere Schienen nur einmal', () => {
    const ergebnis = { schienen: [
      { kurse: [{ id: 1, schueler: [10, 11] }, { id: 2, schueler: [12] }] },
      { kurse: [{ id: 1, schueler: [10, 11] }, { id: 3, schueler: [10] }] },
    ] }
    expect(zuordnungenVon(ergebnis, new Set([10, 12]))).toEqual([
      { idKurs: 1, idSchueler: 10 }, { idKurs: 2, idSchueler: 12 }, { idKurs: 3, idSchueler: 10 },
    ])
  })
})
