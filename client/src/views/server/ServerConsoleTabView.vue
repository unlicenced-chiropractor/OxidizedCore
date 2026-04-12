<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useServersStore } from '@/stores/servers'

const route = useRoute()
const store = useServersStore()

const serverId = computed(() => Number(route.params.id))
const server = computed(() => store.byId.get(serverId.value))

const command = ref('')
const outputLines = ref<{ type: 'in' | 'out' | 'err'; text: string }[]>([])
const running = ref(false)
const consoleScroll = ref<HTMLElement | null>(null)

const processLogText = computed(() => store.serverGameLog(serverId.value))

onMounted(async () => {
  store.attachSocket()
  await store.fetchServers()
  if (Number.isFinite(serverId.value)) {
    await store.fetchServerLogHistory(serverId.value)
    store.subscribeLogRooms([serverId.value])
  }
  void nextTick(() => scrollConsole())
})

onUnmounted(() => {
  if (Number.isFinite(serverId.value)) {
    store.unsubscribeLogRooms([serverId.value])
  }
})

watch(processLogText, async () => {
  await nextTick()
  scrollConsole()
})

watch(outputLines, async () => {
  await nextTick()
  scrollConsole()
})

function scrollConsole() {
  const el = consoleScroll.value
  if (el) el.scrollTop = el.scrollHeight
}

async function runCommand() {
  if (!server.value?.rcon_enabled) return
  if (server.value.status !== 'running') return
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

function clearConsoleView() {
  store.clearServerGameLog(serverId.value)
  outputLines.value = []
}
</script>

<template>
  <div v-if="server" class="space-y-3">
    <section
      class="overflow-hidden rounded-lg border border-slate-800/90 bg-slate-950"
      aria-label="Server console"
    >
      <div
        class="flex flex-col gap-2 border-b border-slate-800/80 bg-slate-900/50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
      >
        <h2 class="text-xs font-semibold uppercase tracking-wide text-slate-500">Log & RCON</h2>
        <div class="flex flex-wrap gap-1.5">
          <button
            type="button"
            class="rounded border border-slate-600/80 px-2 py-1 text-xs text-slate-400 hover:border-slate-500 hover:text-slate-200"
            @click="clearConsoleView"
          >
            Clear
          </button>
          <button
            type="button"
            class="rounded border border-slate-600/80 px-2 py-1 text-xs text-slate-400 hover:border-slate-500 hover:text-slate-200"
            @click="store.fetchServerLogHistory(serverId)"
          >
            Reload log
          </button>
        </div>
      </div>

      <div
        v-if="!server.rcon_enabled"
        class="border-b border-slate-800/80 bg-slate-900/35 px-3 py-2 text-xs text-slate-500"
        role="status"
      >
        RCON is off — turn it on under
        <RouterLink :to="{ name: 'server-settings', params: { id: String(server.id) } }" class="text-slate-300 underline underline-offset-2"
          >Settings</RouterLink
        >.
      </div>

      <div
        ref="consoleScroll"
        class="max-h-[min(380px,45vh)] overflow-auto bg-[#0a0e14] px-3 py-2 font-mono text-[11px] leading-relaxed"
        role="log"
        aria-live="polite"
      >
        <pre class="whitespace-pre-wrap break-words text-slate-400">{{
          processLogText || '— No output yet. Start the server from General.'
        }}</pre>

        <div v-if="server.rcon_enabled" class="mt-2 border-t border-slate-800/70 pt-2">
          <p class="mb-1 text-[10px] font-medium uppercase text-slate-600">RCON</p>
          <div class="space-y-1">
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
              {{ server.status === 'running' ? 'Enter a command below.' : 'Start the server to use RCON.' }}
            </p>
          </div>
        </div>
      </div>

      <div
        v-if="server.rcon_enabled && server.status !== 'running'"
        class="border-t border-slate-800/80 bg-amber-950/15 px-3 py-2 text-xs text-amber-200/85"
      >
        Start the server from the
        <RouterLink :to="{ name: 'server-general', params: { id: String(server.id) } }" class="font-medium text-amber-300 underline underline-offset-2"
          >General</RouterLink
        >
        tab.
      </div>

      <form class="flex gap-2 border-t border-slate-800/80 bg-slate-900/30 p-3" @submit.prevent="runCommand">
        <label class="sr-only" for="rcon-cmd">RCON command</label>
        <input
          id="rcon-cmd"
          v-model="command"
          :disabled="running || server.status !== 'running' || !server.rcon_enabled"
          placeholder="RCON command…"
          class="min-w-0 flex-1 rounded border border-slate-700/90 bg-slate-950 px-2.5 py-2 text-xs text-slate-200 placeholder:text-slate-600 outline-none focus:border-blue-600/60 disabled:opacity-50"
        />
        <button
          type="submit"
          :disabled="running || !command.trim() || server.status !== 'running' || !server.rcon_enabled"
          class="shrink-0 rounded bg-blue-600 px-4 py-2 font-sans text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-40"
        >
          Run
        </button>
      </form>
    </section>
  </div>
</template>
