<script setup lang="ts">
import { onMounted, ref } from 'vue'

type SettingsPayload = {
  rustmapsApiKeyConfigured?: boolean
  githubTokenConfigured?: boolean
  githubAuthFromEnvironment?: boolean
  githubTokenInDatabase?: boolean
  error?: string
}

type UpdatePayload = {
  ok: boolean
  error?: string
  image?: {
    repository: string
    currentTag: string
    currentDigest: string | null
    latestTag: 'latest'
    latestDigest: string | null
    currentLastUpdated: string | null
    latestLastUpdated: string | null
    updateAvailable: boolean | null
    determination: 'digest' | 'timestamp' | 'unknown'
  }
}

const loading = ref(true)
const saving = ref(false)
const keyConfigured = ref(false)
const apiKeyInput = ref('')
const message = ref<string | null>(null)
const error = ref<string | null>(null)

const ghKeyConfigured = ref(false)
const ghFromEnv = ref(false)
const ghInDatabase = ref(false)
const githubTokenInput = ref('')
const ghMessage = ref<string | null>(null)
const ghError = ref<string | null>(null)
const checkingUpdate = ref(false)
const updateError = ref<string | null>(null)
const updateInfo = ref<UpdatePayload['image'] | null>(null)

function applyPayload(data: SettingsPayload) {
  keyConfigured.value = Boolean(data.rustmapsApiKeyConfigured)
  ghKeyConfigured.value = Boolean(data.githubTokenConfigured)
  ghFromEnv.value = Boolean(data.githubAuthFromEnvironment)
  ghInDatabase.value = Boolean(data.githubTokenInDatabase)
}

async function load() {
  loading.value = true
  error.value = null
  try {
    const res = await fetch('/api/settings')
    const data = (await res.json()) as SettingsPayload
    applyPayload(data)
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
    const data = (await res.json()) as SettingsPayload
    if (!res.ok) {
      error.value = data.error ?? 'Save failed'
      return
    }
    applyPayload(data)
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
    const data = (await res.json()) as SettingsPayload
    if (!res.ok) {
      error.value = 'Could not remove key.'
      return
    }
    applyPayload(data)
    message.value = 'API key removed.'
  } catch {
    error.value = 'Could not remove key.'
  } finally {
    saving.value = false
  }
}

async function saveGithubToken() {
  const v = githubTokenInput.value.trim()
  if (!v) {
    ghError.value = 'Enter a token to save.'
    return
  }
  saving.value = true
  ghMessage.value = null
  ghError.value = null
  try {
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ githubToken: v }),
    })
    const data = (await res.json()) as SettingsPayload
    if (!res.ok) {
      ghError.value = data.error ?? 'Save failed'
      return
    }
    applyPayload(data)
    githubTokenInput.value = ''
    ghMessage.value = 'GitHub token saved.'
  } catch {
    ghError.value = 'Save failed.'
  } finally {
    saving.value = false
  }
}

async function removeGithubToken() {
  if (!confirm('Remove the saved GitHub token from the database?')) return
  saving.value = true
  ghMessage.value = null
  ghError.value = null
  try {
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ githubToken: '' }),
    })
    const data = (await res.json()) as SettingsPayload
    if (!res.ok) {
      ghError.value = 'Could not remove token.'
      return
    }
    applyPayload(data)
    ghMessage.value = 'GitHub token removed from database.'
  } catch {
    ghError.value = 'Could not remove token.'
  } finally {
    saving.value = false
  }
}

async function checkForImageUpdate() {
  checkingUpdate.value = true
  updateError.value = null
  try {
    const res = await fetch('/api/system/update')
    const data = (await res.json()) as UpdatePayload
    if (!res.ok || !data.ok || !data.image) {
      updateError.value = data.error ?? 'Could not check Docker Hub.'
      return
    }
    updateInfo.value = data.image
  } catch {
    updateError.value = 'Could not check Docker Hub.'
  } finally {
    checkingUpdate.value = false
  }
}

onMounted(() => {
  void load()
  void checkForImageUpdate()
})
</script>

