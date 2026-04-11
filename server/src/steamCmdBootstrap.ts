import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { coreLog, coreWarn } from './log.js'
import { getInstancesRoot } from './instancePaths.js'

/** Valve CDN — always serves the current SteamCMD Linux build. */
export const STEAMCMD_LINUX_TARBALL_URL =
  'https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz'

let bootstrapInFlight: Promise<string> | null = null

function steamCmdPresent(dir: string): boolean {
  try {
    return fs.existsSync(path.join(dir, 'steamcmd.sh'))
  } catch {
    return false
  }
}

/** One-time: move old `<data>/steamcmd` into `instances/_shared/steamcmd`. */
export function tryMigrateLegacySteamCmdLayout(): void {
  if (process.env.OXIDIZED_STEAMCMD_DIR?.trim()) return
  const instancesRoot = getInstancesRoot()
  const shared = path.join(instancesRoot, '_shared')
  const preferred = path.join(shared, 'steamcmd')
  const legacy = path.join(path.dirname(instancesRoot), 'steamcmd')
  if (!steamCmdPresent(legacy) || steamCmdPresent(preferred)) return
  try {
    fs.mkdirSync(shared, { recursive: true })
    if (fs.existsSync(preferred)) {
      const left = fs.readdirSync(preferred)
      if (left.length > 0) return
      fs.rmdirSync(preferred)
    }
    fs.renameSync(legacy, preferred)
    coreLog('steamcmd', 'Migrated SteamCMD cache under instances/_shared/steamcmd', {
      from: legacy,
      to: preferred,
    })
  } catch (e) {
    coreWarn('steamcmd', 'Could not migrate legacy steamcmd; continuing with old path', {
      error: e instanceof Error ? e.message : String(e),
    })
  }
}

/** Directory where we extract SteamCMD when auto-downloading (next to shared Rust install under instances). */
export function getSteamCmdInstallRoot(): string {
  const raw = process.env.OXIDIZED_STEAMCMD_DIR?.trim()
  if (raw) return path.resolve(raw)
  const instancesRoot = getInstancesRoot()
  const preferred = path.join(instancesRoot, '_shared', 'steamcmd')
  const legacy = path.join(path.dirname(instancesRoot), 'steamcmd')
  if (steamCmdPresent(legacy) && !steamCmdPresent(preferred)) return legacy
  return preferred
}

function canAutoInstallLinuxSteamCmd(): boolean {
  return (
    process.platform === 'linux' &&
    fs.existsSync('/bin/bash') &&
    fs.existsSync('/bin/tar')
  )
}

function runTarExtract(archive: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('/bin/tar', ['-xzf', archive, '-C', dest], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let err = ''
    child.stderr?.on('data', (c) => {
      err += String(c)
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(err.trim() || `tar exited with code ${code}`))
    })
  })
}

async function downloadSteamCmdTarball(destArchive: string): Promise<void> {
  coreLog('steamcmd', 'Fetching SteamCMD archive…')
  const res = await fetch(STEAMCMD_LINUX_TARBALL_URL, {
    redirect: 'follow',
    headers: { 'User-Agent': 'OxidizedCore/steamcmd-bootstrap' },
  })
  if (!res.ok) {
    throw new Error(`SteamCMD download failed: HTTP ${res.status} ${res.statusText}`)
  }
  const buf = Buffer.from(await res.arrayBuffer())
  fs.writeFileSync(destArchive, buf)
  coreLog('steamcmd', 'SteamCMD archive saved', { bytes: buf.length, destArchive })
}

async function downloadAndExtractSteamCmd(): Promise<string> {
  const root = getSteamCmdInstallRoot()
  fs.mkdirSync(root, { recursive: true })
  const scriptPath = path.join(root, 'steamcmd.sh')
  if (fs.existsSync(scriptPath)) {
    try {
      fs.chmodSync(scriptPath, 0o755)
    } catch {
      /* ignore */
    }
    return scriptPath
  }

  const tarPath = path.join(root, 'steamcmd_linux.tar.gz')
  await downloadSteamCmdTarball(tarPath)
  coreLog('steamcmd', 'Extracting SteamCMD tarball…', { root })
  try {
    await runTarExtract(tarPath, root)
  } finally {
    try {
      fs.unlinkSync(tarPath)
    } catch {
      /* ignore */
    }
  }

  if (!fs.existsSync(scriptPath)) {
    throw new Error(`SteamCMD archive extracted but steamcmd.sh not found under ${root}`)
  }
  try {
    fs.chmodSync(scriptPath, 0o755)
  } catch {
    /* ignore */
  }
  coreLog('steamcmd', 'SteamCMD bootstrap complete', { scriptPath })
  return scriptPath
}

/**
 * Resolves the path to steamcmd.sh: honors STEAMCMD_SCRIPT when the file exists,
 * then common Docker path, then a cached auto-install under OXIDIZED_STEAMCMD_DIR.
 */
export async function ensureSteamCmdScript(): Promise<string> {
  const envPath = process.env.STEAMCMD_SCRIPT?.trim()
  if (envPath && fs.existsSync(envPath)) {
    coreLog('steamcmd', 'Using STEAMCMD_SCRIPT from environment', { path: path.resolve(envPath) })
    return path.resolve(envPath)
  }

  const dockerDefault = '/opt/steamcmd/steamcmd.sh'
  if (fs.existsSync(dockerDefault)) {
    coreLog('steamcmd', 'Using preinstalled SteamCMD in container', { path: dockerDefault })
    return dockerDefault
  }

  const localScript = path.join(getSteamCmdInstallRoot(), 'steamcmd.sh')
  if (fs.existsSync(localScript)) {
    coreLog('steamcmd', 'Using cached auto-installed SteamCMD', { path: localScript })
    return localScript
  }

  if (!canAutoInstallLinuxSteamCmd()) {
    const hint = envPath
      ? `STEAMCMD_SCRIPT is set to ${envPath} but that file does not exist. `
      : ''
    throw new Error(
      `${hint}SteamCMD auto-download is only supported on Linux with /bin/bash and /bin/tar. ` +
        'Install SteamCMD manually or set STEAMCMD_SCRIPT to steamcmd.sh.'
    )
  }

  if (!bootstrapInFlight) {
    coreLog('steamcmd', 'SteamCMD not on disk; downloading latest Linux tarball', {
      url: STEAMCMD_LINUX_TARBALL_URL,
      extractTo: getSteamCmdInstallRoot(),
    })
    bootstrapInFlight = downloadAndExtractSteamCmd().finally(() => {
      bootstrapInFlight = null
    })
  } else {
    coreLog('steamcmd', 'Waiting for in-flight SteamCMD bootstrap (another caller started it)')
  }
  return bootstrapInFlight
}
