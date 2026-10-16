/** Auszug aus den Schulstammdaten des SVWS-Servers (/db/{schema}/schule/stammdaten) */
export interface Schulstammdaten {
  schulNr: number
  schulform: string
  bezeichnung1: string
}

/** Eintrag im Schulkatalog einer Datenbank (/db/{schema}/schule/schulen) */
export interface SchulkatalogEintrag {
  id: number
  schulnummerStatistik: string | null
  kuerzel: string | null
  kurzbezeichnung: string | null
  name: string
}
