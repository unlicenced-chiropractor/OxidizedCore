export type ServerStatus = 'stopped' | 'starting' | 'running' | 'error'

export type RustInstallSnapshot = {
  status: 'idle' | 'downloading' | 'ready' | 'error'
  installDir: string
  binary: string
  error: string | null
}

export type GameServer = {
  id: number
  name: string
  host: string
  game_port: number
  rcon_port: number
  /** UDP — query / server browser (open in firewall alongside game UDP). */
  query_port: number
  /** TCP — Rust+ companion (optional for joining via F1). */
  companion_tcp_port: number
  map_seed: number
  map_worldsize: number
  status: ServerStatus
  created_at: string
  /** Folder name under instances/ on the host (stable; not renamed when display name changes). */
  instance_slug: string
}
