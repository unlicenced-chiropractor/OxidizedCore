/**
 * GitHub Search API — discover public repos tagged as Rust/Oxide/uMod plugins (C#).
 * Token: `resolveGithubToken()` (env OXIDIZED_GITHUB_TOKEN / GITHUB_TOKEN, else Settings DB).
 *
 * Note: GitHub does not support OR between topic qualifiers (e.g. topic:a OR topic:b returns 0).
 * Default mode runs several valid searches and merges results.
 */

import { resolveGithubToken } from './appSettings.js'

const SEARCH_URL = 'https://api.github.com/search/repositories'

/**
 * Separate searches (each is valid for GitHub). Merged + deduped + sorted in memory.
 * Excludes OxideMod/Oxide.Rust (framework tree, not a single plugin).
 */
const DEFAULT_SUB_QUERIES = [
  'topic:oxide-plugins language:C#',
  'topic:oxidemod language:C#',
  'topic:rust-plugin language:C#',
] as const

const SKIP_FULL_NAMES = new Set(['oxidemod/oxide.rust'])

export type GithubOxideRepo = {
  name: string
  fullName: string
  description: string | null
  htmlUrl: string
  stars: number
  updatedAt: string | null
}

type GitHubSearchResponse = {
  total_count?: number
  items?: {
    name?: string
    full_name?: string
    description?: string | null
    html_url?: string
    stargazers_count?: number
    updated_at?: string | null
  }[]
  message?: string
  documentation_url?: string
}

function authHeaders(): Record<string, string> {
  const token = resolveGithubToken()
  if (!token) return {}
  if (token.startsWith('github_pat_')) return { Authorization: `Bearer ${token}` }
  return { Authorization: `token ${token}` }
}

/** Shared headers for GitHub REST (search, zipball, repo meta). */
export function githubApiHeaders(): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'OxidizedCore/1.0',
    ...authHeaders(),
  }
}

export type GithubSearchResult =
  | {
      ok: true
      items: GithubOxideRepo[]
      page: number
      perPage: number
      totalCount: number
      hasNext: boolean
      rateLimitRemaining: number | null
    }
  | { ok: false; error: string; rateLimitRemaining: number | null }

function mapItem(it: NonNullable<GitHubSearchResponse['items']>[number]): GithubOxideRepo {
  return {
    name: typeof it.name === 'string' ? it.name : 'unknown',
    fullName: typeof it.full_name === 'string' ? it.full_name : '',
    description: typeof it.description === 'string' ? it.description : null,
    htmlUrl: typeof it.html_url === 'string' ? it.html_url : '',
    stars: typeof it.stargazers_count === 'number' ? it.stargazers_count : 0,
    updatedAt: typeof it.updated_at === 'string' ? it.updated_at : null,
  }
}

async function githubSearchRequest(
  q: string,
  ghPage: number,
  sort: string,
  order: string,
  perPage: number
): Promise<{
  items: GithubOxideRepo[]
  totalCount: number
  hasNext: boolean
  rateLimitRemaining: number | null
  error?: string
  httpOk: boolean
}> {
  const url = new URL(SEARCH_URL)
  url.searchParams.set('q', q)
  url.searchParams.set('sort', sort)
  url.searchParams.set('order', order)
  url.searchParams.set('page', String(ghPage))
  url.searchParams.set('per_page', String(perPage))

  const res = await fetch(url.toString(), {
    headers: githubApiHeaders(),
  })

  const rateRemaining = res.headers.get('x-ratelimit-remaining')
  const rateLimitRemaining = rateRemaining != null ? Number(rateRemaining) : null

  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try {
      const err = (await res.json()) as GitHubSearchResponse
      if (typeof err.message === 'string') msg = err.message
    } catch {
      /* ignore */
    }
    return {
      items: [],
      totalCount: 0,
      hasNext: false,
      rateLimitRemaining,
      error: msg,
      httpOk: false,
    }
  }

  const data = (await res.json()) as GitHubSearchResponse
  if (typeof data.message === 'string' && !Array.isArray(data.items)) {
    return {
      items: [],
      totalCount: 0,
      hasNext: false,
      rateLimitRemaining,
      error: data.message,
      httpOk: false,
    }
  }

  const totalCount = typeof data.total_count === 'number' ? data.total_count : 0
  const items = (data.items ?? []).map(mapItem)
  const hasNext = ghPage * perPage < totalCount

  return { items, totalCount, hasNext, rateLimitRemaining, httpOk: true }
}

function sortRepos(list: GithubOxideRepo[], sort: 'stars' | 'updated' | 'best-match', order: 'asc' | 'desc') {
  const mul = order === 'asc' ? 1 : -1
  list.sort((a, b) => {
    if (sort === 'updated') {
      const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
      const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
      return (ta - tb) * mul
    }
    return (a.stars - b.stars) * mul
  })
}

