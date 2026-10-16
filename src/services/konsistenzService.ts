import type { AxiosInstance } from 'axios'
import {
  BETROFFENE_JAHRGAENGE, fachkombinationSchluessel, GOST_FACH_MERKMALE,
  type Abweichung, type GostFachDaten, type GostJahrgangDaten, type JahrgangDaten, type Quelldaten, type Wert,
} from '@/koop/konsistenz'

// Lädt die Daten einer Quell-DB für die Konsistenzprüfung und schreibt Korrekturen (ADR 002, A7/A8)

/** IDs der Quell-DB, die für Korrekturen gebraucht werden */
export interface QuellIds {
  jahrgaenge: Record<string, number>
  faecher: Record<string, number>
  /** Abiturjahr und Fach-IDs je Jahrgangskürzel */
  gost: Record<string, { abiturjahr: number, faecher: Record<string, number> }>
}

export interface QuellStand {
  daten: Quelldaten
  ids: QuellIds
}

export async function ladeQuellStand(client: AxiosInstance, nr: number, schulNr: number, schulname: string): Promise<QuellStand> {
  const [stammdaten, jahrgaengeRoh, faecherRoh, abiturjahrgaenge, erzieherarten, schulkatalog, lehrer] = await Promise.all([
    client.get('/schule/stammdaten').then(r => r.data),
    client.get('/jahrgaenge/').then(r => r.data as Record<string, unknown>[]),
    client.get('/faecher/').then(r => r.data as Record<string, unknown>[]),
    client.get('/gost/abiturjahrgaenge').then(r => r.data as { abiturjahr: number, jahrgang: string | null }[]),
    client.get('/schule/erzieherarten').then(r => r.data as { bezeichnung: string }[]),
    client.get('/schule/schulen').then(r => r.data as { schulnummerStatistik: string | null, kuerzel: string | null }[]),
    client.get('/lehrer/').then(r => r.data as { kuerzel: string, istSichtbar: boolean }[]),
  ])

  const abschnitt = (stammdaten.abschnitte as { id: number, schuljahr: number, abschnitt: number }[])
    .find(a => a.id === stammdaten.idSchuljahresabschnitt)!

  const jahrgangKuerzel = new Map(jahrgaengeRoh.map(j => [j.id as number, j.kuerzel as string]))
  const jahrgaenge: JahrgangDaten[] = jahrgaengeRoh.map(j => ({
    kuerzel: j.kuerzel as string,
    idJahrgang: (j.idJahrgang as number | null) ?? null,
    idSchulgliederung: (j.idSchulgliederung as number | null) ?? null,
    anzahlRestabschnitte: (j.anzahlRestabschnitte as number | null) ?? null,
    folgejahrgang: j.idFolgejahrgang == null ? null : (jahrgangKuerzel.get(j.idFolgejahrgang as number) ?? null),
  }))

  const klassenRoh = (await client.get(`/klassen/minimal/abschnitt/${stammdaten.idSchuljahresabschnitt}`)).data as { idJahrgang: number, kuerzel: string }[]
  const klassen: Record<string, string[]> = {}
  for (const jg of BETROFFENE_JAHRGAENGE) {
    klassen[jg] = klassenRoh.filter(k => jahrgangKuerzel.get(k.idJahrgang) === jg).map(k => k.kuerzel)
  }

  const fachKuerzel = new Map(faecherRoh.map(f => [f.id as number, f.kuerzel as string]))

  const gostJahrgaenge: GostJahrgangDaten[] = []
  const gostIds: QuellIds['gost'] = {}
  for (const a of abiturjahrgaenge.filter(a => a.jahrgang !== null && (BETROFFENE_JAHRGAENGE as readonly string[]).includes(a.jahrgang))) {
    const [daten, faecher, kombis] = await Promise.all([
      client.get(`/gost/abiturjahrgang/${a.abiturjahr}`).then(r => r.data),
      client.get(`/gost/abiturjahrgang/${a.abiturjahr}/faecher`).then(r => r.data as Record<string, unknown>[]),
      client.get(`/gost/abiturjahrgang/${a.abiturjahr}/fachkombinationen`).then(r => r.data as Record<string, unknown>[]),
    ])
    gostJahrgaenge.push({
      abiturjahr: a.abiturjahr,
      jahrgang: a.jahrgang!,
      hatZusatzkursGE: daten.hatZusatzkursGE,
      beginnZusatzkursGE: daten.beginnZusatzkursGE ?? null,
      hatZusatzkursSW: daten.hatZusatzkursSW,
      beginnZusatzkursSW: daten.beginnZusatzkursSW ?? null,
      faecher: faecher.map(f => {
        const eintrag: GostFachDaten = { kuerzel: f.kuerzel as string }
        for (const merkmal of Object.keys(GOST_FACH_MERKMALE)) eintrag[merkmal] = (f[merkmal] as Wert) ?? null
        return eintrag
      }),
      fachkombinationen: kombis.map(k => fachkombinationSchluessel(
        fachKuerzel.get(k.fachID1 as number) ?? `Fach-ID ${k.fachID1}`, k.kursart1 as string | null,
        fachKuerzel.get(k.fachID2 as number) ?? `Fach-ID ${k.fachID2}`, k.kursart2 as string | null,
        k.typ as number, k.gueltigInHalbjahr as boolean[],
      )),
    })
    gostIds[a.jahrgang!] = { abiturjahr: a.abiturjahr, faecher: Object.fromEntries(faecher.map(f => [f.kuerzel as string, f.id as number])) }
  }

  return {
    daten: {
      nr, schulNr, schulname,
      abschnitt: { schuljahr: abschnitt.schuljahr, abschnitt: abschnitt.abschnitt },
      jahrgaenge,
      klassen,
      faecher: faecherRoh.map(f => ({
        kuerzel: f.kuerzel as string,
        kuerzelStatistik: f.kuerzelStatistik as string,
        bezeichnung: f.bezeichnung as string,
        istOberstufenFach: f.istOberstufenFach as boolean,
        istFremdsprache: f.istFremdsprache as boolean,
        aufgabenfeld: (f.aufgabenfeld as string | null) ?? null,
        bilingualeSprache: (f.bilingualeSprache as string | null) ?? null,
      })),
      gostJahrgaenge,
      erzieherarten: erzieherarten.map(e => e.bezeichnung),
      schulkatalog: schulkatalog.map(s => ({ schulnummerStatistik: s.schulnummerStatistik, kuerzel: s.kuerzel })),
      lehrerKuerzel: lehrer.filter(l => l.istSichtbar).map(l => l.kuerzel),
    },
    ids: {
      jahrgaenge: Object.fromEntries(jahrgaengeRoh.map(j => [j.kuerzel as string, j.id as number])),
      faecher: Object.fromEntries(faecherRoh.map(f => [f.kuerzel as string, f.id as number])),
      gost: gostIds,
    },
  }
}

