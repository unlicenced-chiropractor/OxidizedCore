import fs from 'node:fs'
import path from 'node:path'
import { rustServerIdentity } from './rustLauncher.js'
import { getRustDedicatedInstallDir } from './steamRust.js'

const LINE_RE = /^\s*(ownerid|moderatorid)\s+(\d{15,20})\b/i

export type UserCfgRole = 'ownerid' | 'moderatorid'

export type UserCfgEntry = {
  role: UserCfgRole
  steamId: string
}

export function usersCfgPathForServer(serverId: number): string {
  const identity = rustServerIdentity(serverId)
  return path.join(getRustDedicatedInstallDir(), 'server', identity, 'cfg', 'users.cfg')
}

export function normalizeSteamId64(raw: string): string | null {
  const s = raw.trim().replace(/\s+/g, '')
  if (!/^\d{15,20}$/.test(s)) return null
  return s
}

function parseLines(text: string): UserCfgEntry[] {
  const out: UserCfgEntry[] = []
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('//')) continue
    const m = LINE_RE.exec(trimmed)
    if (!m) continue
    const cmd = m[1]!.toLowerCase()
    if (cmd !== 'ownerid' && cmd !== 'moderatorid') continue
    out.push({ role: cmd, steamId: m[2]! })
  }
  return out
}

/** One row per Steam ID (last line in file wins if duplicated). */
export function listUsersCfgEntries(text: string): UserCfgEntry[] {
  const parsed = parseLines(text)
  const bySteam = new Map<string, UserCfgEntry>()
  for (const e of parsed) {
    bySteam.set(e.steamId, e)
  }
  return [...bySteam.values()].sort((a, b) => a.steamId.localeCompare(b.steamId, undefined, { numeric: true }))
}

function formatLine(role: UserCfgRole, steamId: string): string {
  return `${role} ${steamId} "" ""`
}

/** Removes any ownerid/moderatorid line for this Steam ID, appends one new line. */
export function upsertUserCfgLine(content: string, steamId: string, role: UserCfgRole): string {
  const lines = content.split(/\r?\n/)
  const kept: string[] = []
  for (const line of lines) {
    const m = LINE_RE.exec(line.trim())
    if (m && m[2] === steamId) continue
    kept.push(line)
  }
  while (kept.length && kept[kept.length - 1] === '') kept.pop()
  kept.push(formatLine(role, steamId))
  return kept.join('\n') + '\n'
}

export function removeUserCfgLines(content: string, steamId: string): string {
  const lines = content.split(/\r?\n/)
  const kept = lines.filter((line) => {
    const m = LINE_RE.exec(line.trim())
    if (m && m[2] === steamId) return false
    return true
  })
  const body = kept.join('\n').replace(/\s+$/, '')
  return body ? `${body}\n` : ''
}

export function readUsersCfgFile(filePath: string): string {
  try {
    if (!fs.existsSync(filePath)) return ''
    return fs.readFileSync(filePath, 'utf8')
  } catch {
    return ''
  }
}

export function writeUsersCfgFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content, 'utf8')
}
