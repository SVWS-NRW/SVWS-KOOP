<template>
  <div class="seite">
    <header class="kopf">
      <div>
        <h1>Übernahme in die KOOP-DB</h1>
        <p class="untertitel">Lehrkräfte und Schüler der Jahrgänge 10, EF, Q1 und Q2 aus allen Quell-DBs. Alle Schritte lassen sich wiederholen.</p>
      </div>
      <div class="kopf-aktionen">
        <ThemeToggle />
        <Button label="Zum Dashboard" icon="pi pi-th-large" severity="secondary" text :disabled="laeuft !== null" @click="router.push({ name: 'dashboard' })" />
      </div>
    </header>

    <section class="karte">
      <h2>Quell-DBs</h2>
      <QuellAnmeldung />
      <div class="aktionen">
        <Button label="Konsistenz prüfen" icon="pi pi-check-square" severity="secondary" :disabled="!quellen.alleVerbunden || laeuft !== null" :loading="prueft" @click="pruefe" />
        <Message v-if="anzahlFehler !== null && anzahlFehler === 0" severity="success" :closable="false">Keine Fehler. Die Übernahme ist möglich.</Message>
        <Message v-else-if="anzahlFehler !== null" severity="error" :closable="false">
          {{ anzahlFehler }} Fehler in der Konsistenzprüfung. Bitte zuerst unter „Konsistenz prüfen“ beheben.
        </Message>
      </div>
    </section>

    <section v-for="teil in teile" :key="teil.id" class="karte">
      <div class="teil-kopf">
        <h2>{{ teil.nr }}. {{ teil.titel }}</h2>
        <Button
          :label="ergebnisse[teil.id] ? 'Erneut ausführen' : 'Ausführen'"
          icon="pi pi-play"
          :severity="ergebnisse[teil.id] ? 'secondary' : undefined"
          :disabled="anzahlFehler !== 0 || laeuft !== null"
          :loading="laeuft === teil.id"
          @click="fuehreAus(teil.id)"
        />
      </div>
      <p class="hinweis">{{ teil.beschreibung }}</p>

      <div v-if="laeuft === teil.id" class="fortschritt">
        <ProgressBar :value="fortschritt.gesamt ? Math.round(100 * fortschritt.erledigt / fortschritt.gesamt) : undefined" :mode="fortschritt.gesamt ? 'determinate' : 'indeterminate'" />
        <span class="hinweis">{{ fortschritt.text }}</span>
      </div>

      <template v-if="ergebnisse[teil.id]">
        <div class="zaehler-zeile">
          <span v-for="art in ARTEN" :key="art" class="zaehler" :class="art">{{ ergebnisse[teil.id]!.anzahl(art) }} {{ ART_TITEL[art] }}</span>
        </div>
        <details class="protokoll" :open="ergebnisse[teil.id]!.anzahl('fehler') > 0">
          <summary>Protokoll ({{ ergebnisse[teil.id]!.eintraege.length }} Einträge)</summary>
          <ul>
            <li v-for="(e, i) in sortiert(ergebnisse[teil.id]!)" :key="i" :class="e.art">
              <span class="art">{{ ART_TITEL[e.art] }}</span> <span class="bereich">{{ e.bereich }}</span> {{ e.text }}
            </li>
          </ul>
        </details>
      </template>
    </section>

    <LegalFooter />
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useConfirm } from 'primevue/useconfirm'
import Button from 'primevue/button'
import Message from 'primevue/message'
import ProgressBar from 'primevue/progressbar'
import ThemeToggle from '@/components/ThemeToggle.vue'
import LegalFooter from '@/components/LegalFooter.vue'
import QuellAnmeldung from '@/components/QuellAnmeldung.vue'
import { useQuellenStore } from '@/stores/quellen'
import { useAuthStore } from '@/stores/auth'
import { useErrorService } from '@/services/errorService'
import { KOOP, getClient } from '@/services/apiClient'
import { ladeQuellStand } from '@/services/konsistenzService'
import { bereiteKoopVor, uebernehmeLehrkraefte, uebernehmeSchueler, type QuellKontext } from '@/services/uebernahmeService'
import { pruefeKonsistenz } from '@/koop/konsistenz'
import type { Protokoll, ProtokollArt, ProtokollEintrag } from '@/koop/uebernahme'

type TeilId = 'vorbereiten' | 'lehrkraefte' | 'schueler'

const teile: { id: TeilId, nr: number, titel: string, beschreibung: string }[] = [
  { id: 'vorbereiten', nr: 1, titel: 'KOOP-DB vorbereiten', beschreibung: 'Jahrgänge, Fächer, Klassen 10/EF/Q1/Q2, Abiturjahrgänge mit Einstellungen und Leitfächern, Kataloge (Erzieherarten, Telefonarten, Religionen, Orte, Fahrschülerarten, Haltestellen) als Vereinigung aller Quell-DBs.' },
  { id: 'lehrkraefte', nr: 2, titel: 'Lehrkräfte übernehmen', beschreibung: 'Alle aktiven Lehrkräfte mit Kürzel <Kürzel>-<Nr> und Stammschule, ohne Platzhalter. Vorhandene Lehrkräfte werden aktualisiert.' },
  { id: 'schueler', nr: 3, titel: 'Schüler übernehmen', beschreibung: 'Schüler der Jahrgänge 10, EF, Q1, Q2 (Aufnahme, Aktiv, Beurlaubt) mit Stammdaten, Erziehern, Telefonnummern, Sprachenfolge und Fachwahlen. Bereits übernommene Schüler erhalten nur aktualisierte Stammdaten. Das kann einige Minuten dauern.' },
]

