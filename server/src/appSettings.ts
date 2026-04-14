import type Database from 'better-sqlite3'

const SETTINGS_ID = 1

let settingsDb: Database.Database | null = null

/** Call once after opening SQLite so GitHub API code can read a DB-stored token. */
export function attachSettingsDatabase(database: Database.Database) {
  settingsDb = database
}

export type AppSettingsPublic = {
  rustmapsApiKeyConfigured: boolean
  /** True when any GitHub token is in effect (environment variable or database). */
  githubTokenConfigured: boolean
  /** When true, `OXIDIZED_GITHUB_TOKEN` / `GITHUB_TOKEN` overrides the database token. */
  githubAuthFromEnvironment: boolean
  /** True when a non-empty token row exists in SQLite (may be overridden by env). */
  githubTokenInDatabase: boolean
}

export function migrateAppSettings(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      id INTEGER PRIMARY KEY CHECK (id = ${SETTINGS_ID}),
      rustmaps_api_key TEXT
    );
    INSERT OR IGNORE INTO app_settings (id, rustmaps_api_key) VALUES (${SETTINGS_ID}, NULL);
  `)
  const cols = database.prepare('PRAGMA table_info(app_settings)').all() as { name: string }[]
  const names = new Set(cols.map((c) => c.name))
  if (!names.has('github_token')) {
    database.exec(`ALTER TABLE app_settings ADD COLUMN github_token TEXT`)
  }
}

export function getRustmapsApiKey(database: Database.Database): string | null {
  const row = database
    .prepare('SELECT rustmaps_api_key FROM app_settings WHERE id = ?')
    .get(SETTINGS_ID) as { rustmaps_api_key: string | null } | undefined
  const v = row?.rustmaps_api_key?.trim()
  return v ? v : null
}

function githubTokenFromEnv(): string | null {
  const v =
    process.env.OXIDIZED_GITHUB_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim() || ''
  return v.length ? v : null
}

/** Token used for GitHub REST: environment variables win over the database. */
export function resolveGithubToken(): string | null {
  const env = githubTokenFromEnv()
  if (env) return env
  if (!settingsDb) return null
  return getGithubToken(settingsDb)
}

export function getAppSettingsPublic(database: Database.Database): AppSettingsPublic {
  const fromEnv = githubTokenFromEnv() !== null
  const inDb = getGithubToken(database) !== null
  return {
    rustmapsApiKeyConfigured: getRustmapsApiKey(database) !== null,
    githubTokenConfigured: fromEnv || inDb,
    githubAuthFromEnvironment: fromEnv,
    githubTokenInDatabase: inDb,
  }
}

export function getGithubToken(database: Database.Database): string | null {
  const row = database
    .prepare('SELECT github_token FROM app_settings WHERE id = ?')
    .get(SETTINGS_ID) as { github_token: string | null } | undefined
  const v = row?.github_token?.trim()
  return v ? v : null
}

export function setGithubToken(database: Database.Database, token: string | null) {
  const normalized = token?.trim() ? token.trim().slice(0, 512) : null
  database
    .prepare('UPDATE app_settings SET github_token = ? WHERE id = ?')
    .run(normalized, SETTINGS_ID)
}

export function setRustmapsApiKey(database: Database.Database, key: string | null) {
  const normalized = key?.trim() ? key.trim() : null
  database
    .prepare('UPDATE app_settings SET rustmaps_api_key = ? WHERE id = ?')
    .run(normalized, SETTINGS_ID)
}
