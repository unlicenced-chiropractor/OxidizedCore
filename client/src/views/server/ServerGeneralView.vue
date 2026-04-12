<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useServersStore } from '@/stores/servers'

const route = useRoute()
const store = useServersStore()
const busy = ref(false)

const serverId = computed(() => Number(route.params.id))
const server = computed(() => store.byId.get(serverId.value))

const createdDisplay = computed(() => {
  const s = server.value?.created_at
  if (!s) return '—'
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
})

onMounted(async () => {
  store.attachSocket()
  await store.fetchServers()
})

function statusPill(s: string) {
  switch (s) {
    case 'running':
      return 'bg-emerald-950/80 text-emerald-300 ring-1 ring-emerald-700/40'
    case 'starting':
      return 'bg-amber-950/80 text-amber-300 ring-1 ring-amber-700/40'
    case 'error':
      return 'bg-red-950/80 text-red-300 ring-1 ring-red-700/40'
    default:
      return 'bg-slate-800 text-slate-400 ring-1 ring-slate-600/60'
  }
}

function statusLabel(s: string) {
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

async function start() {
  if (!server.value) return
  busy.value = true
  try {
    await store.startServer(server.value.id)
  } catch (e) {
    alert(e instanceof Error ? e.message : 'Start failed')
  } finally {
    busy.value = false
  }
}

async function stop() {
  if (!server.value) return
  busy.value = true
  try {
    await store.stopServer(server.value.id)
  } catch (e) {
    alert(e instanceof Error ? e.message : 'Stop failed')
  } finally {
    busy.value = false
  }
}

async function restart() {
  if (!server.value) return
  if (!confirm('Restart this server? Players will be disconnected.')) return
  busy.value = true
  try {
    await store.restartServer(server.value.id)
  } catch (e) {
    alert(e instanceof Error ? e.message : 'Restart failed')
  } finally {
    busy.value = false
  }
}

const canStop = computed(() => server.value?.status === 'running' || server.value?.status === 'starting')
const canRestart = computed(() => server.value?.status === 'running')
const canStart = computed(
  () => server.value && server.value.status !== 'running' && server.value.status !== 'starting'
)
</script>

<template>
  <div v-if="server" class="space-y-6">
    <div class="flex flex-wrap items-center gap-3">
      <span
        class="inline-flex rounded-md px-2.5 py-1 text-xs font-semibold ring-1"
        :class="statusPill(server.status)"
      >
        {{ statusLabel(server.status) }}
      </span>
      <span class="text-xs text-slate-600">Server #{{ server.id }}</span>
    </div>

    <div class="flex flex-wrap gap-2">
      <button
        v-if="canStart"
        type="button"
        class="rounded-md bg-blue-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        :disabled="busy"
        @click="start"
      >
        Start
      </button>
      <button
        v-if="canRestart"
        type="button"
        class="rounded-md border border-amber-600/60 bg-amber-950/30 px-3.5 py-2 text-sm font-medium text-amber-200 hover:bg-amber-950/50 disabled:opacity-50"
        :disabled="busy"
        @click="restart"
      >
        Restart
      </button>
      <button
        v-if="canStop"
        type="button"
        class="rounded-md border border-slate-600 px-3.5 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50"
        :disabled="busy"
        @click="stop"
      >
        Stop
      </button>
    </div>

    <section class="rounded-lg border border-slate-800/90 bg-slate-900/25 p-4 sm:p-5">
      <h2 class="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Server identity</h2>
      <dl class="mt-4 grid gap-4 sm:grid-cols-2">
        <div class="sm:col-span-2">
          <dt class="text-xs font-medium text-slate-500">Display name</dt>
          <dd class="mt-1 text-base font-medium text-slate-100">{{ server.name }}</dd>
        </div>
        <div class="sm:col-span-2">
          <dt class="text-xs font-medium text-slate-500">Description</dt>
          <dd class="mt-1 text-sm leading-relaxed text-slate-300">
            {{ server.server_description?.trim() ? server.server_description : '—' }}
          </dd>
        </div>
        <div>
          <dt class="text-xs font-medium text-slate-500">Panel / bind host</dt>
          <dd class="mt-1 font-mono text-sm text-slate-200">{{ server.host || '—' }}</dd>
        </div>
        <div>
          <dt class="text-xs font-medium text-slate-500">Created</dt>
          <dd class="mt-1 text-sm text-slate-300">{{ createdDisplay }}</dd>
        </div>
      </dl>
    </section>

    <section class="rounded-lg border border-slate-800/90 bg-slate-900/25 p-4 sm:p-5">
      <h2 class="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Network</h2>
      <p class="mt-2 text-xs leading-relaxed text-slate-600">
        Open these ports on your firewall and router so players can connect and tools can reach RCON.
      </p>
      <dl class="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <dt class="text-xs font-medium text-slate-500">Game</dt>
          <dd class="mt-1 font-mono text-lg font-semibold tabular-nums text-slate-100">{{ server.game_port }}</dd>
          <dd class="mt-0.5 text-xs text-slate-600">UDP — main game traffic</dd>
        </div>
        <div>
          <dt class="text-xs font-medium text-slate-500">RCON</dt>
          <dd class="mt-1 font-mono text-lg font-semibold tabular-nums text-slate-100">{{ server.rcon_port }}</dd>
          <dd class="mt-0.5 text-xs text-slate-600">TCP — remote console (panel)</dd>
        </div>
        <div>
          <dt class="text-xs font-medium text-slate-500">Query</dt>
          <dd class="mt-1 font-mono text-lg font-semibold tabular-nums text-slate-100">{{ server.query_port }}</dd>
          <dd class="mt-0.5 text-xs text-slate-600">UDP — server browser / Steam query</dd>
        </div>
        <div>
          <dt class="text-xs font-medium text-slate-500">Rust+ companion</dt>
          <dd class="mt-1 font-mono text-lg font-semibold tabular-nums text-slate-100">
            {{ server.companion_enabled ? server.companion_tcp_port : '—' }}
          </dd>
          <dd class="mt-0.5 text-xs text-slate-600">
            <template v-if="server.companion_enabled">
              TCP {{ server.companion_tcp_port }} — forward for the Rust+ app; restart after toggling in Settings.
            </template>
            <template v-else> Off — Rust+ disabled for this server. </template>
          </dd>
        </div>
      </dl>
    </section>

    <section class="rounded-lg border border-slate-800/90 bg-slate-900/25 p-4 sm:p-5">
      <h2 class="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">World</h2>
      <dl class="mt-4 grid gap-4 sm:grid-cols-3">
        <div>
          <dt class="text-xs font-medium text-slate-500">Map size</dt>
          <dd class="mt-1 text-lg font-semibold tabular-nums text-slate-100">
            {{ server.map_worldsize.toLocaleString() }}
          </dd>
          <dd class="mt-0.5 text-xs text-slate-600">World size (meters)</dd>
        </div>
        <div>
          <dt class="text-xs font-medium text-slate-500">Seed</dt>
          <dd class="mt-1 font-mono text-lg font-semibold tabular-nums text-slate-100">{{ server.map_seed }}</dd>
          <dd class="mt-0.5 text-xs text-slate-600">Procedural map seed</dd>
        </div>
        <div>
          <dt class="text-xs font-medium text-slate-500">Player slots</dt>
          <dd class="mt-1 text-lg font-semibold tabular-nums text-slate-100">{{ server.max_players }}</dd>
          <dd class="mt-0.5 text-xs text-slate-600">Maximum concurrent players</dd>
        </div>
      </dl>
    </section>

    <section class="rounded-lg border border-slate-800/90 bg-slate-900/25 p-4 sm:p-5">
      <h2 class="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Features & limits</h2>
      <dl class="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <dt class="text-xs font-medium text-slate-500">RCON</dt>
          <dd class="mt-1 text-sm text-slate-200">
            {{ server.rcon_enabled ? 'Enabled — Console tab can send commands' : 'Disabled — game starts without RCON' }}
          </dd>
        </div>
        <div>
          <dt class="text-xs font-medium text-slate-500">Oxide / uMod</dt>
          <dd class="mt-1 text-sm text-slate-200">
            {{ server.oxide_enabled ? 'Enabled — Oxide merged into install on start' : 'Disabled — vanilla Rust dedicated' }}
          </dd>
        </div>
        <div>
          <dt class="text-xs font-medium text-slate-500">Rust+</dt>
          <dd class="mt-1 text-sm text-slate-200">
            {{
              server.companion_enabled
                ? 'Enabled — companion server on TCP port above'
                : 'Disabled — not advertised for Rust+'
            }}
          </dd>
        </div>
        <div class="sm:col-span-2">
          <dt class="text-xs font-medium text-slate-500">Memory limit</dt>
          <dd class="mt-1 text-sm text-slate-200">
            <template v-if="server.memory_limit_mb != null">
              {{ server.memory_limit_mb.toLocaleString() }} MiB — enforced on the host when supported (e.g. Linux
              systemd-run).
            </template>
            <template v-else>No cap configured — process may use available RAM.</template>
          </dd>
        </div>
      </dl>
    </section>
  </div>
</template>
