// Konsistenzprüfung der Quell-DBs (ADR 002, A7/A8). Reine Vergleichslogik ohne API.
// Verglichen werden die Schulen untereinander. Was als Abweichung gilt, folgt aus ADR 002, nicht aus Testdaten.

import { MAX_QUELL_KUERZEL_LAENGE } from './lehrerKuerzel'

/** Jahrgänge, deren Schüler übernommen werden (ADR 002, A2) */
export const BETROFFENE_JAHRGAENGE = ['10', 'EF', 'Q1', 'Q2'] as const

/**
 * Jahrgänge, deren Klassennamen in allen Schulen gleich sein müssen. Die 10 wird für die Planung der kommenden EF
 * wie eine Jahrgangsstufe behandelt, ihre Klassennamen spielen keine Rolle (ADR 002, Klassen).
 */
export const KLASSEN_VERGLEICH = ['EF', 'Q1', 'Q2'] as const

/** Klasse, in die alle Schüler der Jahrgangsstufe 10 in der KOOP-DB kommen */
export const KOOP_KLASSE_10 = '10'

export type Bereich =
  | 'abschnitt' | 'jahrgaenge' | 'klassen' | 'faecher' | 'abiturjahrgaenge' | 'gostJahrgang'
  | 'gostFaecher' | 'schulkatalog' | 'lehrerkuerzel'

export const BEREICH_TITEL: Record<Bereich, string> = {
  abschnitt: 'Schuljahresabschnitt',
  jahrgaenge: 'Jahrgänge',
  klassen: 'Klassen',
  faecher: 'Fächer',
  abiturjahrgaenge: 'Abiturjahrgänge',
  gostJahrgang: 'Einstellungen der Abiturjahrgänge',
  gostFaecher: 'Fächer der Abiturjahrgänge',
  schulkatalog: 'Schulkatalog',
  lehrerkuerzel: 'Lehrerkürzel',
}

export type Wert = string | number | boolean | null

/** Fehler verhindern die Übernahme, Warnungen nicht */
export type Schwere = 'fehler' | 'warnung'

export interface Abweichung {
  bereich: Bereich
  /** Was abweicht, z. B. „Fach D“ oder „Jahrgang EF“ */
  objekt: string
  /** Welches Merkmal, z. B. „Abitur LK möglich“ */
  merkmal: string
  /** Wert je Nummer der Quellschule, undefined = Objekt fehlt in dieser Schule */
  werte: Record<number, Wert | undefined>
  schwere: Schwere
  /** Hinweis, was zu tun ist (bei Warnungen) */
  hinweis?: string
  /** SVWS-KOOP kann den Wert einer anderen Schule übernehmen (A8) */
  korrigierbar: boolean
  /** Technischer Bezug für die Korrektur */
  korrektur?: KorrekturBezug
}

export type KorrekturBezug =
  | { art: 'gostJahrgang', jahrgang: string, feld: string }
  | { art: 'gostFach', jahrgang: string, fachKuerzel: string, feld: string }

// ── Eingangsdaten je Quellschule ─────────────────────────────────────────────

export interface JahrgangDaten {
  kuerzel: string
  idJahrgang: number | null
  idSchulgliederung: number | null
  anzahlRestabschnitte: number | null
  folgejahrgang: string | null
}

export interface FachDaten {
  kuerzel: string
  kuerzelStatistik: string
  bezeichnung: string
  istOberstufenFach: boolean
  istFremdsprache: boolean
  aufgabenfeld: string | null
  bilingualeSprache: string | null
}

export interface GostFachDaten {
  kuerzel: string
  [merkmal: string]: Wert
}

export interface GostJahrgangDaten {
  abiturjahr: number
  jahrgang: string
  hatZusatzkursGE: boolean
  beginnZusatzkursGE: string | null
  hatZusatzkursSW: boolean
  beginnZusatzkursSW: string | null
  faecher: GostFachDaten[]
}

