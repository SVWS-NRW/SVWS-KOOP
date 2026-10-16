<template>
  <div class="quellen">
    <div
      v-for="q in store.quellen"
      :key="q.nr"
      class="quelle"
      :style="{ '--schulfarbe': `var(--koop-schule-${q.nr})` }"
    >
      <div class="kopf">
        <span class="nr">Schule {{ q.nr }}</span>
        <span class="name">{{ q.schulNr }} · {{ q.schulname }} <span class="schema">({{ q.schema }})</span></span>
        <span v-if="store.verbunden[q.nr]" class="status ok"><i class="pi pi-check" /> verbunden</span>
      </div>
      <form v-if="!store.verbunden[q.nr]" class="anmeldung" @submit.prevent="verbinde(q.nr)">
        <InputText v-model="eingabe[q.nr].username" placeholder="SVWS-Benutzer" />
        <Password v-model="eingabe[q.nr].password" placeholder="Kennwort" :feedback="false" toggleMask />
        <Button type="submit" label="Anmelden" icon="pi pi-sign-in" severity="secondary" :loading="laeuft === q.nr" />
      </form>
    </div>
    <Message v-if="store.quellen.length === 0" severity="warn" :closable="false">
      In dieser KOOP-DB sind keine Quell-DBs vermerkt. Sie wird nicht mit dem Assistenten „KOOP-DB einrichten“ angelegt worden sein.
    </Message>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, watchEffect } from 'vue'
import InputText from 'primevue/inputtext'
import Password from 'primevue/password'
import Button from 'primevue/button'
import Message from 'primevue/message'
import { useQuellenStore } from '@/stores/quellen'
import { useErrorService } from '@/services/errorService'

const store = useQuellenStore()
const { reportError } = useErrorService()

const eingabe = reactive<Record<number, { username: string, password: string }>>({})
watchEffect(() => {
  for (const q of store.quellen) eingabe[q.nr] ??= { username: 'Admin', password: '' }
})

const laeuft = ref<number | null>(null)

async function verbinde(nr: number) {
  laeuft.value = nr
  try {
    await store.verbinde(nr, eingabe[nr].username, eingabe[nr].password)
    eingabe[nr].password = ''
  } catch (e) {
    reportError(e, `quelle-${nr}`)
  } finally {
    laeuft.value = null
  }
}
</script>

<style scoped>
.quellen {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.quelle {
  border: 1px solid var(--app-border);
  border-left: 4px solid var(--schulfarbe);
  border-radius: 8px;
  padding: 0.75rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.kopf {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.nr {
  font-weight: 600;
  color: var(--schulfarbe);
}

.name {
  flex: 1;
}

.schema {
  color: var(--p-text-muted-color);
  font-size: 0.85rem;
}

.status.ok {
  color: var(--koop-ok);
  font-size: 0.85rem;
}

.anmeldung {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
</style>
