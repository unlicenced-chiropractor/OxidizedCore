import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { getInstancesRoot, slugifyForPath } from './instancePaths.js'
import { migrateAppSettings } from './appSettings.js'
import { effectiveQueryPort, rustCompanionTcpPort } from './rustPorts.js'

export type ServerStatus = 'stopped' | 'starting' | 'running' | 'error'

export type GameServerRow = {
  id: number
  name: string
  /** RCON host; single-container mode uses loopback. */
  host: string
  game_port: number
  rcon_port: number
  rcon_password: string
  /** 0 or 1 in SQLite — pass +rcon.* only when enabled. */
  rcon_enabled: number
  /** 0 or 1 — merge Oxide into shared Rust install before start. */
  oxide_enabled: number
  /** 0 or 1 — Rust+ companion TCP (+app.port); off uses +app.port 1- */
  companion_enabled: number
  /** 0 or 1 — EAC enabled/disabled (+server.secure). */
  eac_enabled: number
  /** Optional RAM cap for the game process (MiB); null = unlimited. */
  memory_limit_mb: number | null
  /** Procedural map (+server.seed). */
  map_seed: number
  /** World size (+server.worldsize), typically 1000–6000. */
  map_worldsize: number
  /** +server.maxplayers */
  max_players: number
  /** +server.description */
  server_description: string
  status: ServerStatus
  created_at: string
  /** Stable folder name under instances/ (from name at create time). */
  instance_slug: string
}

export type GameServerPublic = Omit<
  GameServerRow,
  'rcon_password' | 'rcon_enabled' | 'oxide_enabled' | 'companion_enabled' | 'eac_enabled'
> & {
  rcon_enabled: boolean
  oxide_enabled: boolean
  companion_enabled: boolean
  eac_enabled: boolean
  /** UDP — Steam query / server list (same rules as +server.queryport). */
  query_port: number
  /** TCP — Rust+ companion (forward for mobile app; not required for F1 connect). */
  companion_tcp_port: number
}

export function toPublic(row: GameServerRow): GameServerPublic {
  const { rcon_password: _p, rcon_enabled, oxide_enabled, companion_enabled, eac_enabled, ...rest } = row
  return {
    ...rest,
    rcon_enabled: rcon_enabled !== 0,
    oxide_enabled: oxide_enabled !== 0,
    companion_enabled: companion_enabled !== 0,
    eac_enabled: eac_enabled !== 0,
    query_port: effectiveQueryPort(row.game_port, row.rcon_port),
    companion_tcp_port: rustCompanionTcpPort(row.game_port, row.rcon_port),
  }
}

const schema = `
CREATE TABLE IF NOT EXISTS servers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  host TEXT NOT NULL,
  game_port INTEGER NOT NULL,
  rcon_port INTEGER NOT NULL,
  rcon_password TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'stopped',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`

function allocateUniqueInstanceSlug(database: Database.Database, name: string, id: number): string {
  const base = slugifyForPath(name)
  let candidate = base
  const takenByOther = (slug: string): boolean => {
    const row = database.prepare('SELECT id FROM servers WHERE instance_slug = ?').get(slug) as
      | { id: number }
      | undefined
    return row !== undefined && row.id !== id
  }
  if (!takenByOther(candidate)) return candidate
  candidate = `${base}-${id}`
  let n = 2
  while (takenByOther(candidate)) {
    candidate = `${base}-${id}-${n}`
    n++
  }
  return candidate
}

function migrateServersTable(database: Database.Database) {
  const cols = database.prepare('PRAGMA table_info(servers)').all() as { name: string }[]
  const names = new Set(cols.map((c) => c.name))
  if (!names.has('status')) {
    database.exec(`ALTER TABLE servers ADD COLUMN status TEXT NOT NULL DEFAULT 'stopped'`)
  }
  if (!names.has('instance_slug')) {
    database.exec(`ALTER TABLE servers ADD COLUMN instance_slug TEXT`)
    const rows = database.prepare('SELECT id, name FROM servers ORDER BY id ASC').all() as {
      id: number
      name: string
    }[]
    const root = getInstancesRoot()
    for (const r of rows) {
      const slug = allocateUniqueInstanceSlug(database, r.name, r.id)
      database.prepare('UPDATE servers SET instance_slug = ? WHERE id = ?').run(slug, r.id)
      const legacy = path.join(root, String(r.id))
      const next = path.join(root, slug)
      if (fs.existsSync(legacy) && !fs.existsSync(next)) {
        try {
          fs.renameSync(legacy, next)
        } catch {
          /* ignore */
        }
      }
    }
  }
  if (!names.has('map_seed')) {
    database.exec(`ALTER TABLE servers ADD COLUMN map_seed INTEGER NOT NULL DEFAULT 1`)
  }
  if (!names.has('map_worldsize')) {
    database.exec(`ALTER TABLE servers ADD COLUMN map_worldsize INTEGER NOT NULL DEFAULT 3500`)
  }
  if (!names.has('max_players')) {
    database.exec(`ALTER TABLE servers ADD COLUMN max_players INTEGER NOT NULL DEFAULT 100`)
  }
  if (!names.has('server_description')) {
    database.exec(`ALTER TABLE servers ADD COLUMN server_description TEXT NOT NULL DEFAULT ''`)
  }
  if (!names.has('rcon_enabled')) {
    database.exec(`ALTER TABLE servers ADD COLUMN rcon_enabled INTEGER NOT NULL DEFAULT 1`)
  }
  if (!names.has('oxide_enabled')) {
    database.exec(`ALTER TABLE servers ADD COLUMN oxide_enabled INTEGER NOT NULL DEFAULT 0`)
  }
  if (!names.has('companion_enabled')) {
    database.exec(`ALTER TABLE servers ADD COLUMN companion_enabled INTEGER NOT NULL DEFAULT 1`)
  }
  if (!names.has('eac_enabled')) {
    database.exec(`ALTER TABLE servers ADD COLUMN eac_enabled INTEGER NOT NULL DEFAULT 1`)
  }
  if (!names.has('memory_limit_mb')) {
    database.exec(`ALTER TABLE servers ADD COLUMN memory_limit_mb INTEGER`)
  }
}

