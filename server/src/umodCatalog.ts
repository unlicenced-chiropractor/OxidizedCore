/**
 * uMod plugin listing: tries live HTML from umod.org, then a bundled fallback (Cloudflare often blocks servers).
 */

import { getFallbackPluginPage, type UmodPluginItem } from './umodCatalogFallback.js'

export type { UmodPluginItem }

const EXCLUDED_SLUGS = new Set(
  [
    'search',
    'authors',
    'new',
    'random',
    'tags',
    'submit',
    'login',
    'register',
    'guilds',
    'discord',
    'trending',
  ].map((s) => s.toLowerCase())
)

function titleFromSlug(slug: string): string {
  return slug
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function parseUmodPluginsHtml(html: string, origin = 'https://umod.org'): UmodPluginItem[] {
  const re = /href="(\/plugins\/([a-zA-Z0-9._-]+))"/g
  const seen = new Set<string>()
  const out: UmodPluginItem[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const slug = m[2]!
    const low = slug.toLowerCase()
    if (EXCLUDED_SLUGS.has(low)) continue
    if (seen.has(low)) continue
    seen.add(low)
    out.push({
      slug,
      title: titleFromSlug(slug),
      url: `${origin.replace(/\/$/, '')}/plugins/${slug}`,
    })
  }
  return out
}

function looksLikeCloudflareChallenge(html: string): boolean {
  const h = html.slice(0, 12_000).toLowerCase()
  return (
    h.includes('cf-chl') ||
    h.includes('challenge-platform') ||
    h.includes('just a moment') ||
    h.includes('enable javascript and cookies') ||
    h.includes('security verification')
  )
}

function detectHasNextPage(html: string, page: number): boolean {
  const next = `page=${page + 1}`
  return (
    html.includes(`?${next}`) ||
    html.includes(`&${next}`) ||
    html.includes(`"${next}"`) ||
    (/[?&]page=\d+/.test(html) && new RegExp(`[?&]page=${page + 1}(&|")`).test(html))
  )
}

function buildCatalogUrl(opts: { page: number; sort: string; sortdir: 'asc' | 'desc' }): string {
  const url = new URL('https://umod.org/plugins')
  url.searchParams.set('page', String(opts.page))
  url.searchParams.set('sort', opts.sort)
  url.searchParams.set('sortdir', opts.sortdir)
  return url.href
}

export type UmodCatalogFetchResult = {
  source: 'live' | 'fallback'
  plugins: UmodPluginItem[]
  page: number
  hasNext: boolean
  catalogUrl: string
  /** Shown in UI when using bundled list */
  note?: string
}

async function tryLiveFetch(opts: {
  page: number
  sort: string
  sortdir: 'asc' | 'desc'
}): Promise<
  | { ok: true; plugins: UmodPluginItem[]; hasNext: boolean; catalogUrl: string }
  | { ok: false; reason: string }
> {
  const catalogUrl = buildCatalogUrl(opts)
  const res = await fetch(catalogUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    redirect: 'follow',
  })

  if (!res.ok) {
    return { ok: false, reason: `HTTP ${res.status}` }
  }

  const html = await res.text()
  if (looksLikeCloudflareChallenge(html)) {
    return { ok: false, reason: 'cloudflare' }
  }

  const plugins = parseUmodPluginsHtml(html)
  if (plugins.length === 0) {
    return { ok: false, reason: 'no_plugins_parsed' }
  }

  return {
    ok: true,
    plugins,
    hasNext: detectHasNextPage(html, opts.page),
    catalogUrl,
  }
}

/**
 * Returns live uMod listing when reachable; otherwise a paginated bundled catalog (same shape for the UI).
 */
export async function fetchUmodPluginsPage(opts: {
  page: number
  sort: string
  sortdir: 'asc' | 'desc'
}): Promise<UmodCatalogFetchResult> {
  const catalogUrl = buildCatalogUrl(opts)

  try {
    const live = await tryLiveFetch(opts)
    if (live.ok) {
      return {
        source: 'live',
        plugins: live.plugins,
        page: opts.page,
        hasNext: live.hasNext,
        catalogUrl: live.catalogUrl,
      }
    }

    const fb = getFallbackPluginPage(opts.page, opts.sortdir)
    let note = 'uMod.org blocked automated access from this server (e.g. Cloudflare). Showing a bundled starter list — open uMod for the full catalog.'
    if (live.reason.startsWith('HTTP')) note = `${live.reason}. ${note}`
    else if (live.reason === 'no_plugins_parsed') {
      note = 'Could not read the live plugin list. Showing a bundled starter list — open uMod for the full catalog.'
    }

    return {
      source: 'fallback',
      plugins: fb.plugins,
      page: opts.page,
      hasNext: fb.hasNext,
      catalogUrl,
      note,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const fb = getFallbackPluginPage(opts.page, opts.sortdir)
    return {
      source: 'fallback',
      plugins: fb.plugins,
      page: opts.page,
      hasNext: fb.hasNext,
      catalogUrl,
      note: `${msg}. Showing a bundled starter list — open uMod for the full catalog.`,
    }
  }
}
