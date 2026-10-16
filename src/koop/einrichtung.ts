// Angaben und Prüfregeln für den Assistenten „KOOP-DB einrichten“ (ADR 003, Abschnitt 1)

export const MIN_QUELLEN = 2
export const MAX_QUELLEN = 3

/** Strengere Regel als der SVWS-Server, damit Schemanamen auf allen Datenbanksystemen funktionieren */
const SCHEMA_NAME = /^[a-z][a-z0-9_]{0,63}$/
const DB_BENUTZER_NAME = /^[A-Za-z][A-Za-z0-9_]{0,31}$/

/** Vom SVWS-Server reservierte Namen (DBRootManager) */
const RESERVIERTE_SCHEMATA = new Set(['information_schema', 'mysql', 'performance_schema', 'sys', 'master', 'tempdb', 'model', 'msdb'])
const RESERVIERTE_DB_BENUTZER = new Set(['root', 'mysql.infoschema', 'mysql.session', 'mysql.sys', 'sa'])

/** Feldlänge von Bezeichnung1–3 in den Schulstammdaten */
export const MAX_BEZEICHNUNG = 50

export interface ServerAngaben {
  baseUrl: string
  /** Adresse für privilegierte Zugriffe, leer = wie baseUrl */
  privilegedUrl: string
  rootUser: string
  rootPassword: string
}

export interface QuellAngaben {
  /** Nummer der Schule (1–3), bestimmt das Suffix der Lehrerkürzel */
  nr: number
  schema: string
  svwsUser: string
  svwsPassword: string
  /** wird beim Prüfen der Verbindung gesetzt */
  schulNr: number | null
  schulname: string
}

export interface KoopAngaben {
  schema: string
  dbUser: string
  dbPassword: string
  schulNr: number | null
  /** leer = Admin bleibt ohne Kennwort */
  adminPassword: string
}

export interface BenutzerAngaben {
  nr: number
  benutzername: string
  anzeigename: string
  password: string
}

export interface EinrichtungsAngaben {
  server: ServerAngaben
  quellen: QuellAngaben[]
  koop: KoopAngaben
  benutzer: BenutzerAngaben[]
}

export function istSchemaNameGueltig(name: string): boolean {
  return SCHEMA_NAME.test(name) && !RESERVIERTE_SCHEMATA.has(name)
}

export function istDbBenutzerGueltig(name: string): boolean {
  return DB_BENUTZER_NAME.test(name) && !RESERVIERTE_DB_BENUTZER.has(name.toLowerCase())
}

export function istUrlGueltig(url: string): boolean {
  return /^https?:\/\/[^\s/]+/.test(url.trim())
}

/** Entfernt Leerzeichen und abschließende Schrägstriche */
export function normalisiereUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

export function pruefeServer(server: ServerAngaben): string[] {
  const fehler: string[] = []
  if (!istUrlGueltig(server.baseUrl)) fehler.push('Die Server-URL muss mit http:// oder https:// beginnen.')
  if (server.privilegedUrl.trim() !== '' && !istUrlGueltig(server.privilegedUrl)) {
    fehler.push('Die Adresse für privilegierte Zugriffe muss mit http:// oder https:// beginnen.')
  }
  if (server.rootUser.trim() === '') fehler.push('Der Benutzername des Datenbank-Root fehlt.')
  return fehler
}

/**
 * Prüft die Quell-DBs.
 * @param vorhandeneSchemata  Schemata auf dem KOOP-Server (aus /api/schema/liste/alle)
 */
