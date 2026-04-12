<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useServersStore } from '@/stores/servers'
import type { ServerStatus } from '@/types'

const store = useServersStore()
const busyId = ref<number | null>(null)

const serversSorted = computed(() =>
  [...store.servers].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.id - b.id)
)

onMounted(async () => {
  store.attachSocket()
  await Promise.all([store.fetchServers(), store.fetchSystem()])
})

async function onDelete(id: number) {
  if (!confirm('Are you sure you want to delete this server? This cannot be undone.')) return
  try {
    await store.removeServer(id)
  } catch {
    alert('Delete failed.')
  }
}

function statusLabel(s: ServerStatus): string {
  switch (s) {
    case 'running':
      return 'Running'
    case 'starting':
      return 'Starting'
    case 'error':
      return 'Error'
    default:
      return 'Stopped'
  }
}

function statusPillClass(s: ServerStatus): string {
  switch (s) {
    case 'running':
      return 'bg-emerald-950/80 text-emerald-200 ring-1 ring-emerald-700/50'
    case 'starting':
      return 'bg-amber-950/80 text-amber-200 ring-1 ring-amber-700/50'
    case 'error':
      return 'bg-red-950/80 text-red-200 ring-1 ring-red-700/50'
    default:
      return 'bg-slate-800 text-slate-300 ring-1 ring-slate-600/80'
  }
}

async function onStart(id: number) {
  busyId.value = id
  try {
    await store.startServer(id)
  } catch (e) {
    alert(e instanceof Error ? e.message : 'Start failed')
  } finally {
    busyId.value = null
  }
}

