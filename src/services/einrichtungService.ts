import type { AxiosInstance } from 'axios'
import { KOOP, quellSchluessel, erzeugeSchemaClient, erzeugeServerClient } from '@/services/apiClient'
import {
  ladeSchemaliste, existiertSchema, existiertDbBenutzer, passtDbKennwort, erstelleSchema, initialisiereSchema, importiereSqlite,
} from '@/services/schemaService'
import {
  ladeSchulstammdaten, aendereSchulbezeichnung, ladeSchulkatalog, erstelleSchulkatalogEintrag,
  aendereSchulkatalogEintrag, ladeBenutzerliste, erstelleBenutzer, gibAdminrechte, setzeKennwort, setzeKonfiguration,
} from '@/services/svwsService'
import { KONFIG_QUELLEN, type QuellInfo } from '@/models/Quelle'
import { bildeKoopBezeichnung, type EinrichtungsAngaben, type QuellAngaben, type ServerAngaben } from '@/koop/einrichtung'

// Ablauf des Assistenten „KOOP-DB einrichten“ (ADR 003, Abschnitt 1)

/** Client für /api/schema/root/… (bei eigenem Port für privilegierte Zugriffe dessen Adresse) */
export function erzeugeRootClient(server: ServerAngaben): AxiosInstance {
  return erzeugeServerClient({
    baseUrl: server.privilegedUrl.trim() || server.baseUrl,
    username: server.rootUser,
    password: server.rootPassword,
  })
}

/** Prüft den Root-Zugang und liefert die Namen der vorhandenen SVWS-Schemata */
export async function ladeVorhandeneSchemata(server: ServerAngaben): Promise<string[]> {
  const liste = await ladeSchemaliste(erzeugeRootClient(server))
  return liste.filter(s => s.isSVWS).map(s => s.name).sort()
}

/** Meldet sich an einer Quell-DB an und liefert Schulnummer und Schulname */
export async function pruefeQuellVerbindung(server: ServerAngaben, quelle: QuellAngaben): Promise<{ schulNr: number, schulname: string }> {
  const client = erzeugeSchemaClient(quellSchluessel(quelle.nr), {
    baseUrl: server.baseUrl, username: quelle.svwsUser, password: quelle.svwsPassword,
  }, quelle.schema)
  const stammdaten = await ladeSchulstammdaten(client)
  return { schulNr: stammdaten.schulNr, schulname: stammdaten.bezeichnung1 }
}

/** Spielt eine SQLite-Datei als neue Quell-DB ein */
export async function spieleQuellDateiEin(server: ServerAngaben, schema: string, datei: Blob, dbUser: string, dbPassword: string): Promise<void> {
  await importiereSqlite(erzeugeRootClient(server), schema, datei, dbUser, dbPassword)
}

/** Prüfungen am Server, die nur mit Root-Zugang möglich sind */
export async function pruefeAmServer(angaben: EinrichtungsAngaben): Promise<string[]> {
  const root = erzeugeRootClient(angaben.server)
  const fehler: string[] = []
  if (await existiertSchema(root, angaben.koop.schema)) fehler.push(`Ein Schema „${angaben.koop.schema}“ gibt es auf dem Server bereits.`)
  // Ein vorhandener Datenbank-Benutzer wird weiterverwendet, wenn das Kennwort passt (z. B. nach dem Löschen einer KOOP-DB)
  if (await existiertDbBenutzer(root, angaben.koop.dbUser) && !await passtDbKennwort(root, angaben.koop.dbUser, angaben.koop.dbPassword)) {
    fehler.push(`Den Datenbank-Benutzer „${angaben.koop.dbUser}“ gibt es bereits mit einem anderen Kennwort.`)
  }
  return fehler
}

// ── Generierung ──────────────────────────────────────────────────────────────

export type SchrittStatus = 'offen' | 'laeuft' | 'ok' | 'fehler' | 'uebersprungen'

export interface Schritt {
  id: string
  titel: string
  status: SchrittStatus
  meldung?: string
}

