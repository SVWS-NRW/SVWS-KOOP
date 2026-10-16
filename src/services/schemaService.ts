import type { AxiosInstance } from 'axios'

// Serverweite Schema-Endpunkte (/api/schema/…), ADR 003 Abschnitt 1.
// Der Client muss mit den passenden Datenbank-Zugangsdaten erzeugt sein (Root bzw. DB-Benutzer des Schemas).

/** Länger als der Standard, weil Anlegen und Importieren eines Schemas dauern kann */
const TIMEOUT_SCHEMA = 15 * 60_000

export interface SchemaEintrag {
  name: string
  isSVWS: boolean
  revision: number
}

/** Alle Schemata auf dem Server. Dient zugleich als Prüfung des Root-Zugangs. */
export async function ladeSchemaliste(root: AxiosInstance): Promise<SchemaEintrag[]> {
  const { data } = await root.get('/api/schema/liste/alle')
  return (data as SchemaEintrag[]).map(s => ({ name: s.name, isSVWS: s.isSVWS, revision: s.revision }))
}

export async function existiertSchema(root: AxiosInstance, schema: string): Promise<boolean> {
  const { data } = await root.get(`/api/schema/root/exists/${encodeURIComponent(schema)}`)
  return data === true
}

export async function existiertDbBenutzer(root: AxiosInstance, benutzer: string): Promise<boolean> {
  const { data } = await root.get(`/api/schema/root/user/${encodeURIComponent(benutzer)}/exists`)
  return data === true
}

/** Prüft, ob das Kennwort zu einem vorhandenen Datenbank-Benutzer passt */
export async function passtDbKennwort(root: AxiosInstance, benutzer: string, kennwort: string): Promise<boolean> {
  const { data } = await root.post('/api/schema/root/user/checkpwd', { user: benutzer, password: kennwort })
  return data === true
}

interface SimpleOperationResponse {
  success: boolean
  log: string[]
}

/**
 * Der Server meldet manche Fehlschläge mit HTTP 200 und success = false (ADR 003).
 * Wirft dann einen Fehler mit der letzten aussagekräftigen Zeile aus dem Log.
 */
function pruefeErfolg(data: SimpleOperationResponse, aktion: string): void {
  if (data?.success === true) return
  const grund = [...(data?.log ?? [])].reverse().find(z => /fehl|exist|passt/i.test(z))?.trim()
  throw new Error(`${aktion} fehlgeschlagen${grund ? `: ${grund}` : '.'}`)
}

/** Legt ein leeres SVWS-Schema mit neuem Datenbank-Benutzer an (Root-Zugang) */
export async function erstelleSchema(root: AxiosInstance, schema: string, dbUser: string, dbPassword: string): Promise<void> {
  const { data } = await root.post(`/api/schema/root/create/${encodeURIComponent(schema)}`, { user: dbUser, password: dbPassword }, { timeout: TIMEOUT_SCHEMA })
  pruefeErfolg(data, `Anlegen des Schemas „${schema}“`)
}

/** Legt die Schule im Schema an (Zugang mit dem Datenbank-Benutzer des Schemas, nicht mit Admin) */
export async function initialisiereSchema(dbBenutzer: AxiosInstance, schema: string, schulNr: number): Promise<void> {
  await dbBenutzer.post(`/api/schema/create/${encodeURIComponent(schema)}/init/${schulNr}`, null, { timeout: TIMEOUT_SCHEMA })
}

/** Spielt eine SQLite-Datei als neues Schema ein. Ein vorhandenes Schema gleichen Namens wird ersetzt. */
export async function importiereSqlite(root: AxiosInstance, schema: string, datei: Blob, dbUser: string, dbPassword: string): Promise<void> {
  const form = new FormData()
  form.append('database', datei)
  form.append('schemaUsername', dbUser)
  form.append('schemaUserPassword', dbPassword)
  const { data } = await root.post(`/api/schema/root/import/sqlite/${encodeURIComponent(schema)}`, form, {
    timeout: TIMEOUT_SCHEMA,
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  pruefeErfolg(data, `Einspielen in das Schema „${schema}“`)
}

export async function loescheSchema(root: AxiosInstance, schema: string): Promise<void> {
  await root.post(`/api/schema/root/destroy/${encodeURIComponent(schema)}`, null, { timeout: TIMEOUT_SCHEMA })
}
