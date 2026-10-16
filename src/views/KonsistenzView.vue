<template>
  <div class="seite">
    <header class="kopf">
      <div>
        <h1>Konsistenz prüfen</h1>
        <p class="untertitel">Vergleicht die Einstellungen der Quell-DBs, bevor Schüler und Lehrkräfte übernommen werden.</p>
      </div>
      <div class="kopf-aktionen">
        <ThemeToggle />
        <Button label="Zum Dashboard" icon="pi pi-th-large" severity="secondary" text @click="router.push({ name: 'dashboard' })" />
      </div>
    </header>

    <section class="karte">
      <h2>Quell-DBs</h2>
      <QuellAnmeldung />
      <div class="aktionen">
        <Button label="Prüfen" icon="pi pi-search" :disabled="!quellen.alleVerbunden" :loading="prueft" @click="pruefe" />
        <span v-if="geprueftAm" class="hinweis">Zuletzt geprüft: {{ geprueftAm }}</span>
      </div>
    </section>

    <section v-if="geprueftAm" class="karte">
      <h2>Ergebnis</h2>
      <Message v-if="abweichungen.length === 0" severity="success" :closable="false">
        Keine Abweichungen. Die Quell-DBs passen zusammen.
      </Message>
      <template v-else>
        <Message severity="warn" :closable="false">
          {{ abweichungen.length }} Abweichungen. Die Übernahme ist erst möglich, wenn alle behoben sind.
          Korrekturen gelten nur für die Kopien auf dem KOOP-Server. Übernehmen Sie sie auch in der eigenen Datenbank der Schule.
        </Message>

        <div v-for="gruppe in gruppen" :key="gruppe.bereich" class="gruppe">
          <h3>{{ BEREICH_TITEL[gruppe.bereich] }} <span class="anzahl">{{ gruppe.eintraege.length }}</span></h3>
          <table class="tabelle">
            <thead>
              <tr>
                <th>Objekt</th>
                <th>Merkmal</th>
                <th v-for="q in quellen.quellen" :key="q.nr" :style="{ color: `var(--koop-schule-${q.nr})` }">Schule {{ q.nr }}</th>
                <th>Korrektur</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(a, i) in gruppe.eintraege" :key="i">
                <td>{{ a.objekt }}</td>
                <td>{{ a.merkmal }}</td>
                <td v-for="q in quellen.quellen" :key="q.nr" :class="{ fehlt: a.werte[q.nr] === undefined }">
                  {{ zeigeWert(a.werte[q.nr], q.nr in a.werte) }}
                </td>
                <td class="korrektur">
                  <template v-if="a.korrigierbar">
                    <Select
                      v-model="auswahl[schluessel(a)]"
                      :options="quellen.quellen.filter(q => a.werte[q.nr] !== undefined).map(q => ({ label: `Wert von Schule ${q.nr}`, value: q.nr }))"
                      optionLabel="label"
                      optionValue="value"
                      placeholder="Wert wählen"
                      size="small"
                    />
                    <Button
                      icon="pi pi-check"
                      size="small"
                      title="Übernehmen"
                      :disabled="auswahl[schluessel(a)] === undefined"
                      :loading="korrigiert === schluessel(a)"
                      @click="korrigiereAbweichung(a)"
                    />
                  </template>
                  <span v-else class="hinweis">in der Schule beheben</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </section>

    <section v-if="geprueftAm" class="karte">
      <h2>Jahrgänge in die KOOP-DB</h2>
      <p class="hinweis">
        Die beim Anlegen erzeugten Jahrgänge der KOOP-DB sind unvollständig, ihnen fehlt u. a. die Schulgliederung.
        SVWS-KOOP setzt „Standard für diese Schulform“ (***) und übernimmt Restabschnitte und Folgejahrgang
        aus der Quellschule, deren Schulnummer die KOOP-DB trägt.
      </p>
      <div class="aktionen">
        <Button
          label="Jahrgänge übertragen"
          icon="pi pi-arrow-right"
          severity="secondary"
          :disabled="hatJahrgangsAbweichung"
          :loading="uebertraegt"
          @click="uebertrageJahrgaengeInKoop"
        />
        <span v-if="hatJahrgangsAbweichung" class="hinweis">Erst müssen die Jahrgänge 10, EF, Q1 und Q2 in allen Quell-DBs vorhanden sein.</span>
      </div>
    </section>

    <LegalFooter />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useConfirm } from 'primevue/useconfirm'
import Button from 'primevue/button'
import Select from 'primevue/select'
import Message from 'primevue/message'
import ThemeToggle from '@/components/ThemeToggle.vue'
import LegalFooter from '@/components/LegalFooter.vue'
import QuellAnmeldung from '@/components/QuellAnmeldung.vue'
import { useQuellenStore } from '@/stores/quellen'
import { useAuthStore } from '@/stores/auth'
import { useErrorService } from '@/services/errorService'
import { KOOP, getClient } from '@/services/apiClient'
import { ladeQuellStand, korrigiere, uebertrageJahrgaenge, type QuellStand } from '@/services/konsistenzService'
import { pruefeKonsistenz, BEREICH_TITEL, type Abweichung, type Bereich, type Wert } from '@/koop/konsistenz'

