import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { AxiosInstance } from 'axios'
import { KOOP, getClient, quellSchluessel, erzeugeSchemaClient, entferneClient } from '@/services/apiClient'
import { ladeKonfiguration, ladeSchulstammdaten } from '@/services/svwsService'
import { KONFIG_QUELLEN, type QuellInfo } from '@/models/Quelle'
import { useAuthStore } from './auth'

// Quell-DBs der Kooperation. Die Liste steht in der KOOP-DB, die Zugangsdaten nur im Client (ADR 001, Abschnitt 3).
export const useQuellenStore = defineStore('quellen', () => {
  const quellen = ref<QuellInfo[]>([])
  const verbunden = ref<Record<number, boolean>>({})

  const alleVerbunden = computed(() => quellen.value.length > 0 && quellen.value.every(q => verbunden.value[q.nr]))

  /** Lädt die Liste der Quell-DBs aus der KOOP-DB */
  async function laden(): Promise<void> {
    const wert = await ladeKonfiguration(getClient(KOOP), KONFIG_QUELLEN)
    const liste = wert ? (JSON.parse(wert) as QuellInfo[]) : []
    // Bestehende Anmeldungen bleiben erhalten, solange sich die Quell-DB nicht geändert hat
    const alt = quellen.value
    quellen.value = liste
    verbunden.value = Object.fromEntries(liste.map(q => {
      const vorher = alt.find(a => a.nr === q.nr)
      return [q.nr, !!vorher && vorher.schema === q.schema && !!verbunden.value[q.nr]]
    }))
  }

  /** Meldet sich an einer Quell-DB an und prüft, ob sie die erwartete Schule enthält */
  async function verbinde(nr: number, username: string, password: string): Promise<void> {
    const q = quellen.value.find(x => x.nr === nr)
    if (!q) throw new Error(`Es gibt keine Quell-DB ${nr}.`)
    const auth = useAuthStore()
    const client = erzeugeSchemaClient(quellSchluessel(nr), { baseUrl: auth.baseUrl, username, password }, q.schema)
    try {
      const stammdaten = await ladeSchulstammdaten(client)
      if (stammdaten.schulNr !== q.schulNr) {
        throw new Error(`Das Schema „${q.schema}“ enthält die Schule ${stammdaten.schulNr}, erwartet wurde ${q.schulNr}.`)
      }
      verbunden.value[nr] = true
    } catch (e) {
      entferneClient(quellSchluessel(nr))
      verbunden.value[nr] = false
      throw e
    }
  }

  /** Übernimmt die Quell-DBs direkt aus dem Assistenten, dort sind die Clients bereits angemeldet */
  function uebernehmeAusEinrichtung(liste: QuellInfo[]): void {
    quellen.value = liste
    verbunden.value = Object.fromEntries(liste.map(q => [q.nr, true]))
  }

  function clients(): Record<number, AxiosInstance> {
    return Object.fromEntries(quellen.value.map(q => [q.nr, getClient(quellSchluessel(q.nr))]))
  }

  function zuruecksetzen(): void {
    quellen.value = []
    verbunden.value = {}
  }

  return { quellen, verbunden, alleVerbunden, laden, verbinde, uebernehmeAusEinrichtung, clients, zuruecksetzen }
})
