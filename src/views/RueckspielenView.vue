<template>
  <div class="seite">
    <header class="kopf">
      <div>
        <h1>Rückspielen</h1>
        <p class="untertitel">
          Kurse, Kurszuordnungen und Fachwahlen der eigenen Schüler aus der KOOP-DB „{{ auth.schema }}“ in die Datenbank der
          Schule übertragen. Eigene Kurse und Leistungsdaten der Schule bleiben unverändert.
        </p>
      </div>
      <div class="kopf-aktionen">
        <ThemeToggle />
        <Button label="Zum Dashboard" icon="pi pi-th-large" severity="secondary" text :disabled="laeuft" @click="router.push({ name: 'dashboard' })" />
      </div>
    </header>

    <!-- 1. Anmeldung an der Schule -->
    <section class="karte">
      <h2>1. Datenbank der Schule</h2>
      <p class="hinweis">
        Das KOOP-Backup ist als zusätzliches Schema auf dem SVWS-Server der Schule eingespielt, und Sie sind daran angemeldet.
        Melden Sie sich jetzt zusätzlich an der eigenen Datenbank der Schule an, am besten mit einem Administrator.
      </p>
      <form class="raster" @submit.prevent="meldeAn">
        <div class="feld">
          <label for="sschema">Schema der Schule</label>
          <InputText id="sschema" v-model="zugang.schema" :disabled="laeuft" />
        </div>
        <div class="feld">
          <label for="suser">SVWS-Benutzer</label>
          <InputText id="suser" v-model="zugang.username" :disabled="laeuft" />
        </div>
        <div class="feld">
          <label for="spw">Kennwort</label>
          <Password id="spw" v-model="zugang.password" :feedback="false" toggleMask :disabled="laeuft" />
        </div>
        <div class="feld feld-knopf">
          <Button type="submit" label="Anmelden" icon="pi pi-sign-in" severity="secondary" :loading="meldetAn" :disabled="!zugang.schema || laeuft" />
        </div>
      </form>
      <template v-if="anmeldung">
        <Message v-if="anmeldung.passend.length === 0" severity="error" :closable="false">
          Die Schule {{ anmeldung.schulNr }} · {{ anmeldung.schulname }} gehört nicht zu den Quellschulen dieser KOOP-DB.
        </Message>
        <template v-else>
          <Message severity="success" :closable="false">
            Angemeldet an {{ anmeldung.schema }}: {{ anmeldung.schulNr }} · {{ anmeldung.schulname }}
            <template v-if="quelle"> (Schule {{ quelle.nr }} der Kooperation)</template>
          </Message>
          <div v-if="anmeldung.passend.length > 1" class="feld schmal">
            <label>Testdaten: Welche Quellschule ist das?</label>
            <Select v-model="quellNr" :options="anmeldung.passend.map(q => ({ label: `Schule ${q.nr}: ${q.schema}`, value: q.nr }))" optionLabel="label" optionValue="value" />
          </div>
        </template>
      </template>
    </section>

    <!-- 2. Vorschau -->
    <section v-if="quelle" class="karte">
      <div class="teil-kopf">
        <h2>2. Vorschau</h2>
        <Button :label="vorschau ? 'Vorschau neu laden' : 'Vorschau laden'" icon="pi pi-eye" :severity="vorschau ? 'secondary' : undefined" :loading="laedtVorschau" :disabled="laeuft" @click="ladeVorschauNeu" />
      </div>
      <p class="hinweis">Die Vorschau liest beide Datenbanken und schreibt nichts. Bei vielen Schülern dauert das bis zu einer Minute.</p>
      <div v-if="laedtVorschau" class="fortschritt">
        <ProgressBar :value="fortschritt.gesamt ? Math.round(100 * fortschritt.erledigt / fortschritt.gesamt) : undefined" :mode="fortschritt.gesamt ? 'determinate' : 'indeterminate'" />
        <span class="hinweis">{{ fortschritt.text }}</span>
      </div>
      <MeldungsListe v-if="vorschau" :meldungen="vorschau.meldungen" />
    </section>

    <template v-if="vorschau">
      <section v-for="j in vorschau.jahrgaenge" :key="j.abiturjahr" class="karte" :class="{ abgewaehlt: !auswahlJahrgaenge.has(j.abiturjahr) }">
        <div class="teil-kopf">
          <h2>{{ j.jahrgang }} <span class="hinweis">Abitur {{ j.abiturjahr }} · {{ j.schueler }} eigene Schüler</span></h2>
          <label class="schalter">
            <Checkbox :modelValue="auswahlJahrgaenge.has(j.abiturjahr)" binary :disabled="laeuft" @update:modelValue="(an: boolean) => schalte(auswahlJahrgaenge, j.abiturjahr, an)" />
            zurückspielen
          </label>
        </div>
        <MeldungsListe :meldungen="j.meldungen" />

        <div class="block">
          <h3>Fachwahlen</h3>
          <p v-if="aenderungen(j).length === 0" class="hinweis">Keine Änderungen gegenüber der Schule.</p>
          <details v-else>
            <summary>{{ aenderungen(j).length }} Schüler mit geänderten Fachwahlen ab dem aktuellen Halbjahr</summary>
            <ul class="liste">
              <li v-for="f in aenderungen(j)" :key="f.schuleId">
                {{ f.name }}: {{ f.aenderungen.map(a => a.kuerzel).join(', ') }}
                <Tag v-if="f.inStammschuleGeaendert" value="in der Schule geändert" severity="warn" />
              </li>
            </ul>
          </details>
          <label v-if="j.fachwahlen.some(f => f.inStammschuleGeaendert)" class="schalter">
            <Checkbox :modelValue="ueberschreiben.has(j.abiturjahr)" binary :disabled="laeuft" @update:modelValue="(an: boolean) => schalte(ueberschreiben, j.abiturjahr, an)" />
            In der Schule geänderte Fachwahlen trotzdem mit dem Stand der KOOP-DB überschreiben
          </label>
        </div>

        <div v-for="t in j.teile" :key="t.halbjahr" class="block">
          <h3>{{ HALBJAHR_TITEL[t.halbjahr] }} <span class="hinweis">Blockung „{{ t.blockung.name }}“</span></h3>
          <MeldungsListe :meldungen="t.meldungen" />
          <div class="zahlen">
            <span>{{ zaehle(t).eigen }} Kurse eigene Schule</span>
            <span>{{ zaehle(t).partner }} Kurse Partnerschulen</span>
            <span :class="{ warnung: zaehle(t).offen > 0 }">{{ zaehle(t).offen }} ohne gewählte Schule</span>
            <span>{{ zaehle(t).nicht }} Kurse werden nicht angelegt</span>
            <span>{{ t.schueler.filter(s => s.idLernabschnitt !== null).length }} Schüler, {{ t.kurse.reduce((n, k) => n + (wirdAngelegt(k) ? k.zuordnungen : 0), 0) }} Kurszuordnungen</span>
          </div>

          <div v-if="unklar(t).length > 0" class="unklar">
            <div class="sammel">
              <span>Alle Kurse ohne eindeutige Lehrkraft:</span>
              <Select v-model="sammel[schluessel(j, t)]" :options="schulOptionen" optionLabel="label" optionValue="value" placeholder="Schule wählen" :disabled="laeuft" />
              <Button label="Übernehmen" severity="secondary" size="small" :disabled="sammel[schluessel(j, t)] === undefined || laeuft" @click="setzeAlle(j, t)" />
            </div>
            <details>
              <summary>{{ unklar(t).length }} Kurse einzeln zuordnen</summary>
              <table class="kurse">
                <thead><tr><th>Kurs</th><th>Lehrkräfte</th><th>Grund</th><th>Zuordnungen</th><th>findet statt an</th></tr></thead>
                <tbody>
                  <tr v-for="k in unklar(t)" :key="k.koopId">
                    <td class="kuerzel">{{ k.kuerzel }}</td>
                    <td>{{ k.lehrerKuerzel.join(', ') || '–' }}</td>
                    <td class="hinweis">{{ k.ort.art === 'unklar' ? k.ort.grund : '' }}</td>
                    <td class="zahl">{{ k.zuordnungen }}</td>
                    <td>
                      <Select :modelValue="kursOrte.get(k.koopId) ?? null" :options="schulOptionenMitNicht" optionLabel="label" optionValue="value" size="small" :disabled="laeuft"
                        @update:modelValue="(nr: number | null) => setzeOrt(k.koopId, nr)" />
                    </td>
                  </tr>
                </tbody>
              </table>
            </details>
          </div>
        </div>
      </section>

      <!-- 3. Zurückspielen -->
      <section class="karte">
        <div class="teil-kopf">
          <h2>3. Zurückspielen</h2>
          <Button label="Zurückspielen" icon="pi pi-reply" :loading="laeuft" :disabled="!kannSchreiben" @click="spieleZurueckBestaetigt" />
        </div>
        <label v-if="hatWarnungen" class="schalter">
          <Checkbox v-model="warnungenGelesen" binary :disabled="laeuft" />
          Ich habe die Warnungen gelesen und möchte trotzdem zurückspielen.
        </label>
        <p class="hinweis">
          Geschrieben werden die ausgewählten Abiturjahrgänge. Halbjahre mit Fehlern werden übersprungen. Was SVWS-KOOP anlegt,
          vermerkt es in der Schule und ersetzt es bei einer erneuten Rückspielung.
        </p>
        <div v-if="laeuft" class="fortschritt">
          <ProgressBar :value="fortschritt.gesamt ? Math.round(100 * fortschritt.erledigt / fortschritt.gesamt) : undefined" :mode="fortschritt.gesamt ? 'determinate' : 'indeterminate'" />
          <span class="hinweis">{{ fortschritt.text }}</span>
        </div>
        <template v-if="protokoll">
          <ProtokollAnzeige :protokoll="protokoll" />
          <Message severity="info" :closable="false">
            Bitte prüfen Sie die Kurse in der Kursplanung des SVWS-Clients. Danach sollten das eingespielte KOOP-Schema und die
            Backup-Datei gelöscht werden, sie enthalten Daten aller Kooperationsschulen.
          </Message>
        </template>
      </section>
    </template>

    <LegalFooter />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useConfirm } from 'primevue/useconfirm'
