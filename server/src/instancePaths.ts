import path from 'node:path'

/**
 * All game server files for one instance: `<root>/<instance_slug>/`.
 * Defaults next to the SQLite file (`<dir-of-db>/instances`) so one Docker volume covers DB + all servers.
 */
export function getInstancesRoot(): string {
  const raw = process.env.INSTANCES_PATH?.trim()
  if (raw) return path.resolve(raw)
  const sqlite = process.env.SQLITE_PATH?.trim()
  if (sqlite) return path.join(path.dirname(path.resolve(sqlite)), 'instances')
  return path.resolve(process.cwd(), 'data', 'instances')
}

/** URL- and filesystem-safe folder name from display name. */
export function slugifyForPath(name: string): string {
  const s = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return s || 'server'
}

export function getInstanceDir(server: { instance_slug: string }): string {
  const slug = server.instance_slug?.trim()
  if (!slug) {
    throw new Error('Server row missing instance_slug (database migration required)')
  }
  return path.join(getInstancesRoot(), slug)
}
