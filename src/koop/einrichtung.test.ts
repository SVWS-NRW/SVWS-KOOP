import { describe, it, expect } from 'vitest'
import {
  istSchemaNameGueltig, istDbBenutzerGueltig, normalisiereUrl, pruefeServer, pruefeQuellen,
  pruefeKoop, pruefeBenutzer, bildeKoopBezeichnung, MAX_BEZEICHNUNG,
  type QuellAngaben, type KoopAngaben,
} from './einrichtung'

function quelle(nr: number, schema: string, schulNr: number | null, schulname = `Schule ${nr}`): QuellAngaben {
  return { nr, schema, svwsUser: 'Admin', svwsPassword: '', schulNr, schulname }
}

const vorhanden = ['gymnasium', 'svwsdb', 'svwsge']
const quellen = [quelle(1, 'gymnasium', 123456), quelle(2, 'svwsdb', 168890)]

function koop(teil: Partial<KoopAngaben> = {}): KoopAngaben {
  return { schema: 'koop2026', dbUser: 'koop2026', dbPassword: 'geheim', schulNr: 123456, adminPassword: '', ...teil }
}

describe('Namen', () => {
  it('erlaubt nur Kleinbuchstaben, Ziffern und _ als Schemaname', () => {
    expect(istSchemaNameGueltig('koop_2026')).toBe(true)
    expect(istSchemaNameGueltig('Koop')).toBe(false)
    expect(istSchemaNameGueltig('2026koop')).toBe(false)
    expect(istSchemaNameGueltig('koop-2026')).toBe(false)
    expect(istSchemaNameGueltig('mysql')).toBe(false)
  })

  it('lehnt reservierte Datenbank-Benutzer ab', () => {
    expect(istDbBenutzerGueltig('koopadmin')).toBe(true)
    expect(istDbBenutzerGueltig('root')).toBe(false)
    expect(istDbBenutzerGueltig('Root')).toBe(false)
    expect(istDbBenutzerGueltig('a'.repeat(33))).toBe(false)
  })

  it('normalisiert URLs', () => {
    expect(normalisiereUrl(' https://localhost:8443/ ')).toBe('https://localhost:8443')
  })
})

describe('pruefeServer', () => {
  it('verlangt eine gültige URL und einen Root-Benutzer', () => {
    expect(pruefeServer({ baseUrl: 'https://localhost:8443', privilegedUrl: '', rootUser: 'root', rootPassword: '' })).toEqual([])
    expect(pruefeServer({ baseUrl: 'localhost', privilegedUrl: 'ftp://x', rootUser: '', rootPassword: '' })).toHaveLength(3)
  })
})

describe('pruefeQuellen', () => {
  it('akzeptiert zwei geprüfte, verschiedene Quellen', () => {
    expect(pruefeQuellen(quellen, vorhanden)).toEqual([])
  })

  it('verlangt zwei bis drei Quellen', () => {
    expect(pruefeQuellen([quellen[0]], vorhanden)).toHaveLength(1)
  })

  it('erkennt doppelte Schemata und Schulnummern', () => {
    const fehler = pruefeQuellen([quelle(1, 'svwsdb', 168890), quelle(2, 'svwsdb', 168890)], vorhanden)
    expect(fehler.some(f => f.includes('mehrfach ausgewählt'))).toBe(true)
    expect(fehler.some(f => f.includes('Schulnummer 168890'))).toBe(true)
  })

  it('verlangt eine geprüfte Verbindung und ein vorhandenes Schema', () => {
    const fehler = pruefeQuellen([quelle(1, 'gibtsnicht', null), quellen[1]], vorhanden)
    expect(fehler.some(f => f.includes('gibt es auf dem Server nicht'))).toBe(true)
    expect(fehler.some(f => f.includes('noch nicht erfolgreich geprüft'))).toBe(true)
  })
})

describe('pruefeKoop', () => {
  it('akzeptiert gültige Angaben', () => {
    expect(pruefeKoop(koop(), quellen, vorhanden)).toEqual([])
  })

  it('lehnt vorhandene Schemata und Namen der Quell-DBs ab', () => {
    expect(pruefeKoop(koop({ schema: 'svwsge' }), quellen, vorhanden)).toHaveLength(1)
    expect(pruefeKoop(koop({ schema: 'svwsdb' }), quellen, vorhanden).length).toBeGreaterThanOrEqual(1)
  })

  it('verlangt eine Schulnummer aus den Quellschulen', () => {
    expect(pruefeKoop(koop({ schulNr: 999999 }), quellen, vorhanden)).toHaveLength(1)
    expect(pruefeKoop(koop({ schulNr: null }), quellen, vorhanden)).toHaveLength(1)
  })

  it('verlangt Datenbank-Benutzer und Kennwort', () => {
    expect(pruefeKoop(koop({ dbUser: 'root', dbPassword: '' }), quellen, vorhanden)).toHaveLength(2)
  })
})

describe('pruefeBenutzer', () => {
  it('verlangt eindeutige Namen außer Admin und ein Kennwort', () => {
    expect(pruefeBenutzer([
      { nr: 1, benutzername: 'Schule1', anzeigename: '', password: 'x' },
      { nr: 2, benutzername: 'Schule2', anzeigename: '', password: 'y' },
    ])).toEqual([])
    const fehler = pruefeBenutzer([
      { nr: 1, benutzername: 'admin', anzeigename: '', password: '' },
      { nr: 2, benutzername: 'Schule1', anzeigename: '', password: 'x' },
      { nr: 3, benutzername: 'schule1', anzeigename: '', password: 'x' },
    ])
    expect(fehler).toHaveLength(3)
  })
})

describe('bildeKoopBezeichnung', () => {
  it('kennzeichnet die KOOP-DB und hält die Feldlänge ein', () => {
    const b = bildeKoopBezeichnung([
      quelle(1, 'a', 123456, 'Ein sehr langer Schulname für ein Gymnasium'),
      quelle(2, 'b', 168890, 'Albert Zweistein Gymnasium'),
    ])
    expect(b.bezeichnung1).toContain('KOOP-DB')
    expect(b.bezeichnung2).toBe('Kooperation 123456 / 168890')
    expect(b.bezeichnung3.length).toBeLessThanOrEqual(MAX_BEZEICHNUNG)
  })
})
