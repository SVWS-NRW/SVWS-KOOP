import { describe, it, expect } from 'vitest'
import type { AxiosInstance } from 'axios'
import { verteile } from './verteilenService'

/** Nachgebauter Client, der die Aufrufe mitschreibt */
function client(disposition?: string) {
  const aufrufe: string[] = []
  const c = {
    put: async (url: string, body: string) => { aufrufe.push(`PUT ${url} ${body}`) },
    get: async (url: string) => {
      aufrufe.push(`GET ${url}`)
      return { data: new Blob(['x']), headers: disposition ? { 'content-disposition': disposition } : {} }
    },
  }
  return { c: c as unknown as AxiosInstance, aufrufe }
}

describe('verteile', () => {
  const jetzt = new Date('2026-10-18T14:05:00Z')

  it('setzt zuerst den Stand und exportiert danach', async () => {
    const { c, aufrufe } = client('attachment; filename="kooptest_20261018_1605.sqlite"')
    const r = await verteile(c, 'kooptest', jetzt)
    expect(aufrufe).toEqual([
      'PUT /client/config/SVWS-KOOP/global/stand "2026-10-18T14:05:00.000Z"',
      'GET /export/sqlite',
    ])
    expect(r).toMatchObject({ stand: '2026-10-18T14:05:00.000Z', dateiname: 'kooptest_20261018_1605.sqlite' })
  })

  it('bildet einen Dateinamen, wenn der Server keinen liefert', async () => {
    const { c } = client()
    expect((await verteile(c, 'kooptest', jetzt)).dateiname).toBe('kooptest_20261018_1405.sqlite')
  })
})
