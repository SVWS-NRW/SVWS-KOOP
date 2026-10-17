<template>
  <div class="einrichten">
    <header class="kopf">
      <div>
        <h1>KOOP-DB einrichten</h1>
        <p class="untertitel">Alle Angaben werden zuerst gesammelt und geprüft. Angelegt wird erst im letzten Schritt.</p>
      </div>
      <div class="kopf-aktionen">
        <ThemeToggle />
        <Button label="Abbrechen" icon="pi pi-times" severity="secondary" text :disabled="generiert === 'laeuft'" @click="abbrechen" />
      </div>
    </header>

    <ol class="schrittleiste">
      <li v-for="(titel, i) in schrittTitel" :key="titel" :class="{ aktiv: i === aktiv, erledigt: i < aktiv }">
        <span class="nr">{{ i + 1 }}</span>{{ titel }}
      </li>
    </ol>

    <section class="karte">
      <!-- 1. Server -->
      <template v-if="aktiv === 0">
        <h2>Server und Datenbank-Root</h2>
        <div class="raster">
          <div class="feld">
            <label for="url">Server-URL</label>
            <InputText id="url" v-model="angaben.server.baseUrl" placeholder="https://svws-server.example.de" />
          </div>
          <div class="feld">
            <label for="priv">Adresse für privilegierte Zugriffe (optional)</label>
            <InputText id="priv" v-model="angaben.server.privilegedUrl" placeholder="nur bei eigenem Port, z. B. https://server:8444" />
          </div>
          <div class="feld">
            <label for="root">Datenbank-Root: Benutzer</label>
            <InputText id="root" v-model="angaben.server.rootUser" />
          </div>
          <div class="feld">
            <label for="rootpw">Datenbank-Root: Kennwort</label>
            <Password id="rootpw" v-model="angaben.server.rootPassword" :feedback="false" toggleMask />
          </div>
        </div>
        <p class="hinweis">
          Der Root-Zugang wird zum Anlegen der KOOP-DB und zum Einspielen von Backups gebraucht.
          Ist er am Server abgeschaltet, legen Sie die Schemata im Admin-Client des SVWS-Servers an.
        </p>
        <Message v-if="schemata.length > 0" severity="success" :closable="false">
          Verbunden. Auf dem Server gibt es {{ schemata.length }} SVWS-Schemata.
        </Message>
      </template>

      <!-- 2. Quell-DBs -->
      <template v-else-if="aktiv === 1">
        <h2>Quell-DBs der Kooperationsschulen</h2>
        <p class="hinweis">
          Wählen Sie für jede Schule ihr Schema auf dem Server und melden Sie sich mit einem SVWS-Benutzer der Schule an.
          Die Nummer bestimmt das Suffix der Lehrerkürzel (z. B. MÜL-2).
        </p>

        <div v-for="(q, i) in angaben.quellen" :key="q.nr" class="quelle" :style="{ '--schulfarbe': `var(--koop-schule-${q.nr})` }">
          <div class="quelle-kopf">
            <span class="schulnr">Schule {{ q.nr }}</span>
            <span v-if="q.schulNr !== null" class="geprueft"><i class="pi pi-check" /> {{ q.schulNr }} · {{ q.schulname }}</span>
            <Button v-if="angaben.quellen.length > MIN_QUELLEN" icon="pi pi-trash" severity="secondary" text title="Entfernen" @click="entferneQuelle(i)" />
          </div>
          <div class="raster">
            <div class="feld">
              <label>Schema</label>
              <Select v-model="q.schema" :options="schemata" placeholder="Schema wählen" filter @change="setzeUngeprueft(q)" />
            </div>
            <div class="feld">
              <label>SVWS-Benutzer</label>
              <InputText v-model="q.svwsUser" @input="setzeUngeprueft(q)" />
            </div>
            <div class="feld">
              <label>Kennwort</label>
              <Password v-model="q.svwsPassword" :feedback="false" toggleMask @input="setzeUngeprueft(q)" />
            </div>
            <div class="feld feld-knopf">
              <Button label="Verbindung prüfen" icon="pi pi-link" severity="secondary" :loading="pruefeNr === q.nr" :disabled="!q.schema" @click="pruefeQuelle(q)" />
            </div>
          </div>
        </div>

        <Button v-if="angaben.quellen.length < MAX_QUELLEN" label="Weitere Schule" icon="pi pi-plus" severity="secondary" text @click="neueQuelle" />

        <Message v-if="testdaten" severity="info" :closable="false">
          Testdaten erkannt (Schulnummer {{ TESTDATEN_SCHULNR }} aus dem Anonymisierungstool). Nur in diesem Fall dürfen mehrere Quell-DBs
          dieselbe Schulnummer haben. Für echte Kooperationen ist das nicht zulässig.
        </Message>

        <details class="backup">
          <summary>Backup einer Schule einspielen (SQLite-Datei)</summary>
          <p class="hinweis">Die Datei wird als neues Schema auf dem Server eingespielt. Ein vorhandenes Schema gleichen Namens wird ersetzt.</p>
          <div class="raster">
            <div class="feld">
              <label>SQLite-Datei</label>
              <input type="file" accept=".sqlite,.db,application/vnd.sqlite3" @change="waehleDatei" />
            </div>
            <div class="feld">
              <label>Name des neuen Schemas</label>
              <InputText v-model="backup.schema" placeholder="z. B. koop_quelle1" />
            </div>
            <div class="feld">
              <label>Datenbank-Benutzer für das Schema</label>
              <InputText v-model="backup.dbUser" />
            </div>
            <div class="feld">
              <label>Kennwort des Datenbank-Benutzers</label>
              <Password v-model="backup.dbPassword" :feedback="false" toggleMask />
            </div>
          </div>
          <Button label="Einspielen" icon="pi pi-upload" severity="secondary" :loading="backupLaeuft" :disabled="!backupVollstaendig" @click="spieleBackupEin" />
        </details>
      </template>

      <!-- 3. KOOP-DB -->
      <template v-else-if="aktiv === 2">
        <h2>Neue KOOP-DB</h2>
        <div class="raster">
          <div class="feld">
            <label for="kschema">Name des Schemas</label>
            <InputText id="kschema" v-model="angaben.koop.schema" placeholder="z. B. koop2026" />
          </div>
          <div class="feld">
            <label for="kschul">Schulnummer der KOOP-DB</label>
            <Select id="kschul" v-model="angaben.koop.schulNr" :options="schulnummerOptionen" optionLabel="label" optionValue="value" placeholder="Quellschule wählen" />
          </div>
          <div class="feld">
            <label for="kdb">Datenbank-Benutzer</label>
            <InputText id="kdb" v-model="angaben.koop.dbUser" />
          </div>
          <div class="feld">
            <label for="kdbpw">Kennwort des Datenbank-Benutzers</label>
            <Password id="kdbpw" v-model="angaben.koop.dbPassword" :feedback="false" toggleMask />
          </div>
          <div class="feld">
            <label for="kadmin">Kennwort für Admin (optional)</label>
            <Password id="kadmin" v-model="angaben.koop.adminPassword" :feedback="false" toggleMask />
          </div>
        </div>
        <Message v-if="istTestdatenSchulNr(angaben.koop.schulNr)" severity="info" :closable="false">
          Testdaten: Die Schulnummer {{ TESTDATEN_SCHULNR }} stammt aus dem Anonymisierungstool und steht nicht im Schulkatalog.
          Die KOOP-DB wird deshalb mit der Schulnummer {{ TESTDATEN_ERSATZ_SCHULNR }} (Gymnasium) angelegt.
        </Message>
        <p class="hinweis">
          Die Schulnummer ist technisch nötig und gibt der Schule keinen Vorrang. Bleibt das Admin-Kennwort leer,
          kann es später gesetzt werden. Die KOOP-DB wird an alle Schulen verteilt, vergeben Sie deshalb eigene Kennwörter.
        </p>
      </template>

      <!-- 4. Benutzer -->
      <template v-else-if="aktiv === 3">
        <h2>Benutzer in der KOOP-DB</h2>
        <p class="hinweis">Jede Schule erhält einen eigenen Benutzer mit Administratorrechten.</p>
        <div v-for="b in angaben.benutzer" :key="b.nr" class="raster benutzer">
          <div class="feld">
            <label>Benutzername (Schule {{ b.nr }})</label>
            <InputText v-model="b.benutzername" />
          </div>
          <div class="feld">
            <label>Anzeigename</label>
            <InputText v-model="b.anzeigename" />
          </div>
          <div class="feld">
            <label>Kennwort</label>
            <Password v-model="b.password" :feedback="false" toggleMask />
          </div>
        </div>
      </template>

      <!-- 5. Prüfen und generieren -->
      <template v-else>
        <h2>Prüfen und generieren</h2>
        <dl class="zusammenfassung">
          <dt>Server</dt><dd>{{ angaben.server.baseUrl }}</dd>
          <template v-for="q in angaben.quellen" :key="q.nr">
            <dt>Schule {{ q.nr }}</dt>
            <dd>
              {{ q.schema }} · {{ q.schulNr }} · {{ q.schulname }}
              <span v-if="koopNummern[q.nr] !== q.schulNr" class="hinweis">(in der KOOP-DB: {{ koopNummern[q.nr] }}, Testdaten)</span>
            </dd>
          </template>
          <dt>KOOP-DB</dt><dd>{{ angaben.koop.schema }} (Schulnummer {{ initSchulNr(angaben.koop) }}, DB-Benutzer {{ angaben.koop.dbUser }})</dd>
          <dt>Benutzer</dt><dd>Admin, {{ angaben.benutzer.map(b => b.benutzername).join(', ') }}</dd>
        </dl>

        <Message v-if="pruefLaeuft" severity="info" :closable="false">Angaben werden geprüft …</Message>
        <Message v-else-if="pruefFehler.length > 0" severity="error" :closable="false">
          <ul class="fehlerliste"><li v-for="f in pruefFehler" :key="f">{{ f }}</li></ul>
        </Message>
        <Message v-else-if="generiert === 'nein'" severity="success" :closable="false">Alle Angaben sind vollständig und gültig.</Message>

        <ul v-if="schritte.length > 0" class="schritte">
          <li v-for="s in schritte" :key="s.id" :class="s.status">
            <i :class="statusIcon[s.status]" /> {{ s.titel }}
          </li>
        </ul>

        <Message v-if="generiert === 'fehler'" severity="error" :closable="false">
          {{ generierFehler }}
        </Message>
        <Message v-if="generiert === 'fertig'" severity="success" :closable="false">
          Die KOOP-DB „{{ angaben.koop.schema }}“ ist angelegt.
        </Message>
      </template>
    </section>

    <footer class="navigation">
      <Button label="Zurück" icon="pi pi-arrow-left" severity="secondary" :disabled="aktiv === 0 || generiert === 'laeuft' || generiert === 'fertig'" @click="aktiv--" />
      <div class="navigation-rechts">
        <template v-if="aktiv === 0">
          <Button label="Verbinden und weiter" icon="pi pi-arrow-right" iconPos="right" :loading="verbindeLaeuft" @click="verbinde" />
        </template>
        <template v-else-if="aktiv < 4">
          <Button label="Weiter" icon="pi pi-arrow-right" iconPos="right" @click="weiter" />
        </template>
        <template v-else>
          <Button v-if="generiert === 'fehler' && schritte[0]?.status === 'ok'" label="KOOP-DB wieder löschen" icon="pi pi-trash" severity="danger" text :loading="loeschLaeuft" @click="loescheTeilweise" />
          <Button v-if="generiert === 'fertig'" label="Zum Dashboard" icon="pi pi-arrow-right" iconPos="right" :loading="anmeldeLaeuft" @click="zumDashboard" />
          <Button v-else label="KOOP-DB generieren" icon="pi pi-cog" :disabled="pruefLaeuft || pruefFehler.length > 0 || generiert !== 'nein'" :loading="generiert === 'laeuft'" @click="generiere" />
        </template>
      </div>
    </footer>

    <LegalFooter />
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useConfirm } from 'primevue/useconfirm'
import InputText from 'primevue/inputtext'
import Password from 'primevue/password'
import Select from 'primevue/select'
import Button from 'primevue/button'
import Message from 'primevue/message'
import ThemeToggle from '@/components/ThemeToggle.vue'
import LegalFooter from '@/components/LegalFooter.vue'
import { useAuthStore } from '@/stores/auth'
import { useQuellenStore } from '@/stores/quellen'
import { useErrorService, toAppError } from '@/services/errorService'
import { entferneAlleClients } from '@/services/apiClient'
import { loescheSchema } from '@/services/schemaService'
import {
  ladeVorhandeneSchemata, pruefeQuellVerbindung, spieleQuellDateiEin, pruefeAmServer,
  erzeugeSchritte, generiereKoopDb, erzeugeRootClient, quellInfos, type Schritt, type SchrittStatus,
} from '@/services/einrichtungService'
import {
  MIN_QUELLEN, MAX_QUELLEN, normalisiereUrl, pruefeServer, pruefeQuellen, pruefeKoop, pruefeBenutzer, pruefeAngaben,
  istSchemaNameGueltig, istDbBenutzerGueltig, istTestdatenSchulNr, initSchulNr, koopSchulnummern, TESTDATEN_SCHULNR, TESTDATEN_ERSATZ_SCHULNR,
  type EinrichtungsAngaben, type QuellAngaben,
} from '@/koop/einrichtung'

