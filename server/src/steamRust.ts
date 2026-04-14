import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { broadcastSteamCmd } from './logBroadcaster.js'
import { coreLog, coreWarn } from './log.js'
import { getInstancesRoot } from './instancePaths.js'
import {
  hostPlatformLabel,
  oxideRustZipAssetName,
  rustDedicatedBinaryName,
  rustDedicatedSteamPlatformType,
  isWindowsHost,
} from './hostPlatform.js'
import { ensureSteamCmdScript, tryMigrateLegacySteamCmdLayout } from './steamCmdBootstrap.js'

/** Rust Dedicated Server on Steam (Windows or Linux build per host). */
export const RUST_DS_APP_ID = '258550'

export type RustInstallStatus = 'idle' | 'downloading' | 'ready' | 'error'

let installState: RustInstallStatus = 'idle'
let lastError: string | null = null
let currentInstall: Promise<void> | null = null

/** Optional hook (e.g. Socket.IO) so the UI sees downloading/ready/error without only polling. */
let rustInstallStateNotifier: (() => void) | undefined

export function setRustInstallStateNotifier(fn: (() => void) | undefined): void {
  rustInstallStateNotifier = fn
}

function notifyRustInstallState(): void {
  try {
    rustInstallStateNotifier?.()
  } catch {
    /* ignore */
  }
}

export function skipSteamInstall(): boolean {
  return process.env.OXIDIZED_SKIP_STEAM_INSTALL === '1'
}

function rustInstallLooksStarted(dir: string): boolean {
  try {
    const bin = path.join(dir, rustDedicatedBinaryName())
    return fs.existsSync(bin) || fs.existsSync(path.join(dir, 'steamapps'))
  } catch {
    return false
  }
}

/** One-time: move old `<data>/rust-dedicated` into `instances/_shared/rust-dedicated`. */
function tryMigrateLegacyRustInstallLayout(): void {
  if (process.env.RUST_DS_INSTALL_DIR?.trim()) return
  const instancesRoot = getInstancesRoot()
  const shared = path.join(instancesRoot, '_shared')
  const preferred = path.join(shared, 'rust-dedicated')
  const legacy = path.join(path.dirname(instancesRoot), 'rust-dedicated')
  if (!rustInstallLooksStarted(legacy) || rustInstallLooksStarted(preferred)) return
  try {
    fs.mkdirSync(shared, { recursive: true })
    if (fs.existsSync(preferred)) {
      const left = fs.readdirSync(preferred)
      if (left.length > 0) return
      fs.rmdirSync(preferred)
    }
    fs.renameSync(legacy, preferred)
    coreLog('rust-install', 'Migrated Rust DS install under instances/_shared/rust-dedicated', {
      from: legacy,
      to: preferred,
    })
  } catch (e) {
    coreWarn('rust-install', 'Could not migrate legacy rust-dedicated; continuing with old path', {
      error: e instanceof Error ? e.message : String(e),
    })
  }
}

/**
 * Shared Rust DS install for all instances — under `instances/_shared/rust-dedicated` by default
 * so the data volume groups server dirs and Steam files together.
 * If `RUST_DS_INSTALL_DIR` is unset and an older layout exists at `<parent-of-instances>/rust-dedicated`
 * with an in-progress or finished install, that path is used so upgrades do not re-download.
 */
export function getRustInstallRoot(): string {
  const raw = process.env.RUST_DS_INSTALL_DIR?.trim()
  if (raw) return path.resolve(raw)
  const instancesRoot = getInstancesRoot()
  const preferred = path.join(instancesRoot, '_shared', 'rust-dedicated')
  const legacy = path.join(path.dirname(instancesRoot), 'rust-dedicated')
  if (rustInstallLooksStarted(legacy) && !rustInstallLooksStarted(preferred)) return legacy
  return preferred
}