export interface Quelldaten {
  nr: number
  schulNr: number
  /**
   * Schulnummer der Schule in der KOOP-DB. Gleich schulNr, bei Testdaten (123456) eine Ersatznummer. Unter dieser Nummer
   * muss die Schule im Schulkatalog ihrer Partnerschulen stehen (ADR 003, „Testdaten“).
   */
  koopSchulNr: number
  schulname: string
  abschnitt: { schuljahr: number, abschnitt: number }
  jahrgaenge: JahrgangDaten[]
  /** Klassenkürzel je Jahrgangskürzel (nur betroffene Jahrgänge) */
  klassen: Record<string, string[]>
  faecher: FachDaten[]
  gostJahrgaenge: GostJahrgangDaten[]
  schulkatalog: { schulnummerStatistik: string | null, kuerzel: string | null }[]
  /** Kürzel der aktiven Lehrkräfte (istSichtbar) */
  lehrerKuerzel: string[]
}

// ── Merkmale mit lesbaren Namen ──────────────────────────────────────────────

/**
 * Bei Jahrgängen wird nur verglichen, ob sie vorhanden sind. Schulgliederung, Statistik-Jahrgang und Restabschnitte
 * hängen von Schulform und Schuljahr ab und dürfen sich z. B. zwischen GE und GY unterscheiden (Statistikkatalog /types/allinone.json).
 */
const JAHRGANG_MERKMALE: Record<string, string> = {}

const FACH_MERKMALE: Record<keyof Omit<FachDaten, 'kuerzel'>, string> = {
  kuerzelStatistik: 'Statistikkürzel',
  bezeichnung: 'Bezeichnung',
  istOberstufenFach: 'Oberstufenfach',
  istFremdsprache: 'Fremdsprache',
  aufgabenfeld: 'Aufgabenfeld',
  bilingualeSprache: 'Unterrichtssprache',
}

export const GOST_FACH_MERKMALE: Record<string, string> = {
  istMoeglichEF1: 'wählbar EF.1',
  istMoeglichEF2: 'wählbar EF.2',
  istMoeglichQ11: 'wählbar Q1.1',
  istMoeglichQ12: 'wählbar Q1.2',
  istMoeglichQ21: 'wählbar Q2.1',
  istMoeglichQ22: 'wählbar Q2.2',
  istMoeglichAbiLK: 'Abitur LK möglich',
  istMoeglichAbiGK: 'Abitur GK möglich',
  wochenstundenQualifikationsphase: 'Wochenstunden Q-Phase',
  projektKursLeitfach1Kuerzel: 'Leitfach 1 (Projektkurs)',
  projektKursLeitfach2Kuerzel: 'Leitfach 2 (Projektkurs)',
  biliSprache: 'Unterrichtssprache',
}

/** Felder, die der SVWS-Server per PATCH nicht ändert: biliSprache ist bei Oberstufenfächern gesperrt (ADR 003) */
const NICHT_KORRIGIERBAR = new Set(['biliSprache'])

/**
 * Abweichungen bei diesen Merkmalen sind nur Warnungen. Der Wert wird in der KOOP-DB als Vorgabe für die
 * KOOP-Blockung im SVWS-Client festgelegt (ADR 002, A7).
 */
const VORGABE_KOOP_MERKMALE = new Set(['aufgabenfeld', 'bilingualeSprache', 'biliSprache'])
export const HINWEIS_VORGABE_KOOP = 'Wert in der KOOP-DB im SVWS-Client als Vorgabe festlegen.'

/**
 * Abweichungen bei diesen Merkmalen sind Warnungen, die Schulen sollen sie aber in ihren eigenen Datenbanken
 * vereinheitlichen, wenn sie gemeinsam blocken (ADR 002, A7): Bezeichnung der Fächer und alle Einstellungen
 * der Fächer der Abiturjahrgänge.
 */
const VEREINHEITLICHEN_MERKMALE = new Set(['bezeichnung', ...Object.keys(GOST_FACH_MERKMALE)])
export const HINWEIS_VEREINHEITLICHEN = 'Die Schulen sollten den Wert in ihren Datenbanken vereinheitlichen.'

function bewerte(feld: string): { schwere: Schwere, hinweis?: string } {
  if (VORGABE_KOOP_MERKMALE.has(feld)) return { schwere: 'warnung', hinweis: HINWEIS_VORGABE_KOOP }
  if (VEREINHEITLICHEN_MERKMALE.has(feld)) return { schwere: 'warnung', hinweis: HINWEIS_VEREINHEITLICHEN }
  return { schwere: 'fehler' }
}