export function erzeugeSchritte(angaben: EinrichtungsAngaben): Schritt[] {
  return [
    { id: 'anlegen', titel: `KOOP-DB „${angaben.koop.schema}“ anlegen`, status: 'offen' },
    { id: 'init', titel: `Schule ${angaben.koop.schulNr} initialisieren`, status: 'offen' },
    { id: 'anmelden', titel: 'Als Admin an der KOOP-DB anmelden', status: 'offen' },
    { id: 'kennzeichnen', titel: 'Schulstammdaten als KOOP-DB kennzeichnen', status: 'offen' },
    { id: 'katalog', titel: 'Quellschulen in den Schulkatalog eintragen', status: 'offen' },
    { id: 'quellen', titel: 'Quell-DBs in der KOOP-DB vermerken', status: 'offen' },
    { id: 'benutzer', titel: 'Benutzer je Schule anlegen', status: 'offen' },
    { id: 'kennwort', titel: 'Kennwort für Admin setzen', status: 'offen' },
  ]
}

/** Angaben zu den Quell-DBs ohne Zugangsdaten */
export function quellInfos(quellen: QuellAngaben[]): QuellInfo[] {
  return quellen.map(q => ({ nr: q.nr, schema: q.schema, schulNr: q.schulNr!, schulname: q.schulname }))
}

const MAX_KURZBEZEICHNUNG = 40
const MAX_NAME = 120

/**
 * Legt die KOOP-DB an. Bricht beim ersten Fehler ab, der Schritt erhält dann Status „fehler“.
 * @returns das Kennwort, mit dem sich Admin danach anmeldet
 */
export async function generiereKoopDb(angaben: EinrichtungsAngaben, schritte: Schritt[]): Promise<string> {
  const { server, koop, quellen, benutzer } = angaben
  const root = erzeugeRootClient(server)
  let koopClient: AxiosInstance | null = null

  async function fuehreAus(id: string, aktion: () => Promise<string | void>): Promise<void> {
    const schritt = schritte.find(s => s.id === id)!
    schritt.status = 'laeuft'
    try {
      const meldung = await aktion()
      schritt.status = meldung === 'uebersprungen' ? 'uebersprungen' : 'ok'
    } catch (e) {
      schritt.status = 'fehler'
      throw e
    }
  }

  await fuehreAus('anlegen', () => erstelleSchema(root, koop.schema, koop.dbUser, koop.dbPassword))

  await fuehreAus('init', () => initialisiereSchema(
    erzeugeServerClient({ baseUrl: server.baseUrl, username: koop.dbUser, password: koop.dbPassword }),
    koop.schema, koop.schulNr!,
  ))

  await fuehreAus('anmelden', async () => {
    koopClient = erzeugeSchemaClient(KOOP, { baseUrl: server.baseUrl, username: 'Admin', password: '' }, koop.schema)
    await ladeSchulstammdaten(koopClient)
  })

  await fuehreAus('kennzeichnen', () => aendereSchulbezeichnung(koopClient!, bildeKoopBezeichnung(quellen)))

  await fuehreAus('katalog', async () => {
    const katalog = await ladeSchulkatalog(koopClient!)
    for (const q of quellen) {
      const vorhanden = katalog.find(e => e.schulnummerStatistik === String(q.schulNr))
      if (vorhanden) {
        await aendereSchulkatalogEintrag(koopClient!, vorhanden.id, { kuerzel: String(q.nr) })
      } else {
        await erstelleSchulkatalogEintrag(koopClient!, {
          schulnummerStatistik: String(q.schulNr),
          kuerzel: String(q.nr),
          kurzbezeichnung: q.schulname.slice(0, MAX_KURZBEZEICHNUNG),
          name: q.schulname.slice(0, MAX_NAME),
        })
      }
    }
  })

  await fuehreAus('quellen', () => setzeKonfiguration(koopClient!, KONFIG_QUELLEN, JSON.stringify(quellInfos(quellen))))

  await fuehreAus('benutzer', async () => {
    for (const b of benutzer) {
      const id = await erstelleBenutzer(koopClient!, b.benutzername.trim(), b.anzeigename.trim(), b.password)
      await gibAdminrechte(koopClient!, id)
    }
  })

  await fuehreAus('kennwort', async () => {
    if (koop.adminPassword === '') return 'uebersprungen'
    const admin = (await ladeBenutzerliste(koopClient!)).find(b => b.name === 'Admin')
    if (!admin) throw new Error('Der Benutzer Admin wurde in der KOOP-DB nicht gefunden.')
    await setzeKennwort(koopClient!, admin.id, koop.adminPassword)
    // Der Client muss sich danach mit dem neuen Kennwort anmelden
    erzeugeSchemaClient(KOOP, { baseUrl: server.baseUrl, username: 'Admin', password: koop.adminPassword }, koop.schema)
  })

  return koop.adminPassword
}
