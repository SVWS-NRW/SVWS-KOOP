import type { AxiosInstance } from 'axios'
import type { QuellInfo } from '@/models/Quelle'
import { erzeugeSchemaClient, type Zugang } from '@/services/apiClient'
import { ladeKonfiguration, ladeSchulstammdaten, setzeKonfiguration } from '@/services/svwsService'
import { KONFIG_STAND } from '@/services/verteilenService'
import {
  alsFachwahlEintraege, ladePruefsummen, leseFachwahlen, type Fortschritt, type GeleseneFachwahl,
} from '@/services/uebernahmeService'
import { erstesHalbjahr, fachwahlPruefsumme, Protokoll, type Fachwahl } from '@/koop/uebernahme'
import {
  abschnittZumHalbjahr, bestimmeKursort, blockungsKursName, HALBJAHR_JAHRGANG, hatNote, konfigVermerk, KONFIG_LETZTE_RUECKSPIELUNG,
  lehrkraefteInSchule, mischeFachwahl, pruefeStand, type Kursort, type LetzteRueckspielung, type Vermerk,
} from '@/koop/rueckspielung'
import { HALBJAHR_TITEL } from '@/koop/uebersicht'
import { istTestdatenSchulNr } from '@/koop/einrichtung'

// Rückspielung aus der KOOP-DB in die Datenbank einer Stammschule (ADR 002, A16–A20; ADR 004).
// ladeVorschau liest nur, spieleZurueck schreibt nach Bestätigung.

type Roh = Record<string, any>

/** Schlüssel der Verbindung zur Datenbank der Schule */
export const SCHULE = 'schule'

const PARALLEL = 4

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

async function getOderLeer<T>(c: AxiosInstance, pfad: string, leer: T): Promise<T> {
  const r = await c.get(pfad, { validateStatus: st => st === 200 || st === 404 })
  return r.status === 200 ? r.data as T : leer
}

function ladeJson<T>(wert: string | null): T | null {
  return wert ? JSON.parse(wert) as T : null
}

// ── Anmeldung an der Schule (ADR 004, Abschnitt 2) ───────────────────────────

export interface SchulAnmeldung {
  schema: string
  schulNr: number
  schulname: string
  /** Quellschulen mit dieser Schulnummer, bei Testdaten (123456) auch mehrere */
  passend: QuellInfo[]
}

/** Meldet sich an der Datenbank der Schule an und ermittelt, welche Quellschule sie ist */
export async function meldeSchuleAn(zugang: Zugang, schema: string, quellen: QuellInfo[]): Promise<SchulAnmeldung> {
  const client = erzeugeSchemaClient(SCHULE, zugang, schema)
  const st = await ladeSchulstammdaten(client)
  return { schema, schulNr: st.schulNr, schulname: st.bezeichnung1, passend: quellen.filter(q => q.schulNr === st.schulNr) }
}

// ── Vorschau ─────────────────────────────────────────────────────────────────

/** Meldung der Vorschau, lange Listen stehen in `details` */
export interface Meldung {
  text: string
  details?: string[]
}

export interface Meldungen {
  fehler: Meldung[]
  warnungen: Meldung[]
  hinweise: Meldung[]
}

function mld(text: string, details?: string[]): Meldung {
  return details && details.length > 0 ? { text, details } : { text }
}

function meldungen(): Meldungen {
  return { fehler: [], warnungen: [], hinweise: [] }
}

export interface KursPlan {
  koopId: number
  kuerzel: string
  daten: Roh
  /** Kürzel der Haupt- und weiteren Lehrkräfte in der KOOP-DB */
  koopLehrer: string | null
  koopWeitere: { kuerzel: string, wochenstunden: number }[]
  lehrerKuerzel: string[]
  ort: Kursort
  /** Fach in der Schule, null wenn das Kürzel dort fehlt */
  idFachSchule: number | null
  eigeneSchueler: number
  /** Kurszuordnungen, die geschrieben werden. Ohne Zuordnung wird der Kurs nicht angelegt. */
  zuordnungen: number
  /** Grund, warum der Kurs nicht angelegt wird (Konflikt mit einem Kurs der Schule) */
  konflikt: string | null
}

export interface Leistung {
  koopKursId: number
  idFachSchule: number
  kursart: string | null
  wochenstunden: number
  abifach: number | null
}

export interface SchuelerPlan {
  koopId: number
  schuleId: number
  name: string
  idLernabschnitt: number | null
  leistungen: Leistung[]
}

export interface HalbjahrTeil {
  halbjahr: number
  blockung: { id: number, name: string }
  idAbschnittSchule: number | null
  idJahrgangSchule: number | null
  vermerk: Vermerk | null
  eigeneBlockungen: { id: number, name: string, istAktiv: boolean }[]
  kurse: KursPlan[]
  schueler: SchuelerPlan[]
  meldungen: Meldungen
}

export interface FachwahlPlan {
  schuleId: number
  name: string
  aenderungen: { idFachSchule: number, kuerzel: string, halbjahre: (string | null)[], abiturFach: number | null }[]
  /** Die Fachwahlen wurden seit der Übernahme in der Stammschule geändert (Prüfsumme) */
  inStammschuleGeaendert: boolean
}

export interface JahrgangsPlan {
  abiturjahr: number
  jahrgang: string
  schueler: number
  teile: HalbjahrTeil[]
  fachwahlen: FachwahlPlan[]
  meldungen: Meldungen
}

export interface PlatzhalterPlan {
  nr: number
  /**
   * Schulnummer der Partnerschule, unter der sie im Schulkatalog steht und in koopSchule eingetragen wird: die Schulnummer
   * in der KOOP-DB (koopSchulNr), bei Testdaten eine Ersatznummer statt 123456 (ADR 003, „Testdaten“)
   */
  schulNr: number
  kuerzel: string | null
  name: string
  /** vorhandener Platzhalter in der Schule */
  id: number | null
  problem: string | null
}

