import type { AxiosInstance } from 'axios'
import type { Schulstammdaten, SchulkatalogEintrag } from '@/models/Schule'

// Alle REST-Aufrufe gegen den SVWS-Server. Jede Funktion bekommt den Client der
// Verbindung, für die sie gilt (KOOP-DB oder Quell-DB, siehe apiClient.ts).

export async function ladeSchulstammdaten(client: AxiosInstance): Promise<Schulstammdaten> {
  const { data } = await client.get('/schule/stammdaten')
  return {
    schulNr: data.schulNr,
    schulform: data.schulform,
    bezeichnung1: data.bezeichnung1,
  }
}

export async function aendereSchulbezeichnung(
  client: AxiosInstance,
  bezeichnung: { bezeichnung1: string, bezeichnung2: string, bezeichnung3: string },
): Promise<void> {
  await client.patch('/schule/stammdaten', bezeichnung)
}

// ── Schulkatalog (/schule/schulen) ──────────────────────────────────────────

export async function ladeSchulkatalog(client: AxiosInstance): Promise<SchulkatalogEintrag[]> {
  const { data } = await client.get('/schule/schulen')
  return (data as SchulkatalogEintrag[]).map(s => ({
    id: s.id,
    schulnummerStatistik: s.schulnummerStatistik,
    kuerzel: s.kuerzel,
    kurzbezeichnung: s.kurzbezeichnung,
    name: s.name,
  }))
}

export async function erstelleSchulkatalogEintrag(client: AxiosInstance, eintrag: Omit<SchulkatalogEintrag, 'id'>): Promise<void> {
  await client.post('/schule/schulen/create', eintrag)
}

export async function aendereSchulkatalogEintrag(client: AxiosInstance, id: number, aenderung: Partial<Omit<SchulkatalogEintrag, 'id'>>): Promise<void> {
  await client.patch(`/schule/schulen/${id}`, aenderung)
}

// ── Benutzer (/benutzer) ─────────────────────────────────────────────────────

export interface BenutzerListeEintrag {
  id: number
  name: string
  istAdmin: boolean
}

export async function ladeBenutzerliste(client: AxiosInstance): Promise<BenutzerListeEintrag[]> {
  const { data } = await client.get('/benutzer/')
  return (data as BenutzerListeEintrag[]).map(b => ({ id: b.id, name: b.name, istAdmin: b.istAdmin }))
}

/** Legt einen Benutzer an und liefert seine ID */
export async function erstelleBenutzer(client: AxiosInstance, benutzername: string, anzeigename: string, password: string): Promise<number> {
  const { data } = await client.post('/benutzer/new', { benutzername, anzeigename, password })
  return data.id
}

export async function gibAdminrechte(client: AxiosInstance, idBenutzer: number): Promise<void> {
  await client.post(`/benutzer/${idBenutzer}/addAdmin`)
}

/** Setzt das Kennwort eines Benutzers (Body: Kennwort als JSON-String) */
export async function setzeKennwort(client: AxiosInstance, idBenutzer: number, password: string): Promise<void> {
  await client.post(`/benutzer/${idBenutzer}/password`, JSON.stringify(password))
}