const router = useRouter()
const confirm = useConfirm()
const auth = useAuthStore()
const quellenStore = useQuellenStore()
const { reportError, reportWarning, reportInfo } = useErrorService()

const schrittTitel = ['Server', 'Quell-DBs', 'KOOP-DB', 'Benutzer', 'Prüfen und generieren']
const aktiv = ref(0)

function neueQuellAngabe(nr: number): QuellAngaben {
  return { nr, schema: '', svwsUser: 'Admin', svwsPassword: '', schulNr: null, schulname: '' }
}

// Alle Angaben inklusive Kennwörter liegen nur im Arbeitsspeicher dieser Ansicht (ADR 001, Abschnitt 3)
const angaben = reactive<EinrichtungsAngaben>({
  server: {
    baseUrl: import.meta.env.DEV ? (import.meta.env.VITE_SVWS_URL ?? '') : '',
    privilegedUrl: '',
    rootUser: 'root',
    rootPassword: '',
  },
  quellen: [neueQuellAngabe(1), neueQuellAngabe(2)],
  koop: { schema: '', dbUser: '', dbPassword: '', schulNr: null, adminPassword: '' },
  benutzer: [],
})

const schemata = ref<string[]>([])

// ── Schritt 1: Server ────────────────────────────────────────────────────────

