import { Rcon } from 'rcon-client'
import { coreLog, coreWarn } from './log.js'

export type RconSendResult = { ok: true; response: string } | { ok: false; error: string }

function attachRconErrorSink(client: Rcon, host: string, port: number) {
  /**
   * rcon-client forwards socket `error` to an internal EventEmitter. Node exits if `error` is emitted
   * with no listeners — common when the game closes the RCON connection (ECONNRESET).
   */
  client.on('error', (err) => {
    coreWarn('rcon', 'RCON socket error', {
      host,
      port,
      message: err instanceof Error ? err.message : String(err),
    })
  })
}

export async function sendRconCommand(
  host: string,
  port: number,
  password: string,
  command: string,
  timeoutMs = 8000
): Promise<RconSendResult> {
  let client: Rcon | undefined
  try {
    coreLog('rcon', 'Connecting', { host, port, timeoutMs })
    const rcon = new Rcon({
      host,
      port,
      password,
      timeout: timeoutMs,
    })
    attachRconErrorSink(rcon, host, port)
    await rcon.connect()
    client = rcon
    coreLog('rcon', 'Sending command', { chars: command.length })
    const response = await client.send(command)
    return { ok: true, response: response.trim() || '(empty response)' }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    coreWarn('rcon', 'Connect or send failed', { host, port, message })
    return { ok: false, error: message }
  } finally {
    if (client) {
      try {
        await client.end()
      } catch {
        /* ignore */
      }
    }
  }
}
