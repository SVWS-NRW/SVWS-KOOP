import type { AxiosInstance } from 'axios'
import type { QuellInfo } from '@/models/Quelle'
import {
  vergleicheLehrkraefte, vergleicheSchueler, zuordnungenVon, type AbgegangeneLehrkraft, type AbgegangenerSchueler,
  type Blockungsergebnis, type KoopLehrer, type KoopSchueler, type KursSchuelerZuordnung, type QuellLehrer, type QuellSchueler,
} from '@/koop/nachladen'
import { istPlatzhalter, Protokoll } from '@/koop/uebernahme'
import {
  auswahlSchluessel, ladeAbschnitt, uebernehmeLehrkraefte, uebernehmeSchueler, vereinigeKataloge,
  type Auswahl, type Fortschritt, type QuellKontext,
} from '@/services/uebernahmeService'

// Nachladen (ADR 002, A21): neuere Stände der Quell-DBs mit der KOOP-DB abgleichen, neue Schüler und Lehrkräfte
// übernehmen, abgegangene entfernen. Fachwahlen bereits übernommener Schüler bleiben unverändert.

type Roh = Record<string, any>

export interface SchulAbgleich {
  info: QuellInfo
  neueSchueler: QuellSchueler[]
  abgegangeneSchueler: AbgegangenerSchueler[]
  neueLehrkraefte: QuellLehrer[]
  abgegangeneLehrkraefte: AbgegangeneLehrkraft[]
}

/** Schüler der KOOP-DB im aktuellen Abschnitt mit Merkmal Stammschule */
async function ladeKoopSchueler(koop: AxiosInstance): Promise<KoopSchueler[]> {
  const abschnitt = await ladeAbschnitt(koop)
  const liste = (await koop.get(`/schueler/abschnitt/${abschnitt.id}`)).data as Roh[]
  const merkmale = new Map<number, Roh>()
  for (let i = 0; i < liste.length; i += 200) {
    const teil = (await koop.post('/schueler/stammdaten', liste.slice(i, i + 200).map(s => s.id))).data as Roh[]
    for (const s of teil) merkmale.set(s.id, s)
  }
  return liste.map(s => ({
    id: s.id, nachname: s.nachname, vorname: s.vorname, jahrgang: s.jahrgang ?? '',
    externeSchulNr: merkmale.get(s.id)?.externeSchulNr ?? null,
    idSchuelerausweis: merkmale.get(s.id)?.idSchuelerausweis ?? null,
  }))
}

/** Vergleicht jede Quell-DB mit der KOOP-DB */
export async function ladeAbgleich(koop: AxiosInstance, quellen: QuellKontext[], fortschritt: Fortschritt): Promise<SchulAbgleich[]> {
  fortschritt('KOOP-DB laden')
  const koopSchueler = await ladeKoopSchueler(koop)
  const koopLehrer = (await koop.get('/lehrer/')).data as KoopLehrer[]
  const ergebnis: SchulAbgleich[] = []
  for (const q of quellen) {
    fortschritt(`Schule ${q.info.nr} laden`)
    const abschnitt = await ladeAbschnitt(q.client)
    const schueler = (await q.client.get(`/schueler/abschnitt/${abschnitt.id}`)).data as QuellSchueler[]
    const katalogKuerzel = new Set(((await q.client.get('/schule/schulen')).data as Roh[]).map(s => s.kuerzel).filter(Boolean) as string[])
    const lehrer = ((await q.client.get('/lehrer/')).data as Roh[])
      .filter(l => !istPlatzhalter(l as { kuerzel: string, istRelevantFuerStatistik: boolean }, katalogKuerzel)) as QuellLehrer[]
    const s = vergleicheSchueler(q.info.koopSchulNr, schueler, koopSchueler)
    const l = vergleicheLehrkraefte(q.info.nr, lehrer, koopLehrer)
    ergebnis.push({ info: q.info, neueSchueler: s.neu, abgegangeneSchueler: s.abgegangen, neueLehrkraefte: l.neu, abgegangeneLehrkraefte: l.abgegangen })
  }
  fortschritt('fertig')
  return ergebnis
}

/**
 * Übernimmt die neuen Lehrkräfte und Schüler aus dem Abgleich mit derselben Logik wie die Übernahme.
 * Vorher werden die Kataloge ergänzt, weil neue Schüler Einträge mitbringen können, die die KOOP-DB noch nicht kennt.
 */
