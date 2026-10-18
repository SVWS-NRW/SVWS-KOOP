<template>
  <div class="seite">
    <header class="kopf">
      <div>
        <h1>Übersicht KOOP-DB</h1>
        <p class="untertitel">
          {{ auth.schema }} · {{ daten?.schulbezeichnung ?? auth.schulbezeichnung }}
          <template v-if="daten"> · Schuljahr {{ daten.abschnitt.schuljahr }}/{{ (daten.abschnitt.schuljahr + 1) % 100 }}, {{ daten.abschnitt.abschnitt }}. Halbjahr</template>
        </p>
      </div>
      <div class="kopf-aktionen">
        <Button label="Aktualisieren" icon="pi pi-refresh" severity="secondary" text :loading="laedt" @click="lade" />
        <ThemeToggle />
        <Button label="Zum Dashboard" icon="pi pi-th-large" severity="secondary" text @click="router.push({ name: 'dashboard' })" />
      </div>
    </header>

    <div v-if="laedt && !daten" class="karte fortschritt">
      <ProgressBar mode="indeterminate" />
      <span class="hinweis">{{ fortschrittText }}</span>
    </div>

    <Message v-if="quellen.quellen.length === 0 && geladen" severity="warn" :closable="false">
      In dieser KOOP-DB sind keine Quell-DBs vermerkt. Sie wird nicht mit dem Assistenten „KOOP-DB einrichten“ angelegt worden sein.
    </Message>

    <Tabs v-if="daten" v-model:value="reiter">
      <TabList>
        <Tab value="schulen"><i class="pi pi-building" /> Schulen</Tab>
        <Tab value="stufen"><i class="pi pi-sitemap" /> Stufen</Tab>
        <Tab value="lehrkraefte"><i class="pi pi-id-card" /> Lehrkräfte</Tab>
      </TabList>
      <TabPanels>
        <!-- Schulen -->
        <TabPanel value="schulen">
          <Message v-for="h in daten.katalogHinweise" :key="h" severity="warn" :closable="false">{{ h }}</Message>
          <div class="schul-raster">
            <section v-for="s in daten.schulen" :key="s.info.nr" class="karte schule" :style="schulStil(s.info.nr)">
              <div class="schule-kopf">
                <span class="schulnr">Schule {{ s.info.nr }}</span>
                <Tag v-if="s.info.koopSchulNr === daten.schulNr" value="Schulnummer der KOOP-DB" severity="secondary" />
              </div>
              <h2>{{ s.info.schulname }}</h2>
              <p class="hinweis">Schulnummer {{ s.info.koopSchulNr }}<template v-if="s.info.koopSchulNr !== s.info.schulNr"> (Quell-DB {{ s.info.schulNr }}, Testdaten)</template> · Quell-DB {{ s.info.schema }} · Lehrerkürzel &lt;Kürzel&gt;-{{ s.info.nr }}</p>

              <div class="kennzahlen">
                <div class="kennzahl"><span class="wert">{{ s.schueler }}</span><span class="titel">Schüler</span></div>
                <div class="kennzahl"><span class="wert">{{ s.lehrkraefteAktiv }}</span><span class="titel">Lehrkräfte</span></div>
                <div class="kennzahl"><span class="wert">{{ s.kurse }}</span><span class="titel">Kurse</span></div>
                <div class="kennzahl"><span class="wert">{{ s.wochenstunden }}</span><span class="titel">Wochenstunden</span></div>
              </div>

              <dl class="details">
                <template v-for="st in daten.stufen" :key="st.jahrgang">
                  <dt>{{ st.jahrgang }}</dt><dd>{{ s.schuelerJeStufe[st.jahrgang] ?? 0 }} Schüler</dd>
                </template>
                <dt>ohne Fachwahlen</dt>
                <dd :class="{ warnung: s.ohneFachwahlen > 0 }">{{ s.ohneFachwahlen }} Schüler</dd>
                <dt>entfernte Lehrkräfte</dt><dd>{{ s.lehrkraefteEntfernt }}</dd>
              </dl>
              <p class="hinweis">Kurse und Wochenstunden: aktive Blockungen im laufenden Halbjahr, Kurse mit einer Lehrkraft dieser Schule.</p>
            </section>
          </div>
        </TabPanel>

        <!-- Stufen -->
        <TabPanel value="stufen">
          <div class="stufen">
            <section v-for="st in daten.stufen" :key="st.abiturjahr" class="karte">
              <div class="stufe-kopf">
                <h2>{{ st.jahrgang }} <span class="hinweis">Abitur {{ st.abiturjahr }}</span></h2>
                <span class="hinweis">{{ st.jahrgang === '10' ? 'Planung' : 'laufendes Halbjahr' }} {{ HALBJAHR_TITEL[st.laufendesHalbjahr] }}</span>
              </div>

              <div class="verteilung" :title="verteilungsTitel(st)">
                <span v-for="s in daten.schulen" :key="s.info.nr" class="anteil" :style="{ ...schulStil(s.info.nr), flexGrow: st.jeSchule[s.info.nr] }" />
                <span v-if="st.ohneStammschule > 0" class="anteil ohne" :style="{ flexGrow: st.ohneStammschule }" />
              </div>
              <div class="legende">
                <span v-for="s in daten.schulen" :key="s.info.nr" class="legende-eintrag" :style="schulStil(s.info.nr)">
                  <span class="punkt" /> Schule {{ s.info.nr }}: {{ st.jeSchule[s.info.nr] }}
                </span>
                <span v-if="st.ohneStammschule > 0" class="legende-eintrag warnung">ohne Stammschule: {{ st.ohneStammschule }}</span>
              </div>

              <div class="kennzahlen">
                <div class="kennzahl"><span class="wert">{{ st.gesamt }}</span><span class="titel">Schüler</span></div>
                <div class="kennzahl" :class="{ warnung: st.ohneFachwahlen > 0 }"><span class="wert">{{ st.ohneFachwahlen }}</span><span class="titel">ohne Fachwahlen</span></div>
                <div class="kennzahl"><span class="wert">{{ st.kurse ?? '–' }}</span><span class="titel">Kurse</span></div>
                <div class="kennzahl" :class="{ warnung: st.kurseOhneLehrkraft > 0 }"><span class="wert">{{ st.kurse === null ? '–' : st.kurseOhneLehrkraft }}</span><span class="titel">ohne Lehrkraft</span></div>
              </div>

              <h3>Blockungen</h3>
              <p v-if="st.blockungen.length === 0" class="hinweis">Noch keine Blockung angelegt.</p>
              <ul v-else class="blockungen">
                <li v-for="b in st.blockungen" :key="b.id" :class="{ laufend: b.halbjahr === st.laufendesHalbjahr }">
                  <span class="halbjahr">{{ HALBJAHR_TITEL[b.halbjahr] }}</span>
                  <span class="name">{{ b.name }}</span>
                  <Tag v-if="b.istAktiv" value="aktiviert" severity="success" />
                  <span class="hinweis">{{ b.anzahlErgebnisse }} Ergebnisse</span>
                  <a :href="blockungsLink(auth.baseUrl, auth.schema, daten.abschnitt.id, b)" target="_blank" rel="noopener noreferrer" class="link">
                    im SVWS-Client <i class="pi pi-external-link" />
                  </a>
                </li>
              </ul>
            </section>
          </div>
          <p class="hinweis">
            Kurse: aktive Blockung im laufenden Halbjahr. Für die Q1 und Q2 fehlen in der KOOP-DB die Fachwahlen vergangener
            Halbjahre (ADR 003, Abschnitt 7).
          </p>
        </TabPanel>

        <!-- Lehrkräfte -->
        <TabPanel value="lehrkraefte">
          <div class="filter">
            <IconField>
              <InputIcon class="pi pi-search" />
              <InputText v-model="suche" placeholder="Kürzel oder Name" />
            </IconField>
            <Select v-model="filterSchule" :options="schulOptionen" optionLabel="label" optionValue="value" />
            <Select v-model="filterStatus" :options="statusOptionen" optionLabel="label" optionValue="value" />
            <span class="hinweis">{{ lehrkraefte.length }} von {{ daten.lehrkraefte.length }}</span>
          </div>
          <DataTable :value="lehrkraefte" size="small" stripedRows sortField="kuerzel" :sortOrder="1" paginator :rows="25" :rowsPerPageOptions="[25, 50, 100]">
            <Column field="kuerzel" header="Kürzel" sortable>
              <template #body="{ data }"><span class="kuerzel">{{ data.kuerzel }}</span></template>
            </Column>
            <Column field="nachname" header="Name" sortable>
              <template #body="{ data }">{{ data.nachname }}, {{ data.vorname }}</template>
            </Column>
            <Column field="nr" header="Schule" sortable>
              <template #body="{ data }">
                <span v-if="data.nr !== null" class="legende-eintrag" :style="schulStil(data.nr)"><span class="punkt" /> {{ schulname(data.nr) }}</span>
                <span v-else class="hinweis">ohne Suffix</span>
              </template>
            </Column>
            <Column field="istSichtbar" header="Status" sortable>
              <template #body="{ data }"><Tag :value="data.istSichtbar ? 'aktiv' : 'entfernt'" :severity="data.istSichtbar ? 'success' : 'secondary'" /></template>
            </Column>
            <Column field="kurse" header="Kurse" sortable class="zahl" />
            <Column field="wochenstunden" header="Wochenstunden" sortable class="zahl" />
            <Column header="Stufen">
              <template #body="{ data }">{{ data.stufen.join(', ') }}</template>
            </Column>
          </DataTable>
          <p class="hinweis">Kurse und Wochenstunden: aktive Blockungen im laufenden Halbjahr.</p>
        </TabPanel>
      </TabPanels>
    </Tabs>

    <LegalFooter />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import Message from 'primevue/message'
