<template>
  <div class="zaehler-zeile">
    <span v-for="art in ARTEN" :key="art" class="zaehler" :class="art">{{ protokoll.anzahl(art) }} {{ ART_TITEL[art] }}</span>
  </div>
  <details class="protokoll" :open="protokoll.anzahl('fehler') > 0">
    <summary>Protokoll ({{ protokoll.eintraege.length }} Einträge)</summary>
    <ul>
      <li v-for="(e, i) in sortiert" :key="i" :class="e.art">
        <span class="art">{{ ART_TITEL[e.art] }}</span> <span class="bereich">{{ e.bereich }}</span> {{ e.text }}
      </li>
    </ul>
  </details>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Protokoll, ProtokollArt } from '@/koop/uebernahme'

// Protokoll eines Laufs (ADR 002, A13): Zähler je Art, Einträge mit Fehlern zuerst

const props = defineProps<{ protokoll: Protokoll }>()

const ARTEN: ProtokollArt[] = ['neu', 'aktualisiert', 'entfernt', 'uebersprungen', 'hinweis', 'fehler']
const ART_TITEL: Record<ProtokollArt, string> = { neu: 'neu', aktualisiert: 'aktualisiert', entfernt: 'entfernt', uebersprungen: 'übersprungen', hinweis: 'Hinweise', fehler: 'Fehler' }
const REIHENFOLGE: Record<ProtokollArt, number> = { fehler: 0, hinweis: 1, entfernt: 2, uebersprungen: 3, neu: 4, aktualisiert: 5 }

const sortiert = computed(() => [...props.protokoll.eintraege].sort((a, b) => REIHENFOLGE[a.art] - REIHENFOLGE[b.art]))
</script>

<style scoped>
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
