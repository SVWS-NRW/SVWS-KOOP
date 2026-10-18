// Übersicht der KOOP-DB (ADR 002, „Oberfläche“): Schulen, Stufen und Lehrkräfte. Reine Logik ohne API.

import type { QuellInfo } from '@/models/Quelle'
import { zerlegeKoopKuerzel } from './lehrerKuerzel'

export const HALBJAHR_TITEL = ['EF.1', 'EF.2', 'Q1.1', 'Q1.2', 'Q2.1', 'Q2.2'] as const

/**
 * GOSt-Halbjahr (0 = EF.1 … 5 = Q2.2), das ein Abiturjahrgang im Schuljahresabschnitt gerade belegt. Für den Jahrgang 10
 * ist das die EF.1 des kommenden Schuljahres, die geplant wird (ADR 002, A2).
 */
export function laufendesHalbjahr(abiturjahr: number, schuljahr: number, abschnitt: number): number {
  const hj = (schuljahr - (abiturjahr - 3)) * 2 + (abschnitt - 1)
  return Math.min(5, Math.max(0, hj))
}

/** Link auf eine Blockung im SVWS-Client (Routen gost/:abiturjahr/kursplanung/:halbjahr/:idblockung/:idergebnis) */
export function blockungsLink(baseUrl: string, schema: string, idAbschnitt: number, b: { abiturjahr: number, halbjahr: number, id: number, idAktivesErgebnis: number | null }): string {
  const ergebnis = b.idAktivesErgebnis !== null ? `/${b.idAktivesErgebnis}` : ''
  return `${baseUrl}/#/${encodeURIComponent(schema)}/${idAbschnitt}/gost/${b.abiturjahr}/kursplanung/${b.halbjahr}/${b.id}${ergebnis}`
}

// ── Eingangsdaten ────────────────────────────────────────────────────────────

export interface BlockungInfo {
  id: number
  name: string
  abiturjahr: number
  halbjahr: number
  istAktiv: boolean
  anzahlErgebnisse: number
  idAktivesErgebnis: number | null
}

/** Lehrkraft eines Blockungskurses (GostBlockungKursLehrer) */
export interface KursLehrer {
  id: number
  wochenstunden: number
}

export interface StufenDaten {
  abiturjahr: number
  jahrgang: string
  /** Schüler des Abiturjahrgangs, wie der Server sie für die Blockung zählt */
  schueler: { id: number, externeSchulNr: string | null }[]
  /** IDs der Schüler mit mindestens einer Fachwahl */
  mitFachwahlen: Set<number>
  /** Blockungen aller Halbjahre */
  blockungen: BlockungInfo[]
  laufendesHalbjahr: number
  /** Kurse der aktiven Blockung im laufenden Halbjahr, leer wenn keine aktiviert ist */
  kurse: { lehrer: KursLehrer[] }[]
}

export interface LehrerDaten {
  id: number
  kuerzel: string
  nachname: string
  vorname: string
  istSichtbar: boolean
}

// ── Ergebnis ─────────────────────────────────────────────────────────────────

export interface SchulZeile {
  info: QuellInfo
  schuelerJeStufe: Record<string, number>
  schueler: number
  ohneFachwahlen: number
  lehrkraefteAktiv: number
  lehrkraefteEntfernt: number
  /** Kurse der aktiven Blockungen im laufenden Halbjahr mit einer Lehrkraft dieser Schule */
  kurse: number
  wochenstunden: number
}

export interface StufenZeile {
  abiturjahr: number
  jahrgang: string
  laufendesHalbjahr: number
  /** Schülerzahl je Nummer der Quellschule */
  jeSchule: Record<number, number>
  /** Schüler ohne passende Stammschule (sollte 0 sein) */
  ohneStammschule: number
  gesamt: number
  ohneFachwahlen: number
  blockungen: BlockungInfo[]
  /** Kurse der aktiven Blockung im laufenden Halbjahr, null wenn keine aktiviert ist */
  kurse: number | null
  kurseOhneLehrkraft: number
}

export interface LehrerZeile extends LehrerDaten {
  /** Nummer der Quellschule aus dem Kürzel, null bei Kürzeln ohne Suffix */
  nr: number | null
  kurse: number
  wochenstunden: number
  stufen: string[]
}

export interface Uebersicht {
  schulen: SchulZeile[]
  stufen: StufenZeile[]
  lehrkraefte: LehrerZeile[]
}

