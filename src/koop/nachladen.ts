// Nachladen (ADR 002, A21): Abgleich einer Quell-DB mit der KOOP-DB. Reine Logik ohne API.

import { bildeKoopKuerzel, zerlegeKoopKuerzel } from './lehrerKuerzel'
import { UEBERNAHME_STATUS, istUebernahmeSchueler } from './uebernahme'

/** Bezeichnungen aus dem Statistikkatalog SchuelerStatus */
const STATUS_TEXT: Record<number, string> = {
  0: 'Aufnahme', 1: 'Warteliste', 2: 'Aktiv', 3: 'Beurlaubt', 6: 'Extern', 8: 'Abschluss', 9: 'Abgang', 10: 'Ehemalige',
}

export function statusText(status: number): string {
  return STATUS_TEXT[status] ?? `Status ${status}`
}

/** Schüler einer Quell-DB im aktuellen Abschnitt (aus /schueler/abschnitt/{id}) */
export interface QuellSchueler {
  id: number
  nachname: string
  vorname: string
  jahrgang: string
  status: number
}

/** Schüler der KOOP-DB mit Merkmal Stammschule (ADR 002, „Merkmal Stammschule“) */
export interface KoopSchueler {
  id: number
  nachname: string
  vorname: string
  jahrgang: string
  externeSchulNr: string | null
  /** ID in der Quell-DB, vorerst in der Schülerausweisnummer */
  idSchuelerausweis: string | null
}

export interface AbgegangenerSchueler {
  koop: KoopSchueler
  grund: string
}

function abgangsGrund(quelle: QuellSchueler | undefined): string {
  if (!quelle) return 'nicht mehr in der Quell-DB'
  if (!UEBERNAHME_STATUS.has(quelle.status)) return `Status ${statusText(quelle.status)}`
  return `jetzt Jahrgang ${quelle.jahrgang}`
}

/**
 * Vergleicht die Schüler einer Quell-DB mit der KOOP-DB.
 * - neu: in der Quell-DB zu übernehmen, aber noch nicht in der KOOP-DB
 * - abgegangen: in der KOOP-DB, aber in der Quell-DB nicht mehr zu übernehmen (fehlt, anderer Jahrgang oder Status)
 * @param koopSchulNr  Schulnummer der Quellschule in der KOOP-DB (externeSchulNr)
 */
export function vergleicheSchueler(
  koopSchulNr: number, quelle: QuellSchueler[], koop: KoopSchueler[],
): { neu: QuellSchueler[], abgegangen: AbgegangenerSchueler[] } {
  const eigene = koop.filter(s => s.externeSchulNr === String(koopSchulNr) && s.idSchuelerausweis)
  const inKoop = new Set(eigene.map(s => s.idSchuelerausweis))
  const quellNachId = new Map(quelle.map(s => [String(s.id), s]))
  const neu = quelle.filter(s => istUebernahmeSchueler(s) && !inKoop.has(String(s.id)))
  const abgegangen = eigene
    .filter(s => {
      const q = quellNachId.get(s.idSchuelerausweis!)
      return !q || !istUebernahmeSchueler(q)
    })
    .map(s => ({ koop: s, grund: abgangsGrund(quellNachId.get(s.idSchuelerausweis!)) }))
  return { neu, abgegangen }
}

/** Lehrkraft einer Quell-DB (aus /lehrer/), ohne Platzhalter */
export interface QuellLehrer {
  id: number
  kuerzel: string
  nachname: string
  vorname: string
  istSichtbar: boolean
}

export interface KoopLehrer {
  id: number
  kuerzel: string
  nachname: string
  vorname: string
  istSichtbar: boolean
}

export interface AbgegangeneLehrkraft {
  koop: KoopLehrer
  grund: string
}

/**
 * Vergleicht die Lehrkräfte einer Quell-DB mit der KOOP-DB über das Kürzel <Kürzel>-<Nr> (ADR 002, A10).
 * - neu: aktive Lehrkraft der Quell-DB, deren Kürzel in der KOOP-DB fehlt
 * - abgegangen: aktive Lehrkraft der KOOP-DB mit Suffix dieser Schule, die in der Quell-DB fehlt oder nicht mehr aktiv ist.
 *   Bereits entfernte (unsichtbare) Lehrkräfte der KOOP-DB werden nicht erneut gemeldet.
 */
export function vergleicheLehrkraefte(
  nr: number, quelle: QuellLehrer[], koop: KoopLehrer[],
): { neu: QuellLehrer[], abgegangen: AbgegangeneLehrkraft[] } {
  const koopKuerzel = new Set(koop.map(l => l.kuerzel))
  const quellNachKuerzel = new Map(quelle.map(l => [l.kuerzel.trim(), l]))
  const neu = quelle.filter(l => l.istSichtbar && !koopKuerzel.has(bildeKoopKuerzel(l.kuerzel, nr)))
  const abgegangen: AbgegangeneLehrkraft[] = []
  for (const l of koop) {
    const teile = zerlegeKoopKuerzel(l.kuerzel)
    if (teile?.nr !== nr || !l.istSichtbar) continue
    const q = quellNachKuerzel.get(teile.kuerzel)
    if (!q) abgegangen.push({ koop: l, grund: 'nicht mehr in der Quell-DB' })
    else if (!q.istSichtbar) abgegangen.push({ koop: l, grund: 'in der Quell-DB nicht mehr aktiv' })
  }
  return { neu, abgegangen }
}

// ── Entfernen (ADR 002, A21) ─────────────────────────────────────────────────

/** Blockungsergebnis aus /gost/blockungen/zwischenergebnisse/{id}, nur die benötigten Felder */
export interface Blockungsergebnis {
  schienen: { kurse: { id: number, schueler: number[] }[] }[]
}

export interface KursSchuelerZuordnung {
  idKurs: number
  idSchueler: number
}

/** Kurs-Schüler-Zuordnungen eines Blockungsergebnisses für die angegebenen Schüler, jede nur einmal */
export function zuordnungenVon(ergebnis: Blockungsergebnis, schuelerIds: Set<number>): KursSchuelerZuordnung[] {
  const gefunden = new Map<string, KursSchuelerZuordnung>()
  // Ein Kurs über mehrere Schienen erscheint in jeder dieser Schienen
  for (const schiene of ergebnis.schienen) {
    for (const kurs of schiene.kurse) {
      for (const idSchueler of kurs.schueler) {
        if (schuelerIds.has(idSchueler)) gefunden.set(`${kurs.id}|${idSchueler}`, { idKurs: kurs.id, idSchueler })
      }
    }
  }
  return [...gefunden.values()]
}
