<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { useServersStore } from '@/stores/servers'

const SERVER_ROUTE_NAMES = new Set([
  'server-general',
  'server-console',
  'server-plugins',
  'server-backups',
])

const route = useRoute()
const serversStore = useServersStore()

const serversGroupOpen = ref(true)
const updateAvailable = ref<boolean | null>(null)
let updatePollTimer: number | null = null

const serversSorted = computed(() => [...serversStore.servers].sort((a, b) => a.id - b.id))

const onServerPage = computed(() => typeof route.name === 'string' && SERVER_ROUTE_NAMES.has(route.name))

const serversSectionActive = computed(
  () =>
    route.name === 'dashboard' || onServerPage.value || route.name === 'create-server'
)

function isServerSidebarActive(serverId: number) {
  return onServerPage.value && Number(route.params.id) === serverId
}

async function checkForServiceUpdate() {
  try {
    const res = await fetch('/api/system/update')
    const data = (await res.json()) as {
      ok?: boolean
      image?: { updateAvailable?: boolean | null }
    }
    if (!res.ok || !data.ok) return
    updateAvailable.value = data.image?.updateAvailable ?? null
  } catch {
    // Keep current indicator state on transient network failures.
  }
}

watch(
  () => route.name,
  (name) => {
    if (name === 'dashboard' || (typeof name === 'string' && SERVER_ROUTE_NAMES.has(name)) || name === 'create-server') {
      serversGroupOpen.value = true
    }
  }
)

onMounted(async () => {
  serversStore.attachSocket()
  await Promise.all([serversStore.fetchServers(), checkForServiceUpdate()])
  updatePollTimer = window.setInterval(() => {
    void checkForServiceUpdate()
  }, 5 * 60 * 1000)
})

onUnmounted(() => {
  if (updatePollTimer !== null) {
    window.clearInterval(updatePollTimer)
    updatePollTimer = null
  }
})
</script>

<template>
  <div class="flex min-h-screen">
    <aside
      class="flex w-[17rem] shrink-0 flex-col border-r border-slate-800/60 bg-slate-900/40 px-6 py-10 lg:w-[19rem] lg:px-7"
    >
      <RouterLink to="/" class="group mb-12 flex gap-3.5">
        <img
          src="/favicon.svg"
          width="48"
          height="48"
          alt=""
          class="h-12 w-12 shrink-0 rounded-xl ring-1 ring-slate-700/80"
          aria-hidden="true"
        />
        <span class="min-w-0 self-center">
          <span class="block text-lg font-semibold tracking-tight text-slate-100 group-hover:text-white">
            OxidizedCore
          </span>
        </span>
      </RouterLink>

      <nav class="flex flex-col gap-0" aria-label="Main">
        <div class="mb-0.5">
          <div
            class="flex items-stretch overflow-hidden rounded-lg transition"
            :class="
              serversSectionActive
                ? 'bg-slate-800/80 text-slate-100'
                : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
            "
          >
            <RouterLink
              to="/"
              class="flex min-w-0 flex-1 items-center gap-3.5 px-3.5 py-3 text-base transition-[color,transform] duration-200 ease-out active:scale-[0.99]"
              :class="
                route.name === 'dashboard' || onServerPage
                  ? 'nav-active font-medium text-slate-100'
                  : ''
              "
            >
              <svg class="h-6 w-6 shrink-0 opacity-80" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path
                  d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"
                />
              </svg>
              <span class="truncate">Servers</span>
            </RouterLink>
            <button
              type="button"
              class="flex shrink-0 items-center border-l border-slate-700/50 px-3 text-slate-500 transition-colors duration-200 hover:bg-slate-800/60 hover:text-slate-300 active:scale-95"
              :aria-expanded="serversGroupOpen"
              aria-controls="servers-submenu"
              @click="serversGroupOpen = !serversGroupOpen"
            >
              <svg
                class="h-5 w-5 transition duration-200"
                :class="serversGroupOpen ? '' : '-rotate-90'"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fill-rule="evenodd"
                  d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                  clip-rule="evenodd"
                />
              </svg>
              <span class="sr-only">{{ serversGroupOpen ? 'Collapse' : 'Expand' }} servers menu</span>
            </button>
          </div>

          <div
            v-show="serversGroupOpen"
            id="servers-submenu"
            class="mt-1.5 ml-3 flex flex-col gap-1 border-l border-slate-600/50 pl-3.5"
            role="group"
            aria-label="Servers menu"
          >
            <RouterLink
              to="/servers/new"
              class="flex min-w-0 items-center gap-3 rounded-md py-2 pl-1 pr-2 text-base text-slate-500 transition-[color,background-color,transform] duration-200 hover:bg-slate-800/50 hover:text-slate-300 active:scale-[0.99]"
              active-class="!bg-slate-800/80 !text-slate-100"
            >
              <svg class="h-6 w-6 shrink-0 opacity-80" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path
                  fill-rule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z"
                  clip-rule="evenodd"
                />
              </svg>
              <span>New server</span>
            </RouterLink>
            <RouterLink
              v-for="s in serversSorted"
              :key="s.id"
              :to="{ name: 'server-general', params: { id: String(s.id) } }"
              class="flex min-w-0 items-center gap-3 rounded-md py-2 pl-1 pr-2 text-base text-slate-500 transition-[color,background-color,transform] duration-200 hover:bg-slate-800/50 hover:text-slate-300 active:scale-[0.99]"
              :class="isServerSidebarActive(s.id) ? '!bg-slate-800/80 !text-slate-100' : ''"
            >
              <svg class="h-6 w-6 shrink-0 opacity-80" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path
                  d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"
                />
              </svg>
              <span class="truncate">{{ s.name }}</span>
            </RouterLink>
          </div>
        </div>

        <RouterLink
          to="/settings"
          class="flex w-full items-center gap-3.5 rounded-lg px-3.5 py-3 text-base text-slate-400 transition-[color,background-color,transform] duration-200 hover:bg-slate-800/60 hover:text-slate-200 active:scale-[0.99]"
          active-class="!bg-slate-800/80 !text-slate-100 nav-active"
        >
          <svg class="h-6 w-6 shrink-0 opacity-70" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path
              fill-rule="evenodd"
              d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
              clip-rule="evenodd"
            />
          </svg>
          <span>Settings</span>
          <span
            v-if="updateAvailable === true"
            class="ml-auto inline-flex h-2.5 w-2.5 rounded-full bg-amber-400"
            title="A newer service image is available"
          />
        </RouterLink>
      </nav>
    </aside>

    <div class="flex min-w-0 flex-1 flex-col bg-slate-950">
      <main class="flex-1 px-8 py-12 sm:px-12 sm:py-14 lg:px-16 lg:py-16 xl:px-20">
        <div
          class="mx-auto w-full"
          :class="
            onServerPage
              ? 'max-w-[88rem]'
              : route.name === 'create-server'
                ? 'max-w-5xl'
                : route.name === 'dashboard'
                  ? 'max-w-[88rem]'
                : 'max-w-4xl'
          "
        >
          <RouterView v-slot="{ Component }">
            <Transition name="page" mode="out-in">
              <component :is="Component" />
            </Transition>
          </RouterView>
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
.nav-active {
  box-shadow: inset 4px 0 0 0 rgb(59 130 246 / 0.85);
}
</style>