import ProgressBar from 'primevue/progressbar'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import Tag from 'primevue/tag'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import InputText from 'primevue/inputtext'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import Select from 'primevue/select'
import ThemeToggle from '@/components/ThemeToggle.vue'
import LegalFooter from '@/components/LegalFooter.vue'
import { useQuellenStore } from '@/stores/quellen'
import { useAuthStore } from '@/stores/auth'
import { useErrorService } from '@/services/errorService'
import { KOOP, getClient } from '@/services/apiClient'
import { ladeUebersicht, type UebersichtDaten } from '@/services/uebersichtService'
import { HALBJAHR_TITEL, blockungsLink, type StufenZeile } from '@/koop/uebersicht'

const router = useRouter()
const quellen = useQuellenStore()
const auth = useAuthStore()
const { reportError } = useErrorService()

const reiter = ref('schulen')
const daten = ref<UebersichtDaten | null>(null)
const laedt = ref(false)
const geladen = ref(false)
const fortschrittText = ref('')

async function lade() {
  laedt.value = true
  try {
    await quellen.laden()
    daten.value = await ladeUebersicht(getClient(KOOP), quellen.quellen, text => { fortschrittText.value = text })
  } catch (e) {
    reportError(e, 'uebersicht:laden')
  } finally {
    laedt.value = false
    geladen.value = true
  }
}