// ── Korrektur ────────────────────────────────────────────────────────────────

/** Übersetzt einen Wert aus der Vergleichsdarstellung (Kürzel) in den Wert für den PATCH der Ziel-DB (ID) */
function patchFeldUndWert(feld: string, wert: Wert, ziel: QuellIds): { feld: string, wert: Wert } {
  if (feld === 'folgejahrgang') {
    return { feld: 'idFolgejahrgang', wert: wert === null ? null : (ziel.jahrgaenge[String(wert)] ?? fehlt(`Jahrgang ${wert}`)) }
  }
  if (feld === 'projektKursLeitfach1Kuerzel' || feld === 'projektKursLeitfach2Kuerzel') {
    return { feld: feld.replace('Kuerzel', 'ID'), wert: wert === null ? null : (ziel.faecher[String(wert)] ?? fehlt(`Fach ${wert}`)) }
  }
  return { feld, wert }
}

function fehlt(was: string): never {
  throw new Error(`${was} gibt es in der Ziel-DB nicht.`)
}

/**
 * Übernimmt den Wert der Schule `vonNr` in alle anderen Schulen (nur Kopien auf dem KOOP-Server, A8).
 * @param clients  Client je Nummer der Quellschule
 */
export async function korrigiere(abweichung: Abweichung, vonNr: number, staende: QuellStand[], clients: Record<number, AxiosInstance>): Promise<void> {
  const bezug = abweichung.korrektur
  if (!abweichung.korrigierbar || !bezug) throw new Error('Diese Abweichung kann SVWS-KOOP nicht korrigieren.')
  const wert = abweichung.werte[vonNr]
  if (wert === undefined) throw new Error(`In Schule ${vonNr} gibt es keinen Wert für „${abweichung.merkmal}“.`)

  for (const stand of staende.filter(s => s.daten.nr !== vonNr && abweichung.werte[s.daten.nr] !== wert)) {
    const client = clients[stand.daten.nr]
    const { feld, wert: patchWert } = patchFeldUndWert(bezug.feld, wert, stand.ids)
    if (bezug.art === 'gostJahrgang') {
      const gost = stand.ids.gost[bezug.jahrgang] ?? fehlt(`Abiturjahrgang (${bezug.jahrgang})`)
      await client.patch(`/gost/abiturjahrgang/${gost.abiturjahr}`, { [feld]: patchWert })
    } else {
      const gost = stand.ids.gost[bezug.jahrgang] ?? fehlt(`Abiturjahrgang (${bezug.jahrgang})`)
      const id = gost.faecher[bezug.fachKuerzel] ?? fehlt(`Fach ${bezug.fachKuerzel}`)
      await client.patch(`/gost/abiturjahrgang/${gost.abiturjahr}/fach/${id}`, { [feld]: patchWert })
    }
  }
}

