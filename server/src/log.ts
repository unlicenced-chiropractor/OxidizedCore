/** Verbose server logs — prefix matches docker-compose service name for easy grepping. */

function stamp(): string {
  return new Date().toISOString()
}

export function coreLog(scope: string, message: string, extra?: Record<string, unknown>): void {
  const head = `[oxidized-core] ${stamp()} [${scope}] ${message}`
  if (extra && Object.keys(extra).length > 0) console.log(head, extra)
  else console.log(head)
}

export function coreWarn(scope: string, message: string, extra?: Record<string, unknown>): void {
  const head = `[oxidized-core] ${stamp()} [${scope}] ${message}`
  if (extra && Object.keys(extra).length > 0) console.warn(head, extra)
  else console.warn(head)
}

export function coreError(scope: string, message: string, extra?: Record<string, unknown>): void {
  const head = `[oxidized-core] ${stamp()} [${scope}] ${message}`
  if (extra && Object.keys(extra).length > 0) console.error(head, extra)
  else console.error(head)
}

/** For console: hide RCON password after +rcon.password */
export function redactRustLaunchArgs(args: string[]): string[] {
  const out = args.slice()
  const i = out.indexOf('+rcon.password')
  if (i !== -1 && out[i + 1] !== undefined) out[i + 1] = '****'
  return out
}
