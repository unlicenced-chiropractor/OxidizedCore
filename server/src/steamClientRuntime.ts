import fs, { globSync } from 'node:fs'
import path from 'node:path'
import { getSteamCmdInstallRoot } from './steamCmdBootstrap.js'
import { coreLog, coreWarn } from './log.js'

function steamCmdRootCandidates(): string[] {
  const fromEnv = process.env.STEAMCMD_DIR?.trim()
  const fromScript = path.dirname(
    (process.env.STEAMCMD_SCRIPT ?? '/opt/steamcmd/steamcmd.sh').trim()
  )
  const home = (process.env.HOME || '/root').trim() || '/root'
  return [
    ...new Set(
      [fromEnv, fromScript, getSteamCmdInstallRoot(), '/opt/steamcmd', path.join(home, '.steam')].filter(
        Boolean
      ) as string[]
    ),
  ]
}

/** Tarball-only SteamCMD often has no steamclient.so until the first +login run. */
function findSteamClientSoFile(): string | undefined {
  for (const root of steamCmdRootCandidates()) {
    const direct = path.join(root, 'linux64', 'steamclient.so')
    if (fs.existsSync(direct)) return direct
  }
  for (const root of steamCmdRootCandidates()) {
    if (!fs.existsSync(root)) continue
    try {
      const rel = globSync('**/steamclient.so', { cwd: root })[0]
      if (rel) {
        const abs = path.resolve(root, rel)
        if (fs.existsSync(abs)) return abs
      }
    } catch {
      /* ignore */
    }
  }
  return undefined
}

/**
 * RustDedicated loads Steam via ~/.steam/sdk64/steamclient.so (and LD_LIBRARY_PATH).
 * Copy from SteamCMD’s tree (often …/linux64/ after a bootstrap run).
 * @returns Absolute path to the directory containing steamclient.so (for LD_LIBRARY_PATH), or undefined.
 */
export function ensureSteamClientSdk64(): string | undefined {
  const src = findSteamClientSoFile()
  if (!src) {
    coreWarn('steam', 'steamclient.so not found under SteamCMD or ~/.steam', {
      roots: steamCmdRootCandidates(),
    })
    return undefined
  }

  const home = (process.env.HOME || '/root').trim() || '/root'
  const destDir = path.join(home, '.steam', 'sdk64')
  const dest = path.join(destDir, 'steamclient.so')
  try {
    fs.mkdirSync(destDir, { recursive: true })
    fs.copyFileSync(src, dest)
    try {
      fs.chmodSync(dest, 0o644)
    } catch {
      /* ignore */
    }
    coreLog('steam', 'Prepared steamclient.so for RustDedicated', { from: src, to: dest })
  } catch (e) {
    coreWarn('steam', 'Could not copy steamclient.so into ~/.steam/sdk64', {
      error: e instanceof Error ? e.message : String(e),
    })
    return undefined
  }

  return path.dirname(src)
}
