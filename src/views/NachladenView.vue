<template>
  <div class="seite">
    <header class="kopf">
      <div>
        <h1>Nachladen</h1>
        <p class="untertitel">
          Neuere Stände der Quell-DBs mit der KOOP-DB abgleichen. Neue Schüler und Lehrkräfte werden übernommen,
          abgegangene entfernt. Fachwahlen bereits übernommener Schüler bleiben unverändert.
        </p>
      </div>
      <div class="kopf-aktionen">
        <ThemeToggle />
        <Button label="Zum Dashboard" icon="pi pi-th-large" severity="secondary" text :disabled="laeuft" @click="router.push({ name: 'dashboard' })" />
      </div>
    </header>

    <section class="karte">
      <h2>Quell-DBs</h2>
      <p class="hinweis">
        Hat eine Schule ein neueres Backup geliefert, wird es zuerst unter demselben Schemanamen eingespielt
        (Admin-Client des SVWS-Servers). Danach hier anmelden und abgleichen.
      </p>
      <QuellAnmeldung />
      <div class="aktionen">
        <Button label="Abgleichen" icon="pi pi-sync" :disabled="!quellen.alleVerbunden || laeuft" :loading="gleichtAb" @click="gleicheAb" />
        <Message v-if="anzahlFehler !== null && anzahlFehler > 0" severity="error" :closable="false">
          {{ anzahlFehler }} Fehler in der Konsistenzprüfung. Bitte zuerst unter „Konsistenz prüfen“ beheben.
        </Message>
      </div>
      <div v-if="gleichtAb" class="fortschritt">
        <ProgressBar mode="indeterminate" />
        <span class="hinweis">{{ fortschritt.text }}</span>
      </div>
    </section>

    <template v-if="abgleich">
      <section v-for="a in abgleich" :key="a.info.nr" class="karte schule" :style="{ '--schulfarbe': `var(--koop-schule-${a.info.nr})` }">
        <h2><span class="schulnr">Schule {{ a.info.nr }}</span> {{ a.info.schulname }} <span class="hinweis">({{ a.info.schema }})</span></h2>
        <p v-if="istUnveraendert(a)" class="hinweis"><i class="pi pi-check" /> Keine Änderungen gegenüber der KOOP-DB.</p>

        <div v-if="a.neueLehrkraefte.length > 0" class="gruppe">
          <h3 class="neu">{{ a.neueLehrkraefte.length }} neue Lehrkräfte</h3>
          <ul>
            <li v-for="l in a.neueLehrkraefte" :key="l.id">
              <span class="kuerzel">{{ bildeKoopKuerzel(l.kuerzel, a.info.nr) }}</span> {{ l.nachname }}, {{ l.vorname }}
            </li>
          </ul>
        </div>

        <div v-if="a.neueSchueler.length > 0" class="gruppe">
          <h3 class="neu">{{ a.neueSchueler.length }} neue Schüler</h3>
          <ul>
            <li v-for="s in a.neueSchueler" :key="s.id">
              {{ s.nachname }}, {{ s.vorname }} <span class="hinweis">· {{ s.jahrgang }} · {{ statusText(s.status) }}</span>
            </li>
          </ul>
        </div>

        <div v-if="a.abgegangeneSchueler.length > 0" class="gruppe">
          <h3 class="abgang">{{ a.abgegangeneSchueler.length }} abgegangene Schüler</h3>
          <ul>
            <li v-for="s in a.abgegangeneSchueler" :key="s.koop.id">
              {{ s.koop.nachname }}, {{ s.koop.vorname }} <span class="hinweis">· in der KOOP-DB {{ s.koop.jahrgang }} · {{ s.grund }}</span>
            </li>
          </ul>
        </div>

        <div v-if="a.abgegangeneLehrkraefte.length > 0" class="gruppe">
          <h3 class="abgang">{{ a.abgegangeneLehrkraefte.length }} abgegangene Lehrkräfte</h3>
          <ul>
            <li v-for="l in a.abgegangeneLehrkraefte" :key="l.koop.id">
              <span class="kuerzel">{{ l.koop.kuerzel }}</span> {{ l.koop.nachname }}, {{ l.koop.vorname }} <span class="hinweis">· {{ l.grund }}</span>
            </li>
          </ul>
        </div>
      </section>

      <section class="karte">
        <div class="teil-kopf">
          <h2>Neue Schüler und Lehrkräfte übernehmen</h2>
          <Button
            :label="`Nachladen (${anzahlNeu})`"
            icon="pi pi-download"
            :disabled="anzahlNeu === 0 || anzahlFehler !== 0 || laeuft"
            :loading="laedtNach"
            @click="ladeNachBestaetigt"
          />
        </div>
        <p class="hinweis">
          Wie bei der Übernahme: Lehrkräfte mit Kürzel &lt;Kürzel&gt;-&lt;Nr&gt; und Stammschule, Schüler mit Stammdaten, Erziehern,
          Telefonnummern, Sprachenfolge und Fachwahlen. Fehlende Katalogeinträge werden vorher ergänzt.
        </p>
        <div v-if="laedtNach" class="fortschritt">
          <ProgressBar :value="fortschritt.gesamt ? Math.round(100 * fortschritt.erledigt / fortschritt.gesamt) : undefined" :mode="fortschritt.gesamt ? 'determinate' : 'indeterminate'" />
          <span class="hinweis">{{ fortschritt.text }}</span>
        </div>
        <ProtokollAnzeige v-if="protokoll" :protokoll="protokoll" />
      </section>

      <section class="karte">
        <div class="teil-kopf">
          <h2>Abgegangene Schüler und Lehrkräfte entfernen</h2>
          <Button
            :label="`Entfernen (${anzahlAbgaenge})`"
            icon="pi pi-user-minus"
            severity="danger"
            :disabled="anzahlAbgaenge === 0 || laeuft"
            :loading="entfernt"
            @click="entferneBestaetigt"
          />
        </div>
        <p class="hinweis">
          Schüler: Kurszuordnungen in allen Blockungsergebnissen und in den Leistungsdaten werden gelöscht, danach erhält der
          Schüler einen Löschvermerk und zählt nicht mehr zum Abiturjahrgang. Endgültig löschen lassen sich Schüler über die API
          derzeit nicht. Lehrkräfte: Sie werden aus Blockungskursen und Kursen genommen und unsichtbar gesetzt.
        </p>
        <div v-if="entfernt" class="fortschritt">
          <ProgressBar :value="fortschritt.gesamt ? Math.round(100 * fortschritt.erledigt / fortschritt.gesamt) : undefined" :mode="fortschritt.gesamt ? 'determinate' : 'indeterminate'" />
          <span class="hinweis">{{ fortschritt.text }}</span>
        </div>
        <ProtokollAnzeige v-if="protokollEntfernen" :protokoll="protokollEntfernen" />
      </section>
    </template>

    <LegalFooter />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useConfirm } from 'primevue/useconfirm'
