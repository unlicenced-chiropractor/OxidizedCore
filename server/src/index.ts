import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import { createServer } from 'node:http'
import { Server as SocketIOServer } from 'socket.io'
import {
  deleteServer,
  getDb,
  getServer,
  insertServer,
  listServers,
  setServerStatus,
  toPublic,
  updateServer,
} from './db.js'
import { getInstanceDir, getInstancesRoot } from './instancePaths.js'
import {
  reconcileOrphanStatuses,
  startInstance,
  stopInstance,
  stopInstanceSyncIfRunning,
} from './instanceSupervisor.js'
import { getSystemMetricsSnapshot } from './systemMetrics.js'
import { sendRconCommand } from './rcon.js'
import { coreLog, coreWarn } from './log.js'
import { setLogBroadcasters } from './logBroadcaster.js'
import { getCombinedServerLogTail } from './serverLogs.js'
import {
  getRustInstallSnapshot,
  initRustInstallState,
  scheduleRustDedicatedInstall,
  setRustInstallStateNotifier,
} from './steamRust.js'
import { resolveProceduralMapPreview } from './rustMapsPreview.js'
import {
  attachSettingsDatabase,
  getAppSettingsPublic,
  getRustmapsApiKey,
  setGithubToken,
  setRustmapsApiKey,
} from './appSettings.js'
import { detectOxidePresentOnDisk } from './oxideInstall.js'
import { searchOxideRelatedRepos } from './githubPlugins.js'
import {
  deleteInstalledOxidePlugin,
  installOxidePluginFromGithubRepo,
  listInstalledOxidePlugins,
} from './pluginGithubInstall.js'
import { getDockerImageVersionInfo } from './dockerHubUpdates.js'
import {
  listUsersCfgEntries,
  normalizeSteamId64,
  readUsersCfgFile,
  removeUserCfgLines,
  upsertUserCfgLine,
  usersCfgPathForServer,
  writeUsersCfgFile,
  type UserCfgRole,
} from './rustUsersCfg.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env') })

const PORT = Number(process.env.PORT) || 3001
const HOST = process.env.HOST || '0.0.0.0'
/** Game + RCON processes run in this container; RCON client targets loopback. */
const LOCAL_GAME_HOST = (process.env.LOCAL_GAME_HOST ?? '127.0.0.1').trim() || '127.0.0.1'
const SQLITE_PATH = path.resolve(
  process.env.SQLITE_PATH || path.join(__dirname, '..', 'data', 'oxidized.db')
)

const serveStaticExplicit = process.env.SERVE_STATIC === '1'
const serveStaticProdDefault =
  process.env.NODE_ENV === 'production' && process.env.SERVE_STATIC !== '0'
const SERVE_STATIC = serveStaticExplicit || serveStaticProdDefault

const staticDir = process.env.STATIC_PATH
  ? path.resolve(process.env.STATIC_PATH)
  : path.join(__dirname, '..', 'static')

const staticAvailable = SERVE_STATIC && fs.existsSync(path.join(staticDir, 'index.html'))

function corsConfig(): cors.CorsOptions {
  const raw = process.env.CORS_ORIGIN?.trim()
  if (raw === 'true') return { origin: true, credentials: true }
  if (raw && raw !== '') {
    const list = raw.split(',').map((s) => s.trim()).filter(Boolean)
    return {
      origin: list.length > 1 ? list : list[0]!,
      credentials: true,
    }
  }
  if (staticAvailable) return { origin: true, credentials: true }
  return {
    origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
    credentials: true,
  }
}

const corsOpts = corsConfig()
const ioCorsOrigin =
  typeof corsOpts.origin === 'boolean'
    ? corsOpts.origin
    : (corsOpts.origin as string | string[] | undefined)

coreLog('boot', 'Starting OxidizedCore server', {
  node: process.version,
  cwd: process.cwd(),
  platform: process.platform,
  NODE_ENV: process.env.NODE_ENV ?? '(unset)',
})

const database = getDb(SQLITE_PATH)
attachSettingsDatabase(database)
coreLog('boot', 'SQLite database open', { SQLITE_PATH })
initRustInstallState()