// ── Jahrgänge in die KOOP-DB ─────────────────────────────────────────────────

/** Schulgliederung „Standard für diese Schulform“ (***), gültig für GE und GY */
export const SCHULGLIEDERUNG_STANDARD = 0

/**
 * Vervollständigt die Jahrgänge der KOOP-DB. Die von init angelegten Jahrgänge haben keine Schulgliederung,
 * ohne die kein Abiturjahrgang angelegt werden kann (ADR 003). Gesetzt wird immer *** (Standard für diese Schulform),
 * weil die Gliederungen der Quellschulen von deren Schulform abhängen (z. B. GY8 ab 2024 nur am GY).
 * Restabschnitte und Folgejahrgang kommen aus der Quell-DB, deren Schulnummer die KOOP-DB trägt (gleiche Schulform).
 * @returns Kürzel der übertragenen Jahrgänge
 */
export async function uebertrageJahrgaenge(quelle: QuellStand, koop: AxiosInstance): Promise<string[]> {
  const koopJahrgaenge = (await koop.get('/jahrgaenge/')).data as { id: number, kuerzel: string }[]
  const koopIds = Object.fromEntries(koopJahrgaenge.map(j => [j.kuerzel, j.id]))
  const uebertragen: string[] = []
  for (const j of quelle.daten.jahrgaenge) {
    const id = koopIds[j.kuerzel]
    if (id === undefined) continue
    const patch: Record<string, Wert> = {
      idSchulgliederung: SCHULGLIEDERUNG_STANDARD,
      anzahlRestabschnitte: j.anzahlRestabschnitte,
      idFolgejahrgang: j.folgejahrgang === null ? null : (koopIds[j.folgejahrgang] ?? null),
    }
    await koop.patch(`/jahrgaenge/${id}`, patch)
    uebertragen.push(j.kuerzel)
  }
  return uebertragen
}
