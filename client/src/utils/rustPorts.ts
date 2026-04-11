/** Mirrors server rustPorts.ts for older API responses missing derived fields. */

export function fallbackQueryPort(gamePort: number, rconPort: number): number {
  const d = gamePort + 1
  if (d !== rconPort) return d
  return gamePort + 2
}

export function fallbackCompanionTcpPort(gamePort: number, rconPort: number): number {
  return Math.max(gamePort + 67, rconPort + 67)
}