const app = express()
if (process.env.TRUST_PROXY === '1') {
  app.set('trust proxy', 1)
}
const httpServer = createServer(app)

const io = new SocketIOServer(httpServer, {
  cors: { origin: ioCorsOrigin === true ? true : ioCorsOrigin, methods: ['GET', 'POST'] },
})

app.use(cors(corsOpts))
app.use(express.json())

function emitServersUpdated() {
  io.emit('servers:updated', { servers: listServers(database).map(toPublic) })
}

function emitSystemRust() {
  io.emit('system:rust', getRustInstallSnapshot())
}

setRustInstallStateNotifier(emitSystemRust)

setLogBroadcasters({
  gameLog(serverId, stream, text) {
    io.to(`server:${serverId}`).emit('server:log', { serverId, stream, text })
  },
  steamLog(text) {
    io.emit('system:steamcmd', { text })
  },
})

reconcileOrphanStatuses(database, emitServersUpdated)
setTimeout(() => {
  const autostartRows = listServers(database).filter((s) => s.autostart !== 0)
  for (const row of autostartRows) {
    void startInstance(row, database, emitServersUpdated).catch((e) => {
      coreWarn('boot', 'Autostart failed', {
        serverId: row.id,
        message: e instanceof Error ? e.message : String(e),
      })
    })
  }
}, 250)

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.get('/api/system', (_req, res) => {
  res.json({
    rust: getRustInstallSnapshot(),
    oxideInstalled: detectOxidePresentOnDisk(),
  })
})

app.get('/api/system/metrics', async (_req, res) => {
  try {
    const snapshot = await getSystemMetricsSnapshot()
    res.json({ ok: true, snapshot })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    coreWarn('api', 'GET /api/system/metrics failed', { message })
    res.status(500).json({ ok: false, error: message })
  }
})

app.get('/api/system/update', async (_req, res) => {
  try {
    const image = await getDockerImageVersionInfo()
    res.json({ ok: true, image })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    coreWarn('api', 'GET /api/system/update failed', { message })
    res.status(502).json({ ok: false, error: message })
  }
})

app.get('/api/github/oxide-plugins', async (req, res) => {
  const page = Number(req.query.page)
  const p = Number.isFinite(page) ? Math.floor(page) : 1
  const sortRaw = typeof req.query.sort === 'string' ? req.query.sort.trim() : 'stars'
  const sort =
    sortRaw === 'updated' || sortRaw === 'best-match' ? sortRaw : 'stars'
  const order = req.query.order === 'asc' ? 'asc' : 'desc'
  const q = typeof req.query.q === 'string' && req.query.q.trim() ? req.query.q.trim().slice(0, 256) : undefined
  try {
    const result = await searchOxideRelatedRepos({ page: p, sort, order, query: q })
    if (!result.ok) {
      res.status(502).json({
        ok: false,
        error: result.error,
        rateLimitRemaining: result.rateLimitRemaining,
      })
      return
    }
    res.json({
      ok: true,
      page: result.page,
      perPage: result.perPage,
      totalCount: result.totalCount,
      hasNext: result.hasNext,
      rateLimitRemaining: result.rateLimitRemaining,
      items: result.items,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    coreWarn('api', 'GET /api/github/oxide-plugins failed', { message: msg })
    res.status(500).json({ ok: false, error: msg })
  }
})

app.get('/api/servers/:id/plugins/installed', (req, res) => {
  if (!detectOxidePresentOnDisk()) {
    res.status(503).json({ ok: false, error: 'Oxide is not installed in the shared Rust dedicated directory' })
    return
  }
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) {
    res.status(400).json({ ok: false, error: 'Invalid server id' })
    return
  }
  if (!getServer(database, id)) {
    res.status(404).json({ ok: false, error: 'Not found' })
    return
  }
  const result = listInstalledOxidePlugins()
  if (!result.ok) {
    res.status(500).json({ ok: false, error: result.error })
    return
  }
  res.json({ ok: true, plugins: result.plugins, pluginsDir: result.pluginsDir })
})

app.delete('/api/servers/:id/plugins/installed', (req, res) => {
  if (!detectOxidePresentOnDisk()) {
    res.status(503).json({ ok: false, error: 'Oxide is not installed in the shared Rust dedicated directory' })
    return
  }
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) {
    res.status(400).json({ ok: false, error: 'Invalid server id' })
    return
  }
  if (!getServer(database, id)) {
    res.status(404).json({ ok: false, error: 'Not found' })
    return
  }
  const file =
    typeof req.query.file === 'string'
      ? req.query.file
      : typeof req.body?.file === 'string'
        ? req.body.file
        : ''
  if (!file.trim()) {
    res.status(400).json({ ok: false, error: 'Missing file name (query ?file= or JSON body { file })' })
    return
  }
  const del = deleteInstalledOxidePlugin(file)
  if (!del.ok) {
    res.status(del.error === 'File not found' ? 404 : 400).json({ ok: false, error: del.error })
    return
  }
  res.json({ ok: true })
})

