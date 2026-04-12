<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { useServersStore } from '@/stores/servers'

defineProps<{ id: string }>()
const route = useRoute()
const store = useServersStore()

const serverId = computed(() => Number(route.params.id))
const server = computed(() => store.byId.get(serverId.value))
const idParam = computed(() => String(route.params.id))

const tabs = computed(() => {
  const t: { name: 'server-general' | 'server-console' | 'server-settings' | 'server-plugins' | 'server-backups'; label: string }[] = [
    { name: 'server-general', label: 'General' },
    { name: 'server-console', label: 'Console' },
    { name: 'server-settings', label: 'Settings' },
  ]
  if (store.oxideInstalled) {
    t.push({ name: 'server-plugins', label: 'Plugins' })
  }
  t.push({ name: 'server-backups', label: 'Backups' })
  return t
})

onMounted(() => {
  void store.fetchSystem()
})
</script>

<template>
  <div v-if="!server" class="space-y-3 text-sm">
    <p class="text-slate-500">Server not found.</p>
    <RouterLink to="/" class="font-medium text-blue-400 hover:text-blue-300">← Back to list</RouterLink>
  </div>

  <div v-else class="space-y-5">
    <nav class="text-xs text-slate-500" aria-label="Breadcrumb">
      <RouterLink to="/" class="hover:text-slate-400">Servers</RouterLink>
      <span class="mx-1.5 text-slate-700">/</span>
      <span class="text-slate-400">{{ server.name }}</span>
    </nav>

    <div class="flex min-w-0 flex-wrap items-center justify-between gap-2">
      <h1 class="truncate text-lg font-semibold text-slate-100 sm:text-xl">{{ server.name }}</h1>
    </div>

    <nav
      class="-mx-1 flex gap-0.5 overflow-x-auto border-b border-slate-800/90 pb-px"
      aria-label="Server sections"
    >
      <RouterLink
        v-for="tab in tabs"
        :key="tab.name"
        v-slot="{ href, navigate, isExactActive }"
        :to="{ name: tab.name, params: { id: idParam } }"
        custom
      >
        <a
          :href="href"
          role="tab"
          :aria-selected="isExactActive"
          :tabindex="isExactActive ? 0 : -1"
          class="shrink-0 rounded-t-md border border-b-0 px-3 py-2 text-sm font-medium transition hover:text-slate-300"
          :class="
            isExactActive
              ? '!border-slate-800/90 !bg-slate-900/50 !text-blue-400'
              : 'border-transparent text-slate-500'
          "
          @click="navigate"
        >
          {{ tab.label }}
        </a>
      </RouterLink>
    </nav>

    <RouterView />
  </div>
</template>
