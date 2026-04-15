import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type Database from 'better-sqlite3'
import type { GameServerRow } from './db.js'
import { getInstanceDir } from './instancePaths.js'
import { setServerStatus } from './db.js'
import { broadcastGameLog } from './logBroadcaster.js'
import { redactRustLaunchArgs, coreLog, coreWarn } from './log.js'
import { applyMemoryLimitToSpawn } from './memoryLimitSpawn.js'
import { buildRustLaunchSpec } from './rustLauncher.js'
import { ensureOxideInstalled } from './oxideInstall.js'
import { getRustDedicatedInstallDir, waitForRustDedicatedOrThrow } from './steamRust.js'

export type SupervisorEmit = () => void

const children = new Map<number, ChildProcess>()
/** Poll RustDedicated.log (-logfile); Unity sends little to stdout. */
const rustDedicatedLogIntervals = new Map<number, ReturnType<typeof setInterval>>()

function stopRustDedicatedLogTail(id: number): void {
  const iv = rustDedicatedLogIntervals.get(id)
  if (iv !== undefined) {
    clearInterval(iv)
    rustDedicatedLogIntervals.delete(id)
  }
}

function startRustDedicatedLogTail(id: number, instanceDir: string): void {
  stopRustDedicatedLogTail(id)
  const logPath = path.join(instanceDir, 'logs', 'RustDedicated.log')
  let pos = 0
  try {
    if (fs.existsSync(logPath)) pos = fs.statSync(logPath).size
  } catch {
    /* ignore */
  }
  const tick = () => {
    try {
      if (!fs.existsSync(logPath)) return
      const st = fs.statSync(logPath)
      if (st.size < pos) pos = 0
      if (st.size <= pos) return
      const fd = fs.openSync(logPath, 'r')
      try {
        const len = st.size - pos
        const buf = Buffer.alloc(len)
        fs.readSync(fd, buf, 0, len, pos)
        pos = st.size
        const text = buf.toString('utf8')
        if (text) broadcastGameLog(id, 'stdout', text)
      } finally {
        fs.closeSync(fd)
      }
    } catch {
      /* ignore */
    }
  }
  const iv = setInterval(tick, 600)
  rustDedicatedLogIntervals.set(id, iv)
  setTimeout(tick, 800)
}

export function isInstanceRunning(id: number): boolean {
  const c = children.get(id)
  return c !== undefined && !c.killed
}

export function listRunningInstancePids(): Array<{ serverId: number; pid: number }> {
  const out: Array<{ serverId: number; pid: number }> = []
  for (const [serverId, child] of children.entries()) {
    if (typeof child.pid === 'number' && child.pid > 0 && !child.killed) {
      out.push({ serverId, pid: child.pid })
    }
  }
  return out
}

function attachExitHandler(
  id: number,
  child: ChildProcess,
  database: Database.Database,
  emit: SupervisorEmit
) {
  child.on('exit', (code, signal) => {
    children.delete(id)
    stopRustDedicatedLogTail(id)
    broadcastGameLog(
      id,
      'stdout',
      `\r\n[oxidized-core] Process exited (code ${code ?? 'null'}, signal ${signal ?? 'null'})\r\n`
    )
    coreLog('instance', `Game process exited`, { serverId: id, code, signal })
    const row = database.prepare('SELECT status FROM servers WHERE id = ?').get(id) as
      | { status: string }
      | undefined
    if (row?.status === 'starting' || row?.status === 'running') {
      if (code === 0 || signal === 'SIGTERM') {
        setServerStatus(database, id, 'stopped')
      } else {
        setServerStatus(database, id, 'error')
      }
      emit()
    }
  })
  child.on('error', (err) => {
    children.delete(id)
    stopRustDedicatedLogTail(id)
    coreWarn('instance', `Game process error`, { serverId: id, message: err.message })
    setServerStatus(database, id, 'error')
    emit()
  })
}

