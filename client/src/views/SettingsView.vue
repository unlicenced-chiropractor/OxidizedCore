<script setup lang="ts">
import { onMounted, ref } from 'vue'

const loading = ref(true)
const saving = ref(false)
const keyConfigured = ref(false)
const apiKeyInput = ref('')
const message = ref<string | null>(null)
const error = ref<string | null>(null)

async function load() {
  loading.value = true
  error.value = null
  try {
    const res = await fetch('/api/settings')
    const data = (await res.json()) as { rustmapsApiKeyConfigured?: boolean }
    keyConfigured.value = Boolean(data.rustmapsApiKeyConfigured)
  } catch {
    error.value = 'Could not load settings.'
  } finally {
    loading.value = false
  }
}

async function saveKey() {
  const v = apiKeyInput.value.trim()
  if (!v) {
    error.value = 'Enter an API key to save.'
    return
  }
  saving.value = true
  message.value = null
  error.value = null
  try {
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rustmapsApiKey: v }),
    })
    const data = (await res.json()) as { rustmapsApiKeyConfigured?: boolean; error?: string }
    if (!res.ok) {
      error.value = data.error ?? 'Save failed'
      return
    }
    keyConfigured.value = Boolean(data.rustmapsApiKeyConfigured)
    apiKeyInput.value = ''
    message.value = 'API key saved.'
  } catch {
    error.value = 'Save failed.'
  } finally {
    saving.value = false
  }
}

async function removeKey() {
  if (!confirm('Remove the saved RustMaps API key?')) return
  saving.value = true
  message.value = null
  error.value = null
  try {
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rustmapsApiKey: '' }),
    })
    const data = (await res.json()) as { rustmapsApiKeyConfigured?: boolean }
    if (!res.ok) {
      error.value = 'Could not remove key.'
      return
    }
    keyConfigured.value = Boolean(data.rustmapsApiKeyConfigured)
    message.value = 'API key removed.'
  } catch {
    error.value = 'Could not remove key.'
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  void load()
})
</script>

<template>
  <div class="space-y-8">
    <header class="border-b border-slate-800/60 pb-8">
      <h1 class="text-2xl font-semibold tracking-tight text-slate-50">Settings</h1>
    </header>

    <section class="space-y-4 rounded-lg border border-slate-800/80 bg-slate-900/25 p-6">
      <h2 class="text-sm font-semibold text-slate-200">RustMaps API key</h2>
      <p class="text-sm leading-relaxed text-slate-500">
        Used for procedural map previews when adding a server. Create a free key at
        <a
          href="https://rustmaps.com/dashboard"
          target="_blank"
          rel="noopener noreferrer"
          class="text-blue-400 underline-offset-2 hover:underline"
        >
          rustmaps.com
        </a>
        and paste it below. It is stored in your local database only.
      </p>

      <p v-if="loading" class="text-sm text-slate-500">Loading…</p>

      <template v-else>
        <p v-if="keyConfigured" class="text-sm text-emerald-400/90">A key is saved.</p>

        <label class="block">
          <span class="text-sm font-medium text-slate-400">{{
            keyConfigured ? 'Replace with a new key' : 'API key'
          }}</span>
          <input
            v-model="apiKeyInput"
            type="password"
            autocomplete="off"
            placeholder="Paste API key"
            class="mt-2 w-full max-w-md rounded-md border border-slate-700/90 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-blue-600/70 focus:ring-2 focus:ring-blue-600/20"
          />
        </label>

        <div class="flex flex-wrap gap-3">
          <button
            type="button"
            :disabled="saving"
            class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
            @click="saveKey"
          >
            {{ saving ? 'Saving…' : 'Save key' }}
          </button>
          <button
            v-if="keyConfigured"
            type="button"
            :disabled="saving"
            class="rounded-md border border-slate-600/90 px-4 py-2 text-sm text-slate-400 transition hover:bg-slate-800/50 disabled:opacity-50"
            @click="removeKey"
          >
            Remove key
          </button>
        </div>

        <p v-if="message" class="text-sm text-slate-400">{{ message }}</p>
        <p v-if="error" class="text-sm text-red-300/90" role="alert">{{ error }}</p>
      </template>
    </section>
  </div>
</template>
