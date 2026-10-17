import { describe, it, expect } from 'vitest'
import axios, { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios'
import { istWiederholbar, wartezeit, mitWiederholung, MAX_VERSUCHE } from './wiederholung'

describe('istWiederholbar', () => {
  it('wiederholt schreibende POST-Aufrufe bei HTTP 500', () => {
    expect(istWiederholbar('post', '/lehrer/create', 500)).toBe(true)
    expect(istWiederholbar('POST', '/schueler/erzieher/new/12/1', 500)).toBe(true)
    expect(istWiederholbar('post', '/schueler/12/telefon', 500)).toBe(true)
    expect(istWiederholbar('post', '/lehrer/personalabschnittsdaten', 500)).toBe(true)
  })

  it('wiederholt keine Lesezugriffe per POST, keine Schema-Endpunkte, keine anderen Methoden und Status', () => {
    expect(istWiederholbar('post', '/schueler/stammdaten', 500)).toBe(false)
    expect(istWiederholbar('post', '/api/schema/root/create/koop', 500)).toBe(false)
    expect(istWiederholbar('patch', '/lehrer/create', 500)).toBe(false)
    expect(istWiederholbar('post', '/lehrer/create', 400)).toBe(false)
  })
})

describe('wartezeit', () => {
  it('wächst exponentiell, ist zufällig verteilt und begrenzt', () => {
    expect(wartezeit(1, () => 1)).toBe(100)
    expect(wartezeit(2, () => 1)).toBe(200)
    expect(wartezeit(10, () => 1)).toBe(1000)
    expect(wartezeit(3, () => 0)).toBe(0)
    expect(wartezeit(3, () => 0.5)).toBe(200)
  })
})

/** Adapter, der die ersten n Aufrufe mit 500 beantwortet */
function adapter(fehlschlaege: number, zaehler: { n: number }): AxiosAdapter {
  return async (config: InternalAxiosRequestConfig) => {
    zaehler.n++
    if (zaehler.n <= fehlschlaege) {
      throw new AxiosError('Fehler', 'ERR_BAD_RESPONSE', config, null, { status: 500, statusText: '', data: '', headers: {}, config })
    }
    return { status: 201, statusText: 'Created', data: { id: 7 }, headers: {}, config }
  }
}

describe('mitWiederholung', () => {
  it('wiederholt ein Anlegen nach 500 und liefert das Ergebnis', async () => {
    const zaehler = { n: 0 }
    const client = mitWiederholung(axios.create({ adapter: adapter(2, zaehler) }))
    const r = await client.post('/lehrer/create', {})
    expect(r.data.id).toBe(7)
    expect(zaehler.n).toBe(3)
  })

  it('gibt nach der maximalen Zahl von Versuchen auf', async () => {
    const zaehler = { n: 0 }
    const client = mitWiederholung(axios.create({ adapter: adapter(99, zaehler) }))
    await expect(client.post('/lehrer/create', {})).rejects.toThrow()
    expect(zaehler.n).toBe(MAX_VERSUCHE)
  })

  it('wiederholt Lesezugriffe per POST nicht', async () => {
    const zaehler = { n: 0 }
    const client = mitWiederholung(axios.create({ adapter: adapter(1, zaehler) }))
    await expect(client.post('/schueler/stammdaten', [1])).rejects.toThrow()
    expect(zaehler.n).toBe(1)
  })
})
