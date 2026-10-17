import type { AxiosInstance } from 'axios'
import type { QuellInfo } from '@/models/Quelle'
import { BETROFFENE_JAHRGAENGE, KOOP_KLASSE_10 } from '@/koop/konsistenz'
import {
  bereiteErzieherVor, bereiteLehrerVor, bereiteSchuelerStammdatenVor, bereiteTelefonVor, fehlendeKatalogEintraege,
  fachwahlFuerKoop, gruppiereErzieher, istPlatzhalter, koopKlasse, ordneKatalogZu, Protokoll, type Fachwahl,
  type KatalogName, type KatalogZuordnungen,
} from '@/koop/uebernahme'
import { ladeQuellStand, uebertrageJahrgaenge } from '@/services/konsistenzService'

// Übernahme in die KOOP-DB (ADR 002, A9–A13, ADR 003). Alle Schritte sind wiederholbar.

export interface QuellKontext {
  info: QuellInfo
  client: AxiosInstance
}

export type Fortschritt = (text: string, erledigt?: number, gesamt?: number) => void

type Roh = Record<string, any>

/** Schülerstatus, die übernommen werden: Aufnahme, Aktiv, Beurlaubt (Statistikkatalog SchuelerStatus) */
export const UEBERNAHME_STATUS = new Set([0, 2, 3])

const ABITURJAHR_VORLAGE = -1

/**
 * Zahl der gleichzeitig bearbeiteten Lehrkräfte bzw. Schüler. Der SVWS-Server hat bei gleichzeitigen Create-Aufrufen
 * eine Race Condition (HTTP 500), die der API-Client mit Wiederholung und Jitter abfängt (wiederholung.ts, ADR 003).
 */
const PARALLEL_SCHREIBEN = 4

