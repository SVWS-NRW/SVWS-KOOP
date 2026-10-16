import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { erzeugeSchemaClient, entferneAlleClients } from '@/services/apiClient'
import { ladeSchulstammdaten } from '@/services/svwsService'

export interface AuthConfig {
  baseUrl: string
  schema: string
  username: string
  password: string
}

/** Schlüssel der Verbindung zur KOOP-DB */
export const KOOP = 'koop'

// Zugangsdaten werden nur im Client (Arbeitsspeicher) gehalten, nie im Store oder Storage (ADR 001, Abschnitt 3)
export const useAuthStore = defineStore('auth', () => {
  const baseUrl = ref('')
  const schema = ref('')
  const username = ref('')
  const schulNr = ref<number | null>(null)
  const schulbezeichnung = ref('')
  const _connected = ref(false)

  const isConnected = computed(() => _connected.value)

  async function connect(config: AuthConfig): Promise<void> {
    const client = erzeugeSchemaClient(KOOP, config, config.schema)
    const stammdaten = await ladeSchulstammdaten(client)
    baseUrl.value = config.baseUrl
    schema.value = config.schema
    username.value = config.username
    schulNr.value = stammdaten.schulNr
    schulbezeichnung.value = stammdaten.bezeichnung1
    _connected.value = true
  }

  function disconnect(): void {
    entferneAlleClients()
    baseUrl.value = ''
    schema.value = ''
    username.value = ''
    schulNr.value = null
    schulbezeichnung.value = ''
    _connected.value = false
  }

  return { baseUrl, schema, username, schulNr, schulbezeichnung, isConnected, connect, disconnect }
})