async function onStop(id: number) {
  busyId.value = id
  try {
    await store.stopServer(id)
  } catch (e) {
    alert(e instanceof Error ? e.message : 'Stop failed')
  } finally {
    busyId.value = null
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Steam -->
    <div
      v-if="store.rustInstall?.status === 'downloading'"
      class="rounded-lg bg-amber-950/35 px-4 py-3 text-sm leading-relaxed ring-1 ring-amber-800/40"
      role="status"
    >
      <p class="font-medium text-amber-100">Downloading Rust dedicated server</p>
      <p class="mt-1.5 text-slate-400">
        {{ store.rustInstall?.rustSteamPlatform ?? 'linux' }} build for
        {{ store.rustInstall?.hostPlatformLabel ?? 'this computer' }}. Finish this before starting a server.
      </p>
    </div>

    <div
      v-if="store.rustInstall?.status === 'error'"
      class="rounded-lg bg-red-950/35 px-4 py-3 text-sm ring-1 ring-red-800/40"
      role="alert"
    >
      <p class="font-medium text-red-100">Steam install failed</p>
      <p class="mt-1.5 break-words leading-relaxed text-red-200/90">{{ store.rustInstall.error }}</p>
    </div>

    <header class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-2xl font-semibold tracking-tight text-slate-50">Servers</h1>
      <RouterLink
        to="/servers/new"
        class="rounded-md bg-blue-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
      >
        New server
      </RouterLink>
    </header>

    <div v-if="store.loading" class="space-y-2" aria-busy="true">
      <div v-for="n in 4" :key="n" class="animate-pulse rounded-lg bg-slate-900/50 py-2.5 ring-1 ring-slate-800/80">
        <div class="mx-3 flex items-center gap-4">
          <div class="h-3.5 w-32 rounded bg-slate-800" />
          <div class="h-3.5 w-16 rounded bg-slate-800/80" />
          <div class="hidden h-3.5 flex-1 rounded bg-slate-800/60 sm:block" />
        </div>
      </div>
    </div>

    <p v-else-if="store.error" class="text-sm leading-relaxed text-red-300" role="alert">{{ store.error }}</p>

    <div v-else-if="serversSorted.length" class="overflow-x-auto rounded-lg ring-1 ring-slate-800/80">
      <div class="min-w-[640px] divide-y divide-slate-800/80 bg-slate-900/25">
        <div
          class="grid grid-cols-[minmax(0,1.2fr)_auto_minmax(0,1.4fr)_auto] gap-2 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-600 sm:px-4"
        >
          <span>Server</span>
          <span class="text-center">Status</span>
          <span class="hidden sm:block">Ports / world</span>
          <span class="text-right">Actions</span>
        </div>

        <TransitionGroup name="server-row" tag="div" class="divide-y divide-slate-800/80">
          <div
            v-for="s in serversSorted"
            :key="s.id"
            class="grid grid-cols-[minmax(0,1.2fr)_auto_minmax(0,1.4fr)_auto] items-center gap-2 px-3 py-2 sm:px-4 sm:py-2.5"
          >
            <div class="min-w-0">
              <RouterLink
                :to="{ name: 'server-general', params: { id: String(s.id) } }"
                class="block truncate text-sm font-medium text-slate-100 hover:text-blue-400"
              >
                {{ s.name }}
              </RouterLink>
              <p class="truncate text-[11px] text-slate-600">{{ s.instance_slug }}</p>
            </div>

            <div class="flex justify-center">
              <span
                class="whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium sm:text-xs"
                :class="statusPillClass(s.status)"
              >
                {{ statusLabel(s.status) }}
              </span>
            </div>

            <div class="hidden min-w-0 font-mono text-[10px] leading-snug text-slate-500 sm:block">
              <span class="tabular-nums">{{ s.game_port }}/{{ s.rcon_port }}/{{ s.query_port }}/{{ s.companion_tcp_port }}</span>
              <span class="ml-1 font-sans text-slate-600">udp/tcp</span>
              <span class="block truncate text-slate-600">
                {{ s.map_worldsize }} · seed {{ s.map_seed }} · {{ s.max_players }} pl
              </span>
            </div>

            <div class="flex flex-wrap items-center justify-end gap-1">
              <button
                v-if="s.status !== 'running' && s.status !== 'starting'"
                type="button"
                class="rounded border border-blue-600/50 bg-blue-600/90 px-2 py-1 text-[11px] font-medium text-white hover:bg-blue-500 disabled:opacity-50"
                :disabled="busyId === s.id"
                @click="onStart(s.id)"
              >
                {{ busyId === s.id ? '…' : 'Start' }}
              </button>
              <button
                v-if="s.status === 'running' || s.status === 'starting'"
                type="button"
                class="rounded border border-slate-600 px-2 py-1 text-[11px] font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                :disabled="busyId === s.id"
                @click="onStop(s.id)"
              >
                Stop
              </button>
              <RouterLink
                :to="{ name: 'server-general', params: { id: String(s.id) } }"
                class="rounded border border-slate-600/80 px-2 py-1 text-[11px] font-medium text-slate-300 hover:bg-slate-800/50"
              >
                Open
              </RouterLink>
              <button
                type="button"
                class="rounded bg-red-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
                :disabled="s.status === 'running' || s.status === 'starting'"
                title="Delete server (stop it first)"
                @click="onDelete(s.id)"
              >
                Delete
              </button>
            </div>
          </div>
        </TransitionGroup>
      </div>
    </div>

    <div v-else class="rounded-lg bg-slate-900/40 px-5 py-10 text-center ring-1 ring-slate-800/80">
      <p class="text-sm font-medium text-slate-300">No servers yet</p>
      <p class="mt-1.5 text-sm leading-relaxed text-slate-500">
        Create one, then start it when the game files finish downloading.
      </p>
      <RouterLink
        to="/servers/new"
        class="mt-4 inline-block rounded-md bg-blue-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-blue-500"
      >
        Create server
      </RouterLink>
    </div>
  </div>
</template>

<style scoped>
.server-row-move,
.server-row-enter-active,
.server-row-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.server-row-enter-from,
.server-row-leave-to {
  opacity: 0;
  transform: translateY(-3px);
}
</style>
