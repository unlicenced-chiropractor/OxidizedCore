<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useServersStore } from '@/stores/servers'
import type { ServerStatus } from '@/types'

const store = useServersStore()
const busyId = ref<number | null>(null)
const metricsLoading = ref(false)
const metricsError = ref<string | null>(null)
const metrics = ref<{
  timestamp: string
  host: {
    cpuCores: number
    totalMemMb: number
    freeMemMb: number
    usedMemMb: number
  }
  servers: Array<{ serverId: number; pid: number; cpuPercent: number | null; memoryMb: number | null }>
} | null>(null)
let metricsTimer: number | null = null

const serversSorted = computed(() =>
  [...store.servers].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.id - b.id)
)

const runningCount = computed(() => serversSorted.value.filter((s) => s.status === 'running').length)
const startingCount = computed(() => serversSorted.value.filter((s) => s.status === 'starting').length)
const errorCount = computed(() => serversSorted.value.filter((s) => s.status === 'error').length)

const summaryLine = computed(() => {
  const n = serversSorted.value.length
  if (n === 0) return null
  const parts: string[] = [`${n} server${n === 1 ? '' : 's'}`]
  if (runningCount.value) parts.push(`${runningCount.value} running`)
  if (startingCount.value) parts.push(`${startingCount.value} starting`)
  if (errorCount.value) parts.push(`${errorCount.value} error`)
  return parts.join(' · ')
})

const hostMemoryPercent = computed(() => {
  const m = metrics.value
  if (!m || m.host.totalMemMb <= 0) return null
  return (m.host.usedMemMb / m.host.totalMemMb) * 100
})

const serverMetricsById = computed(() => {
  const map = new Map<number, { cpuPercent: number | null; memoryMb: number | null; pid: number }>()
  for (const m of metrics.value?.servers ?? []) {
    map.set(m.serverId, { cpuPercent: m.cpuPercent, memoryMb: m.memoryMb, pid: m.pid })
  }
  return map
})

function fmtMb(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return `${Math.round(v).toLocaleString()} MB`
}

function fmtPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return `${v.toFixed(1)}%`
}

async function fetchMetrics() {
  metricsLoading.value = true
  try {
    const res = await fetch('/api/system/metrics')
    const data = (await res.json()) as {
      ok?: boolean
      error?: string
      snapshot?: typeof metrics.value
    }
    if (!res.ok || !data.ok || !data.snapshot) {
      metricsError.value = data.error ?? 'Could not load metrics.'
      return
    }
    metricsError.value = null
    metrics.value = data.snapshot
  } catch {
    metricsError.value = 'Could not load metrics.'
  } finally {
    metricsLoading.value = false
  }
}

onMounted(async () => {
  store.attachSocket()
  await Promise.all([store.fetchServers(), store.fetchSystem(), fetchMetrics()])
  metricsTimer = window.setInterval(() => {
    void fetchMetrics()
  }, 5000)
})

onUnmounted(() => {
  if (metricsTimer !== null) {
    window.clearInterval(metricsTimer)
    metricsTimer = null
  }
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
      return 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/25'
    case 'starting':
      return 'bg-amber-500/15 text-amber-200 ring-1 ring-amber-500/25'
    case 'error':
      return 'bg-red-500/15 text-red-300 ring-1 ring-red-500/25'
    default:
      return 'bg-slate-700/50 text-slate-400 ring-1 ring-slate-600/50'
  }
}