onMounted(lade)

function schulStil(nr: number): Record<string, string> {
  return { '--schulfarbe': `var(--koop-schule-${nr})` }
}

function schulname(nr: number): string {
  return quellen.quellen.find(q => q.nr === nr)?.schulname ?? `Schule ${nr}`
}

function verteilungsTitel(st: StufenZeile): string {
  return quellen.quellen.map(q => `Schule ${q.nr}: ${st.jeSchule[q.nr] ?? 0}`).join(', ')
}

// ── Filter der Lehrkräfte ────────────────────────────────────────────────────

const suche = ref('')
const filterSchule = ref<number | null>(null)
const filterStatus = ref<'alle' | 'aktiv' | 'entfernt'>('aktiv')

const schulOptionen = computed(() => [
  { label: 'Alle Schulen', value: null },
  ...quellen.quellen.map(q => ({ label: `Schule ${q.nr}: ${q.schulname}`, value: q.nr })),
])
const statusOptionen = [
  { label: 'Aktive', value: 'aktiv' },
  { label: 'Entfernte', value: 'entfernt' },
  { label: 'Alle', value: 'alle' },
]

const lehrkraefte = computed(() => {
  const text = suche.value.trim().toLowerCase()
  return (daten.value?.lehrkraefte ?? []).filter(l =>
    (filterSchule.value === null || l.nr === filterSchule.value)
    && (filterStatus.value === 'alle' || l.istSichtbar === (filterStatus.value === 'aktiv'))
    && (text === '' || `${l.kuerzel} ${l.nachname} ${l.vorname}`.toLowerCase().includes(text)))
})
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
  gap: 0.9rem;
}

