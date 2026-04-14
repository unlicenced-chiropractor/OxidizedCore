<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useServersStore } from '@/stores/servers'

type UserCfgEntry = { role: 'ownerid' | 'moderatorid'; steamId: string }

const route = useRoute()
const store = useServersStore()
const busy = ref(false)
const editing = ref(false)

const serverId = computed(() => Number(route.params.id))
const server = computed(() => store.byId.get(serverId.value))

const edit = ref({
  name: '',
  game_port: 28015,
  rcon_port: 28016,
  rcon_password: '',
  rcon_enabled: true,
  oxide_enabled: false,
  companion_enabled: true,
  eac_enabled: true,
  map_seed: 1,
  map_worldsize: 3500,
  max_players: 100,
  server_description: '',
  memory_limit_mb: null as number | null,
})

function syncEditFromServer() {
  const s = server.value
  if (!s) return
  edit.value = {
    name: s.name,
    game_port: s.game_port,
    rcon_port: s.rcon_port,
    rcon_password: '',
    rcon_enabled: s.rcon_enabled,
    oxide_enabled: s.oxide_enabled,
    companion_enabled: s.companion_enabled,
    eac_enabled: s.eac_enabled,
    map_seed: s.map_seed,
    map_worldsize: s.map_worldsize,
    max_players: s.max_players,
    server_description: s.server_description,
    memory_limit_mb: s.memory_limit_mb,
  }
}

watch(
  server,
  (s) => {
    if (!s) return
    if (!editing.value) syncEditFromServer()
  },
  { immediate: true }
)

watch(editing, (on) => {
  if (on) syncEditFromServer()
})

const usersCfgLoading = ref(false)
const usersCfgError = ref<string | null>(null)
const usersCfgPath = ref<string | null>(null)
const usersCfgEntries = ref<UserCfgEntry[]>([])
const newSteamId = ref('')
const newRole = ref<'ownerid' | 'moderatorid'>('ownerid')
const usersCfgBusy = ref(false)

const createdDisplay = computed(() => {
  const s = server.value?.created_at
  if (!s) return '—'
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
})

async function loadUsersCfg() {
  if (!Number.isFinite(serverId.value)) return
  usersCfgLoading.value = true
  usersCfgError.value = null
  try {
    const res = await fetch(`/api/servers/${serverId.value}/users-cfg`)
    const data = (await res.json()) as {
      ok?: boolean
      error?: string
      entries?: UserCfgEntry[]
      filePath?: string
    }
    if (!res.ok || data.ok === false) {
      usersCfgEntries.value = []
      usersCfgPath.value = null
      usersCfgError.value = typeof data.error === 'string' ? data.error : 'Could not load users.cfg'
      return
    }
    usersCfgEntries.value = Array.isArray(data.entries) ? data.entries : []
    usersCfgPath.value = typeof data.filePath === 'string' ? data.filePath : null
  } catch {
    usersCfgEntries.value = []
    usersCfgPath.value = null
    usersCfgError.value = 'Could not load users.cfg'
  } finally {
    usersCfgLoading.value = false
  }
}

async function addUserCfg() {
  if (!Number.isFinite(serverId.value)) return
  const steamId = newSteamId.value.trim()
  if (!steamId) {
    usersCfgError.value = 'Enter a Steam ID.'
    return
  }
  usersCfgBusy.value = true
  usersCfgError.value = null
  try {
    const res = await fetch(`/api/servers/${serverId.value}/users-cfg`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ steamId, role: newRole.value }),
    })
    const data = (await res.json()) as {
      ok?: boolean
      error?: string
      entries?: UserCfgEntry[]
      filePath?: string
    }
    if (!res.ok || data.ok === false) {
      usersCfgError.value = typeof data.error === 'string' ? data.error : 'Add failed'
      return
    }
    usersCfgEntries.value = Array.isArray(data.entries) ? data.entries : []
    usersCfgPath.value = typeof data.filePath === 'string' ? data.filePath : usersCfgPath.value
    newSteamId.value = ''
  } catch {
    usersCfgError.value = 'Add failed.'
  } finally {
    usersCfgBusy.value = false
  }
}