import Button from 'primevue/button'
import Message from 'primevue/message'
import ProgressBar from 'primevue/progressbar'
import ThemeToggle from '@/components/ThemeToggle.vue'
import LegalFooter from '@/components/LegalFooter.vue'
import QuellAnmeldung from '@/components/QuellAnmeldung.vue'
import ProtokollAnzeige from '@/components/ProtokollAnzeige.vue'
import { useQuellenStore } from '@/stores/quellen'
import { useAuthStore } from '@/stores/auth'
import { useErrorService } from '@/services/errorService'
import { KOOP, getClient } from '@/services/apiClient'
import { ladeQuellStand } from '@/services/konsistenzService'
import type { QuellKontext } from '@/services/uebernahmeService'
import { entferneAbgegangene, ladeAbgleich, ladeNach, type SchulAbgleich } from '@/services/nachladenService'
import { pruefeKonsistenz } from '@/koop/konsistenz'
import { bildeKoopKuerzel } from '@/koop/lehrerKuerzel'
import { statusText } from '@/koop/nachladen'
import type { Protokoll } from '@/koop/uebernahme'

const router = useRouter()
const confirm = useConfirm()
const quellen = useQuellenStore()
const auth = useAuthStore()
const { reportError } = useErrorService()

const gleichtAb = ref(false)
const laedtNach = ref(false)
const entfernt = ref(false)
const laeuft = computed(() => gleichtAb.value || laedtNach.value || entfernt.value)
const anzahlFehler = ref<number | null>(null)
const abgleich = ref<SchulAbgleich[] | null>(null)
const protokoll = ref<Protokoll | null>(null)
const protokollEntfernen = ref<Protokoll | null>(null)
const fortschritt = reactive({ text: '', erledigt: 0, gesamt: 0 })
const melde = (text: string, erledigt = 0, gesamt = 0) => Object.assign(fortschritt, { text, erledigt, gesamt })