import Button from 'primevue/button'
import Message from 'primevue/message'
import ProgressBar from 'primevue/progressbar'
import InputText from 'primevue/inputtext'
import Password from 'primevue/password'
import Select from 'primevue/select'
import Checkbox from 'primevue/checkbox'
import Tag from 'primevue/tag'
import ThemeToggle from '@/components/ThemeToggle.vue'
import LegalFooter from '@/components/LegalFooter.vue'
import MeldungsListe from '@/components/MeldungsListe.vue'
import ProtokollAnzeige from '@/components/ProtokollAnzeige.vue'
import { useQuellenStore } from '@/stores/quellen'
import { useAuthStore } from '@/stores/auth'
import { useErrorService } from '@/services/errorService'
import { KOOP, getClient, entferneClient } from '@/services/apiClient'
import {
  SCHULE, kursortNr, ladeVorschau, meldeSchuleAn, spieleZurueck, istSchreibbar, wirdAngelegt,
  type HalbjahrTeil, type JahrgangsPlan, type KursPlan, type SchulAnmeldung, type Vorschau,
} from '@/services/rueckspielungService'
import { HALBJAHR_TITEL } from '@/koop/uebersicht'
import type { Protokoll } from '@/koop/uebernahme'

const router = useRouter()
const confirm = useConfirm()
const quellen = useQuellenStore()
const auth = useAuthStore()
const { reportError } = useErrorService()

