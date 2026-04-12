import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import AdmZip from 'adm-zip'
import { coreLog, coreWarn } from './log.js'
import {
  oxideMarkerPlatformKey,
  oxideRustZipAssetName,
} from './hostPlatform.js'
import {
  getRustDedicatedInstallDir,
  isRustDedicatedBinaryPresent,
  skipSteamInstall,
} from './steamRust.js'

const GITHUB_LATEST =
  'https://api.github.com/repos/OxideMod/Oxide.Rust/releases/latest'
const MARKER = '.oxidized-oxide-version'

type GitHubRelease = {
  tag_name?: string
  assets?: { name?: string; browser_download_url?: string }[]
}

function oxideCoreDllPath(installDir: string): string {
  return path.join(installDir, 'RustDedicated_Data', 'Managed', 'Oxide.Core.dll')
}

/** True when Oxide.Core.dll is present in the Rust dedicated install directory. */
export function isOxideCorePresent(installDir: string): boolean {
  if (!installDir || !fs.existsSync(installDir)) return false
  return fs.existsSync(oxideCoreDllPath(installDir))
}

/** Whether this host has Oxide merged into the shared Rust DS tree (DLL on disk). */
export function detectOxidePresentOnDisk(): boolean {
  try {
    if (skipSteamInstall()) {
      const dir = getRustDedicatedInstallDir()
      return isOxideCorePresent(dir)
    }
    if (!isRustDedicatedBinaryPresent()) return false
    return isOxideCorePresent(getRustDedicatedInstallDir())
  } catch {
    return false
  }
}

function readMarker(installDir: string): string | null {
  try {
    const p = path.join(installDir, MARKER)
    if (!fs.existsSync(p)) return null
    return fs.readFileSync(p, 'utf8').trim() || null
  } catch {
    return null
  }
}

function writeMarker(installDir: string, contents: string): void {
  fs.writeFileSync(path.join(installDir, MARKER), contents, 'utf8')
}

async function fetchLatestOxideZipUrl(): Promise<{ tag: string; url: string }> {
  const override = process.env.OXIDIZED_OXIDE_ZIP_URL?.trim()
  if (override) {
    return { tag: 'custom', url: override }
  }
  const assetName = oxideRustZipAssetName()
  const res = await fetch(GITHUB_LATEST, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'OxidizedCore',
    },
  })
  if (!res.ok) {
    throw new Error(`GitHub Oxide.Rust releases/latest failed: HTTP ${res.status}`)
  }
  const data = (await res.json()) as GitHubRelease
  const tag = typeof data.tag_name === 'string' ? data.tag_name : ''
  if (!tag) throw new Error('GitHub release missing tag_name')
  const asset = data.assets?.find((a) => a.name === assetName)
  const url = asset?.browser_download_url
  if (!url) throw new Error(`Release ${tag} has no ${assetName} asset`)
  return { tag, url }
}

function parseMarker(raw: string | null): { platform: string; tag: string } | null {
  if (!raw) return null
  const idx = raw.indexOf(':')
  if (idx <= 0) return { platform: 'legacy', tag: raw.trim() }
  return { platform: raw.slice(0, idx).trim(), tag: raw.slice(idx + 1).trim() }
}

function formatMarker(platformKey: string, tag: string): string {
  return `${platformKey}:${tag}\n`
}

/**
 * Merges the latest Oxide.Rust zip for this OS into the Rust dedicated install directory.
 * Skipped when OXIDIZED_SKIP_STEAM_INSTALL=1. Optional OXIDIZED_OXIDE_ZIP_URL overrides the download URL.
 */
export async function ensureOxideInstalled(
  installDir: string,
  logLine?: (line: string) => void
): Promise<{ ok: true } | { ok: false; error: string }> {
  const log = (msg: string) => {
    coreLog('oxide', msg, { installDir })
    logLine?.(msg)
  }
  if (skipSteamInstall()) {
    log('OXIDIZED_SKIP_STEAM_INSTALL=1 — skipping Oxide install')
    return { ok: true }
  }

  let tag: string
  let url: string
  try {
    ;({ tag, url } = await fetchLatestOxideZipUrl())
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    coreWarn('oxide', 'Could not resolve Oxide download', { error: msg })
    return { ok: false, error: msg }
  }

  const platformKey = oxideMarkerPlatformKey()
  const markerRaw = readMarker(installDir)
  const parsed = parseMarker(markerRaw)
  const dllOk = fs.existsSync(oxideCoreDllPath(installDir))
  if (parsed && parsed.platform === platformKey && parsed.tag === tag && dllOk) {
    log(`Oxide already at ${tag} (${platformKey}) — skip download`)
    return { ok: true }
  }

  log(`Downloading Oxide (${tag}, ${oxideRustZipAssetName()})…`)
  let buf: ArrayBuffer
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'OxidizedCore' } })
    if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`)
    buf = await res.arrayBuffer()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    coreWarn('oxide', 'Oxide zip download failed', { error: msg })
    return { ok: false, error: msg }
  }

  const tmpZip = path.join(os.tmpdir(), `oxidized-oxide-${tag}-${Date.now()}.zip`)
  try {
    fs.writeFileSync(tmpZip, Buffer.from(buf))
    log('Extracting Oxide into Rust install…')
    fs.mkdirSync(installDir, { recursive: true })
    const zip = new AdmZip(tmpZip)
    zip.extractAllTo(installDir, true)
    writeMarker(installDir, formatMarker(platformKey, tag))
    log(`Oxide ${tag} installed`)
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    coreWarn('oxide', 'Oxide extract failed', { error: msg })
    return { ok: false, error: msg }
  } finally {
    try {
      fs.unlinkSync(tmpZip)
    } catch {
      /* ignore */
    }
  }
}
