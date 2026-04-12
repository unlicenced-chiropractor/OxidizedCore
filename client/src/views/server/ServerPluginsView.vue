<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useServersStore } from '@/stores/servers'

type UmodPlugin = { slug: string; title: string; url: string }

type UmodApiResponse = {
  ok?: boolean
  error?: string
  source?: 'live' | 'fallback'
  note?: string
  catalogUrl?: string
  page?: number
  plugins?: UmodPlugin[]
  hasNext?: boolean
}

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

const route = useRoute()
const store = useServersStore()
const serverId = computed(() => String(route.params.id))

const listSource = ref<'umod' | 'github'>('umod')

const page = ref(1)
const loading = ref(false)
const loadError = ref<string | null>(null)
const catalogSource = ref<'live' | 'fallback'>('live')
const catalogNote = ref<string | null>(null)
const catalogUrl = ref('https://umod.org/plugins?page=1&sort=title&sortdir=asc')
const plugins = ref<UmodPlugin[]>([])
const hasNext = ref(false)

const ghPage = ref(1)
const ghLoading = ref(false)
const ghError = ref<string | null>(null)
const ghItems = ref<GithubRepo[]>([])
const ghHasNext = ref(false)
const ghTotal = ref(0)
const ghRateRemaining = ref<number | null>(null)
const ghSort = ref<'stars' | 'updated'>('stars')

async function loadUmod() {
  loading.value = true
  loadError.value = null
  catalogNote.value = null
  try {
    const q = new URLSearchParams({
      page: String(page.value),
      sort: 'title',
      sortdir: 'asc',
    })
    const res = await fetch(`/api/umod/plugins?${q}`)
    const data = (await res.json()) as UmodApiResponse
    if (!res.ok || data.ok === false) {
      plugins.value = []
      hasNext.value = false
      loadError.value = typeof data.error === 'string' ? data.error : res.statusText
      return
    }
    if (typeof data.catalogUrl === 'string') catalogUrl.value = data.catalogUrl
    plugins.value = Array.isArray(data.plugins) ? data.plugins : []
    hasNext.value = !!data.hasNext
    catalogSource.value = data.source === 'live' ? 'live' : 'fallback'
    catalogNote.value = typeof data.note === 'string' && data.note.length ? data.note : null
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : 'Request failed'
  } finally {
    loading.value = false
  }
}

async function loadGithub() {
  ghLoading.value = true
  ghError.value = null
  try {
    const q = new URLSearchParams({
      page: String(ghPage.value),
      sort: ghSort.value,
      order: 'desc',
    })
    const res = await fetch(`/api/github/oxide-plugins?${q}`)
    const data = (await res.json()) as GithubApiResponse
    ghRateRemaining.value =
      typeof data.rateLimitRemaining === 'number' ? data.rateLimitRemaining : null
    if (!res.ok || data.ok === false) {
      ghItems.value = []
      ghHasNext.value = false
      ghTotal.value = 0
      ghError.value = typeof data.error === 'string' ? data.error : res.statusText
      return
    }
    ghItems.value = Array.isArray(data.items) ? data.items : []
    ghHasNext.value = !!data.hasNext
    ghTotal.value = typeof data.totalCount === 'number' ? data.totalCount : 0
  } catch (e) {
    ghError.value = e instanceof Error ? e.message : 'Request failed'
  } finally {
    ghLoading.value = false
  }
}

onMounted(async () => {
  await store.fetchSystem()
  if (store.oxideInstalled) void loadUmod()
})

watch(page, () => {
  if (store.oxideInstalled && listSource.value === 'umod') void loadUmod()
})

watch(ghPage, () => {
  if (store.oxideInstalled && listSource.value === 'github') void loadGithub()
})

watch(ghSort, () => {
  if (store.oxideInstalled && listSource.value === 'github') {
    ghPage.value = 1
    void loadGithub()
  }
})

watch(listSource, (src) => {
  if (!store.oxideInstalled) return
  if (src === 'umod') void loadUmod()
  else void loadGithub()
})

const tabBtn =
  'rounded-md px-3 py-1.5 text-xs font-medium transition border border-transparent'
const tabBtnActive = 'border-slate-600 bg-slate-800/80 text-slate-100'
const tabBtnIdle = 'text-slate-500 hover:bg-slate-800/50 hover:text-slate-300'
</script>