const ARTEN: ProtokollArt[] = ['neu', 'aktualisiert', 'uebersprungen', 'hinweis', 'fehler']
const ART_TITEL: Record<ProtokollArt, string> = { neu: 'neu', aktualisiert: 'aktualisiert', uebersprungen: 'übersprungen', hinweis: 'Hinweise', fehler: 'Fehler' }

const router = useRouter()
const confirm = useConfirm()
const quellen = useQuellenStore()
const auth = useAuthStore()
const { reportError } = useErrorService()

const prueft = ref(false)
const anzahlFehler = ref<number | null>(null)
const laeuft = ref<TeilId | null>(null)
const fortschritt = reactive({ text: '', erledigt: 0, gesamt: 0 })
const ergebnisse = reactive<Partial<Record<TeilId, Protokoll>>>({})

onMounted(async () => {
  try {
    await quellen.laden()
  } catch (e) {
    reportError(e, 'uebernahme:quellen')
  }
})

function kontexte(): QuellKontext[] {
  const clients = quellen.clients()
  return quellen.quellen.map(info => ({ info, client: clients[info.nr] }))
}

async function pruefe() {
  prueft.value = true
  try {
    const staende = await Promise.all(kontexte().map(k => ladeQuellStand(k.client, k.info.nr, k.info.schulNr, k.info.schulname)))
    anzahlFehler.value = pruefeKonsistenz(staende.map(s => s.daten)).filter(a => a.schwere === 'fehler').length
  } catch (e) {
    reportError(e, 'uebernahme:pruefen')
  } finally {
    prueft.value = false
  }
}

function fuehreAus(id: TeilId) {
  const teil = teile.find(t => t.id === id)!
  confirm.require({
    header: teil.titel,
    message: `„${teil.titel}“ schreibt in die KOOP-DB „${auth.schema}“. Fortfahren?`,
    acceptLabel: 'Ausführen',
    rejectLabel: 'Abbrechen',
    accept: async () => {
      laeuft.value = id
      Object.assign(fortschritt, { text: '', erledigt: 0, gesamt: 0 })
      const melde = (text: string, erledigt = 0, gesamt = 0) => Object.assign(fortschritt, { text, erledigt, gesamt })
      try {
        const koop = getClient(KOOP)
        ergebnisse[id] = id === 'vorbereiten' ? await bereiteKoopVor(koop, kontexte(), auth.schulNr, melde)
          : id === 'lehrkraefte' ? await uebernehmeLehrkraefte(koop, kontexte(), melde)
            : await uebernehmeSchueler(koop, kontexte(), melde)
      } catch (e) {
        reportError(e, `uebernahme:${id}`)
      } finally {
        laeuft.value = null
      }
    },
  })
}

const REIHENFOLGE: Record<ProtokollArt, number> = { fehler: 0, hinweis: 1, uebersprungen: 2, neu: 3, aktualisiert: 4 }
function sortiert(p: Protokoll): ProtokollEintrag[] {
  return [...p.eintraege].sort((a, b) => REIHENFOLGE[a.art] - REIHENFOLGE[b.art])
}

</script>

<style scoped>
.seite {
  min-height: 100vh;
  max-width: 1100px;
  margin: 0 auto;
  padding: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.kopf {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.kopf h1 {
  margin: 0;
  font-size: 1.5rem;
  color: var(--accent);
}

.untertitel {
  margin: 0.25rem 0 0;
  font-size: 0.9rem;
  color: var(--p-text-muted-color);
}

.kopf-aktionen {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.karte {
  background: var(--surface);
  border: 1px solid var(--app-border);
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06);
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.karte h2 {
  margin: 0;
  font-size: 1.15rem;
}

.teil-kopf {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.aktionen {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.hinweis {
  margin: 0;
  font-size: 0.85rem;
  color: var(--p-text-muted-color);
}

.fortschritt {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.zaehler-zeile {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  font-size: 0.85rem;
}

.zaehler.neu { color: var(--koop-ok); font-weight: 600; }
.zaehler.fehler { color: var(--koop-fehler); font-weight: 600; }
.zaehler.hinweis { color: var(--koop-warnung); font-weight: 600; }

.protokoll summary {
  cursor: pointer;
  font-weight: 500;
}

.protokoll ul {
  list-style: none;
  margin: 0.6rem 0 0;
  padding: 0;
  max-height: 22rem;
  overflow: auto;
  font-size: 0.82rem;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.protokoll .art {
  display: inline-block;
  min-width: 6.5rem;
  font-weight: 600;
}

.protokoll .bereich {
  color: var(--p-text-muted-color);
  margin-right: 0.4rem;
}

.protokoll li.fehler .art { color: var(--koop-fehler); }
.protokoll li.hinweis .art { color: var(--koop-warnung); }
.protokoll li.neu .art { color: var(--koop-ok); }
</style>
