<template>
  <div class="seite">
    <header class="kopf">
      <div>
        <h1>Verteilen</h1>
        <p class="untertitel">
          Den Stand der KOOP-DB festhalten und ein Backup erstellen, das an jede Kooperationsschule weitergegeben wird.
          Dort wird es eingespielt und zurückgespielt.
        </p>
      </div>
      <div class="kopf-aktionen">
        <ThemeToggle />
        <Button label="Zum Dashboard" icon="pi pi-th-large" severity="secondary" text :disabled="laeuft" @click="router.push({ name: 'dashboard' })" />
      </div>
    </header>

    <section class="karte">
      <h2>Stand</h2>
      <p v-if="laedt" class="hinweis">Wird geladen …</p>
      <p v-else-if="stand">Zuletzt verteilt am <strong>{{ datumText(stand) }}</strong>.</p>
      <p v-else>Die KOOP-DB wurde noch nicht verteilt.</p>
      <p class="hinweis">
        Beim Zurückspielen warnt SVWS-KOOP, wenn eine Schule ein Backup einspielt, das nicht neuer ist als das ihrer letzten
        Rückspielung.
      </p>
    </section>

    <section class="karte">
      <h2>Aktivierte Blockungen</h2>
      <p class="hinweis">
        Zurückgespielt werden die Kurse und Leistungsdaten, die das Aktivieren einer Blockung in der KOOP-DB geschrieben hat.
        Blockungen, die noch nicht aktiviert sind, gelangen nicht in die Schulen.
      </p>
      <p v-if="laedt" class="hinweis">Wird geladen …</p>
      <ul v-else-if="stufen.length > 0" class="stufen">
        <li v-for="st in stufen" :key="st.abiturjahr">
          <span class="stufe">{{ st.jahrgang }}</span>
          <span class="halbjahr">{{ HALBJAHR_TITEL[st.laufendesHalbjahr] }}</span>
          <template v-if="aktiveBlockung(st)">
            <Tag value="aktiviert" severity="success" />
            <span>{{ aktiveBlockung(st)!.name }} · {{ st.kurse }} Kurse<template v-if="st.kurseOhneLehrkraft > 0">, davon {{ st.kurseOhneLehrkraft }} ohne Lehrkraft</template></span>
          </template>
          <template v-else>
            <Tag value="keine aktivierte Blockung" severity="secondary" />
          </template>
        </li>
      </ul>
      <Message v-if="!laedt && stufen.length > 0 && anzahlAktiv === 0" severity="warn" :closable="false">
        Im laufenden Halbjahr ist keine Blockung aktiviert. Das Backup enthält dann nichts, was zurückgespielt werden kann.
      </Message>
      <Message v-if="!laedt && anzahlOhneLehrkraft > 0" severity="info" :closable="false">
        {{ anzahlOhneLehrkraft }} Kurse haben keine Lehrkraft. Beim Zurückspielen muss für jeden dieser Kurse die Schule gewählt
        werden, an der er stattfindet. Einfacher ist es, die Lehrkräfte vorher in der KOOP-DB zuzuordnen und neu zu aktivieren.
      </Message>
    </section>

    <section class="karte">
      <div class="teil-kopf">
        <h2>Backup erstellen</h2>
        <Button label="Stand setzen und Backup erstellen" icon="pi pi-download" :loading="laeuft" :disabled="laedt" @click="verteileBestaetigt" />
      </div>
      <p class="hinweis">
        SVWS-KOOP schreibt den aktuellen Zeitpunkt als Stand in die KOOP-DB und lädt danach das SQLite-Backup herunter. Das kann
        einige Sekunden dauern. Nötig ist die Kompetenz Admin oder SQLite-Export in der KOOP-DB.
      </p>
      <div v-if="ergebnis" class="ergebnis">
        <Message severity="success" :closable="false">
          Stand {{ datumText(ergebnis.stand) }} gesetzt, Backup „{{ ergebnis.dateiname }}“ erstellt ({{ groesseText(ergebnis.groesse) }}).
        </Message>
        <a :href="ergebnis.url" :download="ergebnis.dateiname" class="link"><i class="pi pi-download" /> Erneut herunterladen</a>
      </div>
    </section>

    <section class="karte">
      <h2>So geht es weiter</h2>
      <ol class="schritte">
        <li>Das Backup an jede Kooperationsschule weitergeben, auf einem sicheren Weg. Es enthält Schüler- und Lehrerdaten aller Schulen.</li>
        <li>Jede Schule spielt es auf ihrem SVWS-Server als zusätzliches Schema ein, zum Beispiel im Admin-Client.</li>
        <li>Jede Schule meldet sich in SVWS-KOOP an diesem Schema an und spielt unter „Rückspielen“ die Daten ihrer Schüler in ihre eigene Datenbank zurück.</li>
        <li>Danach löscht jede Schule das eingespielte Schema und die Backup-Datei.</li>
      </ol>
    </section>

    <LegalFooter />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useConfirm } from 'primevue/useconfirm'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Tag from 'primevue/tag'