app.post('/api/servers/:id/plugins/github-install', async (req, res) => {
  if (!detectOxidePresentOnDisk()) {
    res.status(503).json({ ok: false, error: 'Oxide is not installed in the shared Rust dedicated directory' })
    return
  }
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) {
    res.status(400).json({ ok: false, error: 'Invalid server id' })
    return
  }
  const server = getServer(database, id)
  if (!server) {
    res.status(404).json({ ok: false, error: 'Not found' })
    return
  }
  const fullName = typeof req.body?.fullName === 'string' ? req.body.fullName.trim() : ''
  if (!fullName) {
    res.status(400).json({ ok: false, error: 'Body must include fullName (owner/repo)' })
    return
  }
  try {
    const result = await installOxidePluginFromGithubRepo(fullName)
    if (!result.ok) {
      const status = result.code === 'already_installed' ? 409 : 502
      res.status(status).json({
        ok: false,
        error: result.error,
        code: result.code,
        conflicting: result.conflicting,
      })
      return
    }
    res.json({
      ok: true,
      written: result.written,
      pluginsDir: result.pluginsDir,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    coreWarn('api', 'POST /api/servers/:id/plugins/github-install failed', { message: msg })
    res.status(500).json({ ok: false, error: msg })
  }
})

app.get('/api/settings', (_req, res) => {
  res.json(getAppSettingsPublic(database))
})

app.patch('/api/settings', (req, res) => {
  const { rustmapsApiKey, githubToken } = req.body ?? {}
  if (rustmapsApiKey !== undefined && rustmapsApiKey !== null && typeof rustmapsApiKey !== 'string') {
    res.status(400).json({ error: 'rustmapsApiKey must be a string' })
    return
  }
  if (githubToken !== undefined && githubToken !== null && typeof githubToken !== 'string') {
    res.status(400).json({ error: 'githubToken must be a string' })
    return
  }
  if (typeof rustmapsApiKey === 'string') {
    setRustmapsApiKey(database, rustmapsApiKey.length ? rustmapsApiKey : null)
  }
  if (typeof githubToken === 'string') {
    setGithubToken(database, githubToken.length ? githubToken : null)
  }
  coreLog('api', 'PATCH /api/settings', {
    rustmapsKeyUpdated: typeof rustmapsApiKey === 'string',
    githubTokenUpdated: typeof githubToken === 'string',
  })
  res.json(getAppSettingsPublic(database))
})

app.get('/api/map-preview', async (req, res) => {
  const seed = Number(req.query.seed)
  const worldsize = Number(req.query.worldsize)
  const staging = req.query.staging === '1' || req.query.staging === 'true'
  if (!Number.isFinite(seed) || seed < 0 || seed > 2147483647) {
    res.status(400).json({ error: 'Invalid seed (0–2147483647)' })
    return
  }
  if (!Number.isFinite(worldsize) || worldsize < 1000 || worldsize > 6000) {
    res.status(400).json({ error: 'Invalid map size (1000–6000)' })
    return
  }
  try {
    const result = await resolveProceduralMapPreview({
      seed,
      worldsize,
      staging,
      apiKey: getRustmapsApiKey(database),
    })
    if (!result.ok) {
      const status =
        result.code === 'no_api_key'
          ? 503
          : result.code === 'unauthorized'
            ? 502
            : result.code === 'bad_request'
              ? 400
              : 504
      const message =
        result.code === 'no_api_key'
          ? 'Add a RustMaps API key in Settings (get one from rustmaps.com).'
          : result.message
      res.status(status).json({ ok: false, code: result.code, message })
      return
    }
    res.json({ ok: true, thumbnailUrl: result.thumbnailUrl })
  } catch (e) {
    coreWarn('api', 'map-preview failed', { message: e instanceof Error ? e.message : String(e) })
    res.status(500).json({ ok: false, code: 'upstream', message: 'Preview request failed' })
  }
})

app.get('/api/servers', (_req, res) => {
  res.json({ servers: listServers(database).map(toPublic) })
})

/** Last ~512KB each of stdout/stderr pipe capture and RustDedicated.log (game). */
app.get('/api/servers/:id/logs', (req, res) => {
  const id = Number(req.params.id)
  const server = Number.isFinite(id) ? getServer(database, id) : undefined
  if (!server?.instance_slug) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  const text = getCombinedServerLogTail(server)
  res.json({ text })
})

app.get('/api/servers/:id/users-cfg', (req, res) => {
  const id = Number(req.params.id)
  const server = Number.isFinite(id) ? getServer(database, id) : undefined
  if (!server) {
    res.status(404).json({ ok: false, error: 'Not found' })
    return
  }
  const filePath = usersCfgPathForServer(id)
  const raw = readUsersCfgFile(filePath)
  res.json({
    ok: true,
    entries: listUsersCfgEntries(raw),
    filePath,
  })
})

app.post('/api/servers/:id/users-cfg', (req, res) => {
  const id = Number(req.params.id)
  const server = Number.isFinite(id) ? getServer(database, id) : undefined
  if (!server) {
    res.status(404).json({ ok: false, error: 'Not found' })
    return
  }
  const { steamId: bodySteam, role } = req.body ?? {}
  if (typeof bodySteam !== 'string' || typeof role !== 'string') {
    res.status(400).json({ ok: false, error: 'Body must include steamId (string) and role' })
    return
  }
  const steamId = normalizeSteamId64(bodySteam)
  if (!steamId) {
    res.status(400).json({ ok: false, error: 'Invalid SteamID64 (15–20 digit numeric ID)' })
    return
  }
  const r = role.trim().toLowerCase()
  const userRole: UserCfgRole | null = r === 'ownerid' || r === 'owner' ? 'ownerid' : r === 'moderatorid' || r === 'moderator' ? 'moderatorid' : null
  if (!userRole) {
    res.status(400).json({ ok: false, error: 'role must be ownerid or moderatorid' })
    return
  }
  try {
    const filePath = usersCfgPathForServer(id)
    const prev = readUsersCfgFile(filePath)
    const next = upsertUserCfgLine(prev, steamId, userRole)
    writeUsersCfgFile(filePath, next)
    coreLog('api', 'POST /api/servers/:id/users-cfg', { serverId: id, steamId, role: userRole })
    res.json({
      ok: true,
      entries: listUsersCfgEntries(next),
      filePath,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    coreWarn('api', 'POST /api/servers/:id/users-cfg failed', { message: msg })
    res.status(500).json({ ok: false, error: msg })
  }
})

app.delete('/api/servers/:id/users-cfg', (req, res) => {
  const id = Number(req.params.id)
  const server = Number.isFinite(id) ? getServer(database, id) : undefined
  if (!server) {
    res.status(404).json({ ok: false, error: 'Not found' })
    return
  }
  const { steamId: bodySteam } = req.body ?? {}
  if (typeof bodySteam !== 'string') {
    res.status(400).json({ ok: false, error: 'Body must include steamId (string)' })
    return
  }
  const steamId = normalizeSteamId64(bodySteam)
  if (!steamId) {
    res.status(400).json({ ok: false, error: 'Invalid SteamID64' })
    return
  }
  try {
    const filePath = usersCfgPathForServer(id)
    const prev = readUsersCfgFile(filePath)
    const next = removeUserCfgLines(prev, steamId)
    writeUsersCfgFile(filePath, next)
    coreLog('api', 'DELETE /api/servers/:id/users-cfg', { serverId: id, steamId })
    res.json({
      ok: true,
      entries: listUsersCfgEntries(next),
      filePath,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    coreWarn('api', 'DELETE /api/servers/:id/users-cfg failed', { message: msg })
    res.status(500).json({ ok: false, error: msg })
  }
})

app.post('/api/servers', (req, res) => {
  const {
    name,
    game_port,
    rcon_port,
    rcon_password,
    map_seed,
    map_worldsize,
    host: bodyHost,
    max_players: bodyMaxPlayers,
    server_description: bodyDescription,
    rcon_enabled: bodyRconEnabled,
    oxide_enabled: bodyOxideEnabled,
    companion_enabled: bodyCompanionEnabled,
    eac_enabled: bodyEacEnabled,
    autostart: bodyAutostart,
    memory_limit_mb: bodyMemoryLimitMb,
  } = req.body ?? {}
  coreLog('api', 'POST /api/servers (create)', { name, game_port, rcon_port, map_seed, map_worldsize })
  if (
    typeof name !== 'string' ||
    typeof game_port !== 'number' ||
    typeof rcon_port !== 'number' ||
    typeof rcon_password !== 'string' ||
    typeof map_seed !== 'number' ||
    typeof map_worldsize !== 'number'
  ) {
    res.status(400).json({ error: 'Invalid body' })
    return
  }
  const rconEnabled = bodyRconEnabled === false ? false : true
  const oxideEnabled = bodyOxideEnabled === true
  const companionEnabled = bodyCompanionEnabled === false ? false : true
  const eacEnabled = bodyEacEnabled === false ? false : true
  const autostart = bodyAutostart === true
  const maxPlayers =
    typeof bodyMaxPlayers === 'number' && Number.isInteger(bodyMaxPlayers) ? bodyMaxPlayers : 100
  const serverDescription =
    typeof bodyDescription === 'string' ? bodyDescription.trim().slice(0, 512) : ''
  if (maxPlayers < 1 || maxPlayers > 500) {
    res.status(400).json({ error: 'Invalid max_players (1–500)' })
    return
  }
  if (rconEnabled && !rcon_password.trim()) {
    res.status(400).json({ error: 'RCON password required when RCON is enabled' })
    return
  }
  if (map_seed < 0 || map_seed > 2147483647 || !Number.isInteger(map_seed)) {
    res.status(400).json({ error: 'Invalid map_seed' })
    return
  }
  if (map_worldsize < 1000 || map_worldsize > 6000 || !Number.isInteger(map_worldsize)) {
    res.status(400).json({ error: 'Invalid map_worldsize' })
    return
  }
  let memoryLimitMb: number | null = null
  if (bodyMemoryLimitMb !== undefined && bodyMemoryLimitMb !== null && bodyMemoryLimitMb !== '') {
    if (typeof bodyMemoryLimitMb !== 'number' || !Number.isInteger(bodyMemoryLimitMb)) {
      res.status(400).json({ error: 'memory_limit_mb must be an integer (MiB) or null' })
      return
    }
    if (bodyMemoryLimitMb < 512 || bodyMemoryLimitMb > 262_144) {
      res.status(400).json({ error: 'memory_limit_mb must be between 512 and 262144 MiB' })
      return
    }
    memoryLimitMb = bodyMemoryLimitMb
  }
  let host = LOCAL_GAME_HOST
  if (typeof bodyHost === 'string') {
    const h = bodyHost.trim()
    if (h.length > 253) {
      res.status(400).json({ error: 'Invalid host' })
      return
    }
    if (h.length > 0) host = h
  }
  const row = insertServer(database, {
    name,
    host,
    game_port,
    rcon_port,
    rcon_password: rconEnabled ? rcon_password : '',
    rcon_enabled: rconEnabled ? 1 : 0,
    oxide_enabled: oxideEnabled ? 1 : 0,
    companion_enabled: companionEnabled ? 1 : 0,
    eac_enabled: eacEnabled ? 1 : 0,
    autostart: autostart ? 1 : 0,
    map_seed,
    map_worldsize,
    max_players: maxPlayers,
    server_description: serverDescription,
    memory_limit_mb: memoryLimitMb,
    status: 'stopped',
  })
  emitServersUpdated()
  coreLog('api', 'Server row created; scheduling shared Rust Steam install if needed', { id: row.id })
  scheduleRustDedicatedInstall(() => {
    emitServersUpdated()
    emitSystemRust()
  })
  res.status(201).json({ server: toPublic(row) })
})

app.patch('/api/servers/:id', (req, res) => {
  const id = Number(req.params.id)
  coreLog('api', 'PATCH /api/servers/:id', { id, bodyKeys: req.body ? Object.keys(req.body) : [] })
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'Invalid id' })
    return
  }
  const existing = getServer(database, id)
  if (!existing) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  if (existing.status === 'running' || existing.status === 'starting') {
    const { game_port, rcon_port, host, rcon_enabled: re } = req.body ?? {}
    if (typeof game_port === 'number' && game_port !== existing.game_port) {
      res.status(409).json({ error: 'Stop the server before changing ports' })
      return
    }
    if (typeof rcon_port === 'number' && rcon_port !== existing.rcon_port) {
      res.status(409).json({ error: 'Stop the server before changing ports' })
      return
    }
    if (typeof host === 'string' && host !== existing.host) {
      res.status(409).json({ error: 'Stop the server before changing host' })
      return
    }
    if (typeof re === 'boolean' && re !== (existing.rcon_enabled !== 0)) {
      res.status(409).json({ error: 'Stop the server before changing RCON settings' })
      return
    }
    if (typeof req.body?.rcon_password === 'string' && req.body.rcon_password !== existing.rcon_password) {
      res.status(409).json({ error: 'Stop the server before changing RCON password' })
      return
    }
    const { map_seed: ms, map_worldsize: mw } = req.body ?? {}
    if (typeof ms === 'number' && ms !== existing.map_seed) {
      res.status(409).json({ error: 'Stop the server before changing map' })
      return
    }
    if (typeof mw === 'number' && mw !== existing.map_worldsize) {
      res.status(409).json({ error: 'Stop the server before changing map' })
      return
    }
    const { oxide_enabled: ox } = req.body ?? {}
    if (typeof ox === 'boolean' && ox !== (existing.oxide_enabled !== 0)) {
      res.status(409).json({ error: 'Stop the server before changing Oxide' })
      return
    }
    const { companion_enabled: co } = req.body ?? {}
    if (typeof co === 'boolean' && co !== (existing.companion_enabled !== 0)) {
      res.status(409).json({ error: 'Stop the server before changing Rust+' })
      return
    }
    const { eac_enabled: ea } = req.body ?? {}
    if (typeof ea === 'boolean' && ea !== (existing.eac_enabled !== 0)) {
      res.status(409).json({ error: 'Stop the server before changing EAC' })
      return
    }
    if ('memory_limit_mb' in (req.body ?? {})) {
      const raw = req.body.memory_limit_mb
      let nextMem: number | null
      if (raw === null || raw === undefined || raw === '') nextMem = null
      else if (typeof raw === 'number' && Number.isInteger(raw)) {
        if (raw < 512 || raw > 262_144) {
          res.status(400).json({ error: 'memory_limit_mb must be 512–262144 MiB or null' })
          return
        }
        nextMem = raw
      } else {
        res.status(400).json({ error: 'memory_limit_mb must be an integer or null' })
        return
      }
      const curMem = existing.memory_limit_mb ?? null
      if (nextMem !== curMem) {
        res.status(409).json({ error: 'Stop the server before changing RAM limit' })
        return
      }
    }
  }
  const {
    name,
    host,
    game_port,
    rcon_port,
    rcon_password,
    map_seed,
    map_worldsize,
    max_players,
    server_description,
    rcon_enabled: bodyRconEnabled,
    oxide_enabled: bodyOxideEnabled,
    companion_enabled: bodyCompanionEnabled,
    eac_enabled: bodyEacEnabled,
    autostart: bodyAutostart,
    memory_limit_mb: bodyMemoryLimitMb,
  } = req.body ?? {}
  const patch: Parameters<typeof updateServer>[2] = {}
  if (typeof name === 'string') patch.name = name
  if (typeof host === 'string') patch.host = host
  if (typeof game_port === 'number') patch.game_port = game_port
  if (typeof rcon_port === 'number') patch.rcon_port = rcon_port
  if (typeof rcon_password === 'string') patch.rcon_password = rcon_password
  if (typeof map_seed === 'number') {
    if (map_seed < 0 || map_seed > 2147483647 || !Number.isInteger(map_seed)) {
      res.status(400).json({ error: 'Invalid map_seed' })
      return
    }
    patch.map_seed = map_seed
  }
  if (typeof map_worldsize === 'number') {
    if (map_worldsize < 1000 || map_worldsize > 6000 || !Number.isInteger(map_worldsize)) {
      res.status(400).json({ error: 'Invalid map_worldsize' })
      return
    }
    patch.map_worldsize = map_worldsize
  }
  if (typeof max_players === 'number') {
    if (max_players < 1 || max_players > 500 || !Number.isInteger(max_players)) {
      res.status(400).json({ error: 'Invalid max_players (1–500)' })
      return
    }
    patch.max_players = max_players
  }
  if (typeof server_description === 'string') patch.server_description = server_description.trim().slice(0, 512)
  if (typeof bodyRconEnabled === 'boolean') {
    const wasEnabled = existing.rcon_enabled !== 0
    if (bodyRconEnabled !== wasEnabled) {
      patch.rcon_enabled = bodyRconEnabled ? 1 : 0
      if (bodyRconEnabled && !(patch.rcon_password ?? existing.rcon_password).trim()) {
        res.status(400).json({ error: 'Set an RCON password before enabling RCON' })
        return
      }
      if (!bodyRconEnabled) patch.rcon_password = ''
    }
  }
  if (typeof bodyOxideEnabled === 'boolean') {
    patch.oxide_enabled = bodyOxideEnabled ? 1 : 0
  }
  if (typeof bodyCompanionEnabled === 'boolean') {
    patch.companion_enabled = bodyCompanionEnabled ? 1 : 0
  }
  if (typeof bodyEacEnabled === 'boolean') {
    patch.eac_enabled = bodyEacEnabled ? 1 : 0
  }
  if (typeof bodyAutostart === 'boolean') {
    patch.autostart = bodyAutostart ? 1 : 0
  }
  if ('memory_limit_mb' in (req.body ?? {})) {
    const raw = bodyMemoryLimitMb
    if (raw === null || raw === undefined || raw === '') patch.memory_limit_mb = null
    else if (typeof raw === 'number' && Number.isInteger(raw)) {
      if (raw < 512 || raw > 262_144) {
        res.status(400).json({ error: 'memory_limit_mb must be 512–262144 MiB or null' })
        return
      }
      patch.memory_limit_mb = raw
    } else {
      res.status(400).json({ error: 'memory_limit_mb must be an integer or null' })
      return
    }
  }
  const updated = updateServer(database, id, patch)
  if (!updated) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  emitServersUpdated()
  res.json({ server: toPublic(updated) })
})

app.post('/api/servers/:id/start', async (req, res) => {
  const id = Number(req.params.id)
  coreLog('api', 'POST /api/servers/:id/start', { id })
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'Invalid id' })
    return
  }
  const server = getServer(database, id)
  if (!server) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  const result = await startInstance(server, database, emitServersUpdated)
  if (!result.ok) {
    coreWarn('api', 'Start failed', { id, error: result.error })
    res.status(result.error === 'Already running' ? 409 : 500).json({ error: result.error })
    return
  }
  coreLog('api', 'Start OK', { id })
  const row = getServer(database, id)
  res.json({ server: row ? toPublic(row) : undefined })
})