let db: Database.Database | null = null

export function getDb(filePath: string): Database.Database {
  if (db) return db
  const dir = path.dirname(filePath)
  fs.mkdirSync(dir, { recursive: true })
  db = new Database(filePath)
  db.pragma('journal_mode = WAL')
  db.exec(schema)
  migrateServersTable(db)
  migrateAppSettings(db)
  return db
}

export function listServers(database: Database.Database): GameServerRow[] {
  return database.prepare('SELECT * FROM servers ORDER BY id ASC').all() as GameServerRow[]
}

export function getServer(database: Database.Database, id: number): GameServerRow | undefined {
  return database.prepare('SELECT * FROM servers WHERE id = ?').get(id) as GameServerRow | undefined
}

export function insertServer(
  database: Database.Database,
  row: {
    name: string
    host: string
    game_port: number
    rcon_port: number
    rcon_password: string
    rcon_enabled: number
    map_seed: number
    map_worldsize: number
    max_players: number
    server_description: string
    oxide_enabled: number
    companion_enabled: number
    eac_enabled: number
    memory_limit_mb: number | null
    status?: ServerStatus
  }
): GameServerRow {
  const status = row.status ?? 'stopped'
  const insert = database.prepare(
    `INSERT INTO servers (name, host, game_port, rcon_port, rcon_password, rcon_enabled, oxide_enabled, companion_enabled, eac_enabled, memory_limit_mb, map_seed, map_worldsize, max_players, server_description, status)
     VALUES (@name, @host, @game_port, @rcon_port, @rcon_password, @rcon_enabled, @oxide_enabled, @companion_enabled, @eac_enabled, @memory_limit_mb, @map_seed, @map_worldsize, @max_players, @server_description, @status)`
  )
  let newId = 0
  const tx = database.transaction(() => {
    const info = insert.run({
      name: row.name,
      host: row.host,
      game_port: row.game_port,
      rcon_port: row.rcon_port,
      rcon_password: row.rcon_password,
      rcon_enabled: row.rcon_enabled,
      oxide_enabled: row.oxide_enabled,
      companion_enabled: row.companion_enabled,
      eac_enabled: row.eac_enabled,
      memory_limit_mb: row.memory_limit_mb ?? null,
      map_seed: row.map_seed,
      map_worldsize: row.map_worldsize,
      max_players: row.max_players,
      server_description: row.server_description,
      status,
    })
    newId = Number(info.lastInsertRowid)
    const slug = allocateUniqueInstanceSlug(database, row.name, newId)
    database.prepare('UPDATE servers SET instance_slug = ? WHERE id = ?').run(slug, newId)
  })
  tx()
  const createdRow = getServer(database, newId)
  if (!createdRow) throw new Error('Failed to read inserted server')
  return createdRow
}

export function updateServer(
  database: Database.Database,
  id: number,
  row: Partial<
    Pick<
      GameServerRow,
      | 'name'
      | 'host'
      | 'game_port'
      | 'rcon_port'
      | 'rcon_password'
      | 'rcon_enabled'
      | 'oxide_enabled'
      | 'companion_enabled'
      | 'eac_enabled'
      | 'memory_limit_mb'
      | 'map_seed'
      | 'map_worldsize'
      | 'max_players'
      | 'server_description'
      | 'status'
    >
  >
): GameServerRow | undefined {
  const existing = getServer(database, id)
  if (!existing) return undefined
  const next = {
    name: row.name ?? existing.name,
    host: row.host ?? existing.host,
    game_port: row.game_port ?? existing.game_port,
    rcon_port: row.rcon_port ?? existing.rcon_port,
    rcon_password: row.rcon_password ?? existing.rcon_password,
    rcon_enabled: row.rcon_enabled ?? existing.rcon_enabled,
    oxide_enabled: row.oxide_enabled ?? existing.oxide_enabled,
    companion_enabled: row.companion_enabled ?? existing.companion_enabled,
    eac_enabled: row.eac_enabled ?? existing.eac_enabled,
    memory_limit_mb: row.memory_limit_mb !== undefined ? row.memory_limit_mb : existing.memory_limit_mb,
    map_seed: row.map_seed ?? existing.map_seed,
    map_worldsize: row.map_worldsize ?? existing.map_worldsize,
    max_players: row.max_players ?? existing.max_players,
    server_description: row.server_description ?? existing.server_description,
    status: row.status ?? existing.status,
  }
  database
    .prepare(
      `UPDATE servers SET name = @name, host = @host, game_port = @game_port,
       rcon_port = @rcon_port, rcon_password = @rcon_password, rcon_enabled = @rcon_enabled, oxide_enabled = @oxide_enabled,
       companion_enabled = @companion_enabled, eac_enabled = @eac_enabled,
       memory_limit_mb = @memory_limit_mb,
       map_seed = @map_seed, map_worldsize = @map_worldsize, max_players = @max_players,
       server_description = @server_description, status = @status WHERE id = @id`
    )
    .run({ ...next, id })
  return getServer(database, id)
}

export function setServerStatus(database: Database.Database, id: number, status: ServerStatus) {
  database.prepare('UPDATE servers SET status = ? WHERE id = ?').run(status, id)
}

export function deleteServer(database: Database.Database, id: number): boolean {
  const info = database.prepare('DELETE FROM servers WHERE id = ?').run(id)
  return info.changes > 0
}