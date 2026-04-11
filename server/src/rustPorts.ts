/**
 * Rust DS networking helpers (must match launch args in rustLauncher.ts).
 */

/** Steam query / server browser (UDP). Must differ from game and RCON ports. */
export function effectiveQueryPort(gamePort: number, rconPort: number): number {
  const raw = process.env.OXIDIZED_QUERY_PORT?.trim()
  if (raw && /^\d+$/.test(raw)) return Number(raw)
  const d = gamePort + 1
  if (d !== rconPort) return d
  return gamePort + 2
}

/** Rust+ companion server (TCP). See https://wiki.facepunch.com/rust/rust-companion-server */
export function rustCompanionTcpPort(gamePort: number, rconPort: number): number {
  return Math.max(gamePort + 67, rconPort + 67)
}