export interface Vorschau {
  quelle: QuellInfo
  koopSchema: string
  /** Lehrkräfte der Schule: Kürzel → ID (ohne Platzhalter) */
  schulLehrer: Map<string, number>
  koopStand: string | null
  letzte: LetzteRueckspielung | null
  platzhalter: PlatzhalterPlan[]
  jahrgaenge: JahrgangsPlan[]
  meldungen: Meldungen
}

interface EigenerSchueler {
  koopId: number
  schuleId: number
  name: string
  jahrgang: string
}

/** Schulnummer der KOOP-DB-Schüler dieser Quellschule (Merkmal Stammschule) */
function gehoertZu(s: Roh, quelle: QuellInfo): boolean {
  return s.externeSchulNr === String(quelle.koopSchulNr)
}

/**
 * Liest KOOP-DB und Datenbank der Schule und plant die Rückspielung je Abiturjahrgang und Halbjahr (ADR 004, Abschnitt 11).
 * Schreibt nichts.
 */
export async function ladeVorschau(
  koop: AxiosInstance, schule: AxiosInstance, quelle: QuellInfo, quellen: QuellInfo[], koopSchema: string, fortschritt: Fortschritt,
): Promise<Vorschau> {
  fortschritt('Grunddaten laden')
  const global = meldungen()
  const [koopSt, schuleSt, koopStand, letzteWert] = await Promise.all([
    get(koop, '/schule/stammdaten'), get(schule, '/schule/stammdaten'),
    ladeKonfiguration(koop, KONFIG_STAND), ladeKonfiguration(schule, KONFIG_LETZTE_RUECKSPIELUNG),
  ])
  const letzte = ladeJson<LetzteRueckspielung>(letzteWert)
  const stand = pruefeStand(koopStand, letzte)
  if (stand === 'ohneStand') global.hinweise.push(mld('Die KOOP-DB wurde nicht über „Verteilen“ erstellt. Ob das Backup aktuell ist, kann nicht geprüft werden.'))
  if (stand === 'veraltet') global.warnungen.push(mld(`Das eingespielte KOOP-Backup (Stand ${new Date(koopStand!).toLocaleString('de-DE')}) ist nicht neuer als das der letzten Rückspielung (Stand ${new Date(letzte!.stand!).toLocaleString('de-DE')}).`))

  if (quellen.some(q => istTestdatenSchulNr(q.schulNr))) {
    global.hinweise.push(mld('Testdaten: Die Schulen werden über ihre Schulnummern in der KOOP-DB erkannt. Im Schulkatalog der Schule müssen die '
      + 'Partnerschulen unter diesen Nummern mit Kürzel stehen.', quellen.filter(q => q.nr !== quelle.nr).map(q => `Schule ${q.nr} (${q.schema}): ${q.koopSchulNr}`)))
  }

  const koopAbschnitt = (koopSt.abschnitte as Roh[]).find(a => a.id === koopSt.idSchuljahresabschnitt)!
  const abschnittId = (abschnitte: Roh[], schuljahr: number, abschnitt: number): number | null =>
    abschnitte.find(a => a.schuljahr === schuljahr && a.abschnitt === abschnitt)?.id ?? null

  const [koopFaecherListe, schuleFaecherListe, koopLehrerListe, schuleLehrerListe, katalog, koopJahrgaenge, schuleJahrgaenge, abiturjahrgaenge, pruefsummen] = await Promise.all([
    get<Roh[]>(koop, '/faecher/'), get<Roh[]>(schule, '/faecher/'), get<Roh[]>(koop, '/lehrer/'), get<Roh[]>(schule, '/lehrer/'),
    get<Roh[]>(schule, '/schule/schulen'), get<Roh[]>(koop, '/jahrgaenge/'), get<Roh[]>(schule, '/jahrgaenge/'),
    get<Roh[]>(koop, '/gost/abiturjahrgaenge'), ladePruefsummen(koop, quelle.koopSchulNr),
  ])
  const koopFaecher = new Map(koopFaecherListe.map(f => [f.id as number, f.kuerzel as string]))
  const schuleFaecherNachId = new Map(schuleFaecherListe.map(f => [f.id as number, f.kuerzel as string]))
  const schuleFaecher = new Map(schuleFaecherListe.map(f => [f.kuerzel as string, f.id as number]))
  const koopLehrer = new Map(koopLehrerListe.map(l => [l.id as number, l.kuerzel as string]))
  const schulLehrer = new Map(schuleLehrerListe.filter(l => l.istRelevantFuerStatistik !== false).map(l => [l.kuerzel as string, l.id as number]))
  const koopJahrgangId = new Map(koopJahrgaenge.map(j => [j.kuerzel as string, j.id as number]))
  const schuleJahrgangId = new Map(schuleJahrgaenge.map(j => [j.kuerzel as string, j.id as number]))

  // Platzhalter je Partnerschule: Kürzel aus dem Schulkatalog der Schule (ADR 002, „Lehrkraft der Partnerschule“)
  const platzhalter: PlatzhalterPlan[] = quellen.filter(q => q.nr !== quelle.nr).map(q => {
    const eintrag = katalog.find(e => e.schulnummerStatistik === String(q.koopSchulNr))
    const kuerzel = (eintrag?.kuerzel as string | null) ?? null
    const vorhanden = kuerzel ? schuleLehrerListe.find(l => l.kuerzel === kuerzel) : undefined
    let problem: string | null = null
    if (!eintrag) problem = `Die Partnerschule ${q.koopSchulNr} fehlt im Schulkatalog der Schule.`
    else if (!kuerzel) problem = `Die Partnerschule ${q.koopSchulNr} hat im Schulkatalog der Schule kein Kürzel.`
    else if (vorhanden && vorhanden.istRelevantFuerStatistik) problem = `Das Kürzel „${kuerzel}“ der Partnerschule ${q.koopSchulNr} gehört in der Schule zu einer echten Lehrkraft.`
    return {
      nr: q.nr, schulNr: q.koopSchulNr, kuerzel, name: (eintrag?.name as string | undefined) ?? q.schulname,
      id: vorhanden && !vorhanden.istRelevantFuerStatistik ? vorhanden.id as number : null, problem,
    }
  })

  // Eigene Schüler in der KOOP-DB je Abiturjahrgang, mit ID in der Schule (Merkmal Stammschule)
  fortschritt('Schüler zuordnen')
  const jahrgaenge = abiturjahrgaenge.filter(a => a.abiturjahr > 0 && a.jahrgang).sort((x, y) => x.abiturjahr - y.abiturjahr)
  const eigene = new Map<number, EigenerSchueler[]>()
  const alleEigenen: Roh[] = []
  for (const a of jahrgaenge) {
    const liste = (await get<Roh[]>(koop, `/gost/abiturjahrgang/${a.abiturjahr}/schueler`)).filter(s => gehoertZu(s, quelle))
    alleEigenen.push(...liste.map(s => ({ ...s, abiturjahr: a.abiturjahr })))
  }
  const koopStamm = new Map<number, Roh>()
  for (let i = 0; i < alleEigenen.length; i += 200) {
    for (const s of await (await koop.post('/schueler/stammdaten', alleEigenen.slice(i, i + 200).map(s => s.id))).data as Roh[]) koopStamm.set(s.id, s)
  }
  const schuleStamm = new Map<number, Roh>()
  const schuleIds = [...koopStamm.values()].map(s => Number(s.idSchuelerausweis)).filter(id => Number.isInteger(id) && id > 0)
  for (let i = 0; i < schuleIds.length; i += 200) {
    for (const s of await (await schule.post('/schueler/stammdaten', schuleIds.slice(i, i + 200))).data as Roh[]) schuleStamm.set(s.id, s)
  }

  const plaene: JahrgangsPlan[] = []
  const kurseNachAbschnitt = new Map<string, Roh[]>()
  const ladeKurse = async (c: AxiosInstance, art: string, idAbschnitt: number) => {
    const key = `${art}|${idAbschnitt}`
    if (!kurseNachAbschnitt.has(key)) kurseNachAbschnitt.set(key, await get<Roh[]>(c, `/kurse/abschnitt/${idAbschnitt}`))
    return kurseNachAbschnitt.get(key)!
  }

  for (const a of jahrgaenge) {
    const plan: JahrgangsPlan = { abiturjahr: a.abiturjahr, jahrgang: a.jahrgang, schueler: 0, teile: [], fachwahlen: [], meldungen: meldungen() }
    plaene.push(plan)
    const liste: EigenerSchueler[] = []
    const nichtGefunden: string[] = []
    for (const s of alleEigenen.filter(x => x.abiturjahr === a.abiturjahr)) {
      const k = koopStamm.get(s.id)
      const name = `${s.nachname}, ${s.vorname}`
      const schuleId = Number(k?.idSchuelerausweis)
      const gefunden = schuleStamm.get(schuleId)
      if (!gefunden) { nichtGefunden.push(`${name} (ID ${k?.idSchuelerausweis ?? '–'})`); continue }
      if (gefunden.nachname !== k!.nachname || gefunden.geburtsdatum !== k!.geburtsdatum) {
        plan.meldungen.warnungen.push(mld(`${name} wird übersprungen: Die ID ${schuleId} gehört in der Schule zu ${gefunden.nachname}, ${gefunden.vorname} (${gefunden.geburtsdatum}).`))
        continue
      }
      liste.push({ koopId: s.id, schuleId, name, jahrgang: s.jahrgang })
    }
    if (nichtGefunden.length > 0) plan.meldungen.hinweise.push(mld(`${nichtGefunden.length} Schüler wurden in der Datenbank der Schule nicht gefunden und werden übersprungen.`, nichtGefunden))
    eigene.set(a.abiturjahr, liste)
    plan.schueler = liste.length

    // Fachwahlen (ADR 004, Abschnitt 9)
    let ohnePruefsumme = 0
    const fehlendeFaecher = new Set<string>()
    await parallel(liste, PARALLEL * 2, async (s, i) => {
      fortschritt(`${a.jahrgang}: Fachwahlen ${s.name}`, i + 1, liste.length)
      const [koopFw, schuleFw] = await Promise.all([
        leseFachwahlen(koop, s.koopId, koopFaecher), leseFachwahlen(schule, s.schuleId, schuleFaecherNachId),
      ])
      const gespeichert = pruefsummen[String(s.schuleId)]
      const ab = gespeichert?.ab ?? erstesHalbjahr(s.jahrgang, koopAbschnitt.abschnitt)
      if (!gespeichert) ohnePruefsumme++
      const geaendert = !!gespeichert && fachwahlPruefsumme(alsFachwahlEintraege(schuleFw), gespeichert.ab) !== gespeichert.p
      const koopNach = new Map(koopFw.map(f => [f.kuerzel, f.wahl]))
      const schuleNach = new Map<string, GeleseneFachwahl>(schuleFw.map(f => [f.kuerzel, f]))
      const aenderungen: FachwahlPlan['aenderungen'] = []
      for (const kuerzel of new Set([...koopNach.keys(), ...schuleNach.keys()])) {
        const neu = mischeFachwahl(schuleNach.get(kuerzel)?.wahl ?? null, (koopNach.get(kuerzel) as Fachwahl | undefined) ?? null, ab)
        if (!neu) continue
        const idFachSchule = schuleNach.get(kuerzel)?.fachID ?? schuleFaecher.get(kuerzel)
        if (idFachSchule === undefined) { fehlendeFaecher.add(kuerzel); continue }
        aenderungen.push({ idFachSchule, kuerzel, ...neu })
      }
      if (aenderungen.length > 0 || geaendert) plan.fachwahlen.push({ schuleId: s.schuleId, name: s.name, aenderungen, inStammschuleGeaendert: geaendert })
    })
    plan.fachwahlen.sort((x, y) => x.name.localeCompare(y.name))
    if (fehlendeFaecher.size > 0) plan.meldungen.hinweise.push(mld(`Fächer der KOOP-DB fehlen in der Schule, ihre Fachwahlen werden nicht zurückgespielt: ${[...fehlendeFaecher].join(', ')}.`))
    if (ohnePruefsumme > 0) plan.meldungen.hinweise.push(mld(`Für ${ohnePruefsumme} Schüler gibt es keine Prüfsumme aus der Übernahme. Ob ihre Fachwahlen in der Schule geändert wurden, kann nicht geprüft werden.`))
    const geaendert = plan.fachwahlen.filter(f => f.inStammschuleGeaendert)
    if (geaendert.length > 0) {
      plan.meldungen.warnungen.push(mld(`Bei ${geaendert.length} Schülern wurden die Fachwahlen seit der Übernahme in der Schule geändert. `
        + 'Sie werden nur überschrieben, wenn das ausdrücklich bestätigt wird.', geaendert.map(f => f.name)))
    }

    // Halbjahre mit aktivierter Blockung (ADR 004, Abschnitte 3–8)
    for (let hj = 0; hj < 6; hj++) {
      const blockungen = await getOderLeer<Roh[]>(koop, `/gost/abiturjahrgang/${a.abiturjahr}/${hj}/blockungen`, [])
      const aktiv = blockungen.find(b => b.istAktiv)
      if (!aktiv) continue
      fortschritt(`${a.jahrgang}: ${HALBJAHR_TITEL[hj]} planen`)
      plan.teile.push(await planeHalbjahr(hj, aktiv))
    }
    if (plan.teile.length === 0) {
      plan.meldungen.hinweise.push(mld(a.jahrgang === '10'
        ? 'Kurse und Leistungsdaten der 10 werden erst nach dem Schuljahreswechsel zurückgespielt. Die Fachwahlen können schon jetzt zurückgespielt werden.'
        : 'In der KOOP-DB ist für diesen Abiturjahrgang keine Blockung aktiviert. Es werden nur Fachwahlen zurückgespielt.'))
    }

    async function planeHalbjahr(hj: number, blockung: Roh): Promise<HalbjahrTeil> {
      const m = meldungen()
      const titel = HALBJAHR_TITEL[hj]
      const { schuljahr, abschnitt } = abschnittZumHalbjahr(a.abiturjahr, hj)
      const idAbschnittKoop = abschnittId(koopSt.abschnitte, schuljahr, abschnitt)
      const idAbschnittSchule = abschnittId(schuleSt.abschnitte, schuljahr, abschnitt)
      const jgKuerzel = HALBJAHR_JAHRGANG[hj]
      const idJahrgangSchule = schuleJahrgangId.get(jgKuerzel) ?? null
      const vermerk = ladeJson<Vermerk>(await ladeKonfiguration(schule, konfigVermerk(a.abiturjahr, hj)))
      const eigeneBlockungen = (await getOderLeer<Roh[]>(schule, `/gost/abiturjahrgang/${a.abiturjahr}/${hj}/blockungen`, []))
        .filter(b => b.id !== vermerk?.blockung).map(b => ({ id: b.id as number, name: b.name as string, istAktiv: !!b.istAktiv }))
      const teil: HalbjahrTeil = {
        halbjahr: hj, blockung: { id: blockung.id, name: blockung.name }, idAbschnittSchule, idJahrgangSchule, vermerk, eigeneBlockungen,
        kurse: [], schueler: [], meldungen: m,
      }
      if (idAbschnittKoop === null) { m.fehler.push(mld(`Der Abschnitt ${schuljahr}/${abschnitt} fehlt in der KOOP-DB.`)); return teil }
      if (idAbschnittSchule === null) {
        m.fehler.push(mld(`Der Abschnitt ${schuljahr}/${(schuljahr + 1) % 100}, ${abschnitt}. Halbjahr fehlt in der Schule. Kurse und Leistungsdaten für ${titel} können erst nach dem Schuljahreswechsel zurückgespielt werden.`))
        return teil
      }
      if (idJahrgangSchule === null) { m.fehler.push(mld(`Der Jahrgang ${jgKuerzel} fehlt in der Schule.`)); return teil }
      if (eigeneBlockungen.length > 0) {
        const aktiviert = eigeneBlockungen.some(b => b.istAktiv)
        m.warnungen.push(mld(`ACHTUNG: Die Schule hat für ${titel} ${aktiviert ? 'eine AKTIVIERTE und ' : ''}eigene Blockungen. Schulen in einer Kooperation sollen nicht zusätzlich in ihrer eigenen Datenbank blocken. `
          + 'Eigene Kurse und Leistungsdaten der Schule bleiben unverändert, es wird keine Blockung aus den KOOP-Kursen erstellt.',
        eigeneBlockungen.map(b => `${b.name}${b.istAktiv ? ' (aktiviert)' : ''}`)))
      }

      // Kurse der KOOP-DB in diesem Halbjahr
      const idJahrgangKoop = koopJahrgangId.get(jgKuerzel)
      const koopKurse = (await ladeKurse(koop, 'koop', idAbschnittKoop)).filter(k => (k.idJahrgaenge as number[]).includes(idJahrgangKoop!))
      const eigeneIds = new Set((eigene.get(a.abiturjahr) ?? []).map(s => s.koopId))
      const schulKurse = (await ladeKurse(schule, 'schule', idAbschnittSchule))
        .filter(k => (k.idJahrgaenge as number[]).includes(idJahrgangSchule) && !(vermerk?.kurse ?? []).includes(k.id))
      for (const k of koopKurse) {
        const eigeneSchueler = (k.schueler as Roh[]).filter(s => eigeneIds.has(s.id)).length
        if (eigeneSchueler === 0) continue
        // weitereLehrer enthält KursLehrer-Objekte (idLehrer, wochenstundenLehrer)
        const haupt = k.lehrer != null ? (koopLehrer.get(k.lehrer) ?? `#${k.lehrer}`) : null
        const weitere = ((k.weitereLehrer ?? []) as Roh[]).map(w => ({ kuerzel: koopLehrer.get(w.idLehrer) ?? `#${w.idLehrer}`, wochenstunden: w.wochenstundenLehrer ?? 0 }))
        const lehrerKuerzel = [...(haupt ? [haupt] : []), ...weitere.map(w => w.kuerzel)]
        const fachKuerzel = koopFaecher.get(k.idFach) ?? `#${k.idFach}`
        const idFachSchule = schuleFaecher.get(fachKuerzel) ?? null
        const kollision = schulKurse.find(sk => sk.kuerzel === k.kuerzel)
        teil.kurse.push({
          koopId: k.id, kuerzel: k.kuerzel, daten: k, koopLehrer: haupt, koopWeitere: weitere, lehrerKuerzel, ort: bestimmeKursort(lehrerKuerzel), idFachSchule, eigeneSchueler, zuordnungen: 0,
          konflikt: kollision ? `Die Schule hat bereits einen eigenen Kurs „${k.kuerzel}“.` : null,
        })
        if (idFachSchule === null) m.fehler.push(mld(`Kurs ${k.kuerzel}: Das Fach ${fachKuerzel} fehlt in der Schule.`))
      }
      teil.kurse.sort((x, y) => x.kuerzel.localeCompare(y.kuerzel))
      if (schulKurse.length > 0) m.hinweise.push(mld(`Die Schule hat ${schulKurse.length} eigene Kurse in ${titel}. Sie bleiben unverändert.`))
      const kollisionen = teil.kurse.filter(k => k.konflikt)
      if (kollisionen.length > 0) {
        m.warnungen.push(mld(`${kollisionen.length} Kurse werden nicht angelegt, weil die Schule eigene Kurse mit demselben Kürzel hat. Die Schule kann ihre Kurse umbenennen.`,
          kollisionen.map(k => k.kuerzel)))
      }
      // Abweichende Lehrkräfte zwischen Blockung und Kursen (ADR 004, Abschnitt 3)
      const bl = await get(koop, `/gost/blockungen/${blockung.id}`)
      const blockungsLehrer = new Map((bl.kurse as Roh[]).map(bk => [
        blockungsKursName(koopFaecher.get(bk.fach_id) ?? '', bk.kursart, bk.nummer, bk.suffix),
        ((bk.lehrer ?? []) as Roh[]).map(l => l.kuerzel as string).sort().join(','),
      ]))
      const abweichend = teil.kurse.filter(k => blockungsLehrer.has(k.kuerzel) && blockungsLehrer.get(k.kuerzel) !== [...k.lehrerKuerzel].sort().join(','))
      if (abweichend.length > 0) {
        m.warnungen.push(mld(`Bei ${abweichend.length} Kursen weichen die Lehrkräfte der Blockung von den aktivierten Kursen ab. `
          + 'Zurückgespielt werden die Lehrkräfte der Kurse. Sollen die der Blockung gelten, die Blockung in der KOOP-DB erneut aktivieren.',
        abweichend.map(k => `${k.kuerzel}: Kurs ${k.lehrerKuerzel.join(', ') || '–'}, Blockung ${blockungsLehrer.get(k.kuerzel) || '–'}`)))
      }

      // Schüler: Leistungsdaten der KOOP-DB und Lernabschnitt in der Schule
      const kursIds = new Map(teil.kurse.map(k => [k.koopId, k]))
      let mitNoten = 0
      const konflikte: string[] = []
      const ohneLernabschnitt: string[] = []
      await parallel(eigene.get(a.abiturjahr) ?? [], PARALLEL * 2, async (s, i) => {
        fortschritt(`${a.jahrgang} ${titel}: ${s.name}`, i + 1, eigene.get(a.abiturjahr)!.length)
        const [koopLa, schuleLa] = await Promise.all([
          get<Roh[]>(koop, `/schueler/lernabschnittsdaten/${s.koopId}/${idAbschnittKoop}`),
          get<Roh[]>(schule, `/schueler/lernabschnittsdaten/${s.schuleId}/${idAbschnittSchule}`),
        ])
        const koopLeistungen = ((koopLa.find(l => l.wechselNr === 0) ?? koopLa[0])?.leistungsdaten ?? []) as Roh[]
        const schulAbschnitt = schuleLa.find(l => l.wechselNr === 0) ?? schuleLa[0]
        const schulLeistungen = (schulAbschnitt?.leistungsdaten ?? []) as Roh[]
        const vermerkt = new Set(vermerk?.leistungsdaten ?? [])
        if (schulLeistungen.some(l => vermerkt.has(l.id) && (hatNote(l.note) || hatNote(l.noteQuartal)))) mitNoten++
        const eigeneFaecher = new Set(schulLeistungen.filter(l => !vermerkt.has(l.id)).map(l => l.fachID as number))
        const leistungen: Leistung[] = []
        for (const l of koopLeistungen) {
          const kurs = kursIds.get(l.kursID)
          // Kurse mit Konflikt werden nicht angelegt, ihre Zuordnungen meldet bereits die Warnung zu den Kursen
          if (!kurs || kurs.idFachSchule === null || kurs.konflikt) continue
          if (eigeneFaecher.has(kurs.idFachSchule)) { konflikte.push(`${s.name} (${koopFaecher.get(l.fachID)})`); continue }
          leistungen.push({ koopKursId: kurs.koopId, idFachSchule: kurs.idFachSchule, kursart: l.kursart ?? null, wochenstunden: l.wochenstunden ?? 0, abifach: l.abifach ?? null })
        }
        if (leistungen.length === 0) return
        if (!schulAbschnitt) ohneLernabschnitt.push(s.name)
        teil.schueler.push({ koopId: s.koopId, schuleId: s.schuleId, name: s.name, idLernabschnitt: schulAbschnitt?.id ?? null, leistungen })
      })
      teil.schueler.sort((x, y) => x.name.localeCompare(y.name))
      for (const s of teil.schueler.filter(x => x.idLernabschnitt !== null)) {
        for (const l of s.leistungen) kursIds.get(l.koopKursId)!.zuordnungen++
      }
      const leer = teil.kurse.filter(k => !k.konflikt && k.zuordnungen === 0)
      if (leer.length > 0) {
        m.hinweise.push(mld(`${leer.length} Kurse werden nicht angelegt, weil für keinen eigenen Schüler eine Kurszuordnung geschrieben wird.`, leer.map(k => k.kuerzel)))
      }
      for (const p of platzhalter) {
        if (p.problem && teil.kurse.some(k => wirdAngelegt(k) && k.ort.art === 'schule' && k.ort.nr === p.nr)) m.fehler.push(mld(p.problem))
      }
      const fehlend = new Set<string>()
      for (const k of teil.kurse.filter(wirdAngelegt)) {
        if (k.ort.art === 'schule' && k.ort.nr === quelle.nr) {
          lehrkraefteInSchule(k.koopLehrer, k.koopWeitere.map(w => w.kuerzel), quelle.nr, quelle.nr, schulLehrer, new Map()).fehlend.forEach(f => fehlend.add(f))
        }
      }
      if (fehlend.size > 0) m.hinweise.push(mld('Lehrkräfte der eigenen Schule wurden nicht gefunden, ihre Kurse bleiben ohne Lehrkraft.', [...fehlend].sort()))
      if (teil.kurse.some(k => wirdAngelegt(k) && k.ort.art === 'schule' && k.ort.nr !== quelle.nr)) {
        m.hinweise.push(mld('Die Schulnummer der Partnerschule kann wegen eines Fehlers im SVWS-Server noch nicht am Kurs eingetragen werden. Sie steht in den Leistungsdaten (koopSchule).'))
      }

      const unklar = teil.kurse.filter(k => k.ort.art === 'unklar' && wirdAngelegt(k))
      if (unklar.length > 0) m.hinweise.push(mld(`${unklar.length} Kurse ohne eindeutige Lehrkraft: Bitte unten die Schule wählen, an der sie stattfinden.`))
      if (ohneLernabschnitt.length > 0) {
        m.hinweise.push(mld(`${ohneLernabschnitt.length} Schüler haben in der Schule keinen Lernabschnitt in ${titel} und werden übersprungen.`, ohneLernabschnitt.sort()))
      }
      if (mitNoten > 0) m.fehler.push(mld(`In den Leistungsdaten der letzten Rückspielung sind bei ${mitNoten} Schülern Noten eingetragen. ${titel} kann nicht erneut zurückgespielt werden.`))
      if (konflikte.length > 0) {
        m.warnungen.push(mld(`${konflikte.length} Kurszuordnungen werden nicht geschrieben, weil die Schüler in der Schule schon eigene Leistungsdaten in diesem Fach haben.`,
          konflikte.sort()))
      }
      if (hatVermerkteDaten(vermerk)) {
        m.hinweise.push(mld(`Die Rückspielung vom ${new Date(vermerk!.zeitpunkt).toLocaleString('de-DE')} wird ersetzt: ${vermerk!.kurse.length} Kurse, ${vermerk!.leistungsdaten.length} Leistungsdaten`
          + `${vermerk!.blockung !== null ? ', die daraus erstellte Blockung' : ''}.`))
      }
      return teil
    }
  }

  fortschritt('fertig')
  return { quelle, koopSchema, schulLehrer, koopStand, letzte, platzhalter, jahrgaenge: plaene, meldungen: global }
}

