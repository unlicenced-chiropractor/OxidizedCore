<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useServersStore } from '@/stores/servers'
import type { ServerStatus } from '@/types'

const store = useServersStore()
const busyId = ref<number | null>(null)

watch(
  () => [...store.servers.map((s) => s.id)].sort((a, b) => a - b),
  (ids) => {
    store.subscribeLogRooms(ids)
  },
  { immediate: true }
)

onUnmounted(() => {
  store.unsubscribeLogRooms(store.servers.map((s) => s.id))
})

const showAddForm = ref(false)
function randomSeed() {
  return Math.floor(Math.random() * 2_147_483_647)
}
const form = reactive({
  name: '',
  game_port: 28015,
  rcon_port: 28016,
  rcon_password: '',
  map_seed: randomSeed(),
  map_worldsize: 3500,
})
const formError = ref<string | null>(null)
const submitting = ref(false)

const mapPreviewUrl = ref<string | null>(null)
const mapPreviewError = ref<string | null>(null)
const mapPreviewErrorCode = ref<string | null>(null)
const previewLoading = ref(false)
const previewReady = computed(() => mapPreviewUrl.value !== null)

watch(
  () => [form.map_seed, form.map_worldsize] as const,
  () => {
    mapPreviewUrl.value = null
    mapPreviewError.value = null
    mapPreviewErrorCode.value = null
  }
)

onMounted(async () => {
  store.attachSocket()
  await Promise.all([store.fetchServers(), store.fetchSystem()])
})

function resetForm() {
  form.name = ''
  form.game_port = 28015
  form.rcon_port = 28016
  form.rcon_password = ''
  form.map_seed = randomSeed()
  form.map_worldsize = 3500
  formError.value = null
  mapPreviewUrl.value = null
  mapPreviewError.value = null
  mapPreviewErrorCode.value = null
}

async function loadMapPreview() {
  previewLoading.value = true
  mapPreviewError.value = null
  mapPreviewErrorCode.value = null
  mapPreviewUrl.value = null
  try {
    const seed = Math.floor(form.map_seed)
    const worldsize = Math.floor(form.map_worldsize)
    const res = await fetch(`/api/map-preview?seed=${seed}&worldsize=${worldsize}`)
    const data = (await res.json()) as { ok?: boolean; thumbnailUrl?: string; message?: string; code?: string }
    if (!res.ok) {
      mapPreviewErrorCode.value = typeof data.code === 'string' ? data.code : null
      mapPreviewError.value =
        typeof data.message === 'string' && data.message.length > 0
          ? data.message
          : String(data.code || 'Preview failed')
      return
    }
    if (data.thumbnailUrl) mapPreviewUrl.value = data.thumbnailUrl
    else mapPreviewError.value = 'No image returned'
  } catch {
    mapPreviewError.value = 'Could not load preview'
  } finally {
    previewLoading.value = false
  }
}

async function onSubmit() {
  if (!previewReady.value) {
    formError.value = 'Load a map preview first.'
    return
  }
  formError.value = null
  submitting.value = true
  try {
    await store.createServer({
      name: form.name,
      game_port: form.game_port,
      rcon_port: form.rcon_port,
      rcon_password: form.rcon_password,
      map_seed: Math.floor(form.map_seed),
      map_worldsize: Math.floor(form.map_worldsize),
    })
    resetForm()
    showAddForm.value = false
  } catch (e) {
    formError.value = e instanceof Error ? e.message : 'Could not save.'
  } finally {
    submitting.value = false
  }
}

function openAddForm() {
  resetForm()
  showAddForm.value = true
}

function closeAddForm() {
  showAddForm.value = false
  resetForm()
}

