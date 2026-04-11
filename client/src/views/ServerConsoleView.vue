<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useServersStore } from '@/stores/servers'

const props = defineProps<{ id: string }>()
const route = useRoute()
const router = useRouter()
const store = useServersStore()

const serverId = computed(() => Number(props.id || route.params.id))
const server = computed(() => store.byId.get(serverId.value))

const command = ref('')
const outputLines = ref<{ type: 'in' | 'out' | 'err'; text: string }[]>([])
const running = ref(false)
const editOpen = ref(false)
const processLogScroll = ref<HTMLElement | null>(null)
const edit = ref({
  name: '',
  game_port: 28015,
  rcon_port: 28016,
  rcon_password: '',
  map_seed: 1,
  map_worldsize: 3500,
})

const processLogText = computed(() => store.serverGameLog(serverId.value))

onMounted(async () => {
  store.attachSocket()
  await Promise.all([store.fetchServers(), store.fetchSystem()])
  if (Number.isFinite(serverId.value)) {
    await store.fetchServerLogHistory(serverId.value)
    store.subscribeLogRooms([serverId.value])
  }
  void nextTick(() => scrollProcessLog())
})

onUnmounted(() => {
  if (Number.isFinite(serverId.value)) {
    store.unsubscribeLogRooms([serverId.value])
  }
})

watch(processLogText, async () => {
  await nextTick()
  scrollProcessLog()
})

function scrollProcessLog() {
  const el = processLogScroll.value
  if (el) el.scrollTop = el.scrollHeight
}

watch(
  server,
  (s) => {
    if (!s) return
    edit.value = {
      name: s.name,
      game_port: s.game_port,
      rcon_port: s.rcon_port,
      rcon_password: '',
      map_seed: s.map_seed,
      map_worldsize: s.map_worldsize,
    }
  },
  { immediate: true }
)

async function runCommand() {
  if (server.value && server.value.status !== 'running') return
  const cmd = command.value.trim()
  if (!cmd || !Number.isFinite(serverId.value)) return
  outputLines.value.push({ type: 'in', text: `> ${cmd}` })
  command.value = ''
  running.value = true
  try {
    const res = await fetch(`/api/servers/${serverId.value}/rcon`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: cmd }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      outputLines.value.push({ type: 'err', text: data.error ?? res.statusText })
    } else {
      outputLines.value.push({ type: 'out', text: String(data.response ?? '') })
    }
  } catch (e) {
    outputLines.value.push({ type: 'err', text: e instanceof Error ? e.message : 'Request failed' })
  } finally {
    running.value = false
  }
}

async function saveEdit() {
  if (!Number.isFinite(serverId.value)) return
  const body: Record<string, string | number> = {
    name: edit.value.name,
    game_port: edit.value.game_port,
    rcon_port: edit.value.rcon_port,
    map_seed: edit.value.map_seed,
    map_worldsize: edit.value.map_worldsize,
  }
  if (edit.value.rcon_password.trim()) body.rcon_password = edit.value.rcon_password
  try {
    await store.updateServer(serverId.value, body)
    editOpen.value = false
    edit.value.rcon_password = ''
  } catch (e) {
    alert(e instanceof Error ? e.message : 'Update failed. Please try again.')
  }
}

function clearProcessView() {
  store.clearServerGameLog(serverId.value)
}
</script>

