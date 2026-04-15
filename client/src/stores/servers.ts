import { defineStore } from 'pinia'
import { computed, ref, shallowRef, triggerRef } from 'vue'
import { io, type Socket } from 'socket.io-client'
import type { GameServer, RustInstallSnapshot } from '@/types'
import { fallbackCompanionTcpPort, fallbackQueryPort } from '@/utils/rustPorts'

let socket: Socket | null = null

const MAX_LOG_CHARS = 380_000

function appendCap(existing: string, chunk: string): string {
  const next = existing + chunk
  if (next.length <= MAX_LOG_CHARS) return next
  return next.slice(next.length - MAX_LOG_CHARS)
}

function normalizeRustSnapshot(r: RustInstallSnapshot): RustInstallSnapshot {
  const hp = r.hostPlatform ?? 'linux'
  const label =
    r.hostPlatformLabel ??
    (hp === 'win32' ? 'Windows' : hp === 'darwin' ? 'macOS' : 'Linux')
  const steam = r.rustSteamPlatform ?? (hp === 'win32' ? 'windows' : 'linux')
  const oxide =
    r.oxideAsset ?? (steam === 'windows' ? 'Oxide.Rust.zip' : 'Oxide.Rust-linux.zip')
  return { ...r, hostPlatform: hp, hostPlatformLabel: label, rustSteamPlatform: steam, oxideAsset: oxide }
}