// ── Zurückspielen (ADR 004, Abschnitt 10) ────────────────────────────────────

export interface Auswahl {
  /** Abiturjahrgänge, die zurückgespielt werden */
  jahrgaenge: Set<number>
  /** Gewählte Schule (Nummer) für Kurse ohne eindeutige Lehrkraft, je ID des Kurses in der KOOP-DB. Fehlt = nicht übertragen. */
  kursOrte: Map<number, number>
  /** Abiturjahrgänge, in denen in der Schule geänderte Fachwahlen überschrieben werden dürfen */
  fachwahlenUeberschreiben: Set<number>
}

/** Schule, an der ein Kurs stattfindet, oder null, solange sie nicht gewählt ist */
export function kursortNr(k: KursPlan, auswahl: Auswahl): number | null {
  return k.ort.art === 'schule' ? k.ort.nr : (auswahl.kursOrte.get(k.koopId) ?? null)
}

/** Wird ein Kurs in der Schule angelegt? Nicht bei Konflikt, fehlendem Fach oder ohne Kurszuordnungen. */
export function wirdAngelegt(k: KursPlan): boolean {
  return !k.konflikt && k.idFachSchule !== null && k.zuordnungen > 0
}

function hatVermerkteDaten(v: Vermerk | null): boolean {
  return !!v && (v.kurse.length > 0 || v.leistungsdaten.length > 0 || v.blockung !== null)
}

