/** Quell-DB einer Kooperationsschule, wie sie in der KOOP-DB vermerkt ist (ohne Zugangsdaten) */
export interface QuellInfo {
  /** Nummer der Schule (1–3), Suffix der Lehrerkürzel */
  nr: number
  schema: string
  schulNr: number
  schulname: string
}

/** Schlüssel in der Client-Konfiguration der KOOP-DB */
export const KONFIG_QUELLEN = 'quellen'