const verbindeLaeuft = ref(false)

async function verbinde() {
  angaben.server.baseUrl = normalisiereUrl(angaben.server.baseUrl)
  angaben.server.privilegedUrl = angaben.server.privilegedUrl.trim() ? normalisiereUrl(angaben.server.privilegedUrl) : ''
  const fehler = pruefeServer(angaben.server)
  if (fehler.length > 0) return reportWarning(fehler.join(' '))
  verbindeLaeuft.value = true
  try {
    schemata.value = await ladeVorhandeneSchemata(angaben.server)
    aktiv.value = 1
  } catch (e) {
    reportError(e, 'einrichten:server')
  } finally {
    verbindeLaeuft.value = false
  }
}

// ── Schritt 2: Quell-DBs ─────────────────────────────────────────────────────

const pruefeNr = ref<number | null>(null)

function setzeUngeprueft(q: QuellAngaben) {
  q.schulNr = null
  q.schulname = ''
}

async function pruefeQuelle(q: QuellAngaben) {
  pruefeNr.value = q.nr
  try {
    const { schulNr, schulname } = await pruefeQuellVerbindung(angaben.server, q)
    q.schulNr = schulNr
    q.schulname = schulname
  } catch (e) {
    setzeUngeprueft(q)
    reportError(e, `einrichten:quelle-${q.nr}`)
  } finally {
    pruefeNr.value = null
  }
}

