export type GameLogStream = 'stdout' | 'stderr'

type GameLogHandler = (serverId: number, stream: GameLogStream, text: string) => void
type SteamLogHandler = (text: string) => void

let gameLogHandler: GameLogHandler | null = null
let steamLogHandler: SteamLogHandler | null = null

export function setLogBroadcasters(handlers: {
  gameLog: GameLogHandler | null
  steamLog: SteamLogHandler | null
}): void {
  gameLogHandler = handlers.gameLog
  steamLogHandler = handlers.steamLog
}

export function broadcastGameLog(serverId: number, stream: GameLogStream, chunk: Buffer | string): void {
  if (!gameLogHandler) return
  const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8')
  if (!text) return
  gameLogHandler(serverId, stream, text)
}

export function broadcastSteamCmd(chunk: Buffer | string): void {
  if (!steamLogHandler) return
  const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8')
  if (!text) return
  steamLogHandler(text)
}