async function removeUserCfg(steamId: string) {
  if (!Number.isFinite(serverId.value)) return
  if (!confirm(`Remove ${steamId} from users.cfg?`)) return
  usersCfgBusy.value = true
  usersCfgError.value = null
  try {
    const res = await fetch(`/api/servers/${serverId.value}/users-cfg`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ steamId }),
    })
    const data = (await res.json()) as {
      ok?: boolean
      error?: string
      entries?: UserCfgEntry[]
      filePath?: string
    }
    if (!res.ok || data.ok === false) {
      usersCfgError.value = typeof data.error === 'string' ? data.error : 'Remove failed'
      return
    }
    usersCfgEntries.value = Array.isArray(data.entries) ? data.entries : []
  } catch {
    usersCfgError.value = 'Remove failed.'
  } finally {
    usersCfgBusy.value = false
  }
}

function roleLabel(role: UserCfgEntry['role']): string {
  return role === 'ownerid' ? 'Owner' : 'Moderator'
}

onMounted(async () => {
  store.attachSocket()
  await store.fetchServers()
  void loadUsersCfg()
})

watch(serverId, () => {
  void loadUsersCfg()
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

function cancelEdit() {
  editing.value = false
  syncEditFromServer()
}

async function saveEdit() {
  if (!Number.isFinite(serverId.value)) return
  const body: Record<string, string | number | boolean | null> = {
    name: edit.value.name,
    game_port: edit.value.game_port,
    rcon_port: edit.value.rcon_port,
    map_seed: edit.value.map_seed,
    map_worldsize: edit.value.map_worldsize,
    max_players: edit.value.max_players,
    server_description: edit.value.server_description,
    rcon_enabled: edit.value.rcon_enabled,
    oxide_enabled: edit.value.oxide_enabled,
    companion_enabled: edit.value.companion_enabled,
    eac_enabled: edit.value.eac_enabled,
    memory_limit_mb: edit.value.memory_limit_mb,
  }
  if (edit.value.rcon_password.trim()) body.rcon_password = edit.value.rcon_password
  try {
    await store.updateServer(serverId.value, body)
    edit.value.rcon_password = ''
    editing.value = false
  } catch (e) {
    alert(e instanceof Error ? e.message : 'Update failed.')
  }
}
</script>

<template>
  <div v-if="server" class="space-y-8">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div class="flex flex-wrap items-center gap-3">
        <span
          class="inline-flex rounded-lg px-3 py-1.5 text-sm font-semibold ring-1"
          :class="statusPill(server.status)"
        >
          {{ statusLabel(server.status) }}
        </span>
        <span class="text-sm text-slate-600">Server #{{ server.id }}</span>
      </div>
      <div v-if="!editing" class="flex shrink-0 gap-2">
        <button
          type="button"
          class="rounded-lg border border-slate-600 bg-slate-800/50 px-4 py-2 text-base font-medium text-slate-200 transition hover:bg-slate-800"
          @click="editing = true"
        >
          Edit
        </button>
      </div>
      <div v-else class="flex shrink-0 flex-wrap gap-2">
        <button
          type="button"
          class="rounded-lg border border-slate-600 px-4 py-2 text-base font-medium text-slate-300 transition hover:bg-slate-800/60"
          @click="cancelEdit"
        >
          Cancel
        </button>
        <button
          type="button"
          class="rounded-lg bg-blue-600 px-4 py-2 text-base font-medium text-white transition hover:bg-blue-500"
          @click="saveEdit"
        >
          Save
        </button>
      </div>
    </div>

    <div class="flex flex-wrap gap-3">
      <button
        v-if="canStart"
        type="button"
        class="rounded-lg bg-blue-600 px-5 py-2.5 text-base font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        :disabled="busy"
        @click="start"
      >
        Start
      </button>
      <button
        v-if="canRestart"
        type="button"
        class="rounded-lg border border-amber-600/60 bg-amber-950/30 px-5 py-2.5 text-base font-medium text-amber-200 hover:bg-amber-950/50 disabled:opacity-50"
        :disabled="busy"
        @click="restart"
      >
        Restart
      </button>
      <button
        v-if="canStop"
        type="button"
        class="rounded-lg border border-slate-600 px-5 py-2.5 text-base font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50"
        :disabled="busy"
        @click="stop"
      >
        Stop
      </button>
    </div>

    <template v-if="!editing">
      <section class="rounded-xl border border-slate-800/90 bg-slate-900/25 p-5 sm:p-7">
        <h2 class="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Server identity</h2>
        <dl class="mt-5 grid gap-5 sm:grid-cols-2">
          <div class="sm:col-span-2">
            <dt class="text-sm font-medium text-slate-500">Display name</dt>
            <dd class="mt-1 text-lg font-medium text-slate-100">{{ server.name }}</dd>
          </div>
          <div class="sm:col-span-2">
            <dt class="text-sm font-medium text-slate-500">Description</dt>
            <dd class="mt-1 text-base leading-relaxed text-slate-300">
              {{ server.server_description?.trim() ? server.server_description : '—' }}
            </dd>
          </div>
          <div>
            <dt class="text-sm font-medium text-slate-500">RCON host</dt>
            <dd class="mt-1 font-mono text-base text-slate-200">{{ server.host || '—' }}</dd>
          </div>
          <div>
            <dt class="text-sm font-medium text-slate-500">Created</dt>
            <dd class="mt-1 text-base text-slate-300">{{ createdDisplay }}</dd>
          </div>
        </dl>
      </section>

      <section class="rounded-xl border border-slate-800/90 bg-slate-900/25 p-5 sm:p-7">
        <h2 class="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Ports</h2>
        <dl class="mt-5 grid gap-5 sm:grid-cols-2">
          <div>
            <dt class="text-sm font-medium text-slate-500">Game UDP</dt>
            <dd class="mt-1 font-mono text-2xl font-semibold tabular-nums text-slate-100">{{ server.game_port }}</dd>
          </div>
          <div>
            <dt class="text-sm font-medium text-slate-500">RCON TCP</dt>
            <dd class="mt-1 font-mono text-2xl font-semibold tabular-nums text-slate-100">{{ server.rcon_port }}</dd>
          </div>
          <div>
            <dt class="text-sm font-medium text-slate-500">Query UDP</dt>
            <dd class="mt-1 font-mono text-2xl font-semibold tabular-nums text-slate-100">{{ server.query_port }}</dd>
          </div>
          <div>
            <dt class="text-sm font-medium text-slate-500">Rust+ TCP</dt>
            <dd class="mt-1 font-mono text-2xl font-semibold tabular-nums text-slate-100">
              {{ server.companion_enabled ? server.companion_tcp_port : '—' }}
            </dd>
          </div>
        </dl>
      </section>

      <section class="rounded-xl border border-slate-800/90 bg-slate-900/25 p-5 sm:p-7">
        <h2 class="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">World</h2>
        <dl class="mt-5 grid gap-5 sm:grid-cols-3">
          <div>
            <dt class="text-sm font-medium text-slate-500">Map size</dt>
            <dd class="mt-1 text-2xl font-semibold tabular-nums text-slate-100">
              {{ server.map_worldsize.toLocaleString() }}
            </dd>
          </div>
          <div>
            <dt class="text-sm font-medium text-slate-500">Seed</dt>
            <dd class="mt-1 font-mono text-2xl font-semibold tabular-nums text-slate-100">{{ server.map_seed }}</dd>
          </div>
          <div>
            <dt class="text-sm font-medium text-slate-500">Players</dt>
            <dd class="mt-1 text-2xl font-semibold tabular-nums text-slate-100">{{ server.max_players }}</dd>
          </div>
        </dl>
      </section>

      <section class="rounded-xl border border-slate-800/90 bg-slate-900/25 p-5 sm:p-7">
        <h2 class="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Options</h2>
        <dl class="mt-5 grid gap-5 sm:grid-cols-2">
          <div>
            <dt class="text-sm font-medium text-slate-500">RCON</dt>
            <dd class="mt-1 text-base text-slate-200">{{ server.rcon_enabled ? 'On' : 'Off' }}</dd>
          </div>
          <div>
            <dt class="text-sm font-medium text-slate-500">Oxide</dt>
            <dd class="mt-1 text-base text-slate-200">{{ server.oxide_enabled ? 'On' : 'Off' }}</dd>
          </div>
          <div>
            <dt class="text-sm font-medium text-slate-500">Rust+</dt>
            <dd class="mt-1 text-base text-slate-200">{{ server.companion_enabled ? 'On' : 'Off' }}</dd>
          </div>
          <div>
            <dt class="text-sm font-medium text-slate-500">EAC</dt>
            <dd class="mt-1 text-base text-slate-200">{{ server.eac_enabled ? 'On' : 'Off' }}</dd>
          </div>
          <div class="sm:col-span-2">
            <dt class="text-sm font-medium text-slate-500">RAM limit</dt>
            <dd class="mt-1 text-base text-slate-200">
              <template v-if="server.memory_limit_mb != null">{{ server.memory_limit_mb.toLocaleString() }} MiB</template>
              <template v-else>None</template>
            </dd>
          </div>
        </dl>
      </section>
    </template>

    <div v-else class="grid gap-6 sm:grid-cols-2">
      <label class="sm:col-span-2 block">
        <span class="text-sm font-medium text-slate-400">Name</span>
        <input
          v-model="edit.name"
          class="mt-2 w-full rounded-lg border border-slate-700/90 bg-slate-950 px-3 py-2.5 text-base outline-none focus:border-blue-600/60"
        />
      </label>
      <label class="sm:col-span-2 block">
        <span class="text-sm font-medium text-slate-400">Description</span>
        <textarea
          v-model="edit.server_description"
          rows="2"
          maxlength="512"
          class="mt-2 w-full resize-y rounded-lg border border-slate-700/90 bg-slate-950 px-3 py-2.5 text-base outline-none focus:border-blue-600/60"
        />
      </label>
      <label class="block">
        <span class="text-sm font-medium text-slate-400">Max players</span>
        <input
          v-model.number="edit.max_players"
          type="number"
          min="1"
          max="500"
          class="mt-2 w-full rounded-lg border border-slate-700/90 bg-slate-950 px-3 py-2.5 text-base tabular-nums outline-none focus:border-blue-600/60"
        />
      </label>
      <label class="block sm:col-span-2">
        <span class="text-sm font-medium text-slate-400">RAM limit (MiB)</span>
        <input
          :value="edit.memory_limit_mb ?? ''"
          type="number"
          min="512"
          max="262144"
          step="64"
          placeholder="No limit"
          class="mt-2 w-full rounded-lg border border-slate-700/90 bg-slate-950 px-3 py-2.5 text-base tabular-nums outline-none focus:border-blue-600/60"
          @input="
            (e) => {
              const v = (e.target as HTMLInputElement).value
              edit.memory_limit_mb = v === '' ? null : Math.floor(Number(v))
            }
          "
        />
      </label>
      <label class="flex cursor-pointer items-center gap-3 sm:col-span-2">
        <input v-model="edit.rcon_enabled" type="checkbox" class="h-5 w-5 rounded border-slate-600 bg-slate-950 text-blue-600" />
        <span class="text-base text-slate-400">RCON enabled</span>
      </label>
      <label class="flex cursor-pointer items-center gap-3 sm:col-span-2">
        <input v-model="edit.oxide_enabled" type="checkbox" class="h-5 w-5 rounded border-slate-600 bg-slate-950 text-blue-600" />
        <span class="text-base text-slate-400">Oxide</span>
      </label>
      <label class="flex cursor-pointer items-center gap-3 sm:col-span-2">
        <input v-model="edit.companion_enabled" type="checkbox" class="h-5 w-5 rounded border-slate-600 bg-slate-950 text-blue-600" />
        <span class="text-base text-slate-400">Rust+</span>
      </label>
      <label class="flex cursor-pointer items-center gap-3 sm:col-span-2">
        <input v-model="edit.eac_enabled" type="checkbox" class="h-5 w-5 rounded border-slate-600 bg-slate-950 text-blue-600" />
        <span class="text-base text-slate-400">EAC</span>
      </label>
      <label class="block">
        <span class="text-sm font-medium text-slate-400">Map seed</span>
        <input
          v-model.number="edit.map_seed"
          type="number"
          min="0"
          max="2147483647"
          class="mt-2 w-full rounded-lg border border-slate-700/90 bg-slate-950 px-3 py-2.5 text-base tabular-nums outline-none focus:border-blue-600/60"
        />
      </label>
      <label class="block">
        <span class="text-sm font-medium text-slate-400">Map size</span>
        <input
          v-model.number="edit.map_worldsize"
          type="number"
          min="1000"
          max="6000"
          class="mt-2 w-full rounded-lg border border-slate-700/90 bg-slate-950 px-3 py-2.5 text-base tabular-nums outline-none focus:border-blue-600/60"
        />
      </label>
      <label class="block">
        <span class="text-sm font-medium text-slate-400">Game port</span>
        <input
          v-model.number="edit.game_port"
          type="number"
          class="mt-2 w-full rounded-lg border border-slate-700/90 bg-slate-950 px-3 py-2.5 text-base tabular-nums outline-none focus:border-blue-600/60"
        />
      </label>
      <label class="block">
        <span class="text-sm font-medium text-slate-400">RCON port</span>
        <input
          v-model.number="edit.rcon_port"
          type="number"
          class="mt-2 w-full rounded-lg border border-slate-700/90 bg-slate-950 px-3 py-2.5 text-base tabular-nums outline-none focus:border-blue-600/60"
        />
      </label>
      <label v-if="edit.rcon_enabled" class="sm:col-span-2 block">
        <span class="text-sm font-medium text-slate-400">New RCON password (optional)</span>
        <input
          v-model="edit.rcon_password"
          type="password"
          autocomplete="new-password"
          class="mt-2 w-full rounded-lg border border-slate-700/90 bg-slate-950 px-3 py-2.5 text-base outline-none focus:border-blue-600/60"
        />
      </label>
    </div>

    <section class="space-y-5 border-t border-slate-800/60 pt-10">
      <h2 class="text-lg font-semibold text-slate-200">Admins (users.cfg)</h2>
      <p v-if="usersCfgPath" class="font-mono text-sm text-slate-600 break-all">{{ usersCfgPath }}</p>

      <form class="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end" @submit.prevent="addUserCfg">
        <label class="block min-w-[12rem] flex-1">
          <span class="text-sm font-medium text-slate-400">Steam ID</span>
          <input
            v-model="newSteamId"
            type="text"
            inputmode="numeric"
            autocomplete="off"
            placeholder="7656119…"
            class="mt-1 w-full rounded-lg border border-slate-700/90 bg-slate-950 px-2.5 py-2 text-sm tabular-nums outline-none focus:border-blue-600/60"
          />
        </label>
        <label class="block w-full sm:w-44">
          <span class="text-sm font-medium text-slate-400">Role</span>
          <select
            v-model="newRole"
            class="mt-1 w-full rounded-lg border border-slate-700/90 bg-slate-950 px-2.5 py-2 text-sm outline-none focus:border-blue-600/60"
          >
            <option value="ownerid">ownerid</option>
            <option value="moderatorid">moderatorid</option>
          </select>
        </label>
        <button
          type="submit"
          class="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-600 disabled:opacity-50"
          :disabled="usersCfgBusy || usersCfgLoading"
        >
          Add
        </button>
      </form>

      <p v-if="usersCfgError" class="text-sm text-red-300/90" role="alert">{{ usersCfgError }}</p>
      <p v-if="usersCfgLoading" class="text-sm text-slate-500">Loading list…</p>

      <ul
        v-else-if="usersCfgEntries.length > 0"
        class="divide-y divide-slate-800/80 rounded-lg border border-slate-800/90 bg-slate-900/20"
        role="list"
      >
        <li
          v-for="row in usersCfgEntries"
          :key="row.steamId"
          class="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
        >
          <div class="min-w-0">
            <span class="font-mono text-sm text-slate-200">{{ row.steamId }}</span>
            <span class="ml-2 text-sm text-slate-500">{{ roleLabel(row.role) }}</span>
          </div>
          <button
            type="button"
            class="shrink-0 rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-400 hover:bg-slate-800/60 disabled:opacity-50"
            :disabled="usersCfgBusy"
            @click="removeUserCfg(row.steamId)"
          >
            Remove
          </button>
        </li>
      </ul>
      <p v-else class="text-sm text-slate-500">No admins listed yet.</p>
    </section>
  </div>
</template>
