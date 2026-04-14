import fs from 'node:fs'
import path from 'node:path'
import AdmZip from 'adm-zip'
import { coreLog, coreWarn } from './log.js'
import { getRustDedicatedInstallDir } from './steamRust.js'
import { githubApiHeaders } from './githubPlugins.js'

const REPO_FULL_NAME = /^([a-zA-Z0-9][a-zA-Z0-9_.-]*)\/([a-zA-Z0-9][a-zA-Z0-9_.-]*)$/

const SAFE_CS_NAME = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*\.cs$/i

type RepoMeta = { default_branch?: string }

export type PlannedPluginWrite = { fileName: string; data: Buffer }

function parseFullName(raw: string): { owner: string; repo: string } | null {
  const s = raw.trim()
  const m = REPO_FULL_NAME.exec(s)
  if (!m) return null
  return { owner: m[1]!, repo: m[2]! }
}

function shouldSkipCs(rel: string): boolean {
  const lower = rel.toLowerCase()
  if (lower.includes('/obj/') || lower.includes('/bin/') || lower.includes('/node_modules/')) return true
  if (lower.endsWith('assemblyinfo.cs')) return true
  if (lower.includes('/properties/')) return true
  return false
}

/** Strip GitHub zip root folder (`owner-repo-sha/…`) → path inside repo. */
function stripZipRoot(entryName: string): string {
  const norm = entryName.replace(/\\/g, '/').replace(/^\/+/, '')
  const i = norm.indexOf('/')
  return i === -1 ? norm : norm.slice(i + 1)
}

export function getSharedOxidePluginsDir(): string {
  return path.join(getRustDedicatedInstallDir(), 'oxide', 'plugins')
}

export type ListedOxidePlugin = { name: string; size: number; mtimeMs: number }

export function sanitizePluginCsFileName(raw: string): string | null {
  const t = raw.trim()
  if (!t || t !== path.basename(t)) return null
  if (t.includes('..')) return null
  if (!SAFE_CS_NAME.test(t)) return null
  return t
}

