import type Database from 'better-sqlite3'

const SETTINGS_ID = 1

export type AppSettingsPublic = {
  rustmapsApiKeyConfigured: boolean
}

export function migrateAppSettings(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      id INTEGER PRIMARY KEY CHECK (id = ${SETTINGS_ID}),
      rustmaps_api_key TEXT
    );
    INSERT OR IGNORE INTO app_settings (id, rustmaps_api_key) VALUES (${SETTINGS_ID}, NULL);
  `)
}

export function getRustmapsApiKey(database: Database.Database): string | null {
  const row = database
    .prepare('SELECT rustmaps_api_key FROM app_settings WHERE id = ?')
    .get(SETTINGS_ID) as { rustmaps_api_key: string | null } | undefined
  const v = row?.rustmaps_api_key?.trim()
  return v ? v : null
}

export function getAppSettingsPublic(database: Database.Database): AppSettingsPublic {
  return { rustmapsApiKeyConfigured: getRustmapsApiKey(database) !== null }
}

export function setRustmapsApiKey(database: Database.Database, key: string | null) {
  const normalized = key?.trim() ? key.trim() : null
  database
    .prepare('UPDATE app_settings SET rustmaps_api_key = ? WHERE id = ?')
    .run(normalized, SETTINGS_ID)
}
