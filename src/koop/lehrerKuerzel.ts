// Lehrerkürzel in der KOOP-DB: <Kürzel in der Quellschule>-<Nr der Quellschule>, z. B. MÜL-2
// (ADR 002, „Quellschulen und Lehrkräfte in der KOOP-DB“)

/** Maximale Länge eines Lehrerkürzels im SVWS-Server (Spalte K_Lehrer.Kuerzel) */
export const MAX_KUERZEL_LAENGE = 10

/** Maximale Länge eines Kürzels in der Quellschule, damit das Suffix -<Nr> passt */
export const MAX_QUELL_KUERZEL_LAENGE = MAX_KUERZEL_LAENGE - 2

export const MIN_SCHUL_NR = 1
export const MAX_SCHUL_NR = 9

export interface KoopKuerzel {
  kuerzel: string
  nr: number
}

/** Prüft, ob ein Kürzel der Quellschule in die KOOP-DB übernommen werden kann (Konsistenzprüfung, A7) */
export function istQuellKuerzelZulaessig(kuerzel: string): boolean {
  const k = kuerzel.trim()
  return k.length > 0 && k.length <= MAX_QUELL_KUERZEL_LAENGE
}

/** Bildet aus Kürzel und Nummer der Quellschule das Kürzel in der KOOP-DB */
export function bildeKoopKuerzel(kuerzel: string, nr: number): string {
  const k = kuerzel.trim()
  if (!istQuellKuerzelZulaessig(k)) {
    throw new Error(`Das Kürzel "${kuerzel}" ist leer oder länger als ${MAX_QUELL_KUERZEL_LAENGE} Zeichen.`)
  }
  if (!Number.isInteger(nr) || nr < MIN_SCHUL_NR || nr > MAX_SCHUL_NR) {
    throw new Error(`Die Nummer der Quellschule muss zwischen ${MIN_SCHUL_NR} und ${MAX_SCHUL_NR} liegen.`)
  }
  return `${k}-${nr}`
}

/** Zerlegt ein Kürzel der KOOP-DB in Kürzel und Nummer der Quellschule, oder null, wenn es kein KOOP-Kürzel ist */
export function zerlegeKoopKuerzel(koopKuerzel: string): KoopKuerzel | null {
  const treffer = /^(.+)-([1-9])$/.exec(koopKuerzel.trim())
  if (!treffer) return null
  return { kuerzel: treffer[1], nr: Number(treffer[2]) }
}
