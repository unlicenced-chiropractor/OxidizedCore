import fs from 'node:fs'
import { coreLog, coreWarn } from './log.js'

const SYSTEMD_RUN_PATHS = ['/usr/bin/systemd-run', '/bin/systemd-run']

/**
 * Wraps the game command in `systemd-run --scope` with MemoryMax (Linux + systemd-run only).
 * Other platforms: no-op with a warning so operators can use OS/Docker limits instead.
 */
export function applyMemoryLimitToSpawn(opts: {
  command: string
  args: string[]
  memoryLimitMb: number | null | undefined
  serverId: number
}): { command: string; args: string[] } {
  const { command, args, memoryLimitMb, serverId } = opts
  if (memoryLimitMb == null || memoryLimitMb === undefined) {
    return { command, args }
  }
  const mb = Math.floor(Number(memoryLimitMb))
  if (!Number.isFinite(mb) || mb < 512) {
    coreWarn('memory-limit', 'memory_limit_mb must be at least 512 (or empty for no limit)', {
      serverId,
      value: memoryLimitMb,
    })
    return { command, args }
  }
  if (mb > 262_144) {
    coreWarn('memory-limit', 'memory_limit_mb above 256 GiB ignored', { serverId, mb })
    return { command, args }
  }
  if (process.env.OXIDIZED_DISABLE_MEMORY_LIMIT === '1') {
    coreWarn('memory-limit', 'OXIDIZED_DISABLE_MEMORY_LIMIT=1 — RAM cap skipped', { serverId })
    return { command, args }
  }
  if (process.platform !== 'linux') {
    coreWarn(
      'memory-limit',
      'RAM cap is applied on Linux via systemd-run; on this host set limits in Docker/Task Manager or run the panel on Linux',
      { platform: process.platform, serverId, memoryLimitMb: mb }
    )
    return { command, args }
  }

  let systemdRun: string | undefined
  for (const p of SYSTEMD_RUN_PATHS) {
    if (fs.existsSync(p)) {
      systemdRun = p
      break
    }
  }
  if (!systemdRun) {
    coreWarn(
      'memory-limit',
      'systemd-run not found; RAM cap not applied (install systemd or set container memory limits)',
      { serverId, memoryLimitMb: mb }
    )
    return { command, args }
  }

  const unit = `oxidized-rust-${serverId}-${process.pid}-${Date.now().toString(36)}`
  coreLog('memory-limit', 'systemd-run scope with MemoryMax', { serverId, mb, unit, systemdRun })
  return {
    command: systemdRun,
    args: [
      '--scope',
      '-p',
      `MemoryMax=${mb}M`,
      '--collect',
      '--unit',
      unit,
      '--',
      command,
      ...args,
    ],
  }
}
