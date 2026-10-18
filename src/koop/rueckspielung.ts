// Rückspielung in die Stammschulen (ADR 002, A16–A20; ADR 004). Reine Logik ohne API.

import { zerlegeKoopKuerzel } from './lehrerKuerzel'
import type { Fachwahl } from './uebernahme'

/** Jahrgang (ASD) je GOSt-Halbjahr 0 = EF.1 … 5 = Q2.2 */
export const HALBJAHR_JAHRGANG = ['EF', 'EF', 'Q1', 'Q1', 'Q2', 'Q2'] as const

/** Schuljahr und Abschnitt (1 oder 2), in dem ein Abiturjahrgang ein GOSt-Halbjahr belegt */
export function abschnittZumHalbjahr(abiturjahr: number, halbjahr: number): { schuljahr: number, abschnitt: number } {
  return { schuljahr: abiturjahr - 3 + Math.floor(halbjahr / 2), abschnitt: (halbjahr % 2) + 1 }
}

/** Kürzel der GOSt-Kursarten der Blockung (GostKursart) */
const KURSART_KUERZEL: Record<number, string> = { 1: 'LK', 2: 'GK', 3: 'ZK', 4: 'PJK', 5: 'VTF' }

/** Name eines Blockungskurses wie beim Aktivieren, z. B. D-LK1 (Kürzel des Kurses in der KOOP-DB) */
export function blockungsKursName(fachKuerzel: string, kursart: number, nummer: number, suffix: string): string {
  return `${fachKuerzel}-${KURSART_KUERZEL[kursart] ?? kursart}${nummer}${suffix ?? ''}`
}

// ── Ort eines Kurses (ADR 002, „Kurse an der Partnerschule“; ADR 004, Abschnitt 6) ──

export type Kursort =
  | { art: 'schule', nr: number }
  | { art: 'unklar', grund: string }

/**
 * Bestimmt aus den Kürzeln der Kurslehrkräfte (Haupt- und weitere Lehrkräfte) die Quellschule, an der ein Kurs stattfindet.
 * Unklar ist ein Kurs ohne Lehrkraft, mit einem Kürzel ohne Suffix oder mit Lehrkräften verschiedener Schulen.
 */
export function bestimmeKursort(lehrerKuerzel: string[]): Kursort {
  if (lehrerKuerzel.length === 0) return { art: 'unklar', grund: 'ohne Lehrkraft' }
  const nummern = new Set<number>()
  for (const k of lehrerKuerzel) {
    const teile = zerlegeKoopKuerzel(k)
    if (!teile) return { art: 'unklar', grund: `Lehrkraft ${k} ohne Nummer der Quellschule` }
    nummern.add(teile.nr)
  }
  if (nummern.size > 1) return { art: 'unklar', grund: `Lehrkräfte verschiedener Schulen (${lehrerKuerzel.join(', ')})` }
  return { art: 'schule', nr: [...nummern][0] }
}

/**
 * Lehrkräfte eines Kurses in der Stammschule (ADR 004, Abschnitt 6): findet der Kurs an der eigenen Schule statt, werden die
 * eigenen Lehrkräfte über das Kürzel ohne Suffix zugeordnet. Findet er an einer Partnerschule statt, ist die Hauptlehrkraft
 * deren Platzhalter, weitere Lehrkräfte entfallen.
 */
export function lehrkraefteInSchule(
  koopLehrer: string | null, koopWeitere: string[], ortNr: number, eigeneNr: number,
  schulLehrer: Map<string, number>, platzhalter: Map<number, number>,
): { lehrer: number | null, weitere: number[], fehlend: string[] } {
  if (ortNr !== eigeneNr) return { lehrer: platzhalter.get(ortNr) ?? null, weitere: [], fehlend: [] }
  const fehlend: string[] = []
  const zuordnen = (k: string): number | null => {
    const teile = zerlegeKoopKuerzel(k)
    if (teile?.nr !== eigeneNr) return null
    const id = schulLehrer.get(teile.kuerzel)
    if (id === undefined) fehlend.push(teile.kuerzel)
    return id ?? null
  }
  const lehrer = koopLehrer !== null ? zuordnen(koopLehrer) : null
  const weitere = koopWeitere.map(zuordnen).filter((id): id is number => id !== null && id !== lehrer)
  return { lehrer, weitere, fehlend }
}

// ── Fachwahlen (ADR 004, Abschnitt 9) ────────────────────────────────────────

/**
 * Fachwahl, die in die Stammschule geschrieben wird: Halbjahre vor `ab` bleiben wie in der Schule, ab `ab` gilt die
 * KOOP-DB, das Abiturfach kommt aus der KOOP-DB. null, wenn sich nichts ändert.
 * Ein Fach, das in der KOOP-DB nicht mehr gewählt ist, wird ab `ab` geleert.
 */
export function mischeFachwahl(schule: Fachwahl | null, koop: Fachwahl | null, ab: number): { halbjahre: (string | null)[], abiturFach: number | null } | null {
  const alt = schule?.halbjahre ?? [null, null, null, null, null, null]
  const halbjahre = alt.map((h, i) => (i < ab ? h : (koop?.halbjahre[i] ?? null)))
  const abiturFach = koop?.abiturFach ?? null
  const gleich = halbjahre.every((h, i) => h === (alt[i] ?? null)) && abiturFach === (schule?.abiturFach ?? null)
  return gleich ? null : { halbjahre, abiturFach }
}

// ── Noten, Stand, Vermerke ───────────────────────────────────────────────────

/** Ist eine Note eingetragen? Leer und Attest zählen nicht (wie DBUtilsGost.pruefeHatNotenFuerOberstufeInAbschnitt) */
export function hatNote(note: string | null | undefined): boolean {
  return !!note && note !== 'AT'
}

/** Was SVWS-KOOP bei einer Rückspielung in der Stammschule angelegt hat (ADR 004, Abschnitt 5) */
export interface Vermerk {
  zeitpunkt: string
  stand: string | null
  kurse: number[]
  leistungsdaten: number[]
  blockung: number | null
}

export function konfigVermerk(abiturjahr: number, halbjahr: number): string {
  return `rueckspielung.${abiturjahr}.${halbjahr}`
}

/** Letzte Rückspielung in der Stammschule (ADR 002, „Änderungen außerhalb der KOOP-DB“) */
export interface LetzteRueckspielung {
  zeitpunkt: string
  stand: string | null
  koopSchema: string
  bereiche: string[]
}

export const KONFIG_LETZTE_RUECKSPIELUNG = 'letzteRueckspielung'

/**
 * Prüfung „zu altes Backup“: Der Stand des eingespielten KOOP-Backups muss neuer sein als der Stand der letzten Rückspielung.
 * `ohneStand`, wenn die KOOP-DB nicht über „Verteilen“ erstellt wurde.
 */
export function pruefeStand(koopStand: string | null, letzte: LetzteRueckspielung | null): 'ok' | 'ohneStand' | 'veraltet' {
  if (!koopStand) return 'ohneStand'
  if (letzte?.stand && koopStand <= letzte.stand) return 'veraltet'
  return 'ok'
}
