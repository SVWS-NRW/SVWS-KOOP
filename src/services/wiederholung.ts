import type { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios'

// Wiederholung mit Jitter für schreibende POST-Aufrufe (ADR 003, Abschnitt 7).
// Der SVWS-Server hat bei gleichzeitigen Create-Aufrufen eine Race Condition bei der Vergabe neuer IDs und antwortet
// dann mit HTTP 500. Um einige Millisekunden versetzt gelingt der Aufruf. Die Transaktion des fehlgeschlagenen
// Aufrufs wird verworfen, ein erneuter Versuch legt also nichts doppelt an.

export const MAX_VERSUCHE = 5
const BASIS_MS = 50
const MAX_MS = 1_000

/**
 * POST-Aufrufe, die nicht wiederholt werden: Lesen per POST (Stammdaten zu einer ID-Liste) und die Schema-Endpunkte
 * unter /api/schema/, die lange laufen (Anlegen, Einspielen, Löschen von Schemata).
 */
const NICHT_WIEDERHOLEN = [/\/schueler\/stammdaten$/, /^\/api\/schema\//]

/**
 * Wird der Aufruf bei diesem Fehler wiederholt? Alle schreibenden POST-Aufrufe bei HTTP 500. Die Race Condition betrifft
 * nicht nur …/create, sondern jedes Anlegen (getestet: Personalabschnittsdaten, Telefonnummern, Sprachen, Erzieher).
 */
export function istWiederholbar(methode: string | undefined, url: string | undefined, status: number | undefined): boolean {
  return (methode ?? '').toLowerCase() === 'post' && status === 500 && !NICHT_WIEDERHOLEN.some(r => r.test(url ?? ''))
}

/** Wartezeit vor dem n-ten erneuten Versuch (1, 2, …): exponentiell wachsend, zufällig verteilt (Full Jitter) */
export function wartezeit(versuch: number, zufall: () => number = Math.random): number {
  const obergrenze = Math.min(MAX_MS, BASIS_MS * 2 ** versuch)
  return Math.round(zufall() * obergrenze)
}

type ConfigMitVersuch = InternalAxiosRequestConfig & { _versuch?: number }

/** Zahl der bisher wiederholten Aufrufe (für Protokoll und Tests) */
export const wiederholungen = { anzahl: 0 }

/** Hängt die Wiederholung an einen Axios-Client */
export function mitWiederholung(client: AxiosInstance): AxiosInstance {
  client.interceptors.response.use(undefined, async (fehler: AxiosError) => {
    const config = fehler.config as ConfigMitVersuch | undefined
    if (!config || !istWiederholbar(config.method, config.url, fehler.response?.status)) throw fehler
    const versuch = (config._versuch ?? 1) + 1
    if (versuch > MAX_VERSUCHE) throw fehler
    config._versuch = versuch
    wiederholungen.anzahl++
    await new Promise(r => setTimeout(r, wartezeit(versuch - 1)))
    return client.request(config)
  })
  return client
}
