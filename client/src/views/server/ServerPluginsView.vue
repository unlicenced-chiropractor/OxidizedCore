<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useServersStore } from '@/stores/servers'

type GithubRepo = {
  name: string
  fullName: string
  description: string | null
  htmlUrl: string
  stars: number
  updatedAt: string | null
}

type GithubApiResponse = {
  ok?: boolean
  error?: string
  page?: number
  totalCount?: number
  hasNext?: boolean
  rateLimitRemaining?: number | null
  items?: GithubRepo[]
}

type InstallResponse = {
  ok?: boolean
  error?: string
  code?: string
  conflicting?: string[]
  written?: string[]
}

type InstalledPlugin = { name: string; size: number; mtimeMs: number }

const route = useRoute()
const store = useServersStore()
const serverId = computed(() => String(route.params.id))

const page = ref(1)
const loading = ref(false)
const loadError = ref<string | null>(null)
const items = ref<GithubRepo[]>([])
const hasNext = ref(false)
const total = ref(0)
const rateRemaining = ref<number | null>(null)
const sort = ref<'stars' | 'updated'>('stars')

const searchDraft = ref('')
const appliedQuery = ref('')

const installed = ref<InstalledPlugin[]>([])
const installedLoading = ref(false)
const installedError = ref<string | null>(null)

const installing = ref<string | null>(null)
const uninstalling = ref<string | null>(null)
const installMessage = ref<string | null>(null)
const installError = ref<string | null>(null)

function pluginStem(name: string) {
  return name.replace(/\.cs$/i, '').toLowerCase()
}

const installedStemSet = computed(() => new Set(installed.value.map((p) => pluginStem(p.name))))

function repoLikelyInstalled(repo: GithubRepo): boolean {
  return installedStemSet.value.has(repo.name.toLowerCase())
}

async function loadInstalled() {
  installedLoading.value = true
  installedError.value = null
  try {
    const res = await fetch(`/api/servers/${serverId.value}/plugins/installed`)
    const data = (await res.json()) as { ok?: boolean; plugins?: InstalledPlugin[]; error?: string }
    if (!res.ok || data.ok === false) {
      installed.value = []
      installedError.value = typeof data.error === 'string' ? data.error : res.statusText
      return
    }
    installed.value = Array.isArray(data.plugins) ? data.plugins : []
  } catch (e) {
    installed.value = []
    installedError.value = e instanceof Error ? e.message : 'Request failed'
  } finally {
    installedLoading.value = false
  }
}

async function uninstallPlugin(fileName: string) {
  if (!confirm(`Remove ${fileName}?`)) return
  uninstalling.value = fileName
  installError.value = null
  installMessage.value = null
  try {
    const q = new URLSearchParams({ file: fileName })
    const res = await fetch(`/api/servers/${serverId.value}/plugins/installed?${q}`, { method: 'DELETE' })
    const data = (await res.json()) as { ok?: boolean; error?: string }
    if (!res.ok || data.ok === false) {
      installError.value = typeof data.error === 'string' ? data.error : res.statusText
      return
    }
    installMessage.value = `Removed ${fileName}.`
    await loadInstalled()
  } catch (e) {
    installError.value = e instanceof Error ? e.message : 'Request failed'
  } finally {
    uninstalling.value = null
  }
}

async function loadList() {
  loading.value = true
  loadError.value = null
  try {
    const q = new URLSearchParams({
      page: String(page.value),
      sort: sort.value,
      order: 'desc',
    })
    if (appliedQuery.value.trim()) q.set('q', appliedQuery.value.trim())
    const res = await fetch(`/api/github/oxide-plugins?${q}`)
    const data = (await res.json()) as GithubApiResponse
    rateRemaining.value =
      typeof data.rateLimitRemaining === 'number' ? data.rateLimitRemaining : null
    if (!res.ok || data.ok === false) {
      items.value = []
      hasNext.value = false
      total.value = 0
      loadError.value = typeof data.error === 'string' ? data.error : res.statusText
      return
    }
    items.value = Array.isArray(data.items) ? data.items : []
    hasNext.value = !!data.hasNext
    total.value = typeof data.totalCount === 'number' ? data.totalCount : 0
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : 'Request failed'
  } finally {
    loading.value = false
  }
}