export function pruefeQuellen(quellen: QuellAngaben[], vorhandeneSchemata: string[]): string[] {
  const fehler: string[] = []
  if (quellen.length < MIN_QUELLEN || quellen.length > MAX_QUELLEN) {
    fehler.push(`Es müssen ${MIN_QUELLEN} bis ${MAX_QUELLEN} Quell-DBs angegeben werden.`)
  }
  const schemata = new Set<string>()
  const schulnummern = new Set<number>()
  for (const q of quellen) {
    const name = `Quell-DB ${q.nr}`
    if (q.schema === '') {
      fehler.push(`${name}: Es ist kein Schema ausgewählt.`)
    } else {
      if (!vorhandeneSchemata.includes(q.schema)) fehler.push(`${name}: Das Schema „${q.schema}“ gibt es auf dem Server nicht.`)
      if (schemata.has(q.schema)) fehler.push(`${name}: Das Schema „${q.schema}“ ist mehrfach ausgewählt.`)
      schemata.add(q.schema)
    }
    if (q.svwsUser.trim() === '') fehler.push(`${name}: Der SVWS-Benutzer fehlt.`)
    if (q.schulNr === null) {
      fehler.push(`${name}: Die Verbindung wurde noch nicht erfolgreich geprüft.`)
    } else {
      if (schulnummern.has(q.schulNr)) fehler.push(`${name}: Die Schulnummer ${q.schulNr} kommt mehrfach vor.`)
      schulnummern.add(q.schulNr)
    }
  }
  return fehler
}

export function pruefeKoop(koop: KoopAngaben, quellen: QuellAngaben[], vorhandeneSchemata: string[]): string[] {
  const fehler: string[] = []
  if (!istSchemaNameGueltig(koop.schema)) {
    fehler.push('Der Name der KOOP-DB darf nur Kleinbuchstaben, Ziffern und _ enthalten und muss mit einem Buchstaben beginnen.')
  } else if (vorhandeneSchemata.includes(koop.schema)) {
    fehler.push(`Ein Schema „${koop.schema}“ gibt es auf dem Server bereits.`)
  }
  if (quellen.some(q => q.schema === koop.schema)) fehler.push('Die KOOP-DB muss anders heißen als die Quell-DBs.')
  if (!istDbBenutzerGueltig(koop.dbUser)) {
    fehler.push('Der Datenbank-Benutzer der KOOP-DB darf nur Buchstaben, Ziffern und _ enthalten (höchstens 32 Zeichen) und nicht reserviert sein.')
  }
  if (koop.dbPassword === '') fehler.push('Das Kennwort des Datenbank-Benutzers fehlt.')
  if (koop.schulNr === null || !quellen.some(q => q.schulNr === koop.schulNr)) {
    fehler.push('Für die KOOP-DB muss die Schulnummer einer der Quellschulen ausgewählt werden.')
  }
  return fehler
}

export function pruefeBenutzer(benutzer: BenutzerAngaben[]): string[] {
  const fehler: string[] = []
  const namen = new Set<string>()
  for (const b of benutzer) {
    const name = b.benutzername.trim()
    const bezug = `Benutzer für Schule ${b.nr}`
    if (name === '') {
      fehler.push(`${bezug}: Der Benutzername fehlt.`)
      continue
    }
    if (name.toLowerCase() === 'admin') fehler.push(`${bezug}: Der Benutzername „Admin“ ist bereits vergeben.`)
    if (namen.has(name.toLowerCase())) fehler.push(`${bezug}: Der Benutzername „${name}“ kommt mehrfach vor.`)
    namen.add(name.toLowerCase())
    if (b.password === '') fehler.push(`${bezug}: Das Kennwort fehlt.`)
  }
  return fehler
}

export function pruefeAngaben(a: EinrichtungsAngaben, vorhandeneSchemata: string[]): string[] {
  return [
    ...pruefeServer(a.server),
    ...pruefeQuellen(a.quellen, vorhandeneSchemata),
    ...pruefeKoop(a.koop, a.quellen, vorhandeneSchemata),
    ...pruefeBenutzer(a.benutzer),
  ]
}

function kuerze(text: string, laenge: number): string {
  return text.length <= laenge ? text : text.slice(0, laenge - 1) + '…'
}

/** Schulbezeichnungen der KOOP-DB, damit sie nicht mit einer echten Schuldatenbank verwechselt wird (ADR 002, A6) */
export function bildeKoopBezeichnung(quellen: QuellAngaben[]): { bezeichnung1: string, bezeichnung2: string, bezeichnung3: string } {
  return {
    bezeichnung1: 'KOOP-DB – nicht für den Schulbetrieb',
    bezeichnung2: kuerze('Kooperation ' + quellen.map(q => q.schulNr).join(' / '), MAX_BEZEICHNUNG),
    bezeichnung3: kuerze(quellen.map(q => q.schulname).join(' / '), MAX_BEZEICHNUNG),
  }
}