const GOST_JAHRGANG_MERKMALE = {
  hatZusatzkursGE: 'Zusatzkurs GE',
  beginnZusatzkursGE: 'Beginn Zusatzkurs GE',
  hatZusatzkursSW: 'Zusatzkurs SW',
  beginnZusatzkursSW: 'Beginn Zusatzkurs SW',
} as const

// ── Hilfsfunktionen ──────────────────────────────────────────────────────────

function alleGleich(werte: (Wert | undefined)[]): boolean {
  return werte.every(w => w === werte[0])
}

/**
 * Vergleicht Objekte, die in jeder Schule über einen Schlüssel gefunden werden.
 * Fehlt ein Objekt in einer Schule, entsteht eine Abweichung „vorhanden“.
 */
function vergleiche<T>(
  quellen: Quelldaten[],
  bereich: Bereich,
  objekteJeSchule: (q: Quelldaten) => T[],
  schluessel: (o: T) => string,
  objektName: (key: string) => string,
  merkmale: Record<string, string>,
  korrektur?: (key: string, feld: string) => KorrekturBezug | undefined,
): Abweichung[] {
  const maps = new Map<number, Map<string, T>>()
  for (const q of quellen) maps.set(q.nr, new Map(objekteJeSchule(q).map(o => [schluessel(o), o])))
  const alleSchluessel = [...new Set([...maps.values()].flatMap(m => [...m.keys()]))].sort()
  const ergebnis: Abweichung[] = []

  for (const key of alleSchluessel) {
    const fehlt = quellen.filter(q => !maps.get(q.nr)!.has(key))
    if (fehlt.length > 0) {
      ergebnis.push({
        bereich, objekt: objektName(key), merkmal: 'vorhanden', schwere: 'fehler', korrigierbar: false,
        werte: Object.fromEntries(quellen.map(q => [q.nr, maps.get(q.nr)!.has(key) ? 'ja' : undefined])),
      })
      continue
    }
    for (const [feld, titel] of Object.entries(merkmale)) {
      const werte = quellen.map(q => (maps.get(q.nr)!.get(key) as Record<string, Wert>)[feld] ?? null)
      if (alleGleich(werte)) continue
      const bezug = korrektur?.(key, feld)
      ergebnis.push({
        bereich, objekt: objektName(key), merkmal: titel,
        ...bewerte(feld),
        werte: Object.fromEntries(quellen.map((q, i) => [q.nr, werte[i]])),
        korrigierbar: bezug !== undefined,
        korrektur: bezug,
      })
    }
  }
  return ergebnis
}

/** Vergleicht Mengen (z. B. Klassenkürzel) und meldet Einträge, die nicht in allen Schulen vorkommen */
function vergleicheMengen(quellen: Quelldaten[], bereich: Bereich, objekt: (eintrag: string) => string, mengeJeSchule: (q: Quelldaten) => string[]): Abweichung[] {
  const mengen = new Map(quellen.map(q => [q.nr, new Set(mengeJeSchule(q))]))
  const alle = [...new Set([...mengen.values()].flatMap(m => [...m]))].sort()
  return alle
    .filter(e => quellen.some(q => !mengen.get(q.nr)!.has(e)))
    .map(e => ({
      bereich, objekt: objekt(e), merkmal: 'vorhanden', schwere: 'fehler' as const, korrigierbar: false,
      werte: Object.fromEntries(quellen.map(q => [q.nr, mengen.get(q.nr)!.has(e) ? 'ja' : undefined])),
    }))
}

/** true, wenn mindestens eine Abweichung die Übernahme verhindert */
export function hatFehler(abweichungen: Abweichung[]): boolean {
  return abweichungen.some(a => a.schwere === 'fehler')
}

// ── Prüfung ──────────────────────────────────────────────────────────────────