/** Wertet die Daten der KOOP-DB für die Übersicht aus */
export function werteAus(quellen: QuellInfo[], stufen: StufenDaten[], lehrer: LehrerDaten[]): Uebersicht {
  const nrNachSchulNr = new Map(quellen.map(q => [String(q.koopSchulNr), q.nr]))

  // Kurse und Wochenstunden je Lehrkraft aus den aktiven Blockungen des laufenden Halbjahres
  const einsatz = new Map<number, { kurse: number, wochenstunden: number, stufen: Set<string> }>()
  for (const st of stufen) {
    for (const kurs of st.kurse) {
      for (const l of kurs.lehrer) {
        const e = einsatz.get(l.id) ?? { kurse: 0, wochenstunden: 0, stufen: new Set<string>() }
        e.kurse++
        e.wochenstunden += l.wochenstunden
        e.stufen.add(st.jahrgang)
        einsatz.set(l.id, e)
      }
    }
  }

  const lehrkraefte: LehrerZeile[] = lehrer.map(l => {
    const e = einsatz.get(l.id)
    return { ...l, nr: zerlegeKoopKuerzel(l.kuerzel)?.nr ?? null, kurse: e?.kurse ?? 0, wochenstunden: e?.wochenstunden ?? 0, stufen: e ? [...e.stufen] : [] }
  })

  const stufenZeilen: StufenZeile[] = stufen.map(st => {
    const jeSchule: Record<number, number> = Object.fromEntries(quellen.map(q => [q.nr, 0]))
    let ohneStammschule = 0
    for (const s of st.schueler) {
      const nr = s.externeSchulNr !== null ? nrNachSchulNr.get(s.externeSchulNr) : undefined
      if (nr === undefined) ohneStammschule++
      else jeSchule[nr]++
    }
    const aktiv = st.blockungen.some(b => b.halbjahr === st.laufendesHalbjahr && b.istAktiv)
    return {
      abiturjahr: st.abiturjahr, jahrgang: st.jahrgang, laufendesHalbjahr: st.laufendesHalbjahr, jeSchule, ohneStammschule,
      gesamt: st.schueler.length,
      ohneFachwahlen: st.schueler.filter(s => !st.mitFachwahlen.has(s.id)).length,
      blockungen: st.blockungen,
      kurse: aktiv ? st.kurse.length : null,
      kurseOhneLehrkraft: st.kurse.filter(k => k.lehrer.length === 0).length,
    }
  })

  const schulen: SchulZeile[] = quellen.map(q => {
    const schulNr = String(q.koopSchulNr)
    const schuelerJeStufe: Record<string, number> = {}
    let ohneFachwahlen = 0
    for (const st of stufen) {
      const eigene = st.schueler.filter(s => s.externeSchulNr === schulNr)
      schuelerJeStufe[st.jahrgang] = eigene.length
      ohneFachwahlen += eigene.filter(s => !st.mitFachwahlen.has(s.id)).length
    }
    const eigeneLehrer = lehrkraefte.filter(l => l.nr === q.nr)
    // Ein Kurs zählt für jede Schule, die eine seiner Lehrkräfte stellt
    let kurse = 0
    for (const st of stufen) {
      for (const kurs of st.kurse) if (kurs.lehrer.some(l => eigeneLehrer.some(e => e.id === l.id))) kurse++
    }
    return {
      info: q, schuelerJeStufe,
      schueler: Object.values(schuelerJeStufe).reduce((a, b) => a + b, 0),
      ohneFachwahlen,
      lehrkraefteAktiv: eigeneLehrer.filter(l => l.istSichtbar).length,
      lehrkraefteEntfernt: eigeneLehrer.filter(l => !l.istSichtbar).length,
      kurse,
      wochenstunden: eigeneLehrer.reduce((a, l) => a + l.wochenstunden, 0),
    }
  })

  return { schulen, stufen: stufenZeilen, lehrkraefte }
}

/** Quellschulen, die im Schulkatalog der KOOP-DB fehlen oder ein falsches Kürzel haben (ADR 002, A5) */
export function pruefeSchulkatalog(quellen: QuellInfo[], katalog: { schulnummerStatistik: string | null, kuerzel: string | null }[]): string[] {
  const hinweise: string[] = []
  for (const q of quellen) {
    const eintrag = katalog.find(e => e.schulnummerStatistik === String(q.koopSchulNr))
    if (!eintrag) hinweise.push(`Schule ${q.nr} (${q.koopSchulNr}) fehlt im Schulkatalog der KOOP-DB.`)
    else if (eintrag.kuerzel !== String(q.nr)) hinweise.push(`Schule ${q.nr} (${q.koopSchulNr}) hat im Schulkatalog das Kürzel „${eintrag.kuerzel ?? ''}“ statt „${q.nr}“.`)
  }
  return hinweise
}