export function getRustDedicatedBinaryPath(): string {
  const override = process.env.OXIDIZED_RUSTDEDICATED_BIN?.trim()
  if (override) return path.resolve(override)
  return path.join(getRustInstallRoot(), rustDedicatedBinaryName())
}

/** Directory that contains `RustDedicated` and receives Oxide merge (Steam root or parent of overridden binary). */
export function getRustDedicatedInstallDir(): string {
  return path.dirname(getRustDedicatedBinaryPath())
}

export function isRustDedicatedBinaryPresent(): boolean {
  const p = getRustDedicatedBinaryPath()
  try {
    if (isWindowsHost()) {
      return fs.existsSync(p)
    }
    fs.accessSync(p, fs.constants.X_OK)
    return true
  } catch {
    try {
      return fs.existsSync(p)
    } catch {
      return false
    }
  }
}

/**
 * A single binary file can exist after a partial/corrupt Steam install.
 * Require key install markers before treating RustDedicated as ready.
 */
function isRustDedicatedInstallReady(): boolean {
  if (!isRustDedicatedBinaryPresent()) return false
  const installDir = getRustInstallRoot()
  const dataDir = path.join(installDir, 'RustDedicated_Data')
  const appManifest = path.join(installDir, 'steamapps', `appmanifest_${RUST_DS_APP_ID}.acf`)
  try {
    return fs.existsSync(dataDir) && fs.existsSync(appManifest)
  } catch {
    return false
  }
}

/** Configured preference only; actual path may be an auto-downloaded copy under OXIDIZED_STEAMCMD_DIR. */
export function getSteamCmdScript(): string {
  return (process.env.STEAMCMD_SCRIPT ?? '/opt/steamcmd/steamcmd.sh').trim()
}

export function getRustInstallSnapshot() {
  return {
    status: installState,
    installDir: getRustInstallRoot(),
    binary: getRustDedicatedBinaryPath(),
    error: lastError,
    hostPlatform: process.platform,
    hostPlatformLabel: hostPlatformLabel(),
    rustSteamPlatform: rustDedicatedSteamPlatformType(),
    oxideAsset: oxideRustZipAssetName(),
  }
}

/** Call after env is loaded; marks ready if binary already on disk. */
export function initRustInstallState() {
  tryMigrateLegacyRustInstallLayout()
  tryMigrateLegacySteamCmdLayout()
  if (skipSteamInstall()) {
    installState = 'idle'
    coreLog('rust-install', 'OXIDIZED_SKIP_STEAM_INSTALL=1 — Steam Rust install disabled (mock/dev)')
    return
  }
  if (process.env.OXIDIZED_RUSTDEDICATED_BIN?.trim()) {
    installState = isRustDedicatedBinaryPresent() ? 'ready' : 'idle'
    coreLog('rust-install', 'Using OXIDIZED_RUSTDEDICATED_BIN', {
      path: process.env.OXIDIZED_RUSTDEDICATED_BIN,
      present: isRustDedicatedBinaryPresent(),
      state: installState,
    })
    return
  }
  if (isRustDedicatedInstallReady()) {
    installState = 'ready'
    coreLog('rust-install', 'RustDedicated already present at startup', {
      path: getRustDedicatedBinaryPath(),
    })
    return
  }
  installState = 'idle'
  coreLog('rust-install', 'RustDedicated not installed yet; will download via Steam on demand', {
    installDir: getRustInstallRoot(),
  })
}

