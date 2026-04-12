<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { useServersStore } from '@/stores/servers'

const SERVER_ROUTE_NAMES = new Set([
  'server-general',
  'server-console',
  'server-settings',
  'server-plugins',
  'server-backups',
])

const route = useRoute()
const serversStore = useServersStore()

const serversGroupOpen = ref(true)

const serversSorted = computed(() => [...serversStore.servers].sort((a, b) => a.id - b.id))

const onServerPage = computed(() => typeof route.name === 'string' && SERVER_ROUTE_NAMES.has(route.name))

const serversSectionActive = computed(
  () =>
    route.name === 'dashboard' || onServerPage.value || route.name === 'create-server'
)

function isServerSidebarActive(serverId: number) {
  return onServerPage.value && Number(route.params.id) === serverId
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
  await serversStore.fetchServers()
})
</script>

<template>
  <div class="flex min-h-screen">
    <aside
      class="flex w-60 shrink-0 flex-col border-r border-slate-800/60 bg-slate-900/40 px-5 py-8 lg:w-64 lg:px-6"
    >
      <RouterLink to="/" class="group mb-10 flex gap-3">
        <img
          src="/favicon.svg"
          width="40"
          height="40"
          alt=""
          class="h-10 w-10 shrink-0 rounded-lg ring-1 ring-slate-700/80"
          aria-hidden="true"
        />
        <span class="min-w-0">
          <span class="block text-[15px] font-semibold tracking-tight text-slate-100 group-hover:text-white">
            OxidizedCore
          </span>
          <span class="mt-0.5 block text-xs font-normal text-slate-500">
            Rust server control
          </span>
        </span>
      </RouterLink>

      <p class="mb-3 px-3 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-600">
        Navigate
      </p>
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
              class="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-sm transition-[color,transform] duration-200 ease-out active:scale-[0.99]"
              :class="
                route.name === 'dashboard' || onServerPage
                  ? 'nav-active font-medium text-slate-100'
                  : ''
              "
            >
              <svg class="h-5 w-5 shrink-0 opacity-80" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path
                  d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"
                />
              </svg>
              <span class="truncate">Servers</span>
            </RouterLink>
            <button
              type="button"
              class="flex shrink-0 items-center border-l border-slate-700/50 px-2.5 text-slate-500 transition-colors duration-200 hover:bg-slate-800/60 hover:text-slate-300 active:scale-95"
              :aria-expanded="serversGroupOpen"
              aria-controls="servers-submenu"
              @click="serversGroupOpen = !serversGroupOpen"
            >
              <svg
                class="h-4 w-4 transition duration-200"
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
            class="mt-1 ml-[0.6875rem] flex flex-col gap-0.5 border-l border-slate-600/50 pl-3"
            role="group"
            aria-label="Servers menu"
          >
            <RouterLink
              to="/servers/new"
              class="flex min-w-0 items-center gap-2.5 rounded-md py-1.5 pl-1 pr-2 text-sm text-slate-500 transition-[color,background-color,transform] duration-200 hover:bg-slate-800/50 hover:text-slate-300 active:scale-[0.99]"
              active-class="!bg-slate-800/80 !text-slate-100"
            >
              <svg class="h-5 w-5 shrink-0 opacity-80" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path
                  fill-rule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z"
                  clip-rule="evenodd"
                />
              </svg>
              <span>Create new server</span>
            </RouterLink>
            <RouterLink
              v-for="s in serversSorted"
              :key="s.id"
              :to="{ name: 'server-general', params: { id: String(s.id) } }"
              class="flex min-w-0 items-center gap-2.5 rounded-md py-1.5 pl-1 pr-2 text-sm text-slate-500 transition-[color,background-color,transform] duration-200 hover:bg-slate-800/50 hover:text-slate-300 active:scale-[0.99]"
              :class="isServerSidebarActive(s.id) ? '!bg-slate-800/80 !text-slate-100' : ''"
            >
              <svg class="h-5 w-5 shrink-0 opacity-80" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
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
          class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-400 transition-[color,background-color,transform] duration-200 hover:bg-slate-800/60 hover:text-slate-200 active:scale-[0.99]"
          active-class="!bg-slate-800/80 !text-slate-100 nav-active"
        >
          <svg class="h-5 w-5 shrink-0 opacity-70" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path
              fill-rule="evenodd"
              d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
              clip-rule="evenodd"
            />
          </svg>
          <span>Settings</span>
        </RouterLink>
      </nav>
    </aside>

    <div class="flex min-w-0 flex-1 flex-col bg-slate-950">
      <main class="flex-1 px-6 py-10 sm:px-10 sm:py-12 lg:px-12 lg:py-14">
        <div
          class="mx-auto w-full"
          :class="
            onServerPage
              ? 'max-w-6xl'
              : route.name === 'create-server'
                ? 'max-w-4xl'
                : route.name === 'dashboard'
                  ? 'max-w-5xl'
                  : 'max-w-3xl'
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
  box-shadow: inset 3px 0 0 0 rgb(59 130 246 / 0.85);
}
</style>