export function listInstalledOxidePlugins():
  | { ok: true; plugins: ListedOxidePlugin[]; pluginsDir: string }
  | { ok: false; error: string } {
  try {
    const pluginsDir = getSharedOxidePluginsDir()
    if (!fs.existsSync(pluginsDir)) {
      return { ok: true, plugins: [], pluginsDir }
    }
    const names = fs.readdirSync(pluginsDir).filter((n) => n.toLowerCase().endsWith('.cs'))
    const plugins = names
      .map((name) => {
        const p = path.join(pluginsDir, name)
        const st = fs.statSync(p)
        return { name, size: st.size, mtimeMs: st.mtimeMs }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
    return { ok: true, plugins, pluginsDir }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

function fileIsUnderDir(filePath: string, dir: string): boolean {
  const resolvedFile = path.resolve(filePath)
  const resolvedDir = path.resolve(dir)
  const rel = path.relative(resolvedDir, resolvedFile)
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
}

export function deleteInstalledOxidePlugin(fileName: string): { ok: true } | { ok: false; error: string } {
  const safe = sanitizePluginCsFileName(fileName)
  if (!safe) {
    return { ok: false, error: 'Invalid plugin file name' }
  }
  const pluginsDir = getSharedOxidePluginsDir()
  const full = path.join(pluginsDir, safe)
  if (!fileIsUnderDir(full, pluginsDir)) {
    return { ok: false, error: 'Invalid path' }
  }
  try {
    if (!fs.existsSync(full)) {
      return { ok: false, error: 'File not found' }
    }
    fs.unlinkSync(full)
    coreLog('plugins', 'Removed oxide plugin file', { file: safe, pluginsDir })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Picks plugin .cs file(s) from a GitHub zipball (same rules as install).
 */
export function selectPluginWritesFromZip(zip: AdmZip): PlannedPluginWrite[] {
  type Cand = { rel: string; depth: number; size: number; data: Buffer }
  const candidates: Cand[] = []

  for (const ent of zip.getEntries()) {
    if (ent.isDirectory) continue
    const rel = stripZipRoot(ent.entryName)
    if (!rel || rel.endsWith('/')) continue
    if (!rel.toLowerCase().endsWith('.cs')) continue
    if (shouldSkipCs(rel)) continue
    const depth = rel.split('/').length
    const raw = ent.getData()
    const size = raw.length
    candidates.push({ rel, depth, size, data: raw })
  }

  if (candidates.length === 0) {
    return []
  }

  const minDepth = Math.min(...candidates.map((c) => c.depth))
  const tier = candidates.filter((c) => c.depth === minDepth)
  tier.sort((a, b) => b.size - a.size)

  const chosen: Cand[] = []
  if (tier.length === 1) {
    chosen.push(tier[0]!)
  } else {
    const largest = tier[0]!
    chosen.push(largest)
    for (let i = 1; i < tier.length; i++) {
      if (tier[i]!.size === largest.size) chosen.push(tier[i]!)
    }
  }

  const writes: PlannedPluginWrite[] = []
  const usedNames = new Set<string>()

  for (const c of chosen) {
    let base = path.basename(c.rel)
    if (!base.toLowerCase().endsWith('.cs')) base = `${base}.cs`
    let outName = base
    let n = 2
    while (usedNames.has(outName.toLowerCase())) {
      const stem = base.slice(0, -3)
      outName = `${stem}_${n}.cs`
      n++
    }
    usedNames.add(outName.toLowerCase())
    writes.push({ fileName: outName, data: c.data })
  }

  return writes
}

export type GithubPluginInstallResult =
  | { ok: true; written: string[]; pluginsDir: string }
  | { ok: false; error: string; code?: 'already_installed'; conflicting?: string[] }

/**
 * Downloads the repo zipball from GitHub, picks plugin .cs source file(s), writes into shared
 * `oxide/plugins` (same tree all instances use; cwd for RustDedicated is the install dir).
 * Refuses to overwrite existing plugin files.
 */
export async function installOxidePluginFromGithubRepo(fullName: string): Promise<GithubPluginInstallResult> {
  const parsed = parseFullName(fullName)
  if (!parsed) {
    return { ok: false, error: 'Invalid repository (expected owner/name)' }
  }
  const { owner, repo } = parsed
  const headers = githubApiHeaders()

  const metaUrl = `https://api.github.com/repos/${owner}/${repo}`
  let branch: string
  try {
    const metaRes = await fetch(metaUrl, { headers })
    if (!metaRes.ok) {
      let msg = `GitHub HTTP ${metaRes.status}`
      try {
        const j = (await metaRes.json()) as { message?: string }
        if (typeof j.message === 'string') msg = j.message
      } catch {
        /* ignore */
      }
      return { ok: false, error: msg }
    }
    const meta = (await metaRes.json()) as RepoMeta
    const b = typeof meta.default_branch === 'string' ? meta.default_branch.trim() : ''
    if (!b) return { ok: false, error: 'Could not read default branch from GitHub' }
    branch = b
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }

  const zipUrl = `https://api.github.com/repos/${owner}/${repo}/zipball/${encodeURIComponent(branch)}`
  let buf: Buffer
  try {
    const zipRes = await fetch(zipUrl, { headers })
    if (!zipRes.ok) {
      let msg = `Zip download HTTP ${zipRes.status}`
      try {
        const j = (await zipRes.json()) as { message?: string }
        if (typeof j.message === 'string') msg = j.message
      } catch {
        /* ignore */
      }
      return { ok: false, error: msg }
    }
    buf = Buffer.from(await zipRes.arrayBuffer())
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }

  let zip: AdmZip
  try {
    zip = new AdmZip(buf)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Invalid zip archive' }
  }

  const writes = selectPluginWritesFromZip(zip)
  if (writes.length === 0) {
    return { ok: false, error: 'No suitable .cs files found in repository (skipped bin/obj/AssemblyInfo)' }
  }

  const pluginsDir = getSharedOxidePluginsDir()
  try {
    fs.mkdirSync(pluginsDir, { recursive: true })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not create oxide/plugins' }
  }

  const conflicting = writes
    .filter((w) => fs.existsSync(path.join(pluginsDir, w.fileName)))
    .map((w) => w.fileName)
  if (conflicting.length > 0) {
    return {
      ok: false,
      code: 'already_installed',
      conflicting,
      error: `Already installed: ${conflicting.join(', ')}. Uninstall below or remove the file(s) first.`,
    }
  }

  const written: string[] = []
  for (const w of writes) {
    const dest = path.join(pluginsDir, w.fileName)
    try {
      fs.writeFileSync(dest, w.data)
      written.push(w.fileName)
    } catch (e) {
      coreWarn('plugins', 'Failed writing plugin file', { dest, message: e instanceof Error ? e.message : String(e) })
      return { ok: false, error: e instanceof Error ? e.message : 'Write failed' }
    }
  }

  coreLog('plugins', 'Installed GitHub plugin(s) into shared oxide/plugins', {
    repo: `${owner}/${repo}`,
    branch,
    files: written,
    pluginsDir,
  })

  return { ok: true, written, pluginsDir }
}
