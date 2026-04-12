<script setup lang="ts">
import { useRoute } from 'vue-router'
import { computed } from 'vue'

const route = useRoute()
const id = computed(() => route.params.id)
</script>

<template>
  <div class="rounded-lg border border-dashed border-slate-700/80 bg-slate-900/20 px-4 py-8 text-center">
    <p class="text-sm font-medium text-slate-400">Backups</p>
    <p class="mt-2 text-xs leading-relaxed text-slate-600">
      Automatic world backups are not wired up yet. Server id {{ id }} — this tab is reserved for snapshots / restore.
    </p>
  </div>
</template>
