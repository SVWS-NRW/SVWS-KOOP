<template>
  <div class="dashboard">
    <header class="dashboard-header">
      <div>
        <h1>SVWS KOOP</h1>
        <p class="verbindung">
          {{ auth.schema }} · {{ auth.schulbezeichnung }} ({{ auth.schulNr }})
        </p>
      </div>
      <div class="header-actions">
        <ThemeToggle />
        <Button
          label="Abmelden"
          icon="pi pi-sign-out"
          severity="secondary"
          text
          @click="handleLogout"
        />
      </div>
    </header>

    <div class="tile-grid">
      <div
        v-for="kachel in kacheln"
        :key="kachel.titel"
        class="tile"
        :class="kachel.route ? 'tile--nav' : 'tile--gesperrt'"
        @click="kachel.route && router.push({ name: kachel.route })"
      >
        <div class="tile-icon"><i :class="kachel.icon" /></div>
        <div class="tile-body">
          <span class="tile-title">{{ kachel.titel }}</span>
          <span class="tile-sub">{{ kachel.untertitel }}</span>
          <span class="tile-phase">Phase {{ kachel.phase }}{{ kachel.route ? '' : ' · in Vorbereitung' }}</span>
        </div>
        <i class="pi pi-chevron-right tile-arrow" />
      </div>
    </div>

    <div class="dashboard-footer">
      <LegalFooter />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import { useAuthStore } from '@/stores/auth'
import ThemeToggle from '@/components/ThemeToggle.vue'
import LegalFooter from '@/components/LegalFooter.vue'

interface Kachel {
  titel: string
  untertitel: string
  icon: string
  phase: string
  /** Name der Route, fehlt = noch nicht umgesetzt */
  route?: string
}

// Kacheln nach ADR 002, Abschnitt „Oberfläche“
const kacheln: Kachel[] = [
  { titel: 'KOOP-DB einrichten', untertitel: 'Quell-DBs, Zugangsdaten und Benutzer angeben, KOOP-DB anlegen', icon: 'pi pi-database', phase: '1' },
  { titel: 'Konsistenz prüfen', untertitel: 'Fächer, Oberstufe, Jahrgänge, Klassen und Kataloge vergleichen', icon: 'pi pi-check-square', phase: '1', route: 'konsistenz' },
  { titel: 'Lehrkräfte übernehmen', untertitel: 'Aktive Lehrkräfte mit Kürzel <Kürzel>-<Nr>', icon: 'pi pi-id-card', phase: '1', route: 'uebernahme' },
  { titel: 'Schüler übernehmen', untertitel: 'Stammdaten, Erzieher, Sprachenfolge und Fachwahlen', icon: 'pi pi-users', phase: '1', route: 'uebernahme' },
  { titel: 'Nachladen', untertitel: 'Neue und abgegangene Schüler und Lehrkräfte abgleichen', icon: 'pi pi-refresh', phase: '1–2' },
  { titel: 'Übersicht KOOP-DB', untertitel: 'Schüler je Stammschule und Jahrgang, Stand der Fachwahlen', icon: 'pi pi-chart-bar', phase: '2' },
  { titel: 'Rückspielen', untertitel: 'Kurse, Leistungsdaten und Fachwahlen in die Stammschule', icon: 'pi pi-reply', phase: '4' },
  { titel: 'Protokolle', untertitel: 'Alle Läufe einsehen und exportieren', icon: 'pi pi-list', phase: 'alle' },
]

const router = useRouter()
const auth = useAuthStore()

function handleLogout() {
  auth.disconnect()
  router.push({ name: 'connect' })
}
</script>

<style scoped>
.dashboard {
  min-height: 100vh;
  padding: 2rem;
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.dashboard-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.dashboard-header h1 {
  margin: 0;
  font-size: 1.5rem;
}

.verbindung {
  margin: 0.2rem 0 0;
  font-size: 0.85rem;
  color: var(--p-text-muted-color);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.tile-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
}

@media (max-width: 900px) {
  .tile-grid { grid-template-columns: repeat(2, 1fr); }
}

@media (max-width: 560px) {
  .tile-grid { grid-template-columns: 1fr; }
}

.tile {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.25rem 1rem;
  border-radius: 0.75rem;
  border: 1px solid var(--p-content-border-color);
  background: var(--p-content-background);
}

.tile--nav {
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
}

.tile--nav:hover {
  background: var(--p-highlight-background);
  border-color: var(--p-primary-color);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.tile--gesperrt {
  cursor: not-allowed;
  opacity: 0.55;
}

.tile-icon {
  flex-shrink: 0;
  width: 3rem;
  height: 3rem;
  border-radius: 0.5rem;
  background: var(--p-primary-50, #ecfdf5);
  color: var(--p-primary-color);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
}

.tile-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
}

.tile-title {
  font-weight: 600;
  font-size: 1rem;
}

.tile-sub,
.tile-phase {
  font-size: 0.8rem;
  color: var(--p-text-muted-color);
}

.tile-phase {
  font-size: 0.72rem;
}

.tile-arrow {
  flex-shrink: 0;
  color: var(--p-text-muted-color);
  font-size: 0.85rem;
}

.dashboard-footer {
  margin-top: auto;
}
</style>