const router = useRouter()
const confirm = useConfirm()
const quellen = useQuellenStore()
const auth = useAuthStore()
const { reportError, reportInfo } = useErrorService()

const staende = ref<QuellStand[]>([])
const abweichungen = ref<Abweichung[]>([])
const geprueftAm = ref('')
const prueft = ref(false)

onMounted(async () => {
  try {
    await quellen.laden()
  } catch (e) {
    reportError(e, 'konsistenz:quellen')
  }
})

async function pruefe() {
  prueft.value = true
  try {
    const clients = quellen.clients()
    staende.value = await Promise.all(quellen.quellen.map(q => ladeQuellStand(clients[q.nr], q.nr, q.schulNr, q.schulname)))
    abweichungen.value = pruefeKonsistenz(staende.value.map(s => s.daten))
    geprueftAm.value = new Date().toLocaleTimeString('de-DE')
  } catch (e) {
    reportError(e, 'konsistenz:pruefen')
  } finally {
    prueft.value = false
  }
}

const gruppen = computed(() => {
  const map = new Map<Bereich, Abweichung[]>()
  for (const a of abweichungen.value) map.set(a.bereich, [...(map.get(a.bereich) ?? []), a])
  return [...map.entries()].map(([bereich, eintraege]) => ({ bereich, eintraege }))
})

function zeigeWert(wert: Wert | undefined, hatEintrag: boolean): string {
  if (!hatEintrag) return ''
  if (wert === undefined) return 'fehlt'
  if (wert === null) return '–'
  if (typeof wert === 'boolean') return wert ? 'ja' : 'nein'
  return String(wert)
}

// ── Korrektur ────────────────────────────────────────────────────────────────

const auswahl = reactive<Record<string, number | undefined>>({})
const korrigiert = ref<string | null>(null)

function schluessel(a: Abweichung): string {
  return `${a.bereich}|${a.objekt}|${a.merkmal}`
}

function korrigiereAbweichung(a: Abweichung) {
  const vonNr = auswahl[schluessel(a)]!
  confirm.require({
    header: 'Abweichung korrigieren',
    message: `„${a.merkmal}“ bei ${a.objekt}: Der Wert von Schule ${vonNr} wird in die anderen Quell-DBs auf dem KOOP-Server übernommen. Fortfahren?`,
    acceptLabel: 'Übernehmen',
    rejectLabel: 'Abbrechen',
    accept: async () => {
      korrigiert.value = schluessel(a)
      try {
        await korrigiere(a, vonNr, staende.value, quellen.clients())
        reportInfo('Übernommen. Bitte die Korrektur auch in der eigenen Datenbank der Schule vornehmen.')
        await pruefe()
      } catch (e) {
        reportError(e, 'konsistenz:korrigieren')
      } finally {
        korrigiert.value = null
      }
    },
  })
}

// ── Jahrgänge in die KOOP-DB ─────────────────────────────────────────────────

const hatJahrgangsAbweichung = computed(() => abweichungen.value.some(a => a.bereich === 'jahrgaenge'))
const uebertraegt = ref(false)

async function uebertrageJahrgaengeInKoop() {
  uebertraegt.value = true
  try {
    // Gleiche Schulform wie die KOOP-DB: die Quellschule mit derselben Schulnummer
    const quelle = staende.value.find(s => s.daten.schulNr === auth.schulNr) ?? staende.value[0]
    const kuerzel = await uebertrageJahrgaenge(quelle, getClient(KOOP))
    reportInfo(`Jahrgänge übertragen: ${kuerzel.join(', ')}`)
  } catch (e) {
    reportError(e, 'konsistenz:jahrgaenge')
  } finally {
    uebertraegt.value = false
  }
}
</script>

<style scoped>
.seite {
  min-height: 100vh;
  max-width: 1200px;
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
  gap: 1rem;
}

.karte h2 {
  margin: 0;
  font-size: 1.15rem;
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

.gruppe h3 {
  margin: 0 0 0.5rem;
  font-size: 1rem;
}

.anzahl {
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--koop-warnung);
  margin-left: 0.35rem;
}

.tabelle {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.tabelle th,
.tabelle td {
  border-bottom: 1px solid var(--app-border);
  padding: 0.4rem 0.6rem;
  text-align: left;
  vertical-align: middle;
}

.tabelle th {
  font-weight: 600;
  white-space: nowrap;
}

.tabelle td.fehlt {
  color: var(--koop-fehler);
  font-weight: 600;
}

.korrektur {
  display: flex;
  gap: 0.35rem;
  align-items: center;
}
</style>
