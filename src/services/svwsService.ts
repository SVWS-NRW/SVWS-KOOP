import type { AxiosInstance } from 'axios'
import type { Schulstammdaten } from '@/models/Schule'

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
