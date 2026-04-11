/** RustMaps.com API — procedural map preview (thumbnail). Key comes from app settings (SQLite). */

const DEFAULT_API = 'https://api.rustmaps.com/v4'

type MapsData = {
  thumbnailUrl?: string
  imageUrl?: string
  rawImageUrl?: string
  id?: string
}

type MapsEnvelope = {
  meta?: { status?: string; statusCode?: number; errors?: string[] }
  data?: MapsData
}

type GenerateEnvelope = {
  meta?: { errors?: string[] }
  data?: { mapId?: string; state?: string }
}

function apiBase(): string {
  return DEFAULT_API
}

async function fetchJson(url: string, init: RequestInit): Promise<{ status: number; json: unknown }> {
  const res = await fetch(url, init)
  let json: unknown = null
  try {
    json = await res.json()
  } catch {
    /* ignore */
  }
  return { status: res.status, json }
}

function pickThumb(data: MapsData | undefined): string | undefined {
  if (!data) return undefined
  const u = data.thumbnailUrl || data.imageUrl || data.rawImageUrl
  return typeof u === 'string' && u.length > 0 ? u : undefined
}

function parseMapsBody(json: unknown): MapsEnvelope {
  return json && typeof json === 'object' ? (json as MapsEnvelope) : {}
}

/** GET map by size/seed or by mapId */
async function getMap(key: string, pathSegment: string): Promise<{ status: number; envelope: MapsEnvelope }> {
  const { status, json } = await fetchJson(`${apiBase()}/maps/${pathSegment}`, {
    headers: { 'X-API-Key': key, Accept: 'application/json' },
  })
  return { status, envelope: parseMapsBody(json) }
}

async function postGenerate(
  key: string,
  size: number,
  seed: string,
  staging: boolean
): Promise<{ status: number; body: GenerateEnvelope }> {
  const { status, json } = await fetchJson(`${apiBase()}/maps`, {
    method: 'POST',
    headers: { 'X-API-Key': key, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ size, seed, staging }),
  })
  const body = json && typeof json === 'object' ? (json as GenerateEnvelope) : {}
  return { status, body }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export type MapPreviewResult =
  | { ok: true; thumbnailUrl: string }
  | { ok: false; code: 'no_api_key' | 'unauthorized' | 'bad_request' | 'timeout' | 'no_thumbnail'; message?: string }

/**
 * Resolves a preview image URL for procedural map seed + size (polls if generation is queued).
 */
export async function resolveProceduralMapPreview(params: {
  seed: number
  worldsize: number
  staging?: boolean
  apiKey: string | null
}): Promise<MapPreviewResult> {
  const key = params.apiKey?.trim() || null
  if (!key) return { ok: false, code: 'no_api_key' }

  const seedStr = String(params.seed)
  const size = params.worldsize
  const staging = params.staging ?? false

  const tryThumb = async (segment: string): Promise<{ thumb?: string; authFail?: boolean }> => {
    const { status, envelope } = await getMap(key, segment)
    if (status === 401 || status === 403) return { authFail: true }
    if (status === 200) return { thumb: pickThumb(envelope.data) }
    return {}
  }

  let r = await tryThumb(`${size}/${seedStr}`)
  if (r.authFail) return { ok: false, code: 'unauthorized' }
  if (r.thumb) return { ok: true, thumbnailUrl: r.thumb }

  const { status: postStatus, body: gen } = await postGenerate(key, size, seedStr, staging)
  if (postStatus === 401 || postStatus === 403) return { ok: false, code: 'unauthorized' }
  if (postStatus === 400) {
    const msg = gen.meta?.errors?.join('; ')
    return { ok: false, code: 'bad_request', message: msg || 'Invalid seed or map size' }
  }
  if (postStatus !== 200 && postStatus !== 201 && postStatus !== 409) {
    return { ok: false, code: 'bad_request', message: `RustMaps returned HTTP ${postStatus}` }
  }

  const mapId = gen.data?.mapId
  const maxAttempts = 45
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(2000)
    if (mapId) {
      r = await tryThumb(mapId)
      if (r.authFail) return { ok: false, code: 'unauthorized' }
      if (r.thumb) return { ok: true, thumbnailUrl: r.thumb }
    }
    r = await tryThumb(`${size}/${seedStr}`)
    if (r.authFail) return { ok: false, code: 'unauthorized' }
    if (r.thumb) return { ok: true, thumbnailUrl: r.thumb }
  }

  return { ok: false, code: 'timeout', message: 'Map preview did not become ready in time.' }
}
