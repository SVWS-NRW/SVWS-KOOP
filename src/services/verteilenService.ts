import type { AxiosInstance } from 'axios'
import { exportiereSqlite, ladeKonfiguration, setzeKonfiguration } from '@/services/svwsService'

// Verteilen (ADR 002, Phase 3; ADR 004, Abschnitt 1): Stand in die KOOP-DB schreiben, danach das Backup erstellen,
// das an jede Kooperationsschule weitergegeben wird.

/** Schlüssel des Stands in der Client-Konfiguration der KOOP-DB */
export const KONFIG_STAND = 'stand'

/** Zeitpunkt der letzten Verteilung (ISO), oder null, wenn noch nicht verteilt wurde */
export async function ladeStand(koop: AxiosInstance): Promise<string | null> {
  return ladeKonfiguration(koop, KONFIG_STAND)
}

/**
 * Schreibt den Stand und erstellt danach das Backup, damit der Stand im Backup enthalten ist. Scheitert der Export,
 * bleibt der neue Stand stehen. Ein erneuter Lauf setzt ihn wieder neu.
 */
export async function verteile(koop: AxiosInstance, schema: string, jetzt = new Date()): Promise<{ stand: string, datei: Blob, dateiname: string }> {
  const stand = jetzt.toISOString()
  await setzeKonfiguration(koop, KONFIG_STAND, stand)
  const { datei, dateiname } = await exportiereSqlite(koop)
  return { stand, datei, dateiname: dateiname ?? `${schema}_${stand.slice(0, 16).replace(/[-:]/g, '').replace('T', '_')}.sqlite` }
}