// Zugangsdaten der Schule nur im Arbeitsspeicher dieser Ansicht (ADR 001, Abschnitt 3)
const zugang = reactive({ schema: '', username: 'Admin', password: '' })
const meldetAn = ref(false)
const anmeldung = ref<SchulAnmeldung | null>(null)
const quellNr = ref<number | null>(null)
const quelle = computed(() => anmeldung.value?.passend.find(q => q.nr === quellNr.value) ?? null)

const vorschau = ref<Vorschau | null>(null)
const laedtVorschau = ref(false)
const laeuft = ref(false)
const protokoll = ref<Protokoll | null>(null)
const fortschritt = reactive({ text: '', erledigt: 0, gesamt: 0 })
const melde = (text: string, erledigt = 0, gesamt = 0) => Object.assign(fortschritt, { text, erledigt, gesamt })

// Auswahl
const auswahlJahrgaenge = reactive(new Set<number>())
const ueberschreiben = reactive(new Set<number>())
const kursOrte = reactive(new Map<number, number>())
const sammel = reactive<Record<string, number | undefined>>({})
const warnungenGelesen = ref(false)

onMounted(async () => {
  try {
    await quellen.laden()
  } catch (e) {
    reportError(e, 'rueckspielen:quellen')
  }
})

async function meldeAn() {
  meldetAn.value = true
  vorschau.value = null
  protokoll.value = null
  try {
    anmeldung.value = await meldeSchuleAn({ baseUrl: auth.baseUrl, username: zugang.username, password: zugang.password }, zugang.schema.trim(), quellen.quellen)
    quellNr.value = anmeldung.value.passend.length === 1 ? anmeldung.value.passend[0].nr : null
    zugang.password = ''
  } catch (e) {
    anmeldung.value = null
    entferneClient(SCHULE)
    reportError(e, 'rueckspielen:anmelden')
  } finally {
    meldetAn.value = false
  }
}