<template>
  <div v-if="!store.oxideInstalled" class="rounded-lg border border-slate-800/80 bg-slate-900/25 px-4 py-6 text-sm text-slate-400">
    <p class="font-medium text-slate-300">Oxide not detected</p>
    <p class="mt-2 leading-relaxed">
      The Plugins tab appears when <code class="rounded bg-slate-950 px-1 py-0.5 text-[11px]">Oxide.Core.dll</code> is present in your Rust dedicated install. Enable Oxide for this server and start it once so the panel can merge Oxide into the shared game files.
    </p>
    <RouterLink
      :to="{ name: 'server-settings', params: { id: serverId } }"
      class="mt-4 inline-block text-sm font-medium text-blue-400 hover:text-blue-300"
    >
      Open Settings →
    </RouterLink>
  </div>

  <div v-else class="space-y-4">
    <div class="flex flex-wrap items-center gap-2">
      <span class="text-[11px] font-medium uppercase tracking-wide text-slate-600">Source</span>
      <div class="inline-flex rounded-lg border border-slate-800/90 p-0.5">
        <button
          type="button"
          :class="[tabBtn, listSource === 'umod' ? tabBtnActive : tabBtnIdle]"
          @click="listSource = 'umod'"
        >
          uMod
        </button>
        <button
          type="button"
          :class="[tabBtn, listSource === 'github' ? tabBtnActive : tabBtnIdle]"
          @click="listSource = 'github'"
        >
          GitHub API
        </button>
      </div>
    </div>

    <!-- uMod -->
    <template v-if="listSource === 'umod'">
      <p class="text-xs leading-relaxed text-slate-500">
        <template v-if="catalogSource === 'live'">
          Plugins from the
          <a
            :href="catalogUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="text-blue-400 underline underline-offset-2 hover:text-blue-300"
            >uMod catalog</a
          >
          (live, sorted A–Z).
        </template>
        <template v-else>
          Bundled starter list (same A–Z order as uMod’s title sort). For every plugin on uMod, use
          <a
            :href="catalogUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="text-blue-400 underline underline-offset-2 hover:text-blue-300"
            >the full catalog</a
          >.
        </template>
        Install by downloading the <code class="rounded bg-slate-900 px-1 py-0.5 text-[11px]">.cs</code> file into your server’s
        <code class="rounded bg-slate-900 px-1 py-0.5 text-[11px]">oxide/plugins</code> folder, then reload the plugin or restart.
      </p>

      <div
        v-if="catalogNote"
        class="rounded-lg border border-slate-700/80 bg-slate-900/45 px-4 py-3 text-xs leading-relaxed text-slate-400"
        role="status"
      >
        <p>{{ catalogNote }}</p>
        <a
          :href="catalogUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="mt-2 inline-block font-medium text-blue-400 underline underline-offset-2 hover:text-blue-300"
        >
          Open full uMod.org catalog →
        </a>
      </div>

      <p v-if="loadError" class="text-sm text-red-300" role="alert">{{ loadError }}</p>

      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="rounded border border-slate-600 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-40"
            :disabled="loading || page <= 1"
            @click="page = Math.max(1, page - 1)"
          >
            Previous
          </button>
          <span class="text-xs tabular-nums text-slate-500">Page {{ page }}</span>
          <button
            type="button"
            class="rounded border border-slate-600 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-40"
            :disabled="loading || !hasNext"
            @click="page += 1"
          >
            Next
          </button>
        </div>
        <button
          type="button"
          class="rounded border border-slate-600 px-2.5 py-1.5 text-xs text-slate-400 hover:bg-slate-800/60"
          :disabled="loading"
          @click="loadUmod"
        >
          Refresh
        </button>
      </div>

      <div
        v-if="loading"
        class="rounded-lg border border-slate-800/80 bg-slate-900/30 px-4 py-8 text-center text-sm text-slate-500"
      >
        Loading catalog…
      </div>

      <div
        v-else-if="plugins.length === 0"
        class="rounded-lg border border-slate-800/80 bg-slate-900/30 px-4 py-6 text-sm text-slate-500"
      >
        No plugin links were found on this page —
        <a :href="catalogUrl" target="_blank" rel="noopener noreferrer" class="text-blue-400 underline">browse on uMod</a>.
      </div>

      <ul
        v-else
        class="max-h-[min(560px,60vh)] divide-y divide-slate-800/80 overflow-auto rounded-lg border border-slate-800/90 bg-slate-900/20"
        role="list"
      >
        <li
          v-for="pl in plugins"
          :key="pl.slug"
          class="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2.5 hover:bg-slate-900/40"
        >
          <a
            :href="pl.url"
            target="_blank"
            rel="noopener noreferrer"
            class="min-w-0 text-sm font-medium text-slate-200 hover:text-blue-400"
          >
            {{ pl.title }}
          </a>
          <span class="font-mono text-[11px] text-slate-600">{{ pl.slug }}</span>
        </li>
      </ul>
    </template>

    <!-- GitHub -->
    <template v-else>
      <p class="text-xs leading-relaxed text-slate-500">
        Public repositories from the
        <a
          href="https://docs.github.com/en/rest/search/search?apiVersion=2022-11-28#search-repositories"
          target="_blank"
          rel="noopener noreferrer"
          class="text-blue-400 underline underline-offset-2 hover:text-blue-300"
          >GitHub repository search API</a
        >.
        The panel merges separate searches (<code class="rounded bg-slate-950 px-1 py-0.5 text-[11px]">topic:oxide-plugins</code>,
        <code class="rounded bg-slate-950 px-1 py-0.5 text-[11px]">topic:oxidemod</code>,
        <code class="rounded bg-slate-950 px-1 py-0.5 text-[11px]">topic:rust-plugin</code>, all with
        <code class="rounded bg-slate-950 px-1 py-0.5 text-[11px]">language:C#</code>) because GitHub does not allow
        <code class="text-[11px]">OR</code> between topic filters. Not the same catalog as uMod.
      </p>
      <p class="text-xs text-slate-600">
        For higher rate limits, set <code class="rounded bg-slate-950 px-1 py-0.5 text-[11px]">OXIDIZED_GITHUB_TOKEN</code> (classic PAT
        <code class="text-[11px]">ghp_…</code> or fine-grained <code class="text-[11px]">github_pat_…</code>) on the API server.
      </p>

      <p v-if="ghError" class="text-sm text-red-300" role="alert">{{ ghError }}</p>
      <p
        v-else-if="ghRateRemaining !== null && ghRateRemaining <= 5"
        class="text-xs text-amber-200/90"
        role="status"
      >
        GitHub API rate limit low ({{ ghRateRemaining }} remaining). Add a token or wait before retrying.
      </p>

      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-2">
          <label class="flex items-center gap-2 text-xs text-slate-500">
            <span>Sort</span>
            <select
              v-model="ghSort"
              class="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200 outline-none focus:border-blue-600/50"
            >
              <option value="stars">Stars</option>
              <option value="updated">Recently updated</option>
            </select>
          </label>
          <button
            type="button"
            class="rounded border border-slate-600 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-40"
            :disabled="ghLoading || ghPage <= 1"
            @click="ghPage = Math.max(1, ghPage - 1)"
          >
            Previous
          </button>
          <span class="text-xs tabular-nums text-slate-500">Page {{ ghPage }}</span>
          <button
            type="button"
            class="rounded border border-slate-600 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-40"
            :disabled="ghLoading || !ghHasNext"
            @click="ghPage += 1"
          >
            Next
          </button>
        </div>
        <span v-if="ghTotal > 0" class="text-xs text-slate-600">~{{ ghTotal.toLocaleString() }} repos (search cap 1000)</span>
        <button
          type="button"
          class="rounded border border-slate-600 px-2.5 py-1.5 text-xs text-slate-400 hover:bg-slate-800/60"
          :disabled="ghLoading"
          @click="loadGithub"
        >
          Refresh
        </button>
      </div>

      <div
        v-if="ghLoading"
        class="rounded-lg border border-slate-800/80 bg-slate-900/30 px-4 py-8 text-center text-sm text-slate-500"
      >
        Loading GitHub…
      </div>

      <div
        v-else-if="ghItems.length === 0"
        class="rounded-lg border border-slate-800/80 bg-slate-900/30 px-4 py-6 text-sm text-slate-500"
      >
        No repositories returned. Try again later or adjust your GitHub token.
      </div>

      <ul
        v-else
        class="max-h-[min(560px,60vh)] divide-y divide-slate-800/80 overflow-auto rounded-lg border border-slate-800/90 bg-slate-900/20"
        role="list"
      >
        <li
          v-for="repo in ghItems"
          :key="repo.fullName"
          class="px-3 py-3 hover:bg-slate-900/40"
        >
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <a
              :href="repo.htmlUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="text-sm font-medium text-slate-200 hover:text-blue-400"
            >
              {{ repo.name }}
            </a>
            <span class="text-[11px] tabular-nums text-slate-500">★ {{ repo.stars.toLocaleString() }}</span>
          </div>
          <p class="mt-0.5 font-mono text-[11px] text-slate-600">{{ repo.fullName }}</p>
          <p v-if="repo.description" class="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">
            {{ repo.description }}
          </p>
        </li>
      </ul>
    </template>
  </div>
</template>
