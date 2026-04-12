/**
 * Bundled plugin slugs when umod.org cannot be fetched (Cloudflare / HTTP errors).
 * Links target https://umod.org/plugins/{slug} — uMod may redirect to the canonical URL.
 */

export type UmodPluginItem = {
  slug: string
  title: string
  url: string
}

const ORIGIN = 'https://umod.org'

/** Display titles for slugs that don’t split nicely from PascalCase. */
const TITLE_OVERRIDES: Record<string, string> = {
  nteleportation: 'NTeleportation',
  guiannouncements: 'GUI Announcements',
  imagelibrary: 'Image Library',
  betterloot: 'Better Loot',
  betterchat: 'Better Chat',
  copypaste: 'Copy Paste',
  zonemanager: 'Zone Manager',
  serverrewards: 'Server Rewards',
  stacksizecontroller: 'Stack Size Controller',
  quicksmelt: 'Quick Smelt',
  gathermanager: 'Gather Manager',
  playeradministration: 'Player Administration',
  loadingmessages: 'Loading Messages',
  deathnotes: 'Death Notes',
  hitmarkers: 'Hit Markers',
  instantcraft: 'Instant Craft',
  infiniteammo: 'Infinite Ammo',
  nodecay: 'No Decay',
  removertool: 'Remover Tool',
  raidablebases: 'Raidable Bases',
  furnacesplitter: 'Furnace Splitter',
  autodoors: 'Auto Doors',
  timeofday: 'Time of Day',
  skipnight: 'Skip Night',
  playtimetracker: 'Playtime Tracker',
  custommapname: 'Custom Map Name',
  blueprintmanager: 'Blueprint Manager',
  craftingcontroller: 'Crafting Controller',
  lootprotection: 'Loot Protection',
  bradleydrops: 'Bradley Drops',
  helisignals: 'Heli Signals',
  spawnheli: 'Spawn Heli',
  discordextension: 'Discord Extension',
  popupapi: 'Pop-Up API',
  truepve: 'TruePVE',
  fastblueprintexchange: 'Fast Blueprint Exchange',
}

function displayTitle(slug: string): string {
  const o = TITLE_OVERRIDES[slug.toLowerCase()]
  if (o) return o
  return slug.replace(/([a-z\d])([A-Z])/g, '$1 $2').replace(/_/g, ' ')
}

/** Curated Rust uMod slugs (PascalCase / common uMod URLs). */
const SLUGS: string[] = [
  'AdminHammer',
  'AdminMenu',
  'AdminRadar',
  'AFK',
  'AirfieldEvent',
  'AutoBackups',
  'AutoChatMessages',
  'AutoDoors',
  'AutoGrades',
  'AutoLock',
  'Backpacks',
  'BalanceBar',
  'BetterChat',
  'BetterLoot',
  'BetterSay',
  'BlueprintManager',
  'BradleyDrops',
  'BuildingGrades',
  'BuildingSkins',
  'Chrono',
  'Clans',
  'ColouredChat',
  'CopyPaste',
  'CraftingController',
  'CustomMapName',
  'DeathNotes',
  'DiscordExtension',
  'Economics',
  'EventManager',
  'FastBluePrintExchange',
  'Friends',
  'FurnaceSplitter',
  'GatherManager',
  'GUIAnnouncements',
  'HeliSignals',
  'HitMarkers',
  'ImageLibrary',
  'InfiniteAmmo',
  'InstantCraft',
  'InventoryViewer',
  'Kits',
  'LoadingMessages',
  'LootProtection',
  'NTeleportation',
  'NoDecay',
  'PlayerAdministration',
  'PlayerSkins',
  'PlaytimeTracker',
  'PopUpAPI',
  'QuickSmelt',
  'RaidableBases',
  'RemoverTool',
  'ServerMessages',
  'ServerRewards',
  'SignArtist',
  'SkipNight',
  'SmelterSpeed',
  'SpawnHeli',
  'Spectate',
  'StackSizeController',
  'SupplySign',
  'TCProtect',
  'Teams',
  'TimeOfDay',
  'Trade',
  'TruePVE',
  'Vanish',
  'WelcomePanel',
  'Whitelist',
  'WorkshopDownload',
  'ZoneManager',
  'ZombieHorde',
  'MonumentAddons',
  'Quarry',
  'SkillTree',
  'PrivateMessages',
  'BankSystem',
  'ATM',
  'Shop',
  'VendingInStock',
  'RecyclerSpeed',
  'Recycler',
  'Metabolism',
  'BetterNPC',
  'HumanNPC',
  'Convoy',
  'HarborEvent',
  'JunkyardEvent',
  'PlaneCrash',
  'CargoPlane',
  'LootBouncer',
  'PreventLooting',
  'LootScale',
  'GatherRewards',
  'DailyRewards',
  'WelcomePack',
  'TeleportGUI',
  'HomesGUI',
  'KitsGUI',
  'ShopGUI',
  'EconomicsUI',
  'ServerInfo',
  'RulesGUI',
  'MapName',
  'BetterChatMute',
  'AntiSpam',
  'Mute',
  'Godmode',
  'VanishAdmin',
  'AdminESP',
  'AdminPanel',
  'PermissionsManager',
]

function uniqueSlugs(): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const s of SLUGS) {
    const k = s.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(s)
  }
  return out
}

let cachedAll: UmodPluginItem[] | null = null

function allPlugins(): UmodPluginItem[] {
  if (cachedAll) return cachedAll
  cachedAll = uniqueSlugs().map((slug) => ({
    slug,
    title: displayTitle(slug),
    url: `${ORIGIN}/plugins/${slug}`,
  }))
  return cachedAll
}

export const FALLBACK_PAGE_SIZE = 40

/**
 * One page of the bundled catalog, sorted by title (or reversed for sortdir=desc).
 */
export function getFallbackPluginPage(
  page: number,
  sortdir: 'asc' | 'desc'
): { plugins: UmodPluginItem[]; hasNext: boolean } {
  const p = Math.max(1, Math.min(500, page))
  let rows = [...allPlugins()].sort((a, b) =>
    sortdir === 'asc' ? a.title.localeCompare(b.title) : b.title.localeCompare(a.title)
  )
  const start = (p - 1) * FALLBACK_PAGE_SIZE
  const plugins = rows.slice(start, start + FALLBACK_PAGE_SIZE)
  const hasNext = start + FALLBACK_PAGE_SIZE < rows.length
  return { plugins, hasNext }
}