export function pruefeKonsistenz(quellen: Quelldaten[]): Abweichung[] {
  const ergebnis: Abweichung[] = []
  const betroffen = (k: string) => (BETROFFENE_JAHRGAENGE as readonly string[]).includes(k)

  // Aktueller Schuljahresabschnitt
  const abschnitte = quellen.map(q => `${q.abschnitt.schuljahr}/${q.abschnitt.schuljahr + 1}, ${q.abschnitt.abschnitt}. Halbjahr`)
  if (!alleGleich(abschnitte)) {
    ergebnis.push({
      bereich: 'abschnitt', objekt: 'Aktueller Abschnitt', merkmal: 'Schuljahr und Halbjahr', schwere: 'fehler', korrigierbar: false,
      werte: Object.fromEntries(quellen.map((q, i) => [q.nr, abschnitte[i]])),
    })
  }

  ergebnis.push(...vergleiche(quellen, 'jahrgaenge', q => q.jahrgaenge.filter(j => betroffen(j.kuerzel)), j => j.kuerzel,
    k => `Jahrgang ${k}`, JAHRGANG_MERKMALE))

  for (const jg of KLASSEN_VERGLEICH) {
    ergebnis.push(...vergleicheMengen(quellen, 'klassen', k => `Klasse ${k} (Jahrgang ${jg})`, q => q.klassen[jg] ?? []))
  }

  ergebnis.push(...vergleiche(quellen, 'faecher', q => q.faecher.filter(f => f.istOberstufenFach), f => f.kuerzel,
    k => `Fach ${k}`, FACH_MERKMALE))

  // Abiturjahrgänge der betroffenen Jahrgänge
  ergebnis.push(...vergleiche(quellen, 'abiturjahrgaenge', q => q.gostJahrgaenge, g => g.jahrgang,
    k => `Abiturjahrgang (${k})`, { abiturjahr: 'Abiturjahr' }))

  // Fehlende Abiturjahrgänge sind oben schon gemeldet
  ergebnis.push(...vergleiche(quellen, 'gostJahrgang', q => q.gostJahrgaenge, g => g.jahrgang,
    k => `Abiturjahrgang (${k})`, GOST_JAHRGANG_MERKMALE, (jahrgang, feld) => ({ art: 'gostJahrgang', jahrgang, feld }))
    .filter(a => a.merkmal !== 'vorhanden'))

  for (const jg of BETROFFENE_JAHRGAENGE) {
    const jeSchule = quellen.map(q => q.gostJahrgaenge.find(g => g.jahrgang === jg))
    if (jeSchule.some(g => g === undefined)) continue // bereits als fehlender Abiturjahrgang gemeldet
    ergebnis.push(...vergleiche(quellen, 'gostFaecher', q => q.gostJahrgaenge.find(g => g.jahrgang === jg)!.faecher, f => f.kuerzel,
      k => `Fach ${k} (${jg})`, GOST_FACH_MERKMALE,
      (fachKuerzel, feld) => NICHT_KORRIGIERBAR.has(feld) ? undefined : { art: 'gostFach', jahrgang: jg, fachKuerzel, feld }))
  }
  // Fachkombinationen werden nicht verglichen: Sie werden in der KOOP-DB für die KOOP-Blockung angelegt (ADR 002, A7)

  // Erzieherarten und Telefonarten werden nicht verglichen: Die KOOP-DB erhält ihre Vereinigung (ADR 002, A9)

  // Schulkatalog: jede Partnerschule muss mit Kürzel eingetragen sein (für die Platzhalter-Lehrkräfte)
  for (const q of quellen) {
    for (const partner of quellen.filter(p => p.nr !== q.nr)) {
      const eintrag = q.schulkatalog.find(e => e.schulnummerStatistik === String(partner.koopSchulNr))
      if (eintrag && eintrag.kuerzel) continue
      ergebnis.push({
        bereich: 'schulkatalog', objekt: `Partnerschule ${partner.koopSchulNr} im Katalog von Schule ${q.nr}`,
        merkmal: eintrag ? 'Kürzel' : 'vorhanden', schwere: 'fehler', korrigierbar: false,
        werte: { [q.nr]: eintrag ? null : undefined },
      })
    }
  }

  // Lehrerkürzel: höchstens 8 Zeichen, damit -<Nr> passt
  for (const q of quellen) {
    for (const k of q.lehrerKuerzel.filter(k => k.trim().length > MAX_QUELL_KUERZEL_LAENGE)) {
      ergebnis.push({
        bereich: 'lehrerkuerzel', objekt: `Lehrkraft ${k}`, merkmal: `länger als ${MAX_QUELL_KUERZEL_LAENGE} Zeichen`,
        schwere: 'fehler', korrigierbar: false, werte: { [q.nr]: k },
      })
    }
  }

  return ergebnis
}