async function onDelete(id: number) {
  if (!confirm('Remove this server?')) return
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

function statusClass(s: ServerStatus): string {
  switch (s) {
    case 'running':
      return 'border-emerald-800/80 bg-emerald-950/40 text-emerald-400'
    case 'starting':
      return 'border-amber-800/80 bg-amber-950/40 text-amber-400'
    case 'error':
      return 'border-red-800/80 bg-red-950/40 text-red-400'
    default:
      return 'border-slate-700/80 bg-slate-900/60 text-slate-500'
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
  <div class="space-y-8">
    <p
      v-if="store.rustInstall?.status === 'downloading'"
      class="text-sm text-amber-200/90"
      role="status"
    >
      Downloading Rust dedicated (Steam)…
    </p>

    <p v-if="store.rustInstall?.status === 'error'" class="text-sm text-red-300/90" role="alert">
      Steam install failed: {{ store.rustInstall.error }}
    </p>

    <header class="flex flex-col gap-4 border-b border-slate-800/60 pb-8 sm:flex-row sm:items-center sm:justify-between">
      <h1 class="text-2xl font-semibold tracking-tight text-slate-50">Servers</h1>
      <button
        type="button"
        class="inline-flex shrink-0 items-center justify-center rounded-md bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-500"
        @click="showAddForm ? closeAddForm() : openAddForm()"
      >
        {{ showAddForm ? 'Cancel' : 'Add server' }}
      </button>
    </header>

    <div
      v-if="showAddForm"
      class="space-y-6 rounded-lg border border-slate-800/80 bg-slate-900/25 p-6 sm:p-8"
    >
      <h2 class="text-sm font-semibold text-slate-200">New server</h2>

      <form class="space-y-6" @submit.prevent="onSubmit">
        <label class="block">
          <span class="text-sm font-medium text-slate-400">Name</span>
          <input
            v-model="form.name"
            required
            autocomplete="off"
            class="mt-2 w-full rounded-md border border-slate-700/90 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-blue-600/70 focus:ring-2 focus:ring-blue-600/20"
          />
        </label>

        <div class="grid gap-6 sm:grid-cols-2">
          <label class="block">
            <span class="text-sm font-medium text-slate-400">Map seed</span>
            <div class="mt-2 flex gap-2">
              <input
                v-model.number="form.map_seed"
                type="number"
                required
                min="0"
                max="2147483647"
                step="1"
                class="min-w-0 flex-1 rounded-md border border-slate-700/90 bg-slate-950 px-3 py-2.5 text-sm tabular-nums outline-none focus:border-blue-600/70 focus:ring-2 focus:ring-blue-600/20"
              />
              <button
                type="button"
                class="shrink-0 rounded-md border border-slate-600/90 px-3 py-2 text-xs font-medium text-slate-400 transition hover:bg-slate-800/50"
                @click="form.map_seed = randomSeed()"
              >
                Random
              </button>
            </div>
          </label>
          <label class="block">
            <span class="text-sm font-medium text-slate-400">Map size</span>
            <input
              v-model.number="form.map_worldsize"
              type="number"
              required
              min="1000"
              max="6000"
              step="1"
              class="mt-2 w-full rounded-md border border-slate-700/90 bg-slate-950 px-3 py-2.5 text-sm tabular-nums outline-none focus:border-blue-600/70 focus:ring-2 focus:ring-blue-600/20"
            />
          </label>
        </div>

        <div class="rounded-md border border-slate-800/80 bg-slate-950/40 p-4">
          <div class="flex flex-wrap items-center gap-3">
            <button
              type="button"
              :disabled="previewLoading"
              class="rounded-md bg-slate-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-600 disabled:opacity-50"
              @click="loadMapPreview"
            >
              {{ previewLoading ? 'Loading preview…' : 'Load map preview' }}
            </button>
            <span v-if="previewReady" class="text-xs text-emerald-400/90">Preview ready — you can create the server.</span>
          </div>
          <p v-if="mapPreviewError" class="mt-2 text-sm text-red-300/90">{{ mapPreviewError }}</p>
          <RouterLink
            v-if="mapPreviewErrorCode === 'no_api_key'"
            to="/settings"
            class="mt-2 inline-block text-sm font-medium text-blue-400 hover:text-blue-300"
          >
            Open Settings
          </RouterLink>
          <div v-if="mapPreviewUrl" class="mt-4 overflow-hidden rounded-md border border-slate-800/80 bg-black/40">
            <img
              :src="mapPreviewUrl"
              alt="Map preview"
              class="mx-auto max-h-64 w-full max-w-md object-contain"
              referrerpolicy="no-referrer"
            />
          </div>
        </div>

        <div class="grid gap-6 sm:grid-cols-2">
          <label class="block">
            <span class="text-sm font-medium text-slate-400">Game port</span>
            <input
              v-model.number="form.game_port"
              type="number"
              required
              min="1"
              max="65535"
              class="mt-2 w-full rounded-md border border-slate-700/90 bg-slate-950 px-3 py-2.5 text-sm tabular-nums outline-none focus:border-blue-600/70 focus:ring-2 focus:ring-blue-600/20"
            />
          </label>
          <label class="block">
            <span class="text-sm font-medium text-slate-400">RCON port</span>
            <input
              v-model.number="form.rcon_port"
              type="number"
              required
              min="1"
              max="65535"
              class="mt-2 w-full rounded-md border border-slate-700/90 bg-slate-950 px-3 py-2.5 text-sm tabular-nums outline-none focus:border-blue-600/70 focus:ring-2 focus:ring-blue-600/20"
            />
          </label>
        </div>

        <label class="block">
          <span class="text-sm font-medium text-slate-400">RCON password</span>
          <input
            v-model="form.rcon_password"
            type="password"
            required
            autocomplete="new-password"
            class="mt-2 w-full rounded-md border border-slate-700/90 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-blue-600/70 focus:ring-2 focus:ring-blue-600/20"
          />
        </label>

        <p v-if="formError" class="text-sm text-red-300/90" role="alert">{{ formError }}</p>

        <button
          type="submit"
          :disabled="submitting || !previewReady"
          class="rounded-md bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-500 disabled:pointer-events-none disabled:opacity-40"
        >
          {{ submitting ? 'Saving…' : 'Create server' }}
        </button>
      </form>
    </div>

    <div v-if="store.loading" class="text-sm text-slate-500">Loading…</div>

    <div v-else-if="store.error" class="text-sm text-red-300/90" role="alert">
      {{ store.error }}
    </div>

    <div v-else-if="store.servers.length" class="overflow-hidden rounded-lg border border-slate-800/80 bg-slate-900/25">
      <ul class="divide-y divide-slate-800/60">
        <li
          v-for="s in store.servers"
          :key="s.id"
          class="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div class="min-w-0">
            <p class="font-medium text-slate-100">{{ s.name }}</p>
            <p class="mt-0.5 text-xs text-slate-500">
              {{ s.map_worldsize }} map · seed {{ s.map_seed }}
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-3 sm:gap-4">
            <span
              class="inline-flex rounded-md border px-2 py-0.5 text-xs font-medium"
              :class="statusClass(s.status)"
            >
              {{ statusLabel(s.status) }}
            </span>
            <span class="font-mono text-sm text-slate-500">{{ s.game_port }} / {{ s.rcon_port }}</span>
            <div class="flex flex-wrap gap-2">
              <button
                v-if="s.status !== 'running' && s.status !== 'starting'"
                type="button"
                class="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
                :disabled="busyId === s.id"
                @click="onStart(s.id)"
              >
                Start
              </button>
              <button
                v-if="s.status === 'running' || s.status === 'starting'"
                type="button"
                class="rounded-md border border-slate-600/90 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800/50 disabled:opacity-50"
                :disabled="busyId === s.id"
                @click="onStop(s.id)"
              >
                Stop
              </button>
              <RouterLink
                :to="{ name: 'server-console', params: { id: s.id } }"
                class="rounded-md border border-slate-600/90 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800/50"
              >
                Console
              </RouterLink>
              <button
                type="button"
                class="px-3 py-1.5 text-sm text-slate-500 hover:text-red-400 disabled:opacity-40"
                :disabled="s.status === 'running' || s.status === 'starting'"
                @click="onDelete(s.id)"
              >
                Remove
              </button>
            </div>
          </div>
        </li>
      </ul>
    </div>

    <div v-else class="rounded-lg border border-dashed border-slate-800/90 px-8 py-12 text-center text-sm text-slate-500">
      No servers yet.
      <button type="button" class="mt-2 block w-full text-blue-500 hover:text-blue-400" @click="openAddForm">
        Add server
      </button>
    </div>
  </div>
</template>
