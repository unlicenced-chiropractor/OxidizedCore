import fs from 'node:fs'
import path from 'node:path'
import type { GameServerRow } from './db.js'
import { redactRustLaunchArgs, coreLog } from './log.js'
import { ensureSteamClientSdk64 } from './steamClientRuntime.js'
import {
  getRustDedicatedBinaryPath,
  isRustDedicatedBinaryPresent,
  skipSteamInstall,
} from './steamRust.js'
import { effectiveQueryPort } from './rustPorts.js'

export type LaunchSpec = {
  command: string
  args: string[]
  cwd: string
  env: NodeJS.ProcessEnv
}

/**
 * Launches RustDedicated from Steam install or OXIDIZED_RUSTDEDICATED_BIN.
 * If OXIDIZED_SKIP_STEAM_INSTALL=1 and no manual binary, uses a no-op Node process for dev.
 */
export function buildRustLaunchSpec(server: GameServerRow, instanceDir: string): LaunchSpec {
  const identity = `oxidized_${server.id}`
  const override = process.env.OXIDIZED_RUSTDEDICATED_BIN?.trim()
  const exe = override
    ? path.resolve(override)
    : !skipSteamInstall() && isRustDedicatedBinaryPresent()
      ? getRustDedicatedBinaryPath()
      : null

  if (exe && fs.existsSync(exe)) {
    const steamLinux64 = ensureSteamClientSdk64()
    const ldPath = [steamLinux64, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':')

    const installDir = path.dirname(exe)
    // Unity loads AssetBundles (e.g. Bundles/) relative to cwd — must be the Steam install root, not the per-instance folder.
    const cwd = process.env.OXIDIZED_RUSTDEDICATED_CWD?.trim()
      ? path.resolve(process.env.OXIDIZED_RUSTDEDICATED_CWD)
      : installDir

    const queryPort = effectiveQueryPort(server.game_port, server.rcon_port)
    const args = [
      '-batchmode',
      '-nographics',
      '+server.ip',
      '0.0.0.0',
      '+server.port',
      String(server.game_port),
      '+server.queryport',
      String(queryPort),
      '+server.hostname',
      server.name,
      '+server.level',
      'Procedural Map',
      '+server.seed',
      String(server.map_seed),
      '+server.worldsize',
      String(server.map_worldsize),
      '+server.identity',
      identity,
      '+rcon.web',
      '1',
      '+rcon.ip',
      '0.0.0.0',
      '+rcon.port',
      String(server.rcon_port),
      '+rcon.password',
      server.rcon_password,
      '+server.saveinterval',
      '300',
      '-logfile',
      path.join(instanceDir, 'logs', 'RustDedicated.log'),
    ]
    const publicIp = process.env.OXIDIZED_APP_PUBLICIP?.trim()
    if (publicIp) {
      args.push('+app.publicip', publicIp)
    }

    const spec = {
      command: exe,
      args,
      cwd,
      env: {
        ...process.env,
        HOME: process.env.HOME || '/root',
        ...(ldPath ? { LD_LIBRARY_PATH: ldPath } : {}),
        OXIDIZED_INSTANCE_ID: String(server.id),
        OXIDIZED_INSTANCE_DIR: instanceDir,
      },
    }
    coreLog('launch', 'buildRustLaunchSpec: real RustDedicated', {
      serverId: server.id,
      command: spec.command,
      cwd: spec.cwd,
      gameUdp: server.game_port,
      queryUdp: queryPort,
      rconTcp: server.rcon_port,
      args: redactRustLaunchArgs(spec.args),
    })
    return spec
  }

  coreLog('launch', 'buildRustLaunchSpec: mock process (no RustDedicated / skip steam)', {
    serverId: server.id,
    node: process.execPath,
  })
  return {
    command: process.execPath,
    args: ['-e', 'setInterval(()=>{}, 86400_000)'],
    cwd: instanceDir,
    env: {
      ...process.env,
      OXIDIZED_INSTANCE_ID: String(server.id),
      OXIDIZED_INSTANCE_DIR: instanceDir,
    },
  }
}