<template>
  <div v-if="!server" class="space-y-4">
    <p class="text-sm text-slate-500">This server could not be found. It may have been removed.</p>
    <button
      type="button"
      class="text-sm font-medium text-blue-500 transition hover:text-blue-400"
      @click="router.push('/')"
    >
      Back to servers
    </button>
  </div>

  <div v-else class="space-y-8">
    <nav class="text-sm text-slate-600" aria-label="Breadcrumb">
      <RouterLink to="/" class="transition hover:text-slate-400">Servers</RouterLink>
      <span class="mx-2 text-slate-700" aria-hidden="true">/</span>
      <span class="text-slate-500">{{ server.name }}</span>
    </nav>

    <div class="flex flex-col gap-6 border-b border-slate-800/60 pb-8 sm:flex-row sm:items-start sm:justify-between">
      <div class="min-w-0 space-y-3">
        <h1 class="truncate text-2xl font-semibold tracking-tight text-slate-50 sm:text-[1.75rem]">
          {{ server.name }}
        </h1>
        <div class="flex flex-wrap items-center gap-2">
          <span
            class="inline-flex rounded-md border px-2.5 py-1 text-xs font-medium"
            :class="
              server.status === 'running'
                ? 'border-emerald-800/80 bg-emerald-950/40 text-emerald-400'
                : server.status === 'starting'
                  ? 'border-amber-800/80 bg-amber-950/40 text-amber-400'
                  : server.status === 'error'
                    ? 'border-red-800/80 bg-red-950/40 text-red-400'
                    : 'border-slate-700/80 bg-slate-900/60 text-slate-500'
            "
          >
            {{
              server.status === 'running'
                ? 'Running'
                : server.status === 'starting'
                  ? 'Starting'
                  : server.status === 'error'
                    ? 'Error'
                    : 'Stopped'
            }}
          </span>
        </div>
        <p class="font-mono text-xs text-slate-500">
          {{ server.game_port }} / {{ server.rcon_port }}
          <span class="mx-2 text-slate-700">·</span>
          {{ server.map_worldsize }} / {{ server.map_seed }}
        </p>
      </div>
      <button
        type="button"
        class="shrink-0 rounded-md border border-slate-600/90 bg-slate-900/40 px-4 py-2 text-sm font-medium text-slate-300 transition hover:border-slate-500 hover:bg-slate-800/50"
        :aria-expanded="editOpen"
        @click="editOpen = !editOpen"
      >
        {{ editOpen ? 'Hide' : 'Settings' }}
      </button>
    </div>

    <div
      v-if="editOpen"
      class="space-y-6 rounded-lg border border-slate-800/80 bg-slate-900/25 p-6 sm:p-7"
    >
      <div class="grid gap-5 sm:grid-cols-2">
        <label class="sm:col-span-2 block">
          <span class="text-sm font-medium text-slate-400">Name</span>
          <input
            v-model="edit.name"
            class="mt-2 w-full rounded-md border border-slate-700/90 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-blue-600/70 focus:ring-2 focus:ring-blue-600/20"
          />
        </label>
        <label class="block">
          <span class="text-sm font-medium text-slate-400">Map seed</span>
          <input
            v-model.number="edit.map_seed"
            type="number"
            min="0"
            max="2147483647"
            class="mt-2 w-full rounded-md border border-slate-700/90 bg-slate-950 px-3 py-2.5 text-sm tabular-nums outline-none focus:border-blue-600/70 focus:ring-2 focus:ring-blue-600/20"
          />
        </label>
        <label class="block">
          <span class="text-sm font-medium text-slate-400">Map size</span>
          <input
            v-model.number="edit.map_worldsize"
            type="number"
            min="1000"
            max="6000"
            class="mt-2 w-full rounded-md border border-slate-700/90 bg-slate-950 px-3 py-2.5 text-sm tabular-nums outline-none focus:border-blue-600/70 focus:ring-2 focus:ring-blue-600/20"
          />
        </label>
        <label class="block">
          <span class="text-sm font-medium text-slate-400">Game port</span>
          <input
            v-model.number="edit.game_port"
            type="number"
            class="mt-2 w-full rounded-md border border-slate-700/90 bg-slate-950 px-3 py-2.5 text-sm tabular-nums outline-none focus:border-blue-600/70 focus:ring-2 focus:ring-blue-600/20"
          />
        </label>
        <label class="block">
          <span class="text-sm font-medium text-slate-400">RCON port</span>
          <input
            v-model.number="edit.rcon_port"
            type="number"
            class="mt-2 w-full rounded-md border border-slate-700/90 bg-slate-950 px-3 py-2.5 text-sm tabular-nums outline-none focus:border-blue-600/70 focus:ring-2 focus:ring-blue-600/20"
          />
        </label>
        <label class="sm:col-span-2 block">
          <span class="text-sm font-medium text-slate-400">New RCON password (optional)</span>
          <input
            v-model="edit.rcon_password"
            type="password"
            autocomplete="new-password"
            class="mt-2 w-full rounded-md border border-slate-700/90 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-blue-600/70 focus:ring-2 focus:ring-blue-600/20"
          />
        </label>
        <div class="sm:col-span-2 flex justify-end border-t border-slate-800/60 pt-5">
          <button
            type="button"
            class="rounded-md bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-500"
            @click="saveEdit"
          >
            Save changes
          </button>
        </div>
      </div>
    </div>

    <!-- Process log -->
    <section
      class="overflow-hidden rounded-xl border border-slate-800/90 bg-slate-950 shadow-lg shadow-black/15"
      aria-label="Game process log"
    >
      <div
        class="flex flex-col gap-2 border-b border-slate-800/80 bg-slate-900/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <h2 class="text-sm font-semibold text-slate-200">Log</h2>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded-lg border border-slate-600/80 px-3 py-1.5 text-xs font-medium text-slate-400 transition hover:border-slate-500 hover:text-slate-200"
            @click="clearProcessView"
          >
            Clear view
          </button>
          <button
            type="button"
            class="rounded-lg border border-slate-600/80 px-3 py-1.5 text-xs font-medium text-slate-400 transition hover:border-slate-500 hover:text-slate-200"
            @click="store.fetchServerLogHistory(serverId)"
          >
            Reload from disk
          </button>
        </div>
      </div>
      <div
        ref="processLogScroll"
        class="max-h-[min(380px,42vh)] overflow-auto bg-[#0a0e14] px-4 py-3 font-mono text-[12px] leading-relaxed"
        role="log"
        aria-live="polite"
      >
        <pre class="whitespace-pre-wrap break-words text-slate-400">{{
          processLogText || '— No output yet. Start the server from Servers, or wait for install to finish.'
        }}</pre>
      </div>
    </section>

    <!-- RCON -->
    <section
      class="overflow-hidden rounded-xl border border-slate-800/90 bg-slate-950/60"
      aria-label="RCON console"
    >
      <div class="border-b border-slate-800/80 bg-slate-900/40 px-4 py-3">
        <h2 class="text-sm font-semibold text-slate-200">RCON</h2>
      </div>
      <div class="min-h-[200px] font-mono text-[13px] leading-relaxed">
        <div class="max-h-[min(280px,32vh)] space-y-1.5 overflow-y-auto p-4 text-slate-500">
          <p
            v-for="(line, i) in outputLines"
            :key="i"
            class="break-words"
            :class="{
              'text-blue-400/90': line.type === 'in',
              'text-slate-300': line.type === 'out',
              'text-red-400/90': line.type === 'err',
            }"
          >
            {{ line.text }}
          </p>
          <p v-if="!outputLines.length" class="text-slate-600">
            {{
              server.status === 'running'
                ? 'Run a command below (e.g. status, say hello).'
                : 'Start this server from the Servers list to use RCON.'
            }}
          </p>
        </div>
        <div
          v-if="server.status !== 'running'"
          class="border-t border-slate-800/80 bg-amber-950/15 px-4 py-3 text-sm text-amber-200/85"
          role="status"
        >
          RCON only works while the process is running. Go to
          <RouterLink to="/" class="font-medium text-amber-300 underline-offset-2 hover:underline">
            Servers
          </RouterLink>
          and press <span class="font-medium">Start</span>.
        </div>
        <form
          class="flex gap-2 border-t border-slate-800/80 bg-slate-900/30 p-4"
          @submit.prevent="runCommand"
        >
          <label class="sr-only" for="rcon-cmd">RCON command</label>
          <input
            id="rcon-cmd"
            v-model="command"
            :disabled="running || server.status !== 'running'"
            placeholder="RCON command…"
            class="min-w-0 flex-1 rounded-lg border border-slate-700/90 bg-slate-950 px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:border-blue-600/70 focus:ring-2 focus:ring-blue-600/20 disabled:cursor-not-allowed disabled:opacity-50"
          />
          <button
            type="submit"
            :disabled="running || !command.trim() || server.status !== 'running'"
            class="shrink-0 rounded-lg bg-blue-600 px-5 py-2.5 font-sans text-sm font-medium text-white transition hover:bg-blue-500 disabled:pointer-events-none disabled:opacity-40"
          >
            Run
          </button>
        </form>
        <p v-if="running" class="border-t border-slate-800/60 px-4 py-2 text-center text-xs text-slate-600">
          Waiting for response…
        </p>
      </div>
    </section>
  </div>
</template>