app.post('/api/servers/:id/stop', (req, res) => {
  const id = Number(req.params.id)
  coreLog('api', 'POST /api/servers/:id/stop', { id })
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'Invalid id' })
    return
  }
  if (!getServer(database, id)) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  const result = stopInstance(id, database, emitServersUpdated)
  if (!result.ok) {
    res.status(500).json({ error: result.error })
    return
  }
  const row = getServer(database, id)
  res.json({ server: row ? toPublic(row) : undefined })
})

app.delete('/api/servers/:id', (req, res) => {
  const id = Number(req.params.id)
  coreLog('api', 'DELETE /api/servers/:id', { id })
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'Invalid id' })
    return
  }
  const toRemove = getServer(database, id)
  if (!toRemove?.instance_slug) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  stopInstanceSyncIfRunning(id)
  setServerStatus(database, id, 'stopped')
  try {
    fs.rmSync(getInstanceDir(toRemove), { recursive: true, force: true })
  } catch {
    /* ignore */
  }
  const ok = deleteServer(database, id)
  if (!ok) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  emitServersUpdated()
  res.status(204).end()
})

app.post('/api/servers/:id/rcon', async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'Invalid id' })
    return
  }
  const server = getServer(database, id)
  if (!server) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  if (server.status !== 'running') {
    res.status(409).json({ error: 'Start the server before using RCON' })
    return
  }
  if (server.rcon_enabled === 0) {
    res.status(409).json({ error: 'RCON is disabled for this server' })
    return
  }
  const command = typeof req.body?.command === 'string' ? req.body.command.trim() : ''
  coreLog('api', 'POST /api/servers/:id/rcon', { id, commandPreview: command.slice(0, 80) })
  if (!command) {
    res.status(400).json({ error: 'command required' })
    return
  }
  const result = await sendRconCommand(server.host, server.rcon_port, server.rcon_password, command)
  if (!result.ok) {
    coreWarn('api', 'RCON failed', { id, error: result.error })
    res.status(502).json({ error: result.error })
    return
  }
  coreLog('api', 'RCON OK', { id, responseChars: result.response.length })
  res.json({ response: result.response })
})