/** Kann ein Halbjahr geschrieben werden? Nicht bei Fehlern in diesem Halbjahr. */
export function istSchreibbar(t: HalbjahrTeil): boolean {
  return t.meldungen.fehler.length === 0
}

/**
 * Schreibt die Rückspielung in die Datenbank der Schule. Je Abiturjahrgang: Fachwahlen, danach je Halbjahr mit aktivierter
 * Blockung die Daten der früheren Rückspielung entfernen, Kurse und Leistungsdaten anlegen, `restore`. Was angelegt wird,
 * vermerkt SVWS-KOOP laufend in der Schule (ADR 004, Abschnitt 5).
 */
export async function spieleZurueck(schule: AxiosInstance, v: Vorschau, auswahl: Auswahl, fortschritt: Fortschritt): Promise<Protokoll> {
  const p = new Protokoll()
  const zeitpunkt = new Date().toISOString()
  const jahrgaenge = v.jahrgaenge.filter(j => auswahl.jahrgaenge.has(j.abiturjahr))
  const partnerSchulNr = new Map(v.platzhalter.map(x => [x.nr, x.schulNr]))
  const bereiche: string[] = []

  // 1. Platzhalter der Partnerschulen, die gebraucht werden
  const platzhalterIds = new Map<number, number>()
  const benoetigt = new Set<number>()
  for (const j of jahrgaenge) {
    for (const t of j.teile.filter(istSchreibbar)) {
      for (const k of t.kurse.filter(wirdAngelegt)) {
        const nr = kursortNr(k, auswahl)
        if (nr !== null && nr !== v.quelle.nr) benoetigt.add(nr)
      }
    }
  }
  for (const ph of v.platzhalter.filter(x => benoetigt.has(x.nr))) {
    if (ph.id !== null) { platzhalterIds.set(ph.nr, ph.id); continue }
    if (ph.problem || !ph.kuerzel) { p.add('fehler', 'Platzhalter', ph.problem ?? `Schule ${ph.nr}: kein Kürzel im Schulkatalog`); continue }
    try {
      fortschritt(`Platzhalter ${ph.kuerzel} anlegen`)
      const neu = (await schule.post('/lehrer/create', {
        kuerzel: ph.kuerzel, nachname: ph.name.trim().slice(0, 120), vorname: 'Kooperation', geschlecht: 6, personalTyp: 'EXTERN',
        istSichtbar: true, istRelevantFuerStatistik: false,
      })).data
      platzhalterIds.set(ph.nr, neu.id)
      p.add('neu', 'Platzhalter', `${ph.kuerzel} für ${ph.name}`)
    } catch (x) {
      p.add('fehler', 'Platzhalter', `${ph.kuerzel}: ${fehlertext(x)}`)
    }
  }

  for (const j of jahrgaenge) {
    // 2. Fachwahlen (ADR 004, Abschnitt 9), vor Kursen und Leistungsdaten
    const fachwahlen = j.fachwahlen.filter(f => f.aenderungen.length > 0)
    await parallel(fachwahlen, PARALLEL, async (f, i) => {
      fortschritt(`${j.jahrgang}: Fachwahlen ${f.name}`, i + 1, fachwahlen.length)
      if (f.inStammschuleGeaendert && !auswahl.fachwahlenUeberschreiben.has(j.abiturjahr)) {
        p.add('uebersprungen', 'Fachwahlen', `${f.name}: in der Schule geändert, nicht überschrieben`)
        return
      }
      let ok = 0
      for (const a of f.aenderungen) {
        try {
          await schule.patch(`/gost/schueler/${f.schuleId}/fachwahl/${a.idFachSchule}`, { halbjahre: a.halbjahre, abiturFach: a.abiturFach })
          ok++
        } catch (x) {
          p.add('fehler', 'Fachwahlen', `${f.name}, ${a.kuerzel}: ${fehlertext(x)}`)
        }
      }
      if (ok > 0) p.add('aktualisiert', 'Fachwahlen', `${f.name}: ${ok} Fächer (${f.aenderungen.map(a => a.kuerzel).join(', ')})`)
    })

    // 3. Halbjahre mit aktivierter Blockung
    for (const t of j.teile) {
      const titel = `${j.jahrgang} ${HALBJAHR_TITEL[t.halbjahr]}`
      if (!istSchreibbar(t)) { p.add('uebersprungen', titel, 'wegen Fehlern in der Vorschau nicht zurückgespielt'); continue }
      if (!hatVermerkteDaten(t.vermerk) && !t.kurse.some(wirdAngelegt)) { p.add('hinweis', titel, 'keine Kurse oder Kurszuordnungen zurückzuspielen'); continue }
      try {
        await spieleHalbjahr(j, t, titel)
        bereiche.push(`${j.abiturjahr}/${t.halbjahr}`)
      } catch (x) {
        p.add('fehler', titel, `abgebrochen: ${fehlertext(x)}`)
      }
    }
  }

  // 4. Letzte Rückspielung in der Schule (ADR 002, „Änderungen außerhalb der KOOP-DB“)
  if (jahrgaenge.length > 0) {
    const letzte: LetzteRueckspielung = { zeitpunkt, stand: v.koopStand, koopSchema: v.koopSchema, bereiche }
    try {
      await setzeKonfiguration(schule, KONFIG_LETZTE_RUECKSPIELUNG, JSON.stringify(letzte))
    } catch (x) {
      p.add('fehler', 'Abschluss', `letzteRueckspielung: ${fehlertext(x)}`)
    }
  }
  fortschritt('fertig')
  return p

  async function spieleHalbjahr(j: JahrgangsPlan, t: HalbjahrTeil, titel: string): Promise<void> {
    const schluessel = konfigVermerk(j.abiturjahr, t.halbjahr)
    const speichereVermerk = (vm: Vermerk) => setzeKonfiguration(schule, schluessel, JSON.stringify(vm))

    // a. Daten der früheren Rückspielung entfernen (nur was SVWS-KOOP selbst angelegt hat)
    if (t.vermerk && hatVermerkteDaten(t.vermerk)) {
      fortschritt(`${titel}: frühere Rückspielung entfernen`)
      if (t.vermerk.leistungsdaten.length > 0) await schule.delete('/schueler/leistungsdaten/delete/multiple', { data: t.vermerk.leistungsdaten })
      if (t.vermerk.kurse.length > 0) await schule.delete('/kurse/delete/multiple', { data: t.vermerk.kurse })
      if (t.vermerk.blockung !== null) await schule.delete(`/gost/blockungen/${t.vermerk.blockung}`, { validateStatus: st => st === 200 || st === 404 })
      p.add('entfernt', titel, `frühere Rückspielung: ${t.vermerk.kurse.length} Kurse, ${t.vermerk.leistungsdaten.length} Leistungsdaten${t.vermerk.blockung !== null ? ', Blockung' : ''}`)
    }
    const vermerk: Vermerk = { zeitpunkt, stand: v.koopStand, kurse: [], leistungsdaten: [], blockung: null }
    await speichereVermerk(vermerk)

    // b. Kurse
    const angelegt = new Map<number, { id: number, ortNr: number, lehrer: number | null }>()
    const kurse = t.kurse.filter(wirdAngelegt)
    await parallel(kurse, PARALLEL, async (k, i) => {
      fortschritt(`${titel}: Kurs ${k.kuerzel}`, i + 1, kurse.length)
      const ortNr = kursortNr(k, auswahl)
      if (ortNr === null) { p.add('uebersprungen', 'Kurse', `${titel} ${k.kuerzel}: keine Schule gewählt`); return }
      const lk = lehrkraefteInSchule(k.koopLehrer, k.koopWeitere.map(w => w.kuerzel), ortNr, v.quelle.nr, v.schulLehrer, platzhalterIds)
      const d = k.daten
      try {
        const neu = (await schule.post('/kurse/create', {
          idSchuljahresabschnitt: t.idAbschnittSchule, kuerzel: d.kuerzel, idFach: k.idFachSchule, kursartAllg: d.kursartAllg,
          idJahrgaenge: [t.idJahrgangSchule], wochenstunden: d.wochenstunden, wochenstundenLehrer: d.wochenstundenLehrer,
          schienen: d.schienen, sortierung: d.sortierung, lehrer: lk.lehrer, istSichtbar: true,
        })).data
        vermerk.kurse.push(neu.id)
        angelegt.set(k.koopId, { id: neu.id, ortNr, lehrer: lk.lehrer })
        for (const idLehrer of lk.weitere) {
          const wochenstunden = k.koopWeitere.find(w => v.schulLehrer.get(w.kuerzel.replace(/-\d$/, '')) === idLehrer)?.wochenstunden ?? 0
          await schule.post(`/kurse/${neu.id}/kursLehrer/create`, { idKurs: neu.id, idLehrer, wochenstundenLehrer: wochenstunden })
        }
        const wo = ortNr === v.quelle.nr ? 'eigene Schule' : `Schule ${ortNr}`
        p.add('neu', 'Kurse', `${titel} ${k.kuerzel} (${wo}${lk.lehrer === null ? ', ohne Lehrkraft' : ''})`)
      } catch (x) {
        p.add('fehler', 'Kurse', `${titel} ${k.kuerzel}: ${fehlertext(x)}`)
      }
    })
    await speichereVermerk(vermerk)

    // c. Leistungsdaten je Schüler in einer Transaktion
    const schueler = t.schueler.filter(s => s.idLernabschnitt !== null)
    let seitSpeichern = 0
    await parallel(schueler, PARALLEL, async (s, i) => {
      fortschritt(`${titel}: Leistungsdaten ${s.name}`, i + 1, schueler.length)
      const liste = s.leistungen.filter(l => angelegt.has(l.koopKursId)).map(l => {
        const kurs = angelegt.get(l.koopKursId)!
        return {
          lernabschnittID: s.idLernabschnitt, fachID: l.idFachSchule, kursID: kurs.id, kursart: l.kursart, wochenstunden: l.wochenstunden,
          lehrerID: kurs.lehrer, abifach: l.abifach, koopSchule: kurs.ortNr === v.quelle.nr ? null : (partnerSchulNr.get(kurs.ortNr) ?? null),
        }
      })
      if (liste.length === 0) return
      try {
        const neu = (await schule.post('/schueler/leistungsdaten/create/multiple', liste)).data as Roh[]
        vermerk.leistungsdaten.push(...neu.map(l => l.id as number))
        p.add('neu', 'Leistungsdaten', `${titel} ${s.name}: ${neu.length} Kurszuordnungen`)
      } catch (x) {
        p.add('fehler', 'Leistungsdaten', `${titel} ${s.name}: ${fehlertext(x)}`)
      }
      if (++seitSpeichern >= 25) { seitSpeichern = 0; await speichereVermerk(vermerk) }
    })
    await speichereVermerk(vermerk)

    // d. Blockung aus den Kursen erstellen, außer die Schule blockt selbst (ADR 004, Abschnitt 5)
    if (t.eigeneBlockungen.length > 0) {
      p.add('hinweis', titel, 'Die Schule hat eigene Blockungen, es wurde keine Blockung aus den KOOP-Kursen erstellt.')
    } else if (angelegt.size > 0) {
      fortschritt(`${titel}: Blockung erstellen`)
      try {
        const bl = (await schule.get(`/gost/blockungen/${j.abiturjahr}/${t.halbjahr}/restore`)).data
        vermerk.blockung = bl.id
        await speichereVermerk(vermerk)
        p.add('neu', titel, `Blockung „${bl.name ?? 'Restaurierte Blockung'}“ aus den Kursen erstellt`)
      } catch (x) {
        p.add('fehler', titel, `Blockung erstellen (restore): ${fehlertext(x)}`)
      }
    }
  }
}