async function runSteamCmdInstall(): Promise<void> {
  const installDir = getRustInstallRoot()
  fs.mkdirSync(installDir, { recursive: true })
  const logPath = path.join(installDir, 'steamcmd-install.log')
  const logStream = fs.createWriteStream(logPath, { flags: 'a' })
  const stamp = `\n\n=== ${new Date().toISOString()} ===\n`
  logStream.write(stamp)

  coreLog('rust-install', 'Starting SteamCMD install/update for Rust DS', {
    appId: RUST_DS_APP_ID,
    installDir,
    steamLogFile: logPath,
  })

  let steamScript: string
  try {
    steamScript = await ensureSteamCmdScript()
    logStream.write(`Using SteamCMD: ${steamScript}\n`)
  } catch (e) {
    logStream.end()
    coreWarn('rust-install', 'Failed to resolve SteamCMD script', {
      error: e instanceof Error ? e.message : String(e),
    })
    throw e instanceof Error ? e : new Error(String(e))
  }

  const steamPlatform = rustDedicatedSteamPlatformType()
  const args = [
    '+@sSteamCmdForcePlatformType',
    steamPlatform,
    '+force_install_dir',
    installDir,
    '+login',
    'anonymous',
    '+app_update',
    RUST_DS_APP_ID,
    'validate',
    '+quit',
  ]

  return new Promise((resolve, reject) => {
    const steamDir = path.dirname(steamScript)
    const win = isWindowsHost()
    coreLog('rust-install', 'Spawning SteamCMD (full output in steamcmd-install.log)', {
      mode: win ? 'steamcmd.exe' : 'bash+steamcmd.sh',
      steamPlatform,
      script: steamScript,
      cwd: steamDir,
      argsPreview: args.slice(0, 6).join(' ') + ' … +quit',
    })
    const child = win
      ? spawn(steamScript, args, {
          cwd: steamDir,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: {
            ...process.env,
            HOME: process.env.HOME || installDir,
          },
        })
      : spawn('/bin/bash', [steamScript, ...args], {
          cwd: steamDir,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: { ...process.env, HOME: process.env.HOME || installDir },
        })
    child.stdout?.on('data', (c: Buffer) => {
      logStream.write(c)
      broadcastSteamCmd(c)
    })
    child.stderr?.on('data', (c: Buffer) => {
      logStream.write(c)
      broadcastSteamCmd(c)
    })
    child.on('spawn', () => {
      coreLog('rust-install', 'SteamCMD process started', { pid: child.pid })
    })
    child.on('error', (err) => {
      logStream.end()
      coreWarn('rust-install', 'SteamCMD spawn error', { message: err.message })
      reject(err)
    })
    child.on('close', (code) => {
      logStream.end()
      coreLog('rust-install', 'SteamCMD process exited', { code, logPath })
      const ready = isRustDedicatedInstallReady()
      if (code === 0) {
        try {
          if (!isWindowsHost()) {
            const bin = getRustDedicatedBinaryPath()
            if (fs.existsSync(bin)) fs.chmodSync(bin, 0o755)
          }
        } catch {
          /* non-fatal */
        }
        if (ready) {
          coreLog('rust-install', 'RustDedicated install is ready', { path: getRustDedicatedBinaryPath() })
          resolve()
        } else {
          reject(
            new Error(
              `SteamCMD finished but RustDedicated install is incomplete under ${installDir}. See steamcmd-install.log`
            )
          )
        }
      } else if (ready) {
        // Windows SteamCMD often self-updates after app_update and exits non-zero (e.g. 7) even when the game
        // install completed — log shows "Success! App '258550' fully installed" before the updater runs.
        coreWarn('rust-install', 'SteamCMD exited non-zero but RustDedicated install is ready; treating as success', {
          code,
          path: getRustDedicatedBinaryPath(),
        })
        resolve()
      } else {
        reject(new Error(`SteamCMD exited with code ${code}. See ${logPath}`))
      }
    })
  })
}

/**
 * Starts a shared Steam download (anonymous, app 258550) if needed. Safe to call multiple times.
 * Does nothing when OXIDIZED_SKIP_STEAM_INSTALL=1 or OXIDIZED_RUSTDEDICATED_BIN is set.
 */