watch(quellNr, () => { vorschau.value = null })

async function ladeVorschauNeu() {
  if (!quelle.value) return
  laedtVorschau.value = true
  protokoll.value = null
  melde('')
  try {
    vorschau.value = await ladeVorschau(getClient(KOOP), getClient(SCHULE), quelle.value, quellen.quellen, auth.schema, melde)
    auswahlJahrgaenge.clear()
    ueberschreiben.clear()
    kursOrte.clear()
    warnungenGelesen.value = false
    // Vorausgewählt sind Jahrgänge, in denen es etwas zu schreiben gibt
    for (const j of vorschau.value.jahrgaenge) {
      if (aenderungen(j).length > 0 || j.teile.some(istSchreibbar)) auswahlJahrgaenge.add(j.abiturjahr)
    }
  } catch (e) {
    reportError(e, 'rueckspielen:vorschau')
  } finally {
    laedtVorschau.value = false
  }
}

function schalte(menge: Set<number>, wert: number, an: boolean) {
  if (an) menge.add(wert)
  else menge.delete(wert)
}

function aenderungen(j: JahrgangsPlan) {
  return j.fachwahlen.filter(f => f.aenderungen.length > 0)
}

function unklar(t: HalbjahrTeil): KursPlan[] {
  return t.kurse.filter(k => k.ort.art === 'unklar' && wirdAngelegt(k))
}

function schluessel(j: JahrgangsPlan, t: HalbjahrTeil): string {
  return `${j.abiturjahr}/${t.halbjahr}`
}

const schulOptionen = computed(() => quellen.quellen.map(q => ({ label: `Schule ${q.nr}: ${q.schulname}`, value: q.nr })))
const schulOptionenMitNicht = computed(() => [...schulOptionen.value, { label: 'nicht übertragen', value: null }])

function setzeOrt(koopId: number, nr: number | null) {
  if (nr === null) kursOrte.delete(koopId)
  else kursOrte.set(koopId, nr)
}