export async function ladeNach(koop: AxiosInstance, quellen: QuellKontext[], abgleich: SchulAbgleich[], fortschritt: Fortschritt): Promise<Protokoll> {
  const protokoll = new Protokoll()
  const lehrer: Auswahl = new Set(abgleich.flatMap(a => a.neueLehrkraefte.map(l => auswahlSchluessel(a.info.nr, l.id))))
  const schueler: Auswahl = new Set(abgleich.flatMap(a => a.neueSchueler.map(s => auswahlSchluessel(a.info.nr, s.id))))
  if (lehrer.size === 0 && schueler.size === 0) return protokoll

  await vereinigeKataloge(koop, quellen, protokoll, fortschritt)
  if (lehrer.size > 0) protokoll.eintraege.push(...(await uebernehmeLehrkraefte(koop, quellen, fortschritt, lehrer)).eintraege)
  if (schueler.size > 0) protokoll.eintraege.push(...(await uebernehmeSchueler(koop, quellen, fortschritt, schueler)).eintraege)
  fortschritt('fertig')
  return protokoll
}

// ── Abgegangene entfernen ────────────────────────────────────────────────────

function fehlertext(e: unknown): string {
  const ax = e as { response?: { status?: number, data?: unknown }, message?: string }
  if (ax.response) return `HTTP ${ax.response.status}: ${typeof ax.response.data === 'string' ? ax.response.data : JSON.stringify(ax.response.data)}`.slice(0, 300)
  return ax.message ?? String(e)
}

const GOST_HALBJAHRE = [0, 1, 2, 3, 4, 5]

/** IDs aller Blockungen der KOOP-DB (alle Abiturjahrgänge und Halbjahre) */
async function ladeBlockungIds(koop: AxiosInstance): Promise<number[]> {
  const jahrgaenge = ((await koop.get('/gost/abiturjahrgaenge')).data as Roh[]).filter(a => a.abiturjahr > 0)
  const ids: number[] = []
  for (const a of jahrgaenge) {
    for (const hj of GOST_HALBJAHRE) {
      const r = await koop.get(`/gost/abiturjahrgang/${a.abiturjahr}/${hj}/blockungen`, { validateStatus: st => st === 200 || st === 404 })
      if (r.status === 200) ids.push(...(r.data as Roh[]).map(b => b.id as number))
    }
  }
  return ids
}

/**
 * Entfernt abgegangene Schüler und Lehrkräfte aus der KOOP-DB (ADR 002, A21):
 * - Schüler: Kurszuordnungen in allen Blockungsergebnissen und Leistungsdaten mit Kurs (Kurszuordnungen aus aktivierten
 *   Blockungen) werden gelöscht, danach erhält der Schüler einen Löschvermerk. Damit zählt der Server ihn nicht mehr zum
 *   Abiturjahrgang (GostSchuelerService). Endgültig löschen lässt sich ein Schüler über die API derzeit nicht (ADR 003).
 * - Lehrkräfte: Sie werden aus Blockungskursen und Kursen genommen und unsichtbar gesetzt.
 * Schlägt ein Schritt für einen Schüler fehl, bekommt er keinen Löschvermerk und wird beim nächsten Abgleich wieder gemeldet.
 */