.karte h2 {
  margin: 0;
  font-size: 1.15rem;
}

.karte h3 {
  margin: 0.25rem 0 0;
  font-size: 0.95rem;
}

.fortschritt {
  gap: 0.35rem;
}

.hinweis {
  margin: 0;
  font-size: 0.85rem;
  color: var(--p-text-muted-color);
}

.warnung,
.warnung .wert {
  color: var(--koop-warnung);
}

:deep(.p-tabpanels) {
  background: transparent;
  padding: 1.25rem 0 0;
}

:deep(.p-tab) {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

/* Schulen */

.schul-raster {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 1.25rem;
  margin-top: 0.75rem;
}

.schule {
  border-top: 4px solid var(--schulfarbe);
}

.schule-kopf {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.schulnr {
  font-weight: 600;
  color: var(--schulfarbe);
}

.kennzahlen {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.75rem;
}

.kennzahl {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--app-border);
  border-radius: 8px;
}

.kennzahl .wert {
  font-size: 1.5rem;
  font-weight: 600;
  line-height: 1.2;
}

.kennzahl .titel {
  font-size: 0.78rem;
  color: var(--p-text-muted-color);
}

.details {
  margin: 0;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.3rem 1rem;
  font-size: 0.9rem;
}

.details dt {
  color: var(--p-text-muted-color);
}

.details dd {
  margin: 0;
}

/* Stufen */

.stufen {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(460px, 1fr));
  gap: 1.25rem;
  margin-bottom: 0.75rem;
}

.stufe-kopf {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
}

.verteilung {
  display: flex;
  height: 0.75rem;
  border-radius: 999px;
  overflow: hidden;
  background: var(--app-border);
}

.anteil {
  flex-basis: 0;
  background: var(--schulfarbe);
}

.anteil.ohne {
  background: var(--koop-warnung);
}

.legende {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 1.25rem;
  font-size: 0.85rem;
}

.legende-eintrag {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.punkt {
  width: 0.65rem;
  height: 0.65rem;
  border-radius: 50%;
  background: var(--schulfarbe);
}

.blockungen {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  font-size: 0.9rem;
}

.blockungen li {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.6rem;
  padding: 0.4rem 0.6rem;
  border-radius: 6px;
}

.blockungen li.laufend {
  background: var(--p-highlight-background);
}

.halbjahr {
  min-width: 2.75rem;
  font-weight: 600;
}

.name {
  flex: 1;
}

.link {
  color: var(--accent);
  text-decoration: none;
  font-size: 0.85rem;
}

.link:hover {
  text-decoration: underline;
}

/* Lehrkräfte */

.filter {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.kuerzel {
  font-family: ui-monospace, monospace;
}

:deep(td.zahl),
:deep(th.zahl) {
  text-align: right;
}

@media (max-width: 560px) {
  .kennzahlen { grid-template-columns: repeat(2, 1fr); }
  .stufen { grid-template-columns: 1fr; }
}
</style>