function cardAccentClass(s: ServerStatus): string {
  switch (s) {
    case 'running':
      return 'border-l-emerald-500/70'
    case 'starting':
      return 'border-l-amber-500/70'
    case 'error':
      return 'border-l-red-500/70'
    default:
      return 'border-l-slate-600'
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
  <div class="space-y-10">
    <div
      v-if="store.rustInstall?.status === 'downloading'"
      class="flex items-center gap-3 rounded-xl border border-amber-800/40 bg-amber-950/25 px-4 py-3"
      role="status"
    >
      <span class="relative flex h-2.5 w-2.5 shrink-0">
        <span
          class="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400/60 opacity-75"
        />
        <span class="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-400" />
      </span>
      <p class="text-sm text-amber-100/95">Downloading Rust dedicated…</p>
    </div>

    <div
      v-if="store.rustInstall?.status === 'error'"
      class="rounded-xl border border-red-800/45 bg-red-950/20 px-4 py-3"
      role="alert"
    >
      <p class="text-sm font-medium text-red-200">Steam install failed</p>
      <p class="mt-1 break-words text-sm text-red-300/85">{{ store.rustInstall.error }}</p>
    </div>

    <header class="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 class="text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl">Servers</h1>
        <p v-if="summaryLine" class="mt-2 text-base text-slate-500">{{ summaryLine }}</p>
      </div>
      <RouterLink
        to="/servers/new"
        class="inline-flex shrink-0 items-center justify-center gap-2.5 rounded-xl bg-blue-600 px-5 py-3 text-base font-medium text-white shadow-lg shadow-blue-950/30 transition hover:bg-blue-500"
      >
        <svg class="h-5 w-5 opacity-90" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path
            d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
          />
        </svg>
        New server
      </RouterLink>
    </header>

    <section class="grid gap-4 md:grid-cols-3">
      <article class="rounded-xl border border-slate-800/80 bg-slate-900/30 p-4">
        <p class="text-xs uppercase tracking-wider text-slate-500">Host memory</p>
        <p class="mt-2 text-xl font-semibold text-slate-100">
          {{ hostMemoryPercent == null ? '—' : `${hostMemoryPercent.toFixed(1)}%` }}
        </p>
        <p class="mt-1 text-sm text-slate-500">
          {{ metrics ? `${fmtMb(metrics.host.usedMemMb)} / ${fmtMb(metrics.host.totalMemMb)}` : '—' }}
        </p>
      </article>
      <article class="rounded-xl border border-slate-800/80 bg-slate-900/30 p-4">
        <p class="text-xs uppercase tracking-wider text-slate-500">Host CPU cores</p>
        <p class="mt-2 text-xl font-semibold text-slate-100">{{ metrics?.host.cpuCores ?? '—' }}</p>
        <p class="mt-1 text-sm text-slate-500">Running server processes: {{ metrics?.servers.length ?? 0 }}</p>
      </article>
      <article class="rounded-xl border border-slate-800/80 bg-slate-900/30 p-4">
        <p class="text-xs uppercase tracking-wider text-slate-500">Metrics status</p>
        <p class="mt-2 text-sm font-medium text-slate-200">
          <span v-if="metricsLoading">Refreshing…</span>
          <span v-else-if="metricsError">{{ metricsError }}</span>
          <span v-else>Updated {{ metrics?.timestamp ? new Date(metrics.timestamp).toLocaleTimeString() : '—' }}</span>
        </p>
      </article>
    </section>

    <div v-if="store.loading" class="grid gap-5 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
      <div
        v-for="n in 6"
        :key="n"
        class="animate-pulse rounded-xl border border-slate-800/80 bg-slate-900/30 p-6"
      >
        <div class="h-5 w-2/3 max-w-[12rem] rounded bg-slate-800" />
        <div class="mt-4 h-4 w-full rounded bg-slate-800/70" />
        <div class="mt-2 h-4 w-4/5 rounded bg-slate-800/50" />
        <div class="mt-6 flex gap-2">
          <div class="h-9 w-16 rounded-lg bg-slate-800/80" />
          <div class="h-9 w-16 rounded-lg bg-slate-800/60" />
        </div>
      </div>
    </div>

    <p v-else-if="store.error" class="rounded-xl border border-red-900/50 bg-red-950/20 px-4 py-3 text-sm text-red-300" role="alert">
      {{ store.error }}
    </p>

    <TransitionGroup
      v-else-if="serversSorted.length"
      name="server-card"
      tag="div"
      class="grid gap-5 sm:grid-cols-2 xl:grid-cols-3"
    >
      <article
        v-for="s in serversSorted"
        :key="s.id"
        class="group flex flex-col rounded-2xl border border-slate-800/90 border-l-[4px] bg-slate-900/35 p-6 shadow-sm transition hover:border-slate-700/90 hover:bg-slate-900/50"
        :class="cardAccentClass(s.status)"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <RouterLink
              :to="{ name: 'server-general', params: { id: String(s.id) } }"
              class="block truncate text-xl font-semibold tracking-tight text-slate-100 transition group-hover:text-blue-400"
            >
              {{ s.name }}
            </RouterLink>
            <p class="mt-1 truncate font-mono text-sm text-slate-600">{{ s.instance_slug }}</p>
          </div>
          <span
            class="shrink-0 rounded-full px-3 py-1.5 text-sm font-medium tabular-nums"
            :class="statusPillClass(s.status)"
          >
            {{ statusLabel(s.status) }}
          </span>
        </div>

        <dl class="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
          <div>
            <dt class="text-xs font-medium uppercase tracking-wider text-slate-600">Game</dt>
            <dd class="mt-1 font-mono text-base tabular-nums text-slate-200">{{ s.game_port }}</dd>
          </div>
          <div>
            <dt class="text-xs font-medium uppercase tracking-wider text-slate-600">RCON</dt>
            <dd class="mt-1 font-mono text-base tabular-nums text-slate-200">{{ s.rcon_port }}</dd>
          </div>
          <div>
            <dt class="text-xs font-medium uppercase tracking-wider text-slate-600">Query</dt>
            <dd class="mt-1 font-mono text-base tabular-nums text-slate-200">{{ s.query_port }}</dd>
          </div>
          <div>
            <dt class="text-xs font-medium uppercase tracking-wider text-slate-600">Rust+</dt>
            <dd class="mt-1 font-mono text-base tabular-nums text-slate-200">
              {{ s.companion_enabled ? s.companion_tcp_port : '—' }}
            </dd>
          </div>
        </dl>

        <p class="mt-4 truncate text-sm text-slate-500">
          Map {{ s.map_worldsize.toLocaleString() }} · Seed {{ s.map_seed.toLocaleString() }} ·
          {{ s.max_players.toLocaleString() }} players
        </p>

        <div class="mt-3 grid grid-cols-2 gap-3 text-xs">
          <div class="rounded-lg border border-slate-800/70 bg-slate-900/40 px-3 py-2">
            <p class="uppercase tracking-wide text-slate-500">CPU</p>
            <p class="mt-1 text-sm text-slate-200">{{ fmtPct(serverMetricsById.get(s.id)?.cpuPercent) }}</p>
          </div>
          <div class="rounded-lg border border-slate-800/70 bg-slate-900/40 px-3 py-2">
            <p class="uppercase tracking-wide text-slate-500">Memory</p>
            <p class="mt-1 text-sm text-slate-200">{{ fmtMb(serverMetricsById.get(s.id)?.memoryMb) }}</p>
          </div>
        </div>

        <div class="mt-6 flex flex-wrap gap-2.5 border-t border-slate-800/80 pt-5">
          <button
            v-if="s.status !== 'running' && s.status !== 'starting'"
            type="button"
            class="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
            :disabled="busyId === s.id"
            @click="onStart(s.id)"
          >
            {{ busyId === s.id ? '…' : 'Start' }}
          </button>
          <button
            v-if="s.status === 'running' || s.status === 'starting'"
            type="button"
            class="rounded-lg border border-slate-600 bg-slate-800/40 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-slate-800 disabled:opacity-50"
            :disabled="busyId === s.id"
            @click="onStop(s.id)"
          >
            Stop
          </button>
          <RouterLink
            :to="{ name: 'server-general', params: { id: String(s.id) } }"
            class="rounded-lg border border-slate-600/90 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:border-slate-500 hover:bg-slate-800/40"
          >
            Open
          </RouterLink>
          <button
            type="button"
            class="ml-auto rounded-lg border border-transparent px-4 py-2.5 text-sm font-medium text-red-400/90 transition hover:bg-red-950/40 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-30"
            :disabled="s.status === 'running' || s.status === 'starting'"
            title="Stop server first"
            @click="onDelete(s.id)"
          >
            Delete
          </button>
        </div>
      </article>
    </TransitionGroup>

    <div
      v-else
      class="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-700/80 bg-slate-900/25 px-8 py-20 text-center"
    >
      <div class="rounded-full bg-slate-800/80 p-5 ring-1 ring-slate-700/60">
        <svg class="h-12 w-12 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.5"
            d="M5 12h14M12 5v14"
          />
        </svg>
      </div>
      <p class="mt-6 text-lg font-medium text-slate-300">No servers yet</p>
      <p class="mt-2 max-w-md text-base text-slate-500">Create a server to get started.</p>
      <RouterLink
        to="/servers/new"
        class="mt-8 rounded-xl bg-blue-600 px-6 py-3 text-base font-medium text-white transition hover:bg-blue-500"
      >
        New server
      </RouterLink>
    </div>
  </div>
</template>

<style scoped>
.server-card-move,
.server-card-enter-active,
.server-card-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.server-card-enter-from,
.server-card-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