export function ensureInstanceDir(server: GameServerRow): string {
  const dir = getInstanceDir(server)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

/** On API restart we lose child handles — mark running as stopped. */
export function reconcileOrphanStatuses(database: Database.Database, emit: SupervisorEmit) {
  const rows = database.prepare(`SELECT id FROM servers WHERE status IN ('running', 'starting')`).all() as {
    id: number
  }[]
  if (rows.length) {
    coreLog('instance', 'Reconciling DB status after restart (no live child processes)', {
      candidateIds: rows.map((r) => r.id),
    })
  }
  for (const { id } of rows) {
    if (!children.has(id)) {
      coreLog('instance', 'Marking server stopped (orphan — process not in memory)', { serverId: id })
      setServerStatus(database, id, 'stopped')
    }
  }
  if (rows.length) emit()
}

export async function startInstance(
  server: GameServerRow,
  database: Database.Database,
  emit: SupervisorEmit
): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = server.id
  coreLog('instance', 'startInstance requested', {
    serverId: id,
    name: server.name,
    game_port: server.game_port,
    rcon_port: server.rcon_port,
  })
  if (isInstanceRunning(id)) {
    coreWarn('instance', 'startInstance: already running', { serverId: id })
    return { ok: false, error: 'Already running' }
  }
  const row = database.prepare('SELECT status FROM servers WHERE id = ?').get(id) as
    | { status: string }
    | undefined
  if (row?.status === 'running' || row?.status === 'starting') {
    coreLog('instance', 'Resetting stale starting/running status before start', {
      serverId: id,
      previous: row?.status,
    })
    setServerStatus(database, id, 'stopped')
  }

  const instanceDir = ensureInstanceDir(server)
  coreLog('instance', 'Instance directory', {
    serverId: id,
    instanceDir,
    instance_slug: server.instance_slug,
  })
  const readme = path.join(instanceDir, 'README.txt')
  if (!fs.existsSync(readme)) {
    fs.writeFileSync(
      readme,
      `OxidizedCore instance "${server.name}" (${server.instance_slug})\n` +
        `Panel logs: logs/ here. Rust game data: under server/oxidized_${server.id}/ in the shared Steam install (set OXIDIZED_RUSTDEDICATED_CWD to override cwd).\n`,
      'utf8'
    )
  }

  setServerStatus(database, id, 'starting')
  emit()

  broadcastGameLog(
    id,
    'stdout',
    '\r\n[oxidized-core] Starting server — waiting for Rust dedicated install if needed…\r\n'
  )

  try {
    await waitForRustDedicatedOrThrow()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    broadcastGameLog(id, 'stderr', `\r\n[oxidized-core] Start aborted: ${msg}\r\n`)
    coreWarn('instance', 'startInstance: wait for RustDedicated failed', { serverId: id, error: msg })
    setServerStatus(database, id, 'stopped')
    emit()
    return { ok: false, error: msg }
  }

  if (server.oxide_enabled !== 0) {
    broadcastGameLog(
      id,
      'stdout',
      '\r\n[oxidized-core] Oxide enabled — ensuring Oxide/uMod files in shared Rust install…\r\n'
    )
    const oxide = await ensureOxideInstalled(getRustDedicatedInstallDir(), (line) => {
      broadcastGameLog(id, 'stdout', `\r\n[oxidized-core] ${line}\r\n`)
    })
    if (!oxide.ok) {
      broadcastGameLog(id, 'stderr', `\r\n[oxidized-core] Oxide install failed: ${oxide.error}\r\n`)
      coreWarn('instance', 'startInstance: Oxide install failed', { serverId: id, error: oxide.error })
      setServerStatus(database, id, 'stopped')
      emit()
      return { ok: false, error: oxide.error }
    }
  }

  const spec = buildRustLaunchSpec(server, instanceDir)
  const memMb = server.memory_limit_mb ?? null
  const launched = applyMemoryLimitToSpawn({
    command: spec.command,
    args: spec.args,
    memoryLimitMb: memMb,
    serverId: id,
  })
  if (launched.command !== spec.command && memMb != null) {
    broadcastGameLog(
      id,
      'stdout',
      `\r\n[oxidized-core] RAM limit ${memMb} MiB (enforced via systemd-run on Linux when available)\r\n`
    )
  }
  let child: ChildProcess
  try {
    coreLog('instance', 'Spawning game process', {
      serverId: id,
      command: launched.command,
      cwd: spec.cwd,
      args: redactRustLaunchArgs(launched.args),
    })
    child = spawn(launched.command, launched.args, {
      cwd: spec.cwd,
      env: { ...process.env, ...spec.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    coreWarn('instance', 'spawn() threw', { serverId: id, error: msg })
    setServerStatus(database, id, 'error')
    emit()
    return { ok: false, error: msg }
  }

  const logDir = path.join(instanceDir, 'logs')
  fs.mkdirSync(logDir, { recursive: true })
  const stdoutPath = path.join(logDir, 'stdout.log')
  coreLog('instance', 'Game stdout/stderr → file', { serverId: id, stdoutPath })
  const logFile = fs.createWriteStream(stdoutPath, { flags: 'a' })
  child.stdout?.on('data', (chunk: Buffer) => {
    logFile.write(chunk)
    broadcastGameLog(id, 'stdout', chunk)
  })
  child.stderr?.on('data', (chunk: Buffer) => {
    logFile.write(chunk)
    broadcastGameLog(id, 'stderr', chunk)
  })

  children.set(id, child)
  attachExitHandler(id, child, database, emit)

  await new Promise<void>((resolve) => {
    const t = setTimeout(resolve, 750)
    child.once('spawn', () => {
      broadcastGameLog(
        id,
        'stdout',
        `\r\n[oxidized-core] Game process spawned (pid ${child.pid ?? '?'}). Output from RustDedicated follows.\r\n`
      )
      clearTimeout(t)
      resolve()
    })
    child.once('error', () => {
      clearTimeout(t)
      resolve()
    })
  })

  if (child.killed || child.exitCode !== null) {
    coreWarn('instance', 'Process exited immediately after spawn', {
      serverId: id,
      killed: child.killed,
      exitCode: child.exitCode,
    })
    children.delete(id)
    setServerStatus(database, id, 'error')
    emit()
    return { ok: false, error: 'Process exited immediately' }
  }

  setServerStatus(database, id, 'running')
  startRustDedicatedLogTail(id, instanceDir)
  coreLog('instance', 'Server is running', { serverId: id, pid: child.pid })
  emit()
  return { ok: true }
}

export function stopInstance(
  id: number,
  database: Database.Database,
  emit: SupervisorEmit
): { ok: true } | { ok: false; error: string } {
  const child = children.get(id)
  if (!child) {
    stopRustDedicatedLogTail(id)
    coreLog('instance', 'stopInstance: no child process (DB → stopped)', { serverId: id })
    setServerStatus(database, id, 'stopped')
    emit()
    return { ok: true }
  }
  stopRustDedicatedLogTail(id)
  coreLog('instance', 'stopInstance: SIGTERM', { serverId: id, pid: child.pid })
  try {
    child.kill('SIGTERM')
  } catch {
    /* ignore */
  }
  const killTimer = setTimeout(() => {
    try {
      if (!child.killed) child.kill('SIGKILL')
    } catch {
      /* ignore */
    }
  }, 15_000)
  child.once('exit', () => clearTimeout(killTimer))
  children.delete(id)
  setServerStatus(database, id, 'stopped')
  coreLog('instance', 'stopInstance: complete', { serverId: id })
  emit()
  return { ok: true }
}

export function stopInstanceSyncIfRunning(id: number): void {
  stopRustDedicatedLogTail(id)
  const child = children.get(id)
  if (child && !child.killed) {
    coreLog('instance', 'stopInstanceSyncIfRunning: SIGTERM', { serverId: id })
    try {
      child.kill('SIGTERM')
    } catch {
      /* ignore */
    }
  }
  children.delete(id)
}
