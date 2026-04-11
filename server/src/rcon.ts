import { Rcon } from 'rcon-client'
import { coreLog, coreWarn } from './log.js'

export type RconSendResult = { ok: true; response: string } | { ok: false; error: string }

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
    client = await Rcon.connect({
      host,
      port,
      password,
      timeout: timeoutMs,
    })
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
