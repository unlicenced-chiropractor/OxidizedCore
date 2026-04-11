<script setup lang="ts">
import { RouterLink, RouterView, useRoute } from 'vue-router'

const route = useRoute()
</script>

<template>
  <div class="flex min-h-screen">
    <aside
      class="flex w-60 shrink-0 flex-col border-r border-slate-800/60 bg-slate-900/40 px-5 py-8 lg:w-64 lg:px-6"
    >
      <RouterLink to="/" class="group mb-10 block">
        <span class="block text-[15px] font-semibold tracking-tight text-slate-100 group-hover:text-white">
          OxidizedCore
        </span>
        <span class="mt-0.5 block text-xs font-normal text-slate-500">
          Rust server control
        </span>
      </RouterLink>

      <p class="mb-3 px-3 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-600">
        Navigate
      </p>
      <nav class="flex flex-col gap-0.5" aria-label="Main">
        <RouterLink
          to="/"
          class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-400 transition hover:bg-slate-800/60 hover:text-slate-200"
          active-class="!bg-slate-800/80 !text-slate-100 nav-active"
        >
          <svg class="h-5 w-5 shrink-0 opacity-70" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path
              d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"
            />
          </svg>
          <span>Servers</span>
        </RouterLink>
        <RouterLink
          to="/settings"
          class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-400 transition hover:bg-slate-800/60 hover:text-slate-200"
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

      <div
        v-if="route.name === 'server-console'"
        class="mt-auto border-t border-slate-800/60 pt-6"
      >
        <p class="px-1 text-xs leading-relaxed text-slate-600">
          You’re in the RCON console. Use <span class="text-slate-500">Servers</span> above to return to the list.
        </p>
      </div>
    </aside>

    <div class="flex min-w-0 flex-1 flex-col bg-slate-950">
      <main class="flex-1 px-6 py-10 sm:px-10 sm:py-12 lg:px-12 lg:py-14">
        <div
          class="mx-auto w-full"
          :class="route.name === 'server-console' ? 'max-w-6xl' : 'max-w-3xl'"
        >
          <RouterView />
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