/** Führt eine Funktion für alle Elemente mit begrenzter Parallelität aus */
async function parallel<T>(liste: T[], anzahl: number, fn: (e: T, i: number) => Promise<void>): Promise<void> {
  let naechster = 0
  async function arbeiter() {
    while (naechster < liste.length) {
      const i = naechster++
      await fn(liste[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(anzahl, liste.length) }, arbeiter))
}

function fehlertext(e: unknown): string {
  const ax = e as { response?: { status?: number, data?: unknown }, message?: string }
  if (ax.response) return `HTTP ${ax.response.status}: ${typeof ax.response.data === 'string' ? ax.response.data : JSON.stringify(ax.response.data)}`.slice(0, 300)
  return ax.message ?? String(e)
}

async function get<T = any>(c: AxiosInstance, pfad: string): Promise<T> {
  return (await c.get(pfad)).data as T
}

/** Aktueller Schuljahresabschnitt einer Datenbank */
async function ladeAbschnitt(c: AxiosInstance): Promise<{ id: number, schuljahr: number, abschnitt: number }> {
  const st = await get(c, '/schule/stammdaten')
  return (st.abschnitte as { id: number, schuljahr: number, abschnitt: number }[]).find(a => a.id === st.idSchuljahresabschnitt)!
}

/** Quellschule mit derselben Schulnummer wie die KOOP-DB (gleiche Schulform), sonst die erste */
export function referenzQuelle(quellen: QuellKontext[], koopSchulNr: number | null): QuellKontext {
  return quellen.find(q => q.info.schulNr === koopSchulNr) ?? quellen[0]
}

// ── Kataloge ─────────────────────────────────────────────────────────────────

const KATALOGE: Record<KatalogName, { lesen: string, anlegen: string, body: (e: Roh) => Roh }> = {
  erzieherarten: { lesen: '/schule/erzieherarten', anlegen: '/schule/erzieherart/new', body: e => ({ bezeichnung: e.bezeichnung, sortierung: e.sortierung, istSichtbar: true }) },
  telefonarten: { lesen: '/schule/telefonarten', anlegen: '/schule/telefonarten/create', body: e => ({ bezeichnung: e.bezeichnung, sortierung: e.sortierung, istSichtbar: true }) },
  religionen: {
    lesen: '/schule/religionen', anlegen: '/schule/religionen/create',
    body: e => ({ bezeichnung: e.bezeichnung, bezeichnungZeugnis: e.bezeichnungZeugnis, idReligion: e.idReligion, sortierung: e.sortierung ?? 32000, istSichtbar: true }),
  },
  orte: {
    lesen: '/orte', anlegen: '/orte/create',
    body: e => ({ plz: String(e.plz ?? '').trim(), ortsname: String(e.ortsname ?? '').trim(), kreis: e.kreis, idBundesland: e.idBundesland, sortierung: e.sortierung ?? 32000, istSichtbar: true, istAenderbar: true }),
  },
  fahrschuelerarten: { lesen: '/schueler/fahrschuelerarten', anlegen: '/schueler/fahrschuelerarten/create', body: e => ({ bezeichnung: e.bezeichnung, istSichtbar: true }) },
  haltestellen: { lesen: '/haltestellen', anlegen: '/haltestellen/create', body: e => ({ bezeichnung: e.bezeichnung, entfernungSchule: e.entfernungSchule, istSichtbar: true }) },
}

/** Legt in der KOOP-DB die Vereinigung der Kataloge aller Quell-DBs an */
async function vereinigeKataloge(koop: AxiosInstance, quellen: QuellKontext[], protokoll: Protokoll, fortschritt: Fortschritt): Promise<void> {
  for (const [name, def] of Object.entries(KATALOGE) as [KatalogName, typeof KATALOGE[KatalogName]][]) {
    fortschritt(`Katalog ${name}`)
    const quellKataloge = await Promise.all(quellen.map(q => get<Roh[]>(q.client, def.lesen)))
    const fehlend = fehlendeKatalogEintraege(name, quellKataloge, await get<Roh[]>(koop, def.lesen))
    for (const e of fehlend) {
      try {
        await koop.post(def.anlegen, def.body(e))
      } catch (x) {
        protokoll.add('fehler', 'Kataloge', `${name}: „${e.bezeichnung ?? e.ortsname}“ konnte nicht angelegt werden (${fehlertext(x)})`)
      }
    }
    if (fehlend.length > 0) protokoll.add('neu', 'Kataloge', `${name}: ${fehlend.length} Einträge ergänzt`)
  }
}

/** Zuordnung der Katalog-IDs einer Quell-DB zu den IDs der KOOP-DB */
export async function ladeKatalogZuordnungen(koop: AxiosInstance, quelle: AxiosInstance): Promise<KatalogZuordnungen> {
  const ergebnis = {} as KatalogZuordnungen
  for (const [name, def] of Object.entries(KATALOGE) as [KatalogName, typeof KATALOGE[KatalogName]][]) {
    const [q, k] = await Promise.all([get<Roh[]>(quelle, def.lesen), get<Roh[]>(koop, def.lesen)])
    ergebnis[name] = ordneKatalogZu(name, q as (Roh & { id: number })[], k as (Roh & { id: number })[])
  }
  return ergebnis
}

// ── 1. KOOP-DB vorbereiten ───────────────────────────────────────────────────

const FACH_FELDER = ['kuerzelStatistik', 'bezeichnung', 'aufgabenfeld', 'bilingualeSprache', 'istOberstufenFach', 'istPruefungsordnungsRelevant',
  'istFremdsprache', 'istMoeglichAlsNeueFremdspracheInSekII', 'aufZeugnis', 'bezeichnungZeugnis', 'istSichtbar', 'sortierung']

const GOST_FACH_FELDER = ['istMoeglichEF1', 'istMoeglichEF2', 'istMoeglichQ11', 'istMoeglichQ12', 'istMoeglichQ21', 'istMoeglichQ22',
  'istMoeglichAbiLK', 'istMoeglichAbiGK', 'wochenstundenQualifikationsphase']

const GOST_JAHRGANG_FELDER = ['hatZusatzkursGE', 'beginnZusatzkursGE', 'hatZusatzkursSW', 'beginnZusatzkursSW']

/**
 * Bereitet die KOOP-DB für die Übernahme vor: Jahrgänge, Fächer, Klassen, Abiturjahrgänge mit Einstellungen und
 * Kataloge. Grundlage ist die Quell-DB mit derselben Schulnummer wie die KOOP-DB, nach der Konsistenzprüfung
 * stimmen die Quell-DBs überein.
 */
export async function bereiteKoopVor(koop: AxiosInstance, quellen: QuellKontext[], koopSchulNr: number | null, fortschritt: Fortschritt): Promise<Protokoll> {
  const protokoll = new Protokoll()
  const ref = referenzQuelle(quellen, koopSchulNr)
  const abschnitt = await ladeAbschnitt(koop)
  const refAbschnitt = await ladeAbschnitt(ref.client)
  if (refAbschnitt.schuljahr !== abschnitt.schuljahr || refAbschnitt.abschnitt !== abschnitt.abschnitt) {
    protokoll.add('fehler', 'Abschnitt', `Die KOOP-DB steht auf ${abschnitt.schuljahr}/${abschnitt.abschnitt}, die Quell-DBs auf ${refAbschnitt.schuljahr}/${refAbschnitt.abschnitt}.`)
    return protokoll
  }

  fortschritt('Jahrgänge')
  const stand = await ladeQuellStand(ref.client, ref.info.nr, ref.info.schulNr, ref.info.schulname)
  await uebertrageJahrgaenge(stand, koop)
  protokoll.add('aktualisiert', 'Jahrgänge', `aus Schule ${ref.info.nr} übernommen, Schulgliederung ***`)

  // Fächer: alle Oberstufenfächer der Quell-DBs (Referenz zuerst)
  fortschritt('Fächer')
  const oberstufe = new Map<string, Roh>()
  for (const q of [ref, ...quellen.filter(x => x !== ref)]) {
    for (const f of await get<Roh[]>(q.client, '/faecher/')) if (f.istOberstufenFach && !oberstufe.has(f.kuerzel)) oberstufe.set(f.kuerzel, f)
  }
  let koopFaecher = await get<Roh[]>(koop, '/faecher/')
  // Von init angelegte Fächer, die nicht gebraucht werden, aus der Oberstufe nehmen und ihre Bezeichnung freigeben
  for (const f of koopFaecher.filter(f => f.istOberstufenFach && !oberstufe.has(f.kuerzel))) {
    await koop.patch(`/faecher/${f.id}`, { istOberstufenFach: false, bezeichnung: `${f.bezeichnung} (nicht verwendet)`.slice(0, 255) })
  }
  koopFaecher = await get<Roh[]>(koop, '/faecher/')
  for (const f of oberstufe.values()) {
    const daten = Object.fromEntries(FACH_FELDER.map(k => [k, f[k]]))
    const vorhanden = koopFaecher.find(x => x.kuerzel === f.kuerzel)
    try {
      if (vorhanden) await koop.patch(`/faecher/${vorhanden.id}`, daten)
      else await koop.post('/faecher/create', { kuerzel: f.kuerzel, ...daten })
      protokoll.add(vorhanden ? 'aktualisiert' : 'neu', 'Fächer', f.kuerzel)
    } catch (x) {
      protokoll.add('fehler', 'Fächer', `${f.kuerzel}: ${fehlertext(x)}`)
    }
  }

  // Klassen: 10 für die Jahrgangsstufe 10, Klassen der EF, Q1, Q2 wie in der Referenz
  fortschritt('Klassen')
  const koopJahrgaenge = new Map((await get<Roh[]>(koop, '/jahrgaenge/')).map(j => [j.kuerzel as string, j.id as number]))
  const koopKlassen = new Set((await get<Roh[]>(koop, `/klassen/minimal/abschnitt/${abschnitt.id}`)).map(k => k.kuerzel as string))
  const gewuenscht: [string, string][] = [[KOOP_KLASSE_10, '10'], ...(['EF', 'Q1', 'Q2'] as const).flatMap(jg => (stand.daten.klassen[jg] ?? []).map(k => [k, jg] as [string, string]))]
  for (const [kuerzel, jg] of gewuenscht) {
    if (koopKlassen.has(kuerzel)) continue
    try {
      await koop.post('/klassen/create', { idSchuljahresabschnitt: abschnitt.id, kuerzel, idJahrgang: koopJahrgaenge.get(jg) })
      protokoll.add('neu', 'Klassen', `${kuerzel} (Jahrgang ${jg})`)
    } catch (x) {
      protokoll.add('fehler', 'Klassen', `${kuerzel}: ${fehlertext(x)}`)
    }
  }

  // Abiturjahrgänge mit Einstellungen und Fächern
  fortschritt('Abiturjahrgänge')
  const koopAbi = new Set((await get<Roh[]>(koop, '/gost/abiturjahrgaenge')).map(a => a.jahrgang as string | null))
  for (const jg of BETROFFENE_JAHRGAENGE) {
    if (koopAbi.has(jg) || !stand.daten.gostJahrgaenge.some(g => g.jahrgang === jg)) continue
    try {
      await koop.post(`/gost/abiturjahrgang/new/${abschnitt.id}/${koopJahrgaenge.get(jg)}`)
      protokoll.add('neu', 'Abiturjahrgänge', jg)
    } catch (x) {
      protokoll.add('fehler', 'Abiturjahrgänge', `${jg}: ${fehlertext(x)}`)
    }
  }
  const koopFachIds = new Map((await get<Roh[]>(koop, '/faecher/')).map(f => [f.kuerzel as string, f.id as number]))
  const koopAbiturjahrgaenge = (await get<Roh[]>(koop, '/gost/abiturjahrgaenge')).filter(a => a.jahrgang)
  const leitfaecherGesetzt = new Set<string>()
  for (const g of stand.daten.gostJahrgaenge) {
    const ziel = koopAbiturjahrgaenge.find(a => a.jahrgang === g.jahrgang)
    if (!ziel) continue
    fortschritt(`Einstellungen Abiturjahrgang ${g.jahrgang}`)
    await koop.patch(`/gost/abiturjahrgang/${ziel.abiturjahr}`, Object.fromEntries(GOST_JAHRGANG_FELDER.map(k => [k, (g as unknown as Roh)[k]])))
    const zielFaecher = new Map((await get<Roh[]>(koop, `/gost/abiturjahrgang/${ziel.abiturjahr}/faecher`)).map(f => [(f.kuerzelAnzeige || f.kuerzel) as string, f.id as number]))
    for (const f of g.faecher) {
      const id = zielFaecher.get(f.kuerzel)
      if (id === undefined) { protokoll.add('hinweis', 'Abiturjahrgänge', `Fach ${f.kuerzel} fehlt im Abiturjahrgang ${g.jahrgang} der KOOP-DB`); continue }
      await koop.patch(`/gost/abiturjahrgang/${ziel.abiturjahr}/fach/${id}`, Object.fromEntries(GOST_FACH_FELDER.map(k => [k, f[k]])))
      // Leitfächer gelten schulweit und werden über die Vorlage gesetzt (ADR 003)
      if (!leitfaecherGesetzt.has(f.kuerzel) && (f.projektKursLeitfach1Kuerzel || f.projektKursLeitfach2Kuerzel)) {
        await koop.patch(`/gost/abiturjahrgang/${ABITURJAHR_VORLAGE}/fach/${id}`, {
          projektKursLeitfach1ID: f.projektKursLeitfach1Kuerzel ? (koopFachIds.get(String(f.projektKursLeitfach1Kuerzel)) ?? null) : null,
          projektKursLeitfach2ID: f.projektKursLeitfach2Kuerzel ? (koopFachIds.get(String(f.projektKursLeitfach2Kuerzel)) ?? null) : null,
        })
        leitfaecherGesetzt.add(f.kuerzel)
      }
    }
    protokoll.add('aktualisiert', 'Abiturjahrgänge', `Einstellungen ${g.jahrgang} (${ziel.abiturjahr})`)
  }

  await vereinigeKataloge(koop, quellen, protokoll, fortschritt)
  fortschritt('fertig')
  return protokoll
}

// ── 2. Lehrkräfte ────────────────────────────────────────────────────────────

/** Übernimmt die aktiven Lehrkräfte aller Quell-DBs (ADR 002, A10) */
export async function uebernehmeLehrkraefte(koop: AxiosInstance, quellen: QuellKontext[], fortschritt: Fortschritt): Promise<Protokoll> {
  const protokoll = new Protokoll()
  const abschnitt = await ladeAbschnitt(koop)
  for (const q of quellen) {
    const kataloge = await ladeKatalogZuordnungen(koop, q.client)
    const katalogKuerzel = new Set((await get<Roh[]>(q.client, '/schule/schulen')).map(s => s.kuerzel).filter(Boolean) as string[])
    const lehrer = (await get<Roh[]>(q.client, '/lehrer/')).filter(l => l.istSichtbar)
    const koopLehrer = new Map((await get<Roh[]>(koop, '/lehrer/')).map(l => [l.kuerzel as string, l.id as number]))
    await parallel(lehrer, PARALLEL_SCHREIBEN, async (l, i) => {
      fortschritt(`Schule ${q.info.nr}: Lehrkraft ${l.kuerzel}`, i + 1, lehrer.length)
      if (istPlatzhalter(l as { kuerzel: string, istRelevantFuerStatistik: boolean }, katalogKuerzel)) {
        protokoll.add('uebersprungen', 'Lehrkräfte', `${l.kuerzel} (Schule ${q.info.nr}): Platzhalter`)
        return
      }
      try {
        const body = bereiteLehrerVor(await get(q.client, `/lehrer/${l.id}/stammdaten`), q.info.nr, kataloge)
        let id = koopLehrer.get(body.kuerzel as string)
        if (id !== undefined) {
          await koop.patch(`/lehrer/${id}/stammdaten`, body)
        } else {
          id = (await koop.post('/lehrer/create', body)).data.id as number
        }
        // Stammschule in den Personalabschnittsdaten des aktuellen Abschnitts
        const personal = await get(koop, `/lehrer/${id}/personaldaten`)
        const abschnittsdaten = (personal.abschnittsdaten as Roh[] ?? []).find(a => a.idSchuljahresabschnitt === abschnitt.id)
        if (abschnittsdaten) await koop.patch(`/lehrer/personalabschnittsdaten/${abschnittsdaten.id}`, { stammschulnummer: String(q.info.koopSchulNr) })
        else await koop.post('/lehrer/personalabschnittsdaten', { idLehrer: id, idSchuljahresabschnitt: abschnitt.id, stammschulnummer: String(q.info.koopSchulNr) })
        protokoll.add(koopLehrer.has(body.kuerzel as string) ? 'aktualisiert' : 'neu', 'Lehrkräfte', `${body.kuerzel}`)
      } catch (x) {
        protokoll.add('fehler', 'Lehrkräfte', `${l.kuerzel} (Schule ${q.info.nr}): ${fehlertext(x)}`)
      }
    })
  }
  fortschritt('fertig')
  return protokoll
}

// ── 3. Schüler ───────────────────────────────────────────────────────────────

/**
 * Überträgt die Fachwahlen eines Schülers je Fach unverändert aus der Quell-DB, Fächer über das Kürzel zugeordnet
 * (ADR 003). Vergangene Halbjahre bleiben leer. Liefert die Zahl der übertragenen Fächer.
 */
async function uebertrageFachwahlen(
  quelle: AxiosInstance, quellId: number, koop: AxiosInstance, koopId: number, jahrgang: string, abschnitt: number,
  quellFaecher: Map<number, string>, koopFaecher: Map<string, number>, protokoll: Protokoll, name: string,
): Promise<number> {
  let fachwahlen = 0
  let entfernt = 0
  const laufbahn = await quelle.get(`/gost/schueler/${quellId}/laufbahnplanung`, { validateStatus: st => st === 200 || st === 404 })
  for (const fb of (laufbahn.status === 200 ? laufbahn.data.fachbelegungen : []) as Roh[]) {
    if (!fb.abiturFach && !(fb.belegungen as (Roh | null)[]).some(b => b !== null)) continue
    const kuerzel = quellFaecher.get(fb.fachID)
    const zielFach = kuerzel ? koopFaecher.get(kuerzel) : undefined
    if (zielFach === undefined) { protokoll.add('hinweis', 'Schüler', `${name}: Fach ${kuerzel ?? fb.fachID} fehlt in der KOOP-DB`); continue }
    const wahl = await get<Fachwahl>(quelle, `/gost/schueler/${quellId}/fachwahl/${fb.fachID}`)
    const fuerKoop = fachwahlFuerKoop(wahl, jahrgang, abschnitt)
    if (!fuerKoop) { entfernt += wahl.halbjahre.filter(h => h !== null).length; continue }
    entfernt += fuerKoop.entfernt
    const referenz = wahl.idReferenzfach != null ? koopFaecher.get(quellFaecher.get(wahl.idReferenzfach) ?? '') ?? null : null
    await koop.patch(`/gost/schueler/${koopId}/fachwahl/${zielFach}`, { ...fuerKoop.wahl, idReferenzfach: referenz })
    fachwahlen++
  }
  if (entfernt > 0) protokoll.add('hinweis', 'Schüler', `${name}: ${entfernt} Belegungen vergangener Halbjahre nicht übernommen`)
  return fachwahlen
}

/** Bereits übernommene Schüler der KOOP-DB: Schlüssel „Stammschule|ID in der Quell-DB“ → ID in der KOOP-DB */
async function ladeVorhandeneSchueler(koop: AxiosInstance, abschnittId: number): Promise<Map<string, number>> {
  const liste = await get<Roh[]>(koop, `/schueler/abschnitt/${abschnittId}`)
  const ergebnis = new Map<string, number>()
  for (let i = 0; i < liste.length; i += 200) {
    const teil = await (await koop.post('/schueler/stammdaten', liste.slice(i, i + 200).map(s => s.id))).data as Roh[]
    for (const s of teil) if (s.externeSchulNr && s.idSchuelerausweis) ergebnis.set(`${s.externeSchulNr}|${s.idSchuelerausweis}`, s.id)
  }
  return ergebnis
}

/**
 * Übernimmt die Schüler der Jahrgänge 10, EF, Q1, Q2 (Status Aufnahme, Aktiv, Beurlaubt) aller Quell-DBs
 * mit Stammdaten, Erziehern, Telefonnummern, Sprachenfolge und Fachwahlen (ADR 002, A9–A12).
 * Bereits übernommene Schüler erhalten nur aktualisierte Stammdaten, ihre Fachwahlen werden nicht überschrieben (A21).
 */
export async function uebernehmeSchueler(koop: AxiosInstance, quellen: QuellKontext[], fortschritt: Fortschritt): Promise<Protokoll> {
  const protokoll = new Protokoll()
  const abschnitt = await ladeAbschnitt(koop)
  const koopJahrgaenge = new Map((await get<Roh[]>(koop, '/jahrgaenge/')).map(j => [j.kuerzel as string, j.id as number]))
  const koopKlassen = new Map((await get<Roh[]>(koop, `/klassen/minimal/abschnitt/${abschnitt.id}`)).map(k => [k.kuerzel as string, k.id as number]))
  const koopFaecher = new Map((await get<Roh[]>(koop, '/faecher/')).map(f => [f.kuerzel as string, f.id as number]))
  const vorhanden = await ladeVorhandeneSchueler(koop, abschnitt.id)

  for (const q of quellen) {
    fortschritt(`Schule ${q.info.nr}: Daten laden`)
    const kataloge = await ladeKatalogZuordnungen(koop, q.client)
    const quellAbschnitt = await ladeAbschnitt(q.client)
    const quellFaecher = new Map((await get<Roh[]>(q.client, '/faecher/')).map(f => [f.id as number, f.kuerzel as string]))
    const quellKlassen = new Map((await get<Roh[]>(q.client, `/klassen/minimal/abschnitt/${quellAbschnitt.id}`)).map(k => [k.id as number, k.kuerzel as string]))
    const schueler = (await get<Roh[]>(q.client, `/schueler/abschnitt/${quellAbschnitt.id}`))
      .filter(s => (BETROFFENE_JAHRGAENGE as readonly string[]).includes(s.jahrgang) && UEBERNAHME_STATUS.has(s.status))

    await parallel(schueler, PARALLEL_SCHREIBEN, async (s, i) => {
      fortschritt(`Schule ${q.info.nr}: ${s.nachname}, ${s.vorname}`, i + 1, schueler.length)
      const name = `${s.nachname}, ${s.vorname} (${s.jahrgang}, Schule ${q.info.nr})`
      try {
        const stammdaten = await get(q.client, `/schueler/${s.id}/stammdaten`)
        const patch = bereiteSchuelerStammdatenVor(stammdaten, kataloge, q.info.koopSchulNr, s.id)
        const vorhandeneId = vorhanden.get(`${q.info.koopSchulNr}|${s.id}`)
        if (vorhandeneId !== undefined) {
          await koop.patch(`/schueler/${vorhandeneId}/stammdaten`, patch)
          // Fachwahlen werden nicht überschrieben (A21), aber nachgeholt, wenn eine frühere Übernahme abgebrochen ist
          const koopLaufbahn = await koop.get(`/gost/schueler/${vorhandeneId}/laufbahnplanung`, { validateStatus: st => st === 200 || st === 404 })
          const hatFachwahlen = koopLaufbahn.status === 200 && (koopLaufbahn.data.fachbelegungen as Roh[]).some(fb => fb.abiturFach || (fb.belegungen as (Roh | null)[]).some(x => x !== null))
          if (hatFachwahlen) {
            protokoll.add('aktualisiert', 'Schüler', `${name}: Stammdaten`)
          } else {
            const n = await uebertrageFachwahlen(q.client, s.id, koop, vorhandeneId, s.jahrgang, abschnitt.abschnitt, quellFaecher, koopFaecher, protokoll, name)
            protokoll.add('aktualisiert', 'Schüler', `${name}: Stammdaten, ${n} Fachwahlen nachgeholt`)
          }
          return
        }
        const klasse = koopKlasse(s.jahrgang, quellKlassen.get(s.idKlasse) ?? '')
        const neu = (await koop.post('/schueler/create', {
          nachname: stammdaten.nachname, vorname: stammdaten.vorname, alleVornamen: stammdaten.alleVornamen,
          geschlecht: stammdaten.geschlecht, geburtsdatum: stammdaten.geburtsdatum, status: stammdaten.status,
          anmeldedatum: stammdaten.anmeldedatum, aufnahmedatum: stammdaten.aufnahmedatum,
          idSchuljahresabschnitt: abschnitt.id, idJahrgang: koopJahrgaenge.get(s.jahrgang), idKlasse: koopKlassen.get(klasse) ?? null,
        })).data
        const id = neu.id as number
        await koop.patch(`/schueler/${id}/stammdaten`, patch)

        // Einzelne Einträge, die der Server ablehnt (z. B. nicht mehr zulässige Sprachkürzel), brechen den Schüler nicht ab
        const versuche = async (was: string, aktion: () => Promise<unknown>) => {
          try {
            await aktion()
          } catch (x) {
            protokoll.add('hinweis', 'Schüler', `${name}: ${was} nicht übernommen (${fehlertext(x)})`)
          }
        }
        for (const gruppe of gruppiereErzieher(await get<(Roh & { id: number })[]>(q.client, `/schueler/${s.id}/erzieher`))) {
          await versuche(`Erzieher ${gruppe[0].nachname ?? ''}`, async () => {
            const erster = (await koop.post(`/schueler/erzieher/new/${id}/1`, bereiteErzieherVor(gruppe[0], kataloge))).data
            if (gruppe[1]) await koop.patch(`/erzieher/${erster.id}/stammdaten/2`, bereiteErzieherVor(gruppe[1], kataloge))
          })
        }
        for (const t of await get<Roh[]>(q.client, `/schueler/${s.id}/telefone`)) {
          await versuche(`Telefonnummer ${t.telefonnummer ?? ''}`, () => koop.post(`/schueler/${id}/telefon`, bereiteTelefonVor(t, kataloge)))
        }
        for (const b of await get<Roh[]>(q.client, `/schueler/${s.id}/sprachen/belegungen`)) {
          const { id: _id, ...daten } = b
          await versuche(`Sprachbelegung ${b.sprache}`, () => koop.post(`/schueler/${id}/sprachen/belegungen`, daten))
        }
        for (const p of await get<Roh[]>(q.client, `/schueler/${s.id}/sprachen/pruefungen`)) {
          // ersetzteSprache liefert der Server beim Lesen, kennt es beim Anlegen aber nicht (ADR 003)
          const { id: _id, ersetzteSprache: _e, ...daten } = p
          await versuche(`Sprachprüfung ${p.sprache}`, () => koop.post(`/schueler/${id}/sprachen/pruefungen`, daten))
        }

        const fachwahlen = await uebertrageFachwahlen(q.client, s.id, koop, id, s.jahrgang, abschnitt.abschnitt, quellFaecher, koopFaecher, protokoll, name)
        vorhanden.set(`${q.info.koopSchulNr}|${s.id}`, id)
        protokoll.add('neu', 'Schüler', `${name}: ${fachwahlen} Fachwahlen`)
      } catch (x) {
        protokoll.add('fehler', 'Schüler', `${name}: ${fehlertext(x)}`)
      }
    })
  }
  fortschritt('fertig')
  return protokoll
}