async function installRepo(fullName: string) {
  installMessage.value = null
  installError.value = null
  installing.value = fullName
  try {
    const res = await fetch(`/api/servers/${serverId.value}/plugins/github-install`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName }),
    })
    const data = (await res.json()) as InstallResponse
    if (!res.ok || data.ok === false) {
      installError.value = typeof data.error === 'string' ? data.error : res.statusText
      return
    }
    const files = Array.isArray(data.written) ? data.written.join(', ') : ''
    installMessage.value = files ? `Installed: ${files}` : 'Installed.'
    await loadInstalled()
  } catch (e) {
    installError.value = e instanceof Error ? e.message : 'Request failed'
  } finally {
    installing.value = null
  }
}

function submitSearch() {
  appliedQuery.value = searchDraft.value.trim()
  page.value = 1
  void loadList()
}

function clearSearch() {
  searchDraft.value = ''
  appliedQuery.value = ''
  page.value = 1
  void loadList()
}

onMounted(async () => {
  await store.fetchSystem()
  if (store.oxideInstalled) {
    void loadInstalled()
    void loadList()
  }
})

watch(page, () => {
  if (store.oxideInstalled) void loadList()
})

watch(sort, () => {
  if (!store.oxideInstalled) return
  page.value = 1
  void loadList()
})
</script>

