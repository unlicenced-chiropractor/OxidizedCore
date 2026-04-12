export type ServerStatus = 'stopped' | 'starting' | 'running' | 'error'

export type RustInstallSnapshot = {
  status: 'idle' | 'downloading' | 'ready' | 'error'
  installDir: string
  binary: string
  error: string | null
  /** Node `process.platform` from the API host. */
  hostPlatform?: string
  hostPlatformLabel?: string
  /** Steam app_update target: windows | linux */
  rustSteamPlatform?: string
  /** Oxide GitHub asset used when Oxide is enabled. */
  oxideAsset?: string
}

export type GameServer = {
  id: number
  name: string
  host: string
  game_port: number
  rcon_port: number
  /** When false, the game starts without RCON and the panel cannot send commands. */
  rcon_enabled: boolean
  /** When true, Oxide/uMod is merged into the shared Rust install before start (OS-matched zip). */
  oxide_enabled: boolean
  /** When true, dedicated server runs Rust+ companion on companion_tcp_port (+app.port). */
  companion_enabled: boolean
  /** UDP — query / server browser (open in firewall alongside game UDP). */
  query_port: number
  /** TCP — Rust+ companion (optional for joining via F1). */
  companion_tcp_port: number
  map_seed: number
  map_worldsize: number
  max_players: number
  /** Max RAM for the game process (MiB); null = no cap (Linux: systemd-run when available). */
  memory_limit_mb: number | null
  server_description: string
  status: ServerStatus
  created_at: string
  /** Folder name under instances/ on the host (stable; not renamed when display name changes). */
  instance_slug: string
}
