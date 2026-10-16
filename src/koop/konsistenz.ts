// Konsistenzprüfung der Quell-DBs (ADR 002, A7/A8). Reine Vergleichslogik ohne API.
// Verglichen werden die Schulen untereinander. Was als Abweichung gilt, folgt aus ADR 002, nicht aus Testdaten.

import { MAX_QUELL_KUERZEL_LAENGE } from './lehrerKuerzel'

/** Jahrgänge, deren Schüler übernommen werden (ADR 002, A2) */
export const BETROFFENE_JAHRGAENGE = ['10', 'EF', 'Q1', 'Q2'] as const

export type Bereich =
  | 'abschnitt' | 'jahrgaenge' | 'klassen' | 'faecher' | 'abiturjahrgaenge' | 'gostJahrgang'
  | 'gostFaecher' | 'fachkombinationen' | 'erzieherarten' | 'schulkatalog' | 'lehrerkuerzel'

export const BEREICH_TITEL: Record<Bereich, string> = {
  abschnitt: 'Schuljahresabschnitt',
  jahrgaenge: 'Jahrgänge',
  klassen: 'Klassen',
  faecher: 'Fächer',
  abiturjahrgaenge: 'Abiturjahrgänge',
  gostJahrgang: 'Einstellungen der Abiturjahrgänge',
  gostFaecher: 'Fächer der Abiturjahrgänge',
  fachkombinationen: 'Fachkombinationen',
  erzieherarten: 'Erzieherarten',
  schulkatalog: 'Schulkatalog',
  lehrerkuerzel: 'Lehrerkürzel',
}

export type Wert = string | number | boolean | null

export interface Abweichung {
  bereich: Bereich
  /** Was abweicht, z. B. „Fach D“ oder „Jahrgang EF“ */
  objekt: string
  /** Welches Merkmal, z. B. „Abitur LK möglich“ */
  merkmal: string
  /** Wert je Nummer der Quellschule, undefined = Objekt fehlt in dieser Schule */
  werte: Record<number, Wert | undefined>
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
  /** Fachkombinationen als lesbare Schlüssel, siehe fachkombinationSchluessel */
  fachkombinationen: string[]
}

export interface Quelldaten {
  nr: number
  schulNr: number
  schulname: string
  abschnitt: { schuljahr: number, abschnitt: number }
  jahrgaenge: JahrgangDaten[]
  /** Klassenkürzel je Jahrgangskürzel (nur betroffene Jahrgänge) */
  klassen: Record<string, string[]>
  faecher: FachDaten[]
  gostJahrgaenge: GostJahrgangDaten[]
  erzieherarten: string[]
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
        bereich, objekt: objektName(key), merkmal: 'vorhanden', korrigierbar: false,
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
      bereich, objekt: objekt(e), merkmal: 'vorhanden', korrigierbar: false,
      werte: Object.fromEntries(quellen.map(q => [q.nr, mengen.get(q.nr)!.has(e) ? 'ja' : undefined])),
    }))
}

/** Lesbarer Schlüssel einer Fachkombination, unabhängig von IDs der Datenbank */
export function fachkombinationSchluessel(
  fach1: string, kursart1: string | null, fach2: string, kursart2: string | null, typ: number, gueltigInHalbjahr: boolean[],
): string {
  // GostLaufbahnplanungFachkombinationTyp: 0 = VERBOTEN, 1 = ERFORDERLICH
  const art = typ === 1 ? 'erfordert' : 'verbietet'
  const halbjahre = ['EF.1', 'EF.2', 'Q1.1', 'Q1.2', 'Q2.1', 'Q2.2'].filter((_, i) => gueltigInHalbjahr[i]).join(',')
  return `${fach1}${kursart1 ? ' ' + kursart1 : ''} ${art} ${fach2}${kursart2 ? ' ' + kursart2 : ''} (${halbjahre})`
}

// ── Prüfung ──────────────────────────────────────────────────────────────────

export function pruefeKonsistenz(quellen: Quelldaten[]): Abweichung[] {
  const ergebnis: Abweichung[] = []
  const betroffen = (k: string) => (BETROFFENE_JAHRGAENGE as readonly string[]).includes(k)

  // Aktueller Schuljahresabschnitt
  const abschnitte = quellen.map(q => `${q.abschnitt.schuljahr}/${q.abschnitt.schuljahr + 1}, ${q.abschnitt.abschnitt}. Halbjahr`)
  if (!alleGleich(abschnitte)) {
    ergebnis.push({
      bereich: 'abschnitt', objekt: 'Aktueller Abschnitt', merkmal: 'Schuljahr und Halbjahr', korrigierbar: false,
      werte: Object.fromEntries(quellen.map((q, i) => [q.nr, abschnitte[i]])),
    })
  }

  ergebnis.push(...vergleiche(quellen, 'jahrgaenge', q => q.jahrgaenge.filter(j => betroffen(j.kuerzel)), j => j.kuerzel,
    k => `Jahrgang ${k}`, JAHRGANG_MERKMALE))

  for (const jg of BETROFFENE_JAHRGAENGE) {
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
    ergebnis.push(...vergleicheMengen(quellen, 'fachkombinationen', k => `${k} (${jg})`,
      q => q.gostJahrgaenge.find(g => g.jahrgang === jg)!.fachkombinationen))
  }

  ergebnis.push(...vergleicheMengen(quellen, 'erzieherarten', e => `Erzieherart „${e}“`, q => q.erzieherarten))

  // Schulkatalog: jede Partnerschule muss mit Kürzel eingetragen sein (für die Platzhalter-Lehrkräfte)
  for (const q of quellen) {
    for (const partner of quellen.filter(p => p.nr !== q.nr)) {
      const eintrag = q.schulkatalog.find(e => e.schulnummerStatistik === String(partner.schulNr))
      if (eintrag && eintrag.kuerzel) continue
      ergebnis.push({
        bereich: 'schulkatalog', objekt: `Partnerschule ${partner.schulNr} im Katalog von Schule ${q.nr}`,
        merkmal: eintrag ? 'Kürzel' : 'vorhanden', korrigierbar: false,
        werte: { [q.nr]: eintrag ? null : undefined },
      })
    }
  }

  // Lehrerkürzel: höchstens 8 Zeichen, damit -<Nr> passt
  for (const q of quellen) {
    for (const k of q.lehrerKuerzel.filter(k => k.trim().length > MAX_QUELL_KUERZEL_LAENGE)) {
      ergebnis.push({
        bereich: 'lehrerkuerzel', objekt: `Lehrkraft ${k}`, merkmal: `länger als ${MAX_QUELL_KUERZEL_LAENGE} Zeichen`,
        korrigierbar: false, werte: { [q.nr]: k },
      })
    }
  }

  return ergebnis
}