io.on('connection', (socket) => {
  coreLog('socket', 'Client connected', { id: socket.id })
  socket.emit('servers:updated', { servers: listServers(database).map(toPublic) })
  socket.emit('system:rust', getRustInstallSnapshot())

  socket.on('logs:subscribe', (payload: { serverIds?: unknown }) => {
    const raw = payload?.serverIds
    const ids = Array.isArray(raw) ? raw : []
    for (const x of ids) {
      const id = typeof x === 'number' ? x : Number(x)
      if (Number.isFinite(id) && id > 0) {
        void socket.join(`server:${id}`)
      }
    }
    if (ids.length) {
      coreLog('socket', 'logs:subscribe', { socketId: socket.id, serverIds: ids })
    }
  })

  socket.on('logs:unsubscribe', (payload: { serverIds?: unknown }) => {
    const raw = payload?.serverIds
    const ids = Array.isArray(raw) ? raw : []
    for (const x of ids) {
      const id = typeof x === 'number' ? x : Number(x)
      if (Number.isFinite(id) && id > 0) {
        void socket.leave(`server:${id}`)
      }
    }
  })

  socket.on('disconnect', (reason) => {
    coreLog('socket', 'Client disconnected', { id: socket.id, reason })
  })
})

if (staticAvailable) {
  app.use(express.static(staticDir, { index: false }))
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next()
      return
    }
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
      next()
      return
    }
    const ext = path.extname(req.path)
    if (ext !== '' && ext !== '.html') {
      next()
      return
    }
    res.sendFile(path.join(staticDir, 'index.html'), (err) => {
      if (err) next(err)
    })
  })
} else if (SERVE_STATIC) {
  coreWarn('boot', 'SERVE_STATIC is on but no UI found — API only', { staticDir })
}

httpServer.listen(PORT, HOST, () => {
  const where = HOST === '0.0.0.0' ? 'all interfaces' : HOST
  coreLog('boot', 'HTTP + Socket.IO listening', {
    url: `http://${HOST}:${PORT}`,
    bind: where,
    PORT,
    HOST,
  })
  coreLog('boot', 'Paths', {
    instances: getInstancesRoot(),
    staticDir,
    serveStatic: staticAvailable,
    trustProxy: process.env.TRUST_PROXY === '1',
  })
  coreLog('boot', 'Game / RCON', {
    LOCAL_GAME_HOST,
    rustSnapshot: getRustInstallSnapshot(),
  })
})
