import type { AxiosInstance } from 'axios'
import type { QuellInfo } from '@/models/Quelle'
import {
  HALBJAHR_TITEL, laufendesHalbjahr, pruefeSchulkatalog, werteAus, type BlockungInfo, type KursLehrer, type LehrerDaten,
  type StufenDaten, type Uebersicht,
} from '@/koop/uebersicht'
import { ladeAbschnitt, type Fortschritt } from '@/services/uebernahmeService'

// Übersicht der KOOP-DB (ADR 002, „Oberfläche“). Liest nur aus der KOOP-DB, die Quell-DBs werden nicht gebraucht.

type Roh = Record<string, any>

export interface UebersichtDaten extends Uebersicht {
  schulbezeichnung: string
  schulNr: number
  abschnitt: { id: number, schuljahr: number, abschnitt: number }
  katalogHinweise: string[]
}

async function ladeStufe(koop: AxiosInstance, abiturjahr: number, jahrgang: string, abschnitt: { schuljahr: number, abschnitt: number }): Promise<StufenDaten> {
  const pfad = `/gost/abiturjahrgang/${abiturjahr}`
  const [schueler, fachwahlen] = await Promise.all([
    koop.get(`${pfad}/schueler`).then(r => r.data as Roh[]),
    koop.get(`${pfad}/fachwahlen`).then(r => r.data as { halbjahr: { fachwahlen: { schuelerID: number }[] }[] }),
  ])
  const blockungen: BlockungInfo[] = (await Promise.all(HALBJAHR_TITEL.map((_, hj) =>
    koop.get(`${pfad}/${hj}/blockungen`, { validateStatus: st => st === 200 || st === 404 })
      .then(r => r.status === 200 ? (r.data as Roh[]).map(b => ({
        id: b.id, name: b.name, abiturjahr, halbjahr: hj, istAktiv: !!b.istAktiv, anzahlErgebnisse: b.anzahlErgebnisse ?? 0,
        idAktivesErgebnis: b.idAktivesErgebnis ?? null,
      })) : []),
  ))).flat()

  const halbjahr = laufendesHalbjahr(abiturjahr, abschnitt.schuljahr, abschnitt.abschnitt)
  const aktiv = blockungen.find(b => b.halbjahr === halbjahr && b.istAktiv)
  const kurse = aktiv
    ? ((await koop.get(`/gost/blockungen/${aktiv.id}`)).data.kurse as Roh[]).map(k => ({
        lehrer: ((k.lehrer ?? []) as Roh[]).map(l => ({ id: l.id, wochenstunden: l.wochenstunden ?? 0 }) as KursLehrer),
      }))
    : []

  return {
    abiturjahr, jahrgang,
    schueler: schueler.map(s => ({ id: s.id, externeSchulNr: s.externeSchulNr ?? null })),
    mitFachwahlen: new Set(fachwahlen.halbjahr.flatMap(h => h.fachwahlen.map(f => f.schuelerID))),
    blockungen, laufendesHalbjahr: halbjahr, kurse,
  }
}

/** Lädt alle Daten der Übersicht aus der KOOP-DB */
export async function ladeUebersicht(koop: AxiosInstance, quellen: QuellInfo[], fortschritt: Fortschritt): Promise<UebersichtDaten> {
  fortschritt('Schuldaten')
  const [stammdaten, abschnitt, katalog, lehrer, jahrgaenge] = await Promise.all([
    koop.get('/schule/stammdaten').then(r => r.data as Roh),
    ladeAbschnitt(koop),
    koop.get('/schule/schulen').then(r => r.data as Roh[]),
    koop.get('/lehrer/').then(r => r.data as LehrerDaten[]),
    koop.get('/gost/abiturjahrgaenge').then(r => (r.data as Roh[]).filter(a => a.abiturjahr > 0 && a.jahrgang)),
  ])

  const stufen: StufenDaten[] = []
  // Älteste Stufe zuerst, damit die Reihenfolge Q2, Q1, EF, 10 wie im SVWS-Client ist
  for (const a of [...jahrgaenge].sort((x, y) => x.abiturjahr - y.abiturjahr)) {
    fortschritt(`Abiturjahrgang ${a.abiturjahr} (${a.jahrgang})`)
    stufen.push(await ladeStufe(koop, a.abiturjahr, a.jahrgang, abschnitt))
  }
  fortschritt('fertig')

  return {
    ...werteAus(quellen, stufen, lehrer.map(l => ({ id: l.id, kuerzel: l.kuerzel, nachname: l.nachname, vorname: l.vorname, istSichtbar: l.istSichtbar }))),
    schulbezeichnung: stammdaten.bezeichnung1,
    schulNr: stammdaten.schulNr,
    abschnitt,
    katalogHinweise: pruefeSchulkatalog(quellen, katalog as { schulnummerStatistik: string | null, kuerzel: string | null }[]),
  }
}
