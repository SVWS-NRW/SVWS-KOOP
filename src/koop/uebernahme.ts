// Übernahme von Lehrkräften und Schülern in die KOOP-DB (ADR 002, A9–A13). Reine Logik ohne API.

import { bildeKoopKuerzel, zerlegeKoopKuerzel } from './lehrerKuerzel'
import { BETROFFENE_JAHRGAENGE, KOOP_KLASSE_10 } from './konsistenz'

/** Schülerstatus, die übernommen werden: Aufnahme, Aktiv, Beurlaubt (Statistikkatalog SchuelerStatus) */
export const UEBERNAHME_STATUS = new Set([0, 2, 3])

/** Schüler, die übernommen werden: Jahrgänge 10, EF, Q1, Q2 mit Status Aufnahme, Aktiv, Beurlaubt (ADR 002, A2) */
export function istUebernahmeSchueler(s: { jahrgang: string, status: number }): boolean {
  return (BETROFFENE_JAHRGAENGE as readonly string[]).includes(s.jahrgang) && UEBERNAHME_STATUS.has(s.status)
}

/** Zuordnung einer ID der Quell-DB zu einer ID der KOOP-DB */
export type Zuordnung = Map<number, number>

/**
 * Kataloge, die die KOOP-DB als Vereinigung der Quell-DBs erhält (ADR 002, A9). Die Zuordnung erfolgt über einen
 * fachlichen Schlüssel, weil die IDs in jeder Datenbank anders sind.
 */
export type KatalogName = 'erzieherarten' | 'telefonarten' | 'religionen' | 'orte' | 'fahrschuelerarten' | 'haltestellen'

export type KatalogZuordnungen = Record<KatalogName, Zuordnung>

/** Schlüssel, über den Einträge eines Katalogs zwischen Datenbanken zugeordnet werden */
export function katalogSchluessel(katalog: KatalogName, e: Record<string, unknown>): string {
  const norm = (v: unknown) => String(v ?? '').trim().toLowerCase()
  switch (katalog) {
    case 'orte': return `${norm(e.plz)}|${norm(e.ortsname)}`
    // Religionen tragen einen Statistik-Schlüssel, die Bezeichnung kann je Schule abweichen
    case 'religionen': return e.idReligion != null ? `stat:${e.idReligion}` : `bez:${norm(e.bezeichnung)}`
    default: return norm(e.bezeichnung)
  }
}

/** Einträge der Quell-Kataloge, die in der KOOP-DB fehlen, jeder Schlüssel nur einmal */
export function fehlendeKatalogEintraege<T extends Record<string, unknown>>(katalog: KatalogName, quellen: T[][], koop: T[]): T[] {
  const vorhanden = new Set(koop.map(e => katalogSchluessel(katalog, e)))
  const fehlend = new Map<string, T>()
  for (const e of quellen.flat()) {
    const key = katalogSchluessel(katalog, e)
    if (!vorhanden.has(key) && !fehlend.has(key)) fehlend.set(key, e)
  }
  return [...fehlend.values()]
}

/** Ordnet die IDs eines Quell-Katalogs den IDs der KOOP-DB zu. Nicht zuordenbare Einträge fehlen in der Zuordnung. */
export function ordneKatalogZu<T extends Record<string, unknown> & { id: number }>(katalog: KatalogName, quelle: T[], koop: T[]): Zuordnung {
  const koopIds = new Map(koop.map(e => [katalogSchluessel(katalog, e), e.id]))
  const zuordnung: Zuordnung = new Map()
  for (const e of quelle) {
    const id = koopIds.get(katalogSchluessel(katalog, e))
    if (id !== undefined) zuordnung.set(e.id, id)
  }
  return zuordnung
}

function ordne(zuordnung: Zuordnung, id: unknown): number | null {
  return typeof id === 'number' ? (zuordnung.get(id) ?? null) : null
}

/** Felder der Schülerstammdaten, die nicht übernommen werden (vom Server vergeben oder nicht patchbar) */
const SCHUELER_NICHT_UEBERNEHMEN = new Set(['id', 'idSchuljahresabschnitt', 'foto', 'istDuplikat', 'hatLoeschvermerk'])

/**
 * Bereitet die Schülerstammdaten der Quell-DB für den PATCH in der KOOP-DB vor: Katalog-IDs werden übersetzt,
 * Stammschule (`externeSchulNr`) und ID in der Quell-DB (vorerst `idSchuelerausweis`, ADR 002) werden gesetzt.
 * Nicht zuordenbare Katalog-IDs werden leer, ortsteilID immer (Ortsteile werden nicht übernommen).
 */
export function bereiteSchuelerStammdatenVor(
  daten: Record<string, unknown>, kataloge: KatalogZuordnungen, koopSchulNr: number, quellId: number,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(daten)) if (!SCHUELER_NICHT_UEBERNEHMEN.has(k)) patch[k] = v
  patch.religionID = ordne(kataloge.religionen, daten.religionID)
  patch.wohnortID = ordne(kataloge.orte, daten.wohnortID)
  patch.ortsteilID = null
  patch.fahrschuelerArtID = ordne(kataloge.fahrschuelerarten, daten.fahrschuelerArtID)
  patch.haltestelleID = ordne(kataloge.haltestellen, daten.haltestelleID)
  patch.externeSchulNr = String(koopSchulNr)
  patch.idSchuelerausweis = String(quellId)
  return patch
}

/** Felder eines Erziehers für das Anlegen in der KOOP-DB */
export function bereiteErzieherVor(e: Record<string, unknown>, kataloge: KatalogZuordnungen): Record<string, unknown> {
  const { id: _id, idSchueler: _s, ...rest } = e
  return { ...rest, idErzieherArt: ordne(kataloge.erzieherarten, e.idErzieherArt), wohnortID: ordne(kataloge.orte, e.wohnortID), ortsteilID: null }
}