<template>
  <div v-if="!store.oxideInstalled" class="rounded-lg border border-slate-800/80 bg-slate-900/25 px-4 py-6 text-sm text-slate-400">
    <p class="text-slate-300">Oxide not available.</p>
    <RouterLink
      :to="{ name: 'server-general', params: { id: serverId } }"
      class="mt-3 inline-block text-sm text-blue-400 hover:text-blue-300"
    >
      General
    </RouterLink>
  </div>

  <div v-else class="space-y-8">
    <section class="rounded-lg border border-slate-800/80 bg-slate-900/20 px-4 py-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-xs font-semibold uppercase tracking-wide text-slate-400">Installed</h2>
        <button
          type="button"
          class="rounded border border-slate-600 px-2 py-1 text-xs text-slate-400 hover:bg-slate-800/60 disabled:opacity-40"
          :disabled="installedLoading"
          @click="loadInstalled"
        >
          Refresh
        </button>
      </div>
      <p v-if="installedLoading" class="mt-2 text-sm text-slate-500">Loading…</p>
      <p v-else-if="installedError" class="mt-2 text-sm text-red-300" role="alert">{{ installedError }}</p>
      <p v-else-if="installed.length === 0" class="mt-2 text-sm text-slate-500">None (.cs in shared oxide/plugins).</p>
      <ul v-else class="mt-3 divide-y divide-slate-800/80 rounded-md border border-slate-800/60">
        <li
          v-for="p in installed"
          :key="p.name"
          class="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
        >
          <span class="font-mono text-sm text-slate-200">{{ p.name }}</span>
          <button
            type="button"
            class="rounded border border-red-900/60 bg-red-950/30 px-2.5 py-1 text-xs text-red-200 hover:bg-red-950/50 disabled:opacity-40"
            :disabled="uninstalling !== null || installing !== null"
            @click="uninstallPlugin(p.name)"
          >
            {{ uninstalling === p.name ? '…' : 'Uninstall' }}
          </button>
        </li>
      </ul>
    </section>

    <p v-if="loadError" class="text-sm text-red-300" role="alert">{{ loadError }}</p>
    <p v-else-if="rateRemaining !== null && rateRemaining <= 5" class="text-xs text-amber-200/90" role="status">
      GitHub rate limit low ({{ rateRemaining }}).
    </p>
    <p v-if="installError" class="text-sm text-red-300" role="alert">{{ installError }}</p>
    <p v-else-if="installMessage" class="text-xs text-emerald-200/90" role="status">{{ installMessage }}</p>

    <form class="flex flex-col gap-2 sm:flex-row sm:items-center" @submit.prevent="submitSearch">
      <label class="sr-only" for="plugin-search">Search</label>
      <input
        id="plugin-search"
        v-model="searchDraft"
        type="search"
        enterkeyhint="search"
        placeholder="Search…"
        class="min-w-0 flex-1 rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:border-blue-600/50"
      />
      <div class="flex shrink-0 gap-2">
        <button
          type="submit"
          class="rounded border border-slate-600 bg-slate-800/80 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-40"
          :disabled="loading"
        >
          Search
        </button>
        <button
          v-if="appliedQuery"
          type="button"
          class="rounded border border-slate-700 px-3 py-2 text-xs text-slate-400 hover:bg-slate-800/60"
          :disabled="loading"
          @click="clearSearch"
        >
          Clear
        </button>
      </div>
    </form>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-wrap items-center gap-2">
        <label class="flex items-center gap-2 text-xs text-slate-500">
          <span>Sort</span>
          <select
            v-model="sort"
            class="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200 outline-none focus:border-blue-600/50"
          >
            <option value="stars">Stars</option>
            <option value="updated">Updated</option>
          </select>
        </label>
        <button
          type="button"
          class="rounded border border-slate-600 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-40"
          :disabled="loading || page <= 1"
          @click="page = Math.max(1, page - 1)"
        >
          Prev
        </button>
        <span class="text-xs tabular-nums text-slate-500">{{ page }}</span>
        <button
          type="button"
          class="rounded border border-slate-600 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-40"
          :disabled="loading || !hasNext"
          @click="page += 1"
        >
          Next
        </button>
      </div>
      <span v-if="total > 0" class="text-xs text-slate-600">~{{ total.toLocaleString() }} repos</span>
      <button
        type="button"
        class="rounded border border-slate-600 px-2.5 py-1.5 text-xs text-slate-400 hover:bg-slate-800/60"
        :disabled="loading"
        @click="loadList"
      >
        Refresh
      </button>
    </div>

    <div
      v-if="loading"
      class="rounded-lg border border-slate-800/80 bg-slate-900/30 px-4 py-8 text-center text-sm text-slate-500"
    >
      Loading…
    </div>

    <div
      v-else-if="items.length === 0"
      class="rounded-lg border border-slate-800/80 bg-slate-900/30 px-4 py-6 text-sm text-slate-500"
    >
      <template v-if="appliedQuery">No matches.</template>
      <template v-else>Nothing returned.</template>
    </div>

    <ul
      v-else
      class="max-h-[min(560px,60vh)] divide-y divide-slate-800/80 overflow-auto rounded-lg border border-slate-800/90 bg-slate-900/20"
      role="list"
    >
      <li
        v-for="repo in items"
        :key="repo.fullName"
        class="flex flex-col gap-2 px-3 py-3 hover:bg-slate-900/40 sm:flex-row sm:items-start sm:justify-between"
      >
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-baseline gap-2">
            <a
              :href="repo.htmlUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="text-sm font-medium text-slate-200 hover:text-blue-400"
            >
              {{ repo.name }}
            </a>
            <span class="text-sm tabular-nums text-slate-500">★ {{ repo.stars.toLocaleString() }}</span>
            <span v-if="repoLikelyInstalled(repo)" class="text-sm font-medium text-emerald-400/90">on disk</span>
          </div>
          <p class="mt-0.5 font-mono text-sm text-slate-600">{{ repo.fullName }}</p>
          <p v-if="repo.description" class="mt-1 line-clamp-2 text-xs text-slate-500">
            {{ repo.description }}
          </p>
        </div>
        <div class="shrink-0 sm:pt-0.5">
          <button
            v-if="repoLikelyInstalled(repo)"
            type="button"
            disabled
            class="cursor-not-allowed rounded border border-slate-700 bg-slate-900/50 px-3 py-1.5 text-xs text-slate-500"
          >
            Installed
          </button>
          <button
            v-else
            type="button"
            class="rounded border border-blue-700/80 bg-blue-950/40 px-3 py-1.5 text-xs font-medium text-blue-200 hover:bg-blue-950/70 disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="installing !== null"
            @click="installRepo(repo.fullName)"
          >
            {{ installing === repo.fullName ? '…' : 'Install' }}
          </button>
        </div>
      </li>
    </ul>
  </div>
</template>