function buildMergedSubQuery(base: string, keywords: string | undefined): string {
  const k = keywords?.trim().replace(/\s+/g, ' ') ?? ''
  if (!k) return base
  const combined = `${base} ${k}`
  return combined.length > 256 ? combined.slice(0, 256) : combined
}

/** True when the user likely intends a full GitHub search string (not plain keywords). */
function looksLikeGithubAdvancedQuery(s: string): boolean {
  const t = s.trim()
  if (!t) return false
  if (t.includes(':')) return true
  if (/\bOR\b/i.test(t) || /\bAND\b/i.test(t)) return true
  return false
}

/** Default: merge several topic searches (GitHub disallows OR across topic qualifiers). */
async function searchDefaultMerged(opts: {
  page: number
  sort: 'stars' | 'updated' | 'best-match'
  order: 'asc' | 'desc'
  /** AND’d onto each topic sub-query (plain words); omit for full catalog. */
  keywords?: string
}): Promise<GithubSearchResult> {
  const perPageFetch = 100
  const merged = new Map<string, GithubOxideRepo>()
  let rateLimitRemaining: number | null = null
  let lastError: string | null = null

  const sort = opts.sort === 'updated' || opts.sort === 'best-match' ? opts.sort : 'stars'
  const order = opts.order === 'asc' ? 'asc' : 'desc'

  for (const base of DEFAULT_SUB_QUERIES) {
    const subQ = buildMergedSubQuery(base, opts.keywords)
    let ghPage = 1
    while (ghPage <= 10) {
      const r = await githubSearchRequest(subQ, ghPage, sort, order, perPageFetch)
      rateLimitRemaining = r.rateLimitRemaining ?? rateLimitRemaining
      if (!r.httpOk) {
        lastError = r.error ?? 'Request failed'
        break
      }
      for (const it of r.items) {
        const key = it.fullName.toLowerCase()
        if (!it.fullName || SKIP_FULL_NAMES.has(key)) continue
        merged.set(it.fullName, it)
      }
      if (!r.hasNext || r.items.length === 0) break
      ghPage++
    }
  }

  if (merged.size === 0 && lastError) {
    return { ok: false, error: lastError, rateLimitRemaining }
  }

  const list = [...merged.values()]
  sortRepos(list, sort, order)

  const perPage = 30
  const uiPage = Math.min(500, Math.max(1, opts.page))
  const start = (uiPage - 1) * perPage
  const slice = list.slice(start, start + perPage)
  const hasNext = start + perPage < list.length

  return {
    ok: true,
    items: slice,
    page: uiPage,
    perPage,
    totalCount: list.length,
    hasNext,
    rateLimitRemaining,
  }
}

/** Single GitHub search with native pagination (for custom `q`). */
async function searchSingleQuery(opts: {
  page: number
  sort: 'stars' | 'updated' | 'best-match'
  order: 'asc' | 'desc'
  query: string
}): Promise<GithubSearchResult> {
  const ghPage = Math.min(34, Math.max(1, opts.page))
  const perPage = 30
  const sort = opts.sort === 'updated' || opts.sort === 'best-match' ? opts.sort : 'stars'
  const order = opts.order === 'asc' ? 'asc' : 'desc'
  const qRaw = opts.query.trim().slice(0, 256)

  const r = await githubSearchRequest(qRaw, ghPage, sort, order, perPage)
  if (!r.httpOk) {
    return { ok: false, error: r.error ?? 'Search failed', rateLimitRemaining: r.rateLimitRemaining }
  }

  const items = r.items.filter((it) => !SKIP_FULL_NAMES.has(it.fullName.toLowerCase()))
  const hasNext = r.hasNext

  return {
    ok: true,
    items,
    page: ghPage,
    perPage,
    totalCount: r.totalCount,
    hasNext,
    rateLimitRemaining: r.rateLimitRemaining,
  }
}

export async function searchOxideRelatedRepos(opts: {
  page: number
  sort: 'stars' | 'updated' | 'best-match'
  order: 'asc' | 'desc'
  /**
   * Plain words: merged topic searches with keywords AND’d in.
   * If this looks like GitHub syntax (e.g. contains `:`), one native search is used instead.
   */
  query?: string
}): Promise<GithubSearchResult> {
  try {
    const raw = opts.query?.trim().slice(0, 256) ?? ''
    if (raw) {
      if (looksLikeGithubAdvancedQuery(raw)) {
        return await searchSingleQuery({
          page: opts.page,
          sort: opts.sort,
          order: opts.order,
          query: raw,
        })
      }
      return await searchDefaultMerged({
        page: opts.page,
        sort: opts.sort,
        order: opts.order,
        keywords: raw,
      })
    }
    return await searchDefaultMerged({
      page: opts.page,
      sort: opts.sort,
      order: opts.order,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg, rateLimitRemaining: null }
  }
}
