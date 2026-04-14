type DockerHubTagResponse = {
  name?: string
  digest?: string
  last_updated?: string
  images?: Array<{ digest?: string }>
}

export type DockerImageVersionInfo = {
  repository: string
  currentTag: string
  currentDigest: string | null
  latestTag: 'latest'
  latestDigest: string | null
  currentLastUpdated: string | null
  latestLastUpdated: string | null
  updateAvailable: boolean | null
  determination: 'digest' | 'timestamp' | 'unknown'
}

function parseRepo(repoRaw: string | undefined): string {
  const value = (repoRaw ?? 'sortedsheep/oxidized-core').trim().replace(/^\/+|\/+$/g, '')
  return value || 'sortedsheep/oxidized-core'
}

function pickDigest(payload: DockerHubTagResponse): string | null {
  if (typeof payload.digest === 'string' && payload.digest.trim()) return payload.digest.trim()
  const img = Array.isArray(payload.images) ? payload.images.find((x) => typeof x?.digest === 'string' && x.digest.trim()) : undefined
  return img?.digest?.trim() || null
}

async function fetchTag(repository: string, tag: string): Promise<DockerHubTagResponse> {
  const url = `https://hub.docker.com/v2/repositories/${repository}/tags/${encodeURIComponent(tag)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Docker Hub tag lookup failed (${res.status})`)
  return (await res.json()) as DockerHubTagResponse
}

export async function getDockerImageVersionInfo(): Promise<DockerImageVersionInfo> {
  const repository = parseRepo(process.env.DOCKER_IMAGE_REPO)
  const currentTag = (process.env.DOCKER_IMAGE_TAG ?? 'latest').trim() || 'latest'
  const configuredCurrentDigest = (process.env.DOCKER_IMAGE_DIGEST ?? '').trim() || null

  const latestPayload = await fetchTag(repository, 'latest')
  const latestDigest = pickDigest(latestPayload)
  const latestLastUpdated = latestPayload.last_updated ?? null

  let currentLastUpdated: string | null = null
  let currentDigest: string | null = configuredCurrentDigest
  if (currentTag === 'latest') {
    currentLastUpdated = latestLastUpdated
    if (!currentDigest) currentDigest = latestDigest
  } else {
    const currentPayload = await fetchTag(repository, currentTag)
    currentLastUpdated = currentPayload.last_updated ?? null
    if (!currentDigest) currentDigest = pickDigest(currentPayload)
  }

  if (configuredCurrentDigest && latestDigest) {
    return {
      repository,
      currentTag,
      currentDigest: configuredCurrentDigest,
      latestTag: 'latest',
      latestDigest,
      currentLastUpdated,
      latestLastUpdated,
      updateAvailable: configuredCurrentDigest !== latestDigest,
      determination: 'digest',
    }
  }

  if (currentTag !== 'latest' && currentLastUpdated && latestLastUpdated) {
    const currentTs = Date.parse(currentLastUpdated)
    const latestTs = Date.parse(latestLastUpdated)
    if (Number.isFinite(currentTs) && Number.isFinite(latestTs)) {
      return {
        repository,
        currentTag,
        currentDigest,
        latestTag: 'latest',
        latestDigest,
        currentLastUpdated,
        latestLastUpdated,
        updateAvailable: latestTs > currentTs,
        determination: 'timestamp',
      }
    }
  }

  return {
    repository,
    currentTag,
    currentDigest,
    latestTag: 'latest',
    latestDigest,
    currentLastUpdated,
    latestLastUpdated,
    updateAvailable: null,
    determination: 'unknown',
  }
}
