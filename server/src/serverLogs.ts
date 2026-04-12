import fs from 'node:fs'
import path from 'node:path'
import { getInstanceDir } from './instancePaths.js'

const DEFAULT_TAIL_BYTES = 512 * 1024

export function getServerStdoutLogPath(server: { instance_slug: string }): string {
  return path.join(getInstanceDir(server), 'logs', 'stdout.log')
}

/** Unity writes most gameplay lines here (-logfile), not to process stdout. */
export function getServerRustDedicatedLogPath(server: { instance_slug: string }): string {
  return path.join(getInstanceDir(server), 'logs', 'RustDedicated.log')
}

/** History for the panel: process pipe + on-disk game log (each tail capped). */
export function getCombinedServerLogTail(server: { instance_slug: string }, maxBytes = DEFAULT_TAIL_BYTES): string {
  const stdout = tailTextFile(getServerStdoutLogPath(server), maxBytes)
  const game = tailTextFile(getServerRustDedicatedLogPath(server), maxBytes)
  if (!game.trim()) return stdout
  if (!stdout.trim()) return game
  return `${stdout}\n\n--- RustDedicated.log (game) ---\n\n${game}`
}

export function tailTextFile(absPath: string, maxBytes = DEFAULT_TAIL_BYTES): string {
  try {
    if (!fs.existsSync(absPath)) return ''
    const st = fs.statSync(absPath)
    const size = st.size
    if (size === 0) return ''
    const fd = fs.openSync(absPath, 'r')
    try {
      const start = Math.max(0, size - maxBytes)
      const len = size - start
      const buf = Buffer.alloc(len)
      fs.readSync(fd, buf, 0, len, start)
      return buf.toString('utf8')
    } finally {
      fs.closeSync(fd)
    }
  } catch {
    return ''
  }
}
