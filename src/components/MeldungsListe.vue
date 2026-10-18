<template>
  <div v-if="anzahl > 0" class="meldungen">
    <template v-for="art in ARTEN" :key="art">
      <div v-for="(m, i) in meldungen[art]" :key="`${art}-${i}`" class="meldung" :class="art">
        <i :class="ICON[art]" />
        <div class="inhalt">
          <span>{{ m.text }}</span>
          <details v-if="m.details && m.details.length > 0">
            <summary>{{ m.details.length }} Einträge anzeigen</summary>
            <ul><li v-for="d in m.details" :key="d">{{ d }}</li></ul>
          </details>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Meldungen } from '@/services/rueckspielungService'

// Fehler, Warnungen und Hinweise der Rückspielung (ADR 004, Abschnitt 11), lange Listen zum Aufklappen

const props = defineProps<{ meldungen: Meldungen }>()

const ARTEN = ['fehler', 'warnungen', 'hinweise'] as const
const ICON = { fehler: 'pi pi-times-circle', warnungen: 'pi pi-exclamation-triangle', hinweise: 'pi pi-info-circle' }

const anzahl = computed(() => props.meldungen.fehler.length + props.meldungen.warnungen.length + props.meldungen.hinweise.length)
</script>

<style scoped>
.meldungen {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  font-size: 0.875rem;
}

.meldung {
  display: flex;
  gap: 0.6rem;
  align-items: flex-start;
  padding: 0.5rem 0.75rem;
  border-radius: 8px;
  border-left: 4px solid var(--farbe);
  background: color-mix(in srgb, var(--farbe) 8%, transparent);
}

.meldung > i {
  color: var(--farbe);
  margin-top: 0.15rem;
}

.fehler { --farbe: var(--koop-fehler); }
.warnungen { --farbe: var(--koop-warnung); }
.hinweise { --farbe: var(--p-text-muted-color); }

.inhalt {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}

details summary {
  cursor: pointer;
  font-size: 0.8rem;
  color: var(--p-text-muted-color);
}

details ul {
  margin: 0.3rem 0 0;
  padding-left: 1.1rem;
  max-height: 14rem;
  overflow: auto;
  font-size: 0.8rem;
}
</style>