import ThemeToggle from '@/components/ThemeToggle.vue'
import LegalFooter from '@/components/LegalFooter.vue'
import { useQuellenStore } from '@/stores/quellen'
import { useAuthStore } from '@/stores/auth'
import { useErrorService } from '@/services/errorService'
import { KOOP, getClient } from '@/services/apiClient'
import { ladeUebersicht } from '@/services/uebersichtService'
import { ladeStand, verteile } from '@/services/verteilenService'
import { HALBJAHR_TITEL, type StufenZeile } from '@/koop/uebersicht'

const router = useRouter()
const confirm = useConfirm()
const quellen = useQuellenStore()
const auth = useAuthStore()
const { reportError } = useErrorService()

const laedt = ref(true)
const laeuft = ref(false)
const stand = ref<string | null>(null)
const stufen = ref<StufenZeile[]>([])
const ergebnis = ref<{ stand: string, dateiname: string, url: string, groesse: number } | null>(null)

function aktiveBlockung(st: StufenZeile) {
  return st.blockungen.find(b => b.halbjahr === st.laufendesHalbjahr && b.istAktiv)
}

const anzahlAktiv = computed(() => stufen.value.filter(st => aktiveBlockung(st)).length)
const anzahlOhneLehrkraft = computed(() => stufen.value.reduce((n, st) => n + (aktiveBlockung(st) ? st.kurseOhneLehrkraft : 0), 0))

onMounted(async () => {
  try {
    const koop = getClient(KOOP)
    await quellen.laden()
    const [s, u] = await Promise.all([ladeStand(koop), ladeUebersicht(koop, quellen.quellen, () => {})])
    stand.value = s
    stufen.value = u.stufen
  } catch (e) {
    reportError(e, 'verteilen:laden')
  } finally {
    laedt.value = false
  }
})

function verteileBestaetigt() {
  confirm.require({
    header: 'Verteilen',
    message: `Der Stand der KOOP-DB „${auth.schema}“ wird auf jetzt gesetzt, danach wird das Backup erstellt. Fortfahren?`,
    acceptLabel: 'Backup erstellen',
    rejectLabel: 'Abbrechen',
    accept: async () => {
      laeuft.value = true
      try {
        const r = await verteile(getClient(KOOP), auth.schema)
        stand.value = r.stand
        gibUrlFrei()
        ergebnis.value = { stand: r.stand, dateiname: r.dateiname, url: URL.createObjectURL(r.datei), groesse: r.datei.size }
        speichere(ergebnis.value.url, r.dateiname)
      } catch (e) {
        reportError(e, 'verteilen:backup')
      } finally {
        laeuft.value = false
      }
    },
  })
}

/** Startet den Download (Browser: Download, Electron: Speichern-Dialog) */
function speichere(url: string, dateiname: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = dateiname
  document.body.appendChild(a)
  a.click()
  a.remove()
}

function gibUrlFrei() {
  if (ergebnis.value) URL.revokeObjectURL(ergebnis.value.url)
}

onBeforeUnmount(gibUrlFrei)

function datumText(iso: string): string {
  return new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })
}

function groesseText(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.ceil(bytes / 1024)} KB`
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

.karte p {
  margin: 0;
}

.teil-kopf {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.hinweis {
  font-size: 0.85rem;
  color: var(--p-text-muted-color);
}

.stufen {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  font-size: 0.9rem;
}

.stufen li {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.stufe {
  min-width: 2rem;
  font-weight: 600;
}

.halbjahr {
  min-width: 2.75rem;
  color: var(--p-text-muted-color);
}

.ergebnis {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.link {
  color: var(--accent);
  text-decoration: none;
  font-size: 0.9rem;
}

.link:hover {
  text-decoration: underline;
}

.schritte {
  margin: 0;
  padding-left: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  font-size: 0.9rem;
}
</style>
