<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useServersStore } from '@/stores/servers'

const route = useRoute()
const store = useServersStore()

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
  map_seed: 1,
  map_worldsize: 3500,
  max_players: 100,
  server_description: '',
  memory_limit_mb: null as number | null,
})

watch(
  server,
  (s) => {
    if (!s) return
    edit.value = {
      name: s.name,
      game_port: s.game_port,
      rcon_port: s.rcon_port,
      rcon_password: '',
      rcon_enabled: s.rcon_enabled,
      oxide_enabled: s.oxide_enabled,
      companion_enabled: s.companion_enabled,
      map_seed: s.map_seed,
      map_worldsize: s.map_worldsize,
      max_players: s.max_players,
      server_description: s.server_description,
      memory_limit_mb: s.memory_limit_mb,
    }
  },
  { immediate: true }
)

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
    memory_limit_mb: edit.value.memory_limit_mb,
  }
  if (edit.value.rcon_password.trim()) body.rcon_password = edit.value.rcon_password
  try {
    await store.updateServer(serverId.value, body)
    edit.value.rcon_password = ''
  } catch (e) {
    alert(e instanceof Error ? e.message : 'Update failed.')
  }
}
</script>

<template>
  <div v-if="server" class="space-y-5">
    <p class="text-xs text-slate-500">Stop the server before changing ports, map, RCON, Oxide, or Rust+.</p>

    <div class="grid gap-4 sm:grid-cols-2">
      <label class="sm:col-span-2 block">
        <span class="text-xs font-medium text-slate-400">Name</span>
        <input
          v-model="edit.name"
          class="mt-1 w-full rounded border border-slate-700/90 bg-slate-950 px-2.5 py-2 text-sm outline-none focus:border-blue-600/60"
        />
      </label>
      <label class="sm:col-span-2 block">
        <span class="text-xs font-medium text-slate-400">Description</span>
        <textarea
          v-model="edit.server_description"
          rows="2"
          maxlength="512"
          class="mt-1 w-full resize-y rounded border border-slate-700/90 bg-slate-950 px-2.5 py-2 text-sm outline-none focus:border-blue-600/60"
        />
      </label>
      <label class="block">
        <span class="text-xs font-medium text-slate-400">Max players</span>
        <input
          v-model.number="edit.max_players"
          type="number"
          min="1"
          max="500"
          class="mt-1 w-full rounded border border-slate-700/90 bg-slate-950 px-2.5 py-2 text-sm tabular-nums outline-none focus:border-blue-600/60"
        />
      </label>
      <label class="block sm:col-span-2">
        <span class="text-xs font-medium text-slate-400">RAM limit (MiB)</span>
        <input
          :value="edit.memory_limit_mb ?? ''"
          type="number"
          min="512"
          max="262144"
          step="64"
          placeholder="No limit"
          class="mt-1 w-full rounded border border-slate-700/90 bg-slate-950 px-2.5 py-2 text-sm tabular-nums outline-none focus:border-blue-600/60"
          @input="
            (e) => {
              const v = (e.target as HTMLInputElement).value
              edit.memory_limit_mb = v === '' ? null : Math.floor(Number(v))
            }
          "
        />
        <span class="mt-0.5 block text-[11px] text-slate-600">512–262144. Linux systemd-run; Windows use Docker.</span>
      </label>
      <label class="flex cursor-pointer items-center gap-2 sm:col-span-2">
        <input v-model="edit.rcon_enabled" type="checkbox" class="h-4 w-4 rounded border-slate-600 bg-slate-950 text-blue-600" />
        <span class="text-sm text-slate-400">RCON enabled</span>
      </label>
      <label class="flex cursor-pointer items-center gap-2 sm:col-span-2">
        <input v-model="edit.oxide_enabled" type="checkbox" class="h-4 w-4 rounded border-slate-600 bg-slate-950 text-blue-600" />
        <span class="text-sm text-slate-400">Oxide / uMod</span>
      </label>
      <label class="flex cursor-pointer items-center gap-2 sm:col-span-2">
        <input v-model="edit.companion_enabled" type="checkbox" class="h-4 w-4 rounded border-slate-600 bg-slate-950 text-blue-600" />
        <span class="text-sm text-slate-400">Rust+ companion</span>
      </label>
      <p class="text-[11px] leading-relaxed text-slate-600 sm:col-span-2">
        When on, the game listens on the Rust+ TCP port (see General). When off, Rust+ is disabled (+app.port 1-). Restart after changing.
      </p>
      <label class="block">
        <span class="text-xs font-medium text-slate-400">Map seed</span>
        <input
          v-model.number="edit.map_seed"
          type="number"
          min="0"
          max="2147483647"
          class="mt-1 w-full rounded border border-slate-700/90 bg-slate-950 px-2.5 py-2 text-sm tabular-nums outline-none focus:border-blue-600/60"
        />
      </label>
      <label class="block">
        <span class="text-xs font-medium text-slate-400">Map size</span>
        <input
          v-model.number="edit.map_worldsize"
          type="number"
          min="1000"
          max="6000"
          class="mt-1 w-full rounded border border-slate-700/90 bg-slate-950 px-2.5 py-2 text-sm tabular-nums outline-none focus:border-blue-600/60"
        />
      </label>
      <label class="block">
        <span class="text-xs font-medium text-slate-400">Game port</span>
        <input
          v-model.number="edit.game_port"
          type="number"
          class="mt-1 w-full rounded border border-slate-700/90 bg-slate-950 px-2.5 py-2 text-sm tabular-nums outline-none focus:border-blue-600/60"
        />
      </label>
      <label class="block">
        <span class="text-xs font-medium text-slate-400">RCON port</span>
        <input
          v-model.number="edit.rcon_port"
          type="number"
          class="mt-1 w-full rounded border border-slate-700/90 bg-slate-950 px-2.5 py-2 text-sm tabular-nums outline-none focus:border-blue-600/60"
        />
      </label>
      <label v-if="edit.rcon_enabled" class="sm:col-span-2 block">
        <span class="text-xs font-medium text-slate-400">New RCON password (optional)</span>
        <input
          v-model="edit.rcon_password"
          type="password"
          autocomplete="new-password"
          class="mt-1 w-full rounded border border-slate-700/90 bg-slate-950 px-2.5 py-2 text-sm outline-none focus:border-blue-600/60"
        />
      </label>
      <div class="sm:col-span-2 flex justify-end border-t border-slate-800/60 pt-4">
        <button
          type="button"
          class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
          @click="saveEdit"
        >
          Save
        </button>
      </div>
    </div>
  </div>
</template>
