<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useServersStore } from '@/stores/servers'
import { fallbackCompanionTcpPort, fallbackQueryPort } from '@/utils/rustPorts'

const store = useServersStore()
const router = useRouter()

function randomSeed() {
  return Math.floor(Math.random() * 2_147_483_647)
}

function randomRconPassword() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => alphabet[b % alphabet.length] ?? 'x').join('')
}

const form = reactive({
  name: '',
  server_description: '',
  max_players: 100,
  host: '127.0.0.1',
  game_port: 28015,
  rcon_port: 28016,
  rcon_enabled: true,
  rcon_password: randomRconPassword(),
  oxide_enabled: false,
  companion_enabled: true,
  map_seed: randomSeed(),
  map_worldsize: 3500,
  memory_limit_mb: null as number | null,
})
const formError = ref<string | null>(null)
const submitting = ref(false)

const mapPreviewUrl = ref<string | null>(null)
const mapPreviewError = ref<string | null>(null)
const mapPreviewErrorCode = ref<string | null>(null)
const previewLoading = ref(false)
const previewReady = computed(() => mapPreviewUrl.value !== null)

const queryPort = computed(() => fallbackQueryPort(form.game_port, form.rcon_port))
const companionTcpPort = computed(() => fallbackCompanionTcpPort(form.game_port, form.rcon_port))

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
  if (form.memory_limit_mb != null) {
    const m = Math.floor(form.memory_limit_mb)
    if (!Number.isFinite(m) || m < 512 || m > 262_144) {
      formError.value = 'RAM limit must be 512–262144 MiB or leave empty for no limit.'
      return
    }
  }
  submitting.value = true
  try {
    await store.createServer({
      name: form.name.trim(),
      host: form.host.trim() || undefined,
      game_port: form.game_port,
      rcon_port: form.rcon_port,
      rcon_password: form.rcon_enabled ? form.rcon_password : '',
      rcon_enabled: form.rcon_enabled,
      oxide_enabled: form.oxide_enabled,
      companion_enabled: form.companion_enabled,
      map_seed: Math.floor(form.map_seed),
      map_worldsize: Math.floor(form.map_worldsize),
      max_players: Math.floor(form.max_players),
      server_description: form.server_description.trim(),
      memory_limit_mb: form.memory_limit_mb,
    })
    await router.push({ name: 'dashboard' })
  } catch (e) {
    formError.value = e instanceof Error ? e.message : 'Could not save.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <p
      v-if="store.rustInstall?.status === 'downloading'"
      class="text-sm text-amber-200/90"
      role="status"
    >
      Downloading Rust dedicated via Steam (latest
      {{ store.rustInstall?.rustSteamPlatform ?? 'linux' }}
      build for {{ store.rustInstall?.hostPlatformLabel ?? 'this host' }})…
    </p>

    <p v-if="store.rustInstall?.status === 'error'" class="text-sm text-red-300/90" role="alert">
      Steam install failed: {{ store.rustInstall.error }}
    </p>

    <header class="flex flex-wrap items-end justify-between gap-4 border-b border-slate-800/50 pb-5">
      <div>
        <RouterLink
          to="/"
          class="mb-2 inline-block text-xs font-medium text-slate-500 transition hover:text-slate-300"
        >
          ← Servers
        </RouterLink>
        <h1 class="text-xl font-semibold tracking-tight text-slate-50 sm:text-2xl">Create server</h1>
      </div>
    </header>

    <form class="space-y-8" @submit.prevent="onSubmit">
      <div
        class="rounded-xl border border-slate-800/70 bg-slate-900/20 px-4 py-5 sm:px-6 sm:py-6"
      >
        <div class="grid gap-5 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-4">
          <label class="block sm:col-span-2">
            <span class="text-xs font-medium uppercase tracking-wide text-slate-500">Name</span>
            <input
              v-model="form.name"
              required
              autocomplete="off"
              placeholder="My server"
              class="mt-1.5 w-full rounded-lg border border-slate-700/80 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-blue-600/60 focus:ring-1 focus:ring-blue-600/25"
            />
          </label>
          <label class="block">
            <span class="text-xs font-medium uppercase tracking-wide text-slate-500">Max players</span>
            <input
              v-model.number="form.max_players"
              type="number"
              required
              min="1"
              max="500"
              step="1"
              title="1–500"
              class="mt-1.5 w-full rounded-lg border border-slate-700/80 bg-slate-950 px-3 py-2.5 text-sm tabular-nums outline-none focus:border-blue-600/60 focus:ring-1 focus:ring-blue-600/25"
            />
          </label>
          <label class="block">
            <span class="text-xs font-medium uppercase tracking-wide text-slate-500">RAM limit (MiB)</span>
            <input
              :value="form.memory_limit_mb ?? ''"
              type="number"
              min="512"
              max="262144"
              step="64"
              placeholder="No limit"
              title="Optional — enforced on Linux with systemd-run"
              class="mt-1.5 w-full rounded-lg border border-slate-700/80 bg-slate-950 px-3 py-2.5 text-sm tabular-nums outline-none focus:border-blue-600/60 focus:ring-1 focus:ring-blue-600/25"
              @input="
                (e) => {
                  const v = (e.target as HTMLInputElement).value
                  form.memory_limit_mb = v === '' ? null : Math.floor(Number(v))
                }
              "
            />
            <span class="mt-1 block text-[11px] text-slate-600">512–262144 MiB. Windows: use Docker/host limits.</span>
          </label>
          <label class="block sm:col-span-2">
            <span class="text-xs font-medium uppercase tracking-wide text-slate-500">Description</span>
            <span class="float-right text-[11px] text-slate-600">{{ form.server_description.length }}/512</span>
            <textarea
              v-model="form.server_description"
              rows="2"
              maxlength="512"
              placeholder="Optional — server browser text"
              class="mt-1.5 w-full resize-y rounded-lg border border-slate-700/80 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-blue-600/60 focus:ring-1 focus:ring-blue-600/25"
            />
          </label>
        </div>
      </div>

      <div class="rounded-xl border border-slate-800/70 bg-slate-900/20 px-4 py-5 sm:px-6 sm:py-6">
        <p class="mb-4 text-xs font-medium uppercase tracking-wide text-slate-500">Map</p>
        <div class="grid gap-4 sm:grid-cols-2 sm:gap-x-6">
          <label class="block">
            <span class="text-xs text-slate-500">Seed</span>
            <div class="mt-1.5 flex gap-2">
              <input
                v-model.number="form.map_seed"
                type="number"
                required
                min="0"
                max="2147483647"
                step="1"
                class="min-w-0 flex-1 rounded-lg border border-slate-700/80 bg-slate-950 px-3 py-2.5 text-sm tabular-nums outline-none focus:border-blue-600/60 focus:ring-1 focus:ring-blue-600/25"
              />
              <button
                type="button"
                class="shrink-0 rounded-lg border border-slate-600/80 px-3 py-2 text-xs font-medium text-slate-400 hover:bg-slate-800/40"
                @click="form.map_seed = randomSeed()"
              >
                Random
              </button>
            </div>
          </label>
          <label class="block">
            <span class="text-xs text-slate-500">World size</span>
            <input
              v-model.number="form.map_worldsize"
              type="number"
              required
              min="1000"
              max="6000"
              step="1"
              title="1000–6000"
              class="mt-1.5 w-full rounded-lg border border-slate-700/80 bg-slate-950 px-3 py-2.5 text-sm tabular-nums outline-none focus:border-blue-600/60 focus:ring-1 focus:ring-blue-600/25"
            />
          </label>
        </div>

        <div class="mt-5 border-t border-slate-800/50 pt-5">
          <div class="flex flex-wrap items-center gap-3">
            <button
              type="button"
              :disabled="previewLoading"
              class="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-600 disabled:opacity-50"
              @click="loadMapPreview"
            >
              {{ previewLoading ? 'Loading…' : 'Load preview' }}
            </button>
            <span v-if="previewReady" class="text-xs text-emerald-400/90">Ready</span>
            <details class="group text-xs text-slate-500">
              <summary
                class="cursor-pointer list-none text-slate-500 underline decoration-slate-600 decoration-dotted underline-offset-2 hover:text-slate-400 [&::-webkit-details-marker]:hidden"
              >
                Preview slow?
              </summary>
              <p class="mt-2 max-w-md pl-0.5 text-[11px] leading-relaxed text-slate-500">
                RustMaps sometimes generates the image first — often 1–2 minutes. Stay on this page.
              </p>
            </details>
          </div>
          <p v-if="previewLoading" class="mt-2 text-xs text-amber-200/80" role="status">Generating can take 1–2 minutes…</p>
          <p v-if="mapPreviewError" class="mt-2 text-sm text-red-300/90">{{ mapPreviewError }}</p>
          <RouterLink
            v-if="mapPreviewErrorCode === 'no_api_key'"
            to="/settings"
            class="mt-2 inline-block text-sm font-medium text-blue-400 hover:text-blue-300"
          >
            Settings
          </RouterLink>
          <div
            v-if="mapPreviewUrl"
            class="relative mx-auto mt-4 aspect-square w-full max-w-sm overflow-hidden rounded-lg border border-slate-800/80 bg-black/50"
          >
            <img
              :src="mapPreviewUrl"
              alt="Map preview"
              class="h-full w-full object-contain"
              referrerpolicy="no-referrer"
            />
          </div>
        </div>
      </div>

      <div class="rounded-xl border border-slate-800/70 bg-slate-900/20 px-4 py-5 sm:px-6 sm:py-6">
        <p class="mb-4 text-xs font-medium uppercase tracking-wide text-slate-500">Ports</p>
        <div class="grid gap-4 sm:grid-cols-2 sm:gap-x-6">
          <label class="block">
            <span class="text-xs text-slate-500">Game <span class="text-slate-600">UDP</span></span>
            <input
              v-model.number="form.game_port"
              type="number"
              required
              min="1"
              max="65535"
              class="mt-1.5 w-full rounded-lg border border-slate-700/80 bg-slate-950 px-3 py-2.5 text-sm tabular-nums outline-none focus:border-blue-600/60 focus:ring-1 focus:ring-blue-600/25"
            />
          </label>
          <label class="block">
            <span class="text-xs text-slate-500">RCON <span class="text-slate-600">TCP</span></span>
            <input
              v-model.number="form.rcon_port"
              type="number"
              required
              min="1"
              max="65535"
              class="mt-1.5 w-full rounded-lg border border-slate-700/80 bg-slate-950 px-3 py-2.5 text-sm tabular-nums outline-none focus:border-blue-600/60 focus:ring-1 focus:ring-blue-600/25"
            />
          </label>
        </div>
        <p class="mt-3 font-mono text-[11px] text-slate-600">
          Query UDP {{ queryPort
          }}<template v-if="form.companion_enabled"> · Rust+ TCP {{ companionTcpPort }}</template
          ><template v-else> · Rust+ off</template>
        </p>

        <div class="mt-6 border-t border-slate-800/50 pt-5">
          <label class="flex cursor-pointer items-center gap-3">
            <input
              v-model="form.rcon_enabled"
              type="checkbox"
              class="h-4 w-4 rounded border-slate-600 bg-slate-950 text-blue-600"
            />
            <span class="text-sm text-slate-300">RCON (web console)</span>
          </label>
          <label class="mt-4 flex cursor-pointer items-center gap-3">
            <input
              v-model="form.oxide_enabled"
              type="checkbox"
              class="h-4 w-4 rounded border-slate-600 bg-slate-950 text-blue-600"
            />
            <span class="text-sm text-slate-300">Oxide / uMod</span>
          </label>
          <label class="mt-4 flex cursor-pointer items-center gap-3">
            <input
              v-model="form.companion_enabled"
              type="checkbox"
              class="h-4 w-4 rounded border-slate-600 bg-slate-950 text-blue-600"
            />
            <span class="text-sm text-slate-300">Rust+ companion</span>
          </label>
          <p class="mt-1.5 text-xs text-slate-600">
            Oxide: merged into the shared Rust install on first start (change only when stopped). Rust+: mobile app /
            pairing; uses the TCP port above when enabled.
          </p>
          <div v-if="form.rcon_enabled" class="mt-4 grid gap-4 sm:grid-cols-2 sm:gap-x-6">
            <label class="block sm:col-span-2">
              <span class="text-xs text-slate-500">Panel → RCON host</span>
              <input
                v-model="form.host"
                type="text"
                required
                autocomplete="off"
                placeholder="127.0.0.1"
                title="Where this app reaches RCON (Docker: host.docker.internal)"
                class="mt-1.5 w-full rounded-lg border border-slate-700/80 bg-slate-950 px-3 py-2.5 font-mono text-sm outline-none focus:border-blue-600/60 focus:ring-1 focus:ring-blue-600/25"
              />
            </label>
            <label class="block sm:col-span-2">
              <div class="flex items-center justify-between gap-2">
                <span class="text-xs text-slate-500">Password</span>
                <button
                  type="button"
                  class="text-xs text-blue-400 hover:text-blue-300"
                  @click="form.rcon_password = randomRconPassword()"
                >
                  Generate
                </button>
              </div>
              <input
                v-model="form.rcon_password"
                type="password"
                required
                autocomplete="new-password"
                class="mt-1.5 w-full rounded-lg border border-slate-700/80 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-blue-600/60 focus:ring-1 focus:ring-blue-600/25"
              />
            </label>
          </div>
        </div>
      </div>

      <p v-if="formError" class="text-sm text-red-300/90" role="alert">{{ formError }}</p>

      <div class="flex flex-wrap gap-3 pt-1">
        <button
          type="submit"
          :disabled="submitting || !previewReady"
          class="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-[background-color,transform] duration-200 hover:bg-blue-500 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40"
        >
          {{ submitting ? 'Creating…' : 'Create server' }}
        </button>
        <RouterLink
          to="/"
          class="inline-flex items-center rounded-lg border border-slate-600/80 px-5 py-2.5 text-sm text-slate-400 hover:bg-slate-800/40"
        >
          Cancel
        </RouterLink>
      </div>
    </form>
  </div>
</template>