function neueQuelle() {
  angaben.quellen.push(neueQuellAngabe(angaben.quellen.length + 1))
}

function entferneQuelle(index: number) {
  angaben.quellen.splice(index, 1)
  angaben.quellen.forEach((q, i) => { q.nr = i + 1 })
}

const backup = reactive({ datei: null as File | null, schema: '', dbUser: '', dbPassword: '' })
const backupLaeuft = ref(false)
const backupVollstaendig = computed(() =>
  backup.datei !== null && istSchemaNameGueltig(backup.schema) && istDbBenutzerGueltig(backup.dbUser) && backup.dbPassword !== '')

function waehleDatei(event: Event) {
  backup.datei = (event.target as HTMLInputElement).files?.[0] ?? null
}

function spieleBackupEin() {
  const ersetzt = schemata.value.includes(backup.schema)
  confirm.require({
    header: 'Backup einspielen',
    message: ersetzt
      ? `Das Schema „${backup.schema}“ gibt es bereits und wird ersetzt. Fortfahren?`
      : `„${backup.datei?.name}“ wird als neues Schema „${backup.schema}“ eingespielt. Fortfahren?`,
    acceptLabel: 'Einspielen',
    rejectLabel: 'Abbrechen',
    accept: async () => {
      backupLaeuft.value = true
      try {
        await spieleQuellDateiEin(angaben.server, backup.schema, backup.datei!, backup.dbUser, backup.dbPassword)
        schemata.value = await ladeVorhandeneSchemata(angaben.server)
        reportInfo(`Das Backup wurde als „${backup.schema}“ eingespielt.`)
      } catch (e) {
        reportError(e, 'einrichten:backup')
      } finally {
        backupLaeuft.value = false
      }
    },
  })
}