function setzeAlle(j: JahrgangsPlan, t: HalbjahrTeil) {
  const nr = sammel[schluessel(j, t)]
  if (nr === undefined) return
  for (const k of unklar(t)) kursOrte.set(k.koopId, nr)
}

function zaehle(t: HalbjahrTeil) {
  const auswahl = { jahrgaenge: auswahlJahrgaenge, kursOrte, fachwahlenUeberschreiben: ueberschreiben }
  let eigen = 0, partner = 0, offen = 0, nicht = 0
  for (const k of t.kurse) {
    if (!wirdAngelegt(k)) { nicht++; continue }
    const nr = kursortNr(k, auswahl)
    if (nr === null) offen++
    else if (nr === quelle.value?.nr) eigen++
    else partner++
  }
  return { eigen, partner, offen, nicht }
}

const ausgewaehlt = computed(() => (vorschau.value?.jahrgaenge ?? []).filter(j => auswahlJahrgaenge.has(j.abiturjahr)))

const hatWarnungen = computed(() => (vorschau.value?.meldungen.warnungen.length ?? 0) > 0
  || ausgewaehlt.value.some(j => j.meldungen.warnungen.length > 0 || j.teile.some(t => t.meldungen.warnungen.length > 0)))

const kannSchreiben = computed(() => !laeuft.value && ausgewaehlt.value.length > 0 && (!hatWarnungen.value || warnungenGelesen.value))

function spieleZurueckBestaetigt() {
  const halbjahre = ausgewaehlt.value.flatMap(j => j.teile.filter(istSchreibbar).map(t => `${j.jahrgang} ${HALBJAHR_TITEL[t.halbjahr]}`))
  confirm.require({
    header: 'Zurückspielen',
    message: `In die Datenbank „${anmeldung.value?.schema}“ werden geschrieben: Fachwahlen für ${ausgewaehlt.value.map(j => j.jahrgang).join(', ')}`
      + `${halbjahre.length > 0 ? `, Kurse und Kurszuordnungen für ${halbjahre.join(', ')}` : ''}. Fortfahren?`,
    acceptLabel: 'Zurückspielen',
    rejectLabel: 'Abbrechen',
    accept: async () => {
      laeuft.value = true
      melde('')
      try {
        protokoll.value = await spieleZurueck(getClient(SCHULE), vorschau.value!, { jahrgaenge: auswahlJahrgaenge, kursOrte, fachwahlenUeberschreiben: ueberschreiben }, melde)
      } catch (e) {
        reportError(e, 'rueckspielen:schreiben')
      } finally {
        laeuft.value = false
      }
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

.karte.abgewaehlt {
  opacity: 0.6;
}

.karte h2 {
  margin: 0;
  font-size: 1.15rem;
}

.block {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding-top: 0.9rem;
  border-top: 1px solid var(--app-border);
}

.block h3 {
  margin: 0;
  font-size: 1rem;
}

.teil-kopf {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.hinweis {
  margin: 0;
  font-size: 0.85rem;
  color: var(--p-text-muted-color);
  font-weight: normal;
}

.raster {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
}

.feld {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.feld.schmal {
  max-width: 320px;
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

.schalter {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
  cursor: pointer;
}

.fortschritt {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.zahlen {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 1.25rem;
  font-size: 0.85rem;
}

.warnung {
  color: var(--koop-warnung);
  font-weight: 600;
}

details summary {
  cursor: pointer;
  font-size: 0.9rem;
}

.liste {
  margin: 0.4rem 0 0;
  padding-left: 1.1rem;
  font-size: 0.85rem;
  max-height: 16rem;
  overflow: auto;
}

.unklar {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.sammel {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.6rem;
  font-size: 0.9rem;
}

.kurse {
  width: 100%;
  margin-top: 0.5rem;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.kurse th,
.kurse td {
  text-align: left;
  padding: 0.3rem 0.5rem;
  border-bottom: 1px solid var(--app-border);
}

.kurse td.zahl {
  text-align: right;
}

.kuerzel {
  font-family: ui-monospace, monospace;
}
</style>