<template>
  <div class="space-y-10">
    <header class="border-b border-slate-800/60 pb-10">
      <h1 class="text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl">Settings</h1>
    </header>

    <section class="space-y-5 rounded-xl border border-slate-800/80 bg-slate-900/25 p-7 sm:p-8">
      <h2 class="text-base font-semibold text-slate-200">RustMaps API key</h2>
      <p class="text-base text-slate-500">
        Optional map preview —
        <a
          href="https://rustmaps.com/dashboard"
          target="_blank"
          rel="noopener noreferrer"
          class="text-blue-400 underline-offset-2 hover:underline"
          >rustmaps.com</a
        >.
      </p>

      <p v-if="loading" class="text-base text-slate-500">Loading…</p>

      <template v-else>
        <p v-if="keyConfigured" class="text-base text-emerald-400/90">Saved.</p>

        <label class="flex max-w-lg flex-col gap-4">
          <span class="text-base font-medium text-slate-400">{{
            keyConfigured ? 'Replace with a new key' : 'API key'
          }}</span>
          <input
            v-model="apiKeyInput"
            type="password"
            autocomplete="off"
            placeholder="Paste API key"
            class="w-full rounded-lg border border-slate-700/90 bg-slate-950 px-3 py-3 text-base text-slate-100 outline-none focus:border-blue-600/70 focus:ring-2 focus:ring-blue-600/20"
          />
        </label>

        <div class="flex flex-wrap gap-3">
          <button
            type="button"
            :disabled="saving"
            class="rounded-lg bg-blue-600 px-5 py-2.5 text-base font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
            @click="saveKey"
          >
            {{ saving ? 'Saving…' : 'Save key' }}
          </button>
          <button
            v-if="keyConfigured"
            type="button"
            :disabled="saving"
            class="rounded-lg border border-slate-600/90 px-5 py-2.5 text-base text-slate-400 transition hover:bg-slate-800/50 disabled:opacity-50"
            @click="removeKey"
          >
            Remove key
          </button>
        </div>

        <p v-if="message" class="text-base text-slate-400">{{ message }}</p>
        <p v-if="error" class="text-base text-red-300/90" role="alert">{{ error }}</p>
      </template>
    </section>

    <section class="space-y-5 rounded-xl border border-slate-800/80 bg-slate-900/25 p-7 sm:p-8">
      <h2 class="text-base font-semibold text-slate-200">Container updates</h2>
      <p class="text-base text-slate-500">Checks Docker Hub for a newer `latest` image.</p>

      <div class="flex flex-wrap items-center gap-3">
        <button
          type="button"
          :disabled="checkingUpdate"
          class="rounded-lg bg-blue-600 px-5 py-2.5 text-base font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
          @click="checkForImageUpdate"
        >
          {{ checkingUpdate ? 'Checking…' : 'Check for update' }}
        </button>
      </div>

      <p v-if="updateError" class="text-base text-red-300/90" role="alert">{{ updateError }}</p>

      <template v-if="updateInfo">
        <p v-if="updateInfo.updateAvailable === true" class="text-base text-amber-200/90">
          Newer image available on Docker Hub.
        </p>
        <p v-else-if="updateInfo.updateAvailable === false" class="text-base text-emerald-300/90">
          Running image is up to date.
        </p>
        <p v-else class="text-base text-slate-400">
          Could not determine if update is needed with current image metadata.
        </p>

        <div class="space-y-1 text-sm text-slate-400">
          <p><span class="text-slate-500">Repository:</span> {{ updateInfo.repository }}</p>
          <p><span class="text-slate-500">Current tag:</span> {{ updateInfo.currentTag }}</p>
          <p><span class="text-slate-500">Latest tag:</span> {{ updateInfo.latestTag }}</p>
          <p v-if="updateInfo.currentLastUpdated">
            <span class="text-slate-500">Current updated:</span> {{ updateInfo.currentLastUpdated }}
          </p>
          <p v-if="updateInfo.latestLastUpdated">
            <span class="text-slate-500">Latest updated:</span> {{ updateInfo.latestLastUpdated }}
          </p>
          <p><span class="text-slate-500">Decision mode:</span> {{ updateInfo.determination }}</p>
        </div>
      </template>
    </section>

    <section class="space-y-5 rounded-xl border border-slate-800/80 bg-slate-900/25 p-7 sm:p-8">
      <h2 class="text-base font-semibold text-slate-200">GitHub token</h2>
      <p class="text-base leading-relaxed text-slate-500">
        Optional — higher GitHub rate limits for plugin search and installs.
        <a
          href="https://github.com/settings/tokens"
          target="_blank"
          rel="noopener noreferrer"
          class="text-blue-400 underline-offset-2 hover:underline"
        >
          Create a token
        </a>
      </p>

      <p v-if="loading" class="text-base text-slate-500">Loading…</p>

      <template v-else>
        <p v-if="ghFromEnv" class="text-base text-amber-200/90">Using token from server environment.</p>
        <p v-else-if="ghKeyConfigured" class="text-base text-emerald-400/90">Saved.</p>
        <p v-else class="text-base text-slate-500">No token.</p>

        <label class="flex max-w-lg flex-col gap-4">
          <span class="text-base font-medium text-slate-400">{{
            ghInDatabase ? 'Replace with a new token' : 'Personal access token'
          }}</span>
          <input
            v-model="githubTokenInput"
            type="password"
            autocomplete="off"
            placeholder="ghp_… or github_pat_…"
            class="w-full rounded-lg border border-slate-700/90 bg-slate-950 px-3 py-3 text-base text-slate-100 outline-none focus:border-blue-600/70 focus:ring-2 focus:ring-blue-600/20"
          />
        </label>

        <div class="flex flex-wrap gap-3">
          <button
            type="button"
            :disabled="saving"
            class="rounded-lg bg-blue-600 px-5 py-2.5 text-base font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
            @click="saveGithubToken"
          >
            {{ saving ? 'Saving…' : 'Save token' }}
          </button>
          <button
            v-if="ghInDatabase"
            type="button"
            :disabled="saving"
            class="rounded-lg border border-slate-600/90 px-5 py-2.5 text-base text-slate-400 transition hover:bg-slate-800/50 disabled:opacity-50"
            @click="removeGithubToken"
          >
            Remove from database
          </button>
        </div>

        <p v-if="ghMessage" class="text-base text-slate-400">{{ ghMessage }}</p>
        <p v-if="ghError" class="text-base text-red-300/90" role="alert">{{ ghError }}</p>
      </template>
    </section>
  </div>
</template>