/** Felder einer Telefonnummer für das Anlegen in der KOOP-DB */
export function bereiteTelefonVor(t: Record<string, unknown>, kataloge: KatalogZuordnungen): Record<string, unknown> {
  const { id: _id, idSchueler: _s, ...rest } = t
  return { ...rest, idTelefonArt: ordne(kataloge.telefonarten, t.idTelefonArt) }
}

/**
 * Erzieher in der API: ID = ID der Datenbankzeile × 10 + Position (1 oder 2). Zwei Erzieher derselben Zeile teilen
 * sich eine Adresse und müssen in der KOOP-DB wieder gemeinsam angelegt werden (ADR 003).
 */
export function gruppiereErzieher<T extends { id: number }>(erzieher: T[]): T[][] {
  const gruppen = new Map<number, T[]>()
  for (const e of erzieher) {
    const zeile = Math.floor(e.id / 10)
    gruppen.set(zeile, [...(gruppen.get(zeile) ?? []), e])
  }
  return [...gruppen.values()].map(g => g.sort((a, b) => (a.id % 10) - (b.id % 10)))
}

/** Klasse in der KOOP-DB: Schüler der 10 kommen in die Klasse 10, sonst gleicher Name (ADR 002, Klassen) */
export function koopKlasse(jahrgang: string, quellKlasse: string): string {
  return jahrgang === '10' ? KOOP_KLASSE_10 : quellKlasse
}

/** Felder der Lehrer-Individualdaten, die nicht übernommen werden */
const LEHRER_NICHT_UEBERNEHMEN = new Set(['id', 'foto', 'leitungsfunktionen', 'kuerzelStatistik'])

/** Individualdaten einer Lehrkraft für die KOOP-DB, Kürzel mit Nummer der Quellschule (ADR 002, A10) */
export function bereiteLehrerVor(daten: Record<string, unknown>, nr: number, kataloge: KatalogZuordnungen): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(daten)) if (!LEHRER_NICHT_UEBERNEHMEN.has(k)) body[k] = v
  body.kuerzel = bildeKoopKuerzel(String(daten.kuerzel), nr)
  body.wohnortID = ordne(kataloge.orte, daten.wohnortID)
  body.ortsteilID = null
  return body
}

/**
 * Platzhalter-Lehrkräfte aus früheren Rückspielungen werden nicht übernommen (ADR 002, A10): Ihr Kürzel ist ein Kürzel
 * aus dem Schulkatalog der Quell-DB und sie sind nicht statistikrelevant.
 */
export function istPlatzhalter(lehrer: { kuerzel: string, istRelevantFuerStatistik: boolean }, katalogKuerzel: Set<string>): boolean {
  return !lehrer.istRelevantFuerStatistik && katalogKuerzel.has(lehrer.kuerzel)
}

/** Kürzel der Quellschule einer Lehrkraft der KOOP-DB, oder null bei Kürzeln ohne Suffix */
export function quellNrAusKuerzel(koopKuerzel: string): number | null {
  return zerlegeKoopKuerzel(koopKuerzel)?.nr ?? null
}

// ── Protokoll (A13) ──────────────────────────────────────────────────────────

export type ProtokollArt = 'neu' | 'aktualisiert' | 'entfernt' | 'uebersprungen' | 'hinweis' | 'fehler'

export interface ProtokollEintrag {
  art: ProtokollArt
  bereich: string
  text: string
}

export class Protokoll {
  readonly eintraege: ProtokollEintrag[] = []

  add(art: ProtokollArt, bereich: string, text: string): void {
    this.eintraege.push({ art, bereich, text })
  }

  anzahl(art: ProtokollArt): number {
    return this.eintraege.filter(e => e.art === art).length
  }
}

// ── Fachwahlen (ADR 003) ─────────────────────────────────────────────────────

const ERSTES_HALBJAHR: Record<string, number> = { EF: 0, Q1: 2, Q2: 4 }

/**
 * Indizes der Halbjahre (0 = EF.1 … 5 = Q2.2), die für einen Schüler bereits vergangen sind. Für vergangene Halbjahre
 * verlangt der SVWS-Server einen gewerteten Lernabschnitt (GostFachwahlService), den Schüler in der KOOP-DB nicht haben,
 * weil dort nur der aktuelle Lernabschnitt angelegt wird. Für die 10 ist kein Halbjahr vergangen.
 */
export function vergangeneHalbjahre(jahrgang: string, abschnitt: number): number[] {
  const erstes = ERSTES_HALBJAHR[jahrgang]
  if (erstes === undefined) return []
  const aktuell = erstes + (abschnitt - 1)
  return Array.from({ length: aktuell }, (_, i) => i)
}

export interface Fachwahl {
  halbjahre: (string | null)[]
  abiturFach: number | null
  idReferenzfach: number | null
}

/** Fachwahl für die KOOP-DB: vergangene Halbjahre leer. null, wenn danach nichts mehr gewählt ist. */
export function fachwahlFuerKoop(wahl: Fachwahl, jahrgang: string, abschnitt: number): { wahl: Fachwahl, entfernt: number } | null {
  const vergangen = new Set(vergangeneHalbjahre(jahrgang, abschnitt))
  let entfernt = 0
  const halbjahre = wahl.halbjahre.map((h, i) => {
    if (vergangen.has(i) && h !== null) { entfernt++; return null }
    return h
  })
  if (halbjahre.every(h => h === null) && wahl.abiturFach === null) return null
  return { wahl: { ...wahl, halbjahre }, entfernt }
}