export const useServersStore = defineStore('servers', () => {
  const servers = ref<GameServer[]>([])
  const rustInstall = ref<RustInstallSnapshot | null>(null)
  /** Oxide.Core.dll present in shared Rust DS install (from GET /api/system). */
  const oxideInstalled = ref(false)
  const loading = ref(false)
  const error = ref<string | null>(null)

  /** Raw SteamCMD stdout/stderr while installing Rust DS (shared install). */
  const steamInstallLog = ref('')
  /** Captured game process output per server id (from child stdout/stderr). */
  const serverLogsMap = shallowRef(new Map<number, string>())

  const byId = computed(() => {
    const map = new Map<number, GameServer>()
    for (const s of servers.value) map.set(s.id, s)
    return map
  })

  function serverGameLog(id: number): string {
    return serverLogsMap.value.get(id) ?? ''
  }

  function clearSteamInstallLog() {
    steamInstallLog.value = ''
  }

  function clearServerGameLog(id: number) {
    const m = new Map(serverLogsMap.value)
    m.delete(id)
    serverLogsMap.value = m
    triggerRef(serverLogsMap)
  }

  function subscribeLogRooms(serverIds: number[]) {
    const ids = serverIds.filter((n) => Number.isFinite(n) && n > 0)
    if (!socket || !ids.length) return
    const emit = () => socket!.emit('logs:subscribe', { serverIds: ids })
    if (socket.connected) emit()
    else socket.once('connect', emit)
  }

  function unsubscribeLogRooms(serverIds: number[]) {
    const ids = serverIds.filter((n) => Number.isFinite(n) && n > 0)
    if (socket?.connected) socket.emit('logs:unsubscribe', { serverIds: ids })
  }

  function attachSocket() {
    if (socket) return
    socket = io({
      path: '/socket.io',
      transports: ['websocket', 'polling'],
    })
    socket.on('servers:updated', (payload: { servers: GameServer[] }) => {
      servers.value = payload.servers.map((s) => ({
        ...s,
        query_port: s.query_port ?? fallbackQueryPort(s.game_port, s.rcon_port),
        companion_tcp_port:
          s.companion_tcp_port ?? fallbackCompanionTcpPort(s.game_port, s.rcon_port),
        map_seed: s.map_seed ?? 1,
        map_worldsize: s.map_worldsize ?? 3500,
        max_players: s.max_players ?? 100,
        server_description: s.server_description ?? '',
        rcon_enabled: typeof s.rcon_enabled === 'boolean' ? s.rcon_enabled : true,
        oxide_enabled: typeof s.oxide_enabled === 'boolean' ? s.oxide_enabled : false,
        companion_enabled: typeof s.companion_enabled === 'boolean' ? s.companion_enabled : true,
        eac_enabled: typeof s.eac_enabled === 'boolean' ? s.eac_enabled : true,
        autostart: typeof s.autostart === 'boolean' ? s.autostart : false,
        memory_limit_mb:
          typeof s.memory_limit_mb === 'number' && Number.isFinite(s.memory_limit_mb)
            ? s.memory_limit_mb
            : null,
      }))
    })
    socket.on('system:rust', (payload: RustInstallSnapshot) => {
      rustInstall.value = normalizeRustSnapshot(payload)
    })
    socket.on('server:log', (payload: { serverId: number; stream: string; text: string }) => {
      const id = Number(payload?.serverId)
      if (!Number.isFinite(id)) return
      const m = serverLogsMap.value
      const cur = m.get(id) ?? ''
      m.set(id, appendCap(cur, payload.text))
      triggerRef(serverLogsMap)
    })
    socket.on('system:steamcmd', (payload: { text: string }) => {
      if (typeof payload?.text !== 'string') return
      steamInstallLog.value = appendCap(steamInstallLog.value, payload.text)
    })
  }

  async function fetchSystem() {
    try {
      const res = await fetch('/api/system')
      if (!res.ok) return
      const data = (await res.json()) as { rust: RustInstallSnapshot; oxideInstalled?: boolean }
      rustInstall.value = normalizeRustSnapshot(data.rust)
      oxideInstalled.value = typeof data.oxideInstalled === 'boolean' ? data.oxideInstalled : false
    } catch {
      /* ignore */
    }
  }

  async function fetchServers() {
    loading.value = true
    error.value = null
    try {
      const res = await fetch('/api/servers')
      if (!res.ok) throw new Error(await res.text())
      const data = (await res.json()) as { servers: GameServer[] }
      servers.value = data.servers.map((s) => ({
        ...s,
        query_port: s.query_port ?? fallbackQueryPort(s.game_port, s.rcon_port),
        companion_tcp_port:
          s.companion_tcp_port ?? fallbackCompanionTcpPort(s.game_port, s.rcon_port),
        map_seed: s.map_seed ?? 1,
        map_worldsize: s.map_worldsize ?? 3500,
        max_players: s.max_players ?? 100,
        server_description: s.server_description ?? '',
        rcon_enabled: typeof s.rcon_enabled === 'boolean' ? s.rcon_enabled : true,
        oxide_enabled: typeof s.oxide_enabled === 'boolean' ? s.oxide_enabled : false,
        companion_enabled: typeof s.companion_enabled === 'boolean' ? s.companion_enabled : true,
        eac_enabled: typeof s.eac_enabled === 'boolean' ? s.eac_enabled : true,
        autostart: typeof s.autostart === 'boolean' ? s.autostart : false,
        memory_limit_mb:
          typeof s.memory_limit_mb === 'number' && Number.isFinite(s.memory_limit_mb)
            ? s.memory_limit_mb
            : null,
      }))
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load servers'
    } finally {
      loading.value = false
    }
  }

  /** Load tail of stdout.log from disk (replace in-memory buffer for this id). */
  async function fetchServerLogHistory(id: number) {
    try {
      const res = await fetch(`/api/servers/${id}/logs`)
      if (!res.ok) return
      const data = (await res.json()) as { text?: string }
      if (typeof data.text !== 'string' || !data.text.length) return
      const slice = data.text.slice(-MAX_LOG_CHARS)
      const m = new Map(serverLogsMap.value)
      m.set(id, slice)
      serverLogsMap.value = m
      triggerRef(serverLogsMap)
    } catch {
      /* ignore */
    }
  }

  async function createServer(body: {
    name: string
    /** RCON host for this panel (defaults server-side when omitted). */
    host?: string
    game_port: number
    rcon_port: number
    rcon_password: string
    rcon_enabled?: boolean
    autostart?: boolean
    map_seed: number
    map_worldsize: number
    max_players?: number
    server_description?: string
    oxide_enabled?: boolean
    companion_enabled?: boolean
    eac_enabled?: boolean
    memory_limit_mb?: number | null
  }) {
    const res = await fetch('/api/servers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? (await res.text()))
    await fetchServers()
  }

  async function updateServer(
    id: number,
    body: Partial<{
      name: string
      host: string
      game_port: number
      rcon_port: number
      rcon_password: string
      rcon_enabled: boolean
      autostart: boolean
      map_seed: number
      map_worldsize: number
      max_players: number
      server_description: string
      oxide_enabled?: boolean
      companion_enabled?: boolean
      eac_enabled?: boolean
      memory_limit_mb?: number | null
    }>
  ) {
    const res = await fetch(`/api/servers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? (await res.text()))
    await fetchServers()
  }

  async function removeServer(id: number) {
    const res = await fetch(`/api/servers/${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error('Delete failed')
    clearServerGameLog(id)
    await fetchServers()
  }

  async function startServer(id: number) {
    const res = await fetch(`/api/servers/${id}/start`, { method: 'POST' })
    const err = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) throw new Error(err.error ?? 'Start failed')
    await fetchServers()
  }

  async function stopServer(id: number) {
    const res = await fetch(`/api/servers/${id}/stop`, { method: 'POST' })
    const err = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) throw new Error(err.error ?? 'Stop failed')
    await fetchServers()
  }

  async function restartServer(id: number) {
    await stopServer(id)
    await startServer(id)
  }

  return {
    servers,
    rustInstall,
    oxideInstalled,
    loading,
    error,
    steamInstallLog,
    byId,
    serverGameLog,
    clearSteamInstallLog,
    clearServerGameLog,
    subscribeLogRooms,
    unsubscribeLogRooms,
    fetchServerLogHistory,
    attachSocket,
    fetchServers,
    fetchSystem,
    createServer,
    updateServer,
    removeServer,
    startServer,
    stopServer,
    restartServer,
  }
})
