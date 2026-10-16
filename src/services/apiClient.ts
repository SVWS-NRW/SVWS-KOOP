import axios, { type AxiosInstance } from 'axios'

// SVWS-KOOP arbeitet gleichzeitig mit mehreren Schemata desselben SVWS-Servers
// (KOOP-DB und Quell-DBs, ADR 001 Abschnitt 9). Jede Verbindung hat einen eigenen Client.

export interface Zugang {
  baseUrl: string
  username: string
  password: string
}

/** Schlüssel einer Verbindung, z. B. 'koop' oder 'quelle-1' */
export type VerbindungsSchluessel = string

const _clients = new Map<VerbindungsSchluessel, AxiosInstance>()

function istElectron(): boolean {
  return typeof navigator !== 'undefined' && navigator.userAgent.includes('Electron')
}

function erzeugeClient(zugang: Zugang, pfad: string): AxiosInstance {
  const useProxy = !istElectron() && import.meta.env.DEV
  const headers: Record<string, string> = {
    Authorization: 'Basic ' + btoa(`${zugang.username}:${zugang.password}`),
    'Content-Type': 'application/json',
  }
  if (useProxy) headers['X-Proxy-Target'] = zugang.baseUrl

  return axios.create({
    baseURL: (useProxy ? '/svws-proxy' : zugang.baseUrl) + pfad,
    timeout: 30_000,
    headers,
  })
}

/** Client für die Endpunkte eines Schemas (/db/{schema}/…) */
export function erzeugeSchemaClient(schluessel: VerbindungsSchluessel, zugang: Zugang, schema: string): AxiosInstance {
  const client = erzeugeClient(zugang, `/db/${encodeURIComponent(schema)}`)
  _clients.set(schluessel, client)
  return client
}

/**
 * Client für die serverweiten Endpunkte (/api/schema/…). Für /api/schema/root/… mit Root-Zugang,
 * bei eigenem Port für privilegierte Zugriffe mit dessen Adresse (ADR 003, Abschnitt 2).
 * Wird nicht registriert, weil er nur für einzelne Schritte gebraucht wird.
 */
export function erzeugeServerClient(zugang: Zugang): AxiosInstance {
  return erzeugeClient(zugang, '')
}

export function getClient(schluessel: VerbindungsSchluessel): AxiosInstance {
  const client = _clients.get(schluessel)
  if (!client) throw new Error(`Keine Verbindung "${schluessel}". Bitte zuerst verbinden.`)
  return client
}

export function entferneClient(schluessel: VerbindungsSchluessel): void {
  _clients.delete(schluessel)
}

export function entferneAlleClients(): void {
  _clients.clear()
}