// ── Schritt 3 und 4 ──────────────────────────────────────────────────────────

// Doppelte Schulnummern (nur bei Testdaten möglich) erscheinen nur einmal
const schulnummerOptionen = computed(() => angaben.quellen
  .filter((q, i, alle) => q.schulNr !== null && alle.findIndex(x => x.schulNr === q.schulNr) === i)
  .map(q => ({ label: `${q.schulNr} · ${q.schulname}`, value: q.schulNr })))

const testdaten = computed(() => angaben.quellen.some(q => istTestdatenSchulNr(q.schulNr)))
const koopNummern = computed(() => koopSchulnummern(angaben.quellen))

/** Benutzer je Quellschule vorbelegen, vorhandene Eingaben bleiben erhalten */
function bereiteBenutzerVor() {
  angaben.benutzer = angaben.quellen.map(q => {
    const vorhanden = angaben.benutzer.find(b => b.nr === q.nr)
    return vorhanden ?? { nr: q.nr, benutzername: `Schule${q.nr}`, anzeigename: q.schulname, password: '' }
  })
}

function weiter() {
  const fehler = aktiv.value === 1 ? pruefeQuellen(angaben.quellen, schemata.value)
    : aktiv.value === 2 ? pruefeKoop(angaben.koop, angaben.quellen, schemata.value)
      : pruefeBenutzer(angaben.benutzer)
  if (fehler.length > 0) return reportWarning(fehler.join(' '))
  if (aktiv.value === 1) bereiteBenutzerVor()
  aktiv.value++
  if (aktiv.value === 4) pruefeAlles()
}

// ── Schritt 5: Prüfen und generieren ─────────────────────────────────────────

const pruefLaeuft = ref(false)
const pruefFehler = ref<string[]>([])
const generiert = ref<'nein' | 'laeuft' | 'fertig' | 'fehler'>('nein')
const generierFehler = ref('')
const schritte = ref<Schritt[]>([])
const loeschLaeuft = ref(false)
const anmeldeLaeuft = ref(false)

const statusIcon: Record<SchrittStatus, string> = {
  offen: 'pi pi-circle',
  laeuft: 'pi pi-spin pi-spinner',
  ok: 'pi pi-check-circle',
  fehler: 'pi pi-times-circle',
  uebersprungen: 'pi pi-minus-circle',
}

async function pruefeAlles() {
  pruefLaeuft.value = true
  try {
    schemata.value = await ladeVorhandeneSchemata(angaben.server)
    pruefFehler.value = pruefeAngaben(angaben, schemata.value)
    if (pruefFehler.value.length === 0) pruefFehler.value = await pruefeAmServer(angaben)
  } catch (e) {
    pruefFehler.value = [toAppError(e, 'einrichten:pruefen').messageUser]
  } finally {
    pruefLaeuft.value = false
  }
}