export function scheduleRustDedicatedInstall(onFinish: () => void): void {
  if (skipSteamInstall()) {
    coreLog('rust-install', 'scheduleRustDedicatedInstall: skipped (OXIDIZED_SKIP_STEAM_INSTALL)')
    onFinish()
    return
  }
  if (process.env.OXIDIZED_RUSTDEDICATED_BIN?.trim()) {
    coreLog('rust-install', 'scheduleRustDedicatedInstall: skipped (manual OXIDIZED_RUSTDEDICATED_BIN)')
    onFinish()
    return
  }
  if (isRustDedicatedInstallReady()) {
    if (installState === 'error') {
      coreLog('rust-install', 'scheduleRustDedicatedInstall: install ready; clearing stale error state')
    }
    installState = 'ready'
    lastError = null
    notifyRustInstallState()
    coreLog('rust-install', 'scheduleRustDedicatedInstall: already installed, no Steam run needed')
    onFinish()
    return
  }

  if (currentInstall) {
    coreLog('rust-install', 'scheduleRustDedicatedInstall: joining existing Steam download')
    void currentInstall.then(onFinish).catch(() => onFinish())
    return
  }

  installState = 'downloading'
  lastError = null
  notifyRustInstallState()
  coreLog('rust-install', 'scheduleRustDedicatedInstall: queued new SteamCMD run', {
    installDir: getRustInstallRoot(),
  })
  currentInstall = runSteamCmdInstall()
    .then(() => {
      installState = 'ready'
      lastError = null
      coreLog('rust-install', 'Steam Rust install finished successfully')
      notifyRustInstallState()
    })
    .catch((e: Error) => {
      installState = 'error'
      lastError = e.message
      coreWarn('rust-install', 'Steam Rust install failed', { error: e.message })
      notifyRustInstallState()
    })
    .finally(() => {
      currentInstall = null
      onFinish()
    })
}

/** Wait for any in-flight install, then ensure binary exists (for Start). */
export async function waitForRustDedicatedOrThrow(): Promise<void> {
  coreLog('rust-install', 'waitForRustDedicatedOrThrow: checking binary', {
    skipSteam: skipSteamInstall(),
    binaryPath: getRustDedicatedBinaryPath(),
    present: isRustDedicatedBinaryPresent(),
    ready: isRustDedicatedInstallReady(),
    installState,
  })
  if (skipSteamInstall()) return
  if (process.env.OXIDIZED_RUSTDEDICATED_BIN?.trim()) {
    if (!isRustDedicatedBinaryPresent()) {
      throw new Error(`Rust binary not found at ${getRustDedicatedBinaryPath()}`)
    }
    return
  }

  if (isRustDedicatedInstallReady()) {
    if (installState === 'error') {
      coreLog('rust-install', 'RustDedicated on disk; clearing stale error (e.g. Windows SteamCMD exit 7 after success)', {
        path: getRustDedicatedBinaryPath(),
      })
    }
    installState = 'ready'
    lastError = null
    notifyRustInstallState()
    coreLog('rust-install', 'waitForRustDedicatedOrThrow: install already ready')
    return
  }

  if (!isRustDedicatedInstallReady()) {
    if (installState === 'error') {
      throw new Error(lastError || 'Steam install failed')
    }
    if (!currentInstall) {
      coreLog('rust-install', 'waitForRustDedicatedOrThrow: triggering Steam install from Start')
      scheduleRustDedicatedInstall(() => {})
    }
    const installPromise = currentInstall
    if (installPromise) {
      coreLog('rust-install', 'waitForRustDedicatedOrThrow: awaiting SteamCMD promise')
      await installPromise
      coreLog('rust-install', 'waitForRustDedicatedOrThrow: SteamCMD promise settled', {
        installState,
        present: isRustDedicatedBinaryPresent(),
        ready: isRustDedicatedInstallReady(),
      })
    }
  }

  if (installState === 'error') {
    throw new Error(lastError || 'Steam install failed')
  }
  if (!isRustDedicatedInstallReady()) {
    throw new Error(
      'Rust dedicated is not installed yet. Wait for the Steam download to finish (check the banner), then try Start again.'
    )
  }
  installState = 'ready'
  coreLog('rust-install', 'waitForRustDedicatedOrThrow: OK — RustDedicated ready to launch')
}