export async function entferneAbgegangene(koop: AxiosInstance, abgleich: SchulAbgleich[], fortschritt: Fortschritt): Promise<Protokoll> {
  const protokoll = new Protokoll()
  const schueler = abgleich.flatMap(a => a.abgegangeneSchueler.map(s => s.koop))
  const lehrer = abgleich.flatMap(a => a.abgegangeneLehrkraefte.map(l => l.koop))
  if (schueler.length === 0 && lehrer.length === 0) return protokoll

  const schuelerIds = new Set(schueler.map(s => s.id))
  const lehrerIds = new Set(lehrer.map(l => l.id))
  const fehlgeschlagen = new Set<number>()
  const name = (s: KoopSchueler) => `${s.nachname}, ${s.vorname} (${s.jahrgang})`
  const nameNachId = new Map(schueler.map(s => [s.id, name(s)]))

  // 1. Blockungen: Kurszuordnungen der Schüler in allen Ergebnissen, Lehrkräfte in den Blockungskursen
  fortschritt('Blockungen laden')
  const blockungIds = await ladeBlockungIds(koop)
  for (const [i, idBlockung] of blockungIds.entries()) {
    fortschritt(`Blockung ${idBlockung}`, i + 1, blockungIds.length)
    const blockung = (await koop.get(`/gost/blockungen/${idBlockung}`)).data as Roh
    for (const kurs of blockung.kurse as Roh[]) {
      for (const l of (kurs.lehrer ?? []) as Roh[]) {
        if (!lehrerIds.has(l.id)) continue
        try {
          await koop.delete(`/gost/blockungen/kurse/${kurs.id}/lehrer/${l.id}`)
          protokoll.add('aktualisiert', 'Blockungen', `${l.kuerzel} aus Blockungskurs ${kurs.id} („${blockung.name}“) entfernt`)
        } catch (x) {
          protokoll.add('fehler', 'Blockungen', `${l.kuerzel} aus Blockungskurs ${kurs.id}: ${fehlertext(x)}`)
        }
      }
    }
    for (const e of blockung.ergebnisse as Roh[]) {
      const ergebnis = (await koop.get(`/gost/blockungen/zwischenergebnisse/${e.id}`)).data as Blockungsergebnis
      const zuordnungen: KursSchuelerZuordnung[] = zuordnungenVon(ergebnis, schuelerIds)
      if (zuordnungen.length === 0) continue
      try {
        await koop.delete(`/gost/blockungen/zwischenergebnisse/${e.id}/removeKursSchuelerZuordnungen`, { data: zuordnungen })
        const anzahl = new Map<number, number>()
        for (const z of zuordnungen) anzahl.set(z.idSchueler, (anzahl.get(z.idSchueler) ?? 0) + 1)
        for (const [id, n] of anzahl) protokoll.add('aktualisiert', 'Blockungen', `${nameNachId.get(id)}: ${n} Kurszuordnungen in „${blockung.name}“, Ergebnis ${e.id} entfernt`)
      } catch (x) {
        for (const z of zuordnungen) fehlgeschlagen.add(z.idSchueler)
        protokoll.add('fehler', 'Blockungen', `Ergebnis ${e.id} („${blockung.name}“): ${fehlertext(x)}`)
      }
    }
  }

  // 2. Schüler: Leistungsdaten mit Kurs im aktuellen Abschnitt, dann Löschvermerk
  const abschnitt = await ladeAbschnitt(koop)
  const zuLoeschen: number[] = []
  for (const [i, s] of schueler.entries()) {
    fortschritt(`Schüler ${s.nachname}, ${s.vorname}`, i + 1, schueler.length)
    if (fehlgeschlagen.has(s.id)) {
      protokoll.add('fehler', 'Schüler', `${name(s)}: nicht entfernt, weil Kurszuordnungen nicht entfernt werden konnten`)
      continue
    }
    try {
      const abschnitte = ((await koop.get(`/schueler/${s.id}/lernabschnitte`)).data as Roh[]).filter(a => a.schuljahresabschnitt === abschnitt.id)
      const leistungen: number[] = []
      for (const a of abschnitte) {
        const daten = (await koop.get(`/schueler/lernabschnittsdaten/${a.id}`)).data as Roh
        leistungen.push(...(daten.leistungsdaten as Roh[]).filter(l => l.kursID != null).map(l => l.id as number))
      }
      if (leistungen.length > 0) await koop.delete('/schueler/leistungsdaten/delete/multiple', { data: leistungen })
      zuLoeschen.push(s.id)
      protokoll.add('aktualisiert', 'Schüler', `${name(s)}: ${leistungen.length} Kurszuordnungen in den Leistungsdaten entfernt`)
    } catch (x) {
      protokoll.add('fehler', 'Schüler', `${name(s)}: ${fehlertext(x)}`)
    }
  }
  if (zuLoeschen.length > 0) {
    try {
      await koop.delete('/schueler/softdelete/multiple', { data: zuLoeschen })
      for (const id of zuLoeschen) protokoll.add('entfernt', 'Schüler', `${nameNachId.get(id)}: Löschvermerk gesetzt`)
    } catch (x) {
      protokoll.add('fehler', 'Schüler', `Löschvermerk: ${fehlertext(x)}`)
    }
  }

  // 3. Lehrkräfte: aus Kursen nehmen und unsichtbar setzen
  if (lehrer.length > 0) {
    fortschritt('Kurse laden')
    const kurse = (await koop.get(`/kurse/abschnitt/${abschnitt.id}`)).data as Roh[]
    for (const l of lehrer) {
      try {
        for (const k of kurse) {
          if (k.lehrer === l.id) {
            await koop.patch(`/kurse/${k.id}`, { lehrer: null })
            protokoll.add('aktualisiert', 'Kurse', `${l.kuerzel} als Kurslehrkraft von ${k.kuerzel} entfernt`)
          }
          // weitereLehrer enthält KursLehrer-Objekte, gelöscht wird über die ID der Lehrkraft
          if (((k.weitereLehrer ?? []) as { idLehrer: number }[]).some(w => w.idLehrer === l.id)) {
            await koop.delete(`/kurse/${k.id}/kursLehrer/delete/multiple`, { data: [l.id] })
            protokoll.add('aktualisiert', 'Kurse', `${l.kuerzel} als weitere Lehrkraft von ${k.kuerzel} entfernt`)
          }
        }
        await koop.patch(`/lehrer/${l.id}/stammdaten`, { istSichtbar: false })
        protokoll.add('entfernt', 'Lehrkräfte', `${l.kuerzel} (${l.nachname}, ${l.vorname}): unsichtbar gesetzt`)
      } catch (x) {
        protokoll.add('fehler', 'Lehrkräfte', `${l.kuerzel}: ${fehlertext(x)}`)
      }
    }
  }
  fortschritt('fertig')
  return protokoll
}