function generiere() {
  confirm.require({
    header: 'KOOP-DB generieren',
    message: `Die KOOP-DB „${angaben.koop.schema}“ wird jetzt auf dem Server angelegt. Fortfahren?`,
    acceptLabel: 'Generieren',
    rejectLabel: 'Abbrechen',
    accept: async () => {
      schritte.value = erzeugeSchritte(angaben)
      generiert.value = 'laeuft'
      try {
        await generiereKoopDb(angaben, schritte.value)
        generiert.value = 'fertig'
      } catch (e) {
        generiert.value = 'fehler'
        generierFehler.value = toAppError(e, 'einrichten:generieren').messageUser
        reportError(e, 'einrichten:generieren')
      }
    },
  })
}

function loescheTeilweise() {
  confirm.require({
    header: 'KOOP-DB löschen',
    message: `Die unvollständige KOOP-DB „${angaben.koop.schema}“ wird gelöscht. Fortfahren?`,
    acceptLabel: 'Löschen',
    rejectLabel: 'Abbrechen',
    acceptClass: 'p-button-danger',
    accept: async () => {
      loeschLaeuft.value = true
      try {
        await loescheSchema(erzeugeRootClient(angaben.server), angaben.koop.schema)
        schritte.value = []
        generiert.value = 'nein'
        reportInfo(`Die KOOP-DB „${angaben.koop.schema}“ wurde gelöscht.`)
        await pruefeAlles()
      } catch (e) {
        reportError(e, 'einrichten:loeschen')
      } finally {
        loeschLaeuft.value = false
      }
    },
  })
}

async function zumDashboard() {
  anmeldeLaeuft.value = true
  try {
    await auth.connect({
      baseUrl: angaben.server.baseUrl,
      schema: angaben.koop.schema,
      username: 'Admin',
      password: angaben.koop.adminPassword,
    })
    quellenStore.uebernehmeAusEinrichtung(quellInfos(angaben.quellen))
    router.push({ name: 'dashboard' })
  } catch (e) {
    reportError(e, 'einrichten:anmelden')
  } finally {
    anmeldeLaeuft.value = false
  }
}

function abbrechen() {
  entferneAlleClients()
  router.push({ name: 'connect' })
}
</script>

<style scoped>
.einrichten {
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

.schrittleiste {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.25rem;
  font-size: 0.875rem;
  color: var(--p-text-muted-color);
}

.schrittleiste li {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.schrittleiste .nr {
  width: 1.6rem;
  height: 1.6rem;
  border-radius: 50%;
  border: 1px solid var(--app-border);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
}

.schrittleiste .aktiv {
  color: var(--app-ink);
  font-weight: 600;
}

.schrittleiste .aktiv .nr,
.schrittleiste .erledigt .nr {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--surface);
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

.raster {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1rem;
}

.feld {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.feld label {
  font-size: 0.85rem;
  font-weight: 500;
}

.feld :deep(input),
.feld :deep(.p-password),
.feld :deep(.p-select) {
  width: 100%;
}

.feld-knopf {
  justify-content: flex-end;
}

.hinweis {
  margin: 0;
  font-size: 0.85rem;
  color: var(--p-text-muted-color);
}

.quelle {
  border: 1px solid var(--app-border);
  border-left: 4px solid var(--schulfarbe);
  border-radius: 8px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.quelle-kopf {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.schulnr {
  font-weight: 600;
  color: var(--schulfarbe);
}

.geprueft {
  flex: 1;
  font-size: 0.85rem;
  color: var(--koop-ok);
}

.backup {
  border-top: 1px solid var(--app-border);
  padding-top: 1rem;
}

.backup summary {
  cursor: pointer;
  font-weight: 500;
  margin-bottom: 0.75rem;
}

.backup .raster {
  margin: 0.75rem 0;
}

.benutzer + .benutzer {
  border-top: 1px solid var(--app-border);
  padding-top: 1rem;
}

.zusammenfassung {
  margin: 0;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.35rem 1rem;
  font-size: 0.9rem;
}

.zusammenfassung dt {
  color: var(--p-text-muted-color);
}

.zusammenfassung dd {
  margin: 0;
}

.fehlerliste {
  margin: 0;
  padding-left: 1.1rem;
}

.schritte {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  font-size: 0.9rem;
}

.schritte .ok i { color: var(--koop-ok); }
.schritte .fehler { color: var(--koop-fehler); }
.schritte .offen,
.schritte .uebersprungen { color: var(--p-text-muted-color); }

.navigation {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
}

.navigation-rechts {
  display: flex;
  gap: 0.5rem;
}
</style>