const anzahlNeu = computed(() => (abgleich.value ?? []).reduce((n, a) => n + a.neueSchueler.length + a.neueLehrkraefte.length, 0))
const anzahlAbgaenge = computed(() => (abgleich.value ?? []).reduce((n, a) => n + a.abgegangeneSchueler.length + a.abgegangeneLehrkraefte.length, 0))

function istUnveraendert(a: SchulAbgleich): boolean {
  return a.neueSchueler.length + a.neueLehrkraefte.length + a.abgegangeneSchueler.length + a.abgegangeneLehrkraefte.length === 0
}

onMounted(async () => {
  try {
    await quellen.laden()
  } catch (e) {
    reportError(e, 'nachladen:quellen')
  }
})

function kontexte(): QuellKontext[] {
  const clients = quellen.clients()
  return quellen.quellen.map(info => ({ info, client: clients[info.nr] }))
}

/** Konsistenz prüfen (ein neueres Backup kann abweichen) und Quell-DBs mit der KOOP-DB vergleichen */
async function gleicheAb() {
  gleichtAb.value = true
  try {
    melde('Konsistenz prüfen')
    const staende = await Promise.all(kontexte().map(k => ladeQuellStand(k.client, k.info.nr, k.info.schulNr, k.info.schulname)))
    anzahlFehler.value = pruefeKonsistenz(staende.map(s => s.daten)).filter(a => a.schwere === 'fehler').length
    abgleich.value = await ladeAbgleich(getClient(KOOP), kontexte(), melde)
  } catch (e) {
    reportError(e, 'nachladen:abgleich')
  } finally {
    gleichtAb.value = false
  }
}

function ladeNachBestaetigt() {
  confirm.require({
    header: 'Nachladen',
    message: `${anzahlNeu.value} neue Schüler und Lehrkräfte werden in die KOOP-DB „${auth.schema}“ übernommen. Fortfahren?`,
    acceptLabel: 'Nachladen',
    rejectLabel: 'Abbrechen',
    accept: async () => {
      laedtNach.value = true
      melde('')
      try {
        protokoll.value = await ladeNach(getClient(KOOP), kontexte(), abgleich.value ?? [], melde)
      } catch (e) {
        reportError(e, 'nachladen:laden')
      } finally {
        laedtNach.value = false
      }
      // Der Abgleich zeigt danach den neuen Stand, das Protokoll bleibt stehen
      if (protokoll.value) await gleicheAb()
    },
  })
}

function entferneBestaetigt() {
  confirm.require({
    header: 'Abgegangene entfernen',
    message: `${anzahlAbgaenge.value} Schüler und Lehrkräfte werden in der KOOP-DB „${auth.schema}“ aus allen Blockungen und Kursen genommen. `
      + 'Schüler erhalten einen Löschvermerk, Lehrkräfte werden unsichtbar. Fortfahren?',
    acceptLabel: 'Entfernen',
    rejectLabel: 'Abbrechen',
    acceptClass: 'p-button-danger',
    accept: async () => {
      entfernt.value = true
      melde('')
      try {
        protokollEntfernen.value = await entferneAbgegangene(getClient(KOOP), abgleich.value ?? [], melde)
      } catch (e) {
        reportError(e, 'nachladen:entfernen')
      } finally {
        entfernt.value = false
      }
      if (protokollEntfernen.value) await gleicheAb()
    },
  })
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

.schule {
  border-left: 4px solid var(--schulfarbe);
}

.schulnr {
  color: var(--schulfarbe);
  margin-right: 0.35rem;
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

.gruppe h3 {
  margin: 0 0 0.35rem;
  font-size: 0.95rem;
}

.gruppe h3.neu { color: var(--koop-ok); }
.gruppe h3.abgang { color: var(--koop-warnung); }

.gruppe ul {
  margin: 0;
  padding-left: 1.1rem;
  font-size: 0.875rem;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.kuerzel {
  display: inline-block;
  min-width: 5.5rem;
  font-family: ui-monospace, monospace;
}
</style>
