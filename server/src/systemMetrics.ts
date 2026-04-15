import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { listRunningInstancePids } from './instanceSupervisor.js'

const execFileAsync = promisify(execFile)

export type ServerProcessMetric = {
  serverId: number
  pid: number
  cpuPercent: number | null
  memoryMb: number | null
}

export type SystemMetricsSnapshot = {
  timestamp: string
  host: {
    cpuCores: number
    totalMemMb: number
    freeMemMb: number
    usedMemMb: number
  }
  servers: ServerProcessMetric[]
}

async function metricsForPidUnix(pid: number): Promise<{ cpuPercent: number | null; memoryMb: number | null }> {
  try {
    const { stdout } = await execFileAsync('ps', ['-p', String(pid), '-o', '%cpu=,rss='], { timeout: 1500 })
    const line = stdout.trim().split(/\r?\n/).at(-1)?.trim() ?? ''
    const [cpuRaw, rssRaw] = line.split(/\s+/)
    const cpu = Number(cpuRaw)
    const rssKb = Number(rssRaw)
    return {
      cpuPercent: Number.isFinite(cpu) ? cpu : null,
      memoryMb: Number.isFinite(rssKb) ? rssKb / 1024 : null,
    }
  } catch {
    return { cpuPercent: null, memoryMb: null }
  }
}

async function metricsForPidWindows(pid: number): Promise<{ cpuPercent: number | null; memoryMb: number | null }> {
  try {
    const script = `(Get-Process -Id ${pid} | Select-Object CPU,WorkingSet64 | ConvertTo-Json -Compress)`
    const { stdout } = await execFileAsync(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: 1800 }
    )
    const parsed = JSON.parse(stdout.trim()) as { CPU?: number; WorkingSet64?: number }
    const cpu = typeof parsed.CPU === 'number' ? parsed.CPU : null
    const ws = typeof parsed.WorkingSet64 === 'number' ? parsed.WorkingSet64 : null
    return {
      cpuPercent: cpu,
      memoryMb: ws == null ? null : ws / (1024 * 1024),
    }
  } catch {
    return { cpuPercent: null, memoryMb: null }
  }
}

async function metricsForPid(pid: number): Promise<{ cpuPercent: number | null; memoryMb: number | null }> {
  return process.platform === 'win32' ? metricsForPidWindows(pid) : metricsForPidUnix(pid)
}

export async function getSystemMetricsSnapshot(): Promise<SystemMetricsSnapshot> {
  const totalMemMb = os.totalmem() / (1024 * 1024)
  const freeMemMb = os.freemem() / (1024 * 1024)
  const usedMemMb = totalMemMb - freeMemMb
  const running = listRunningInstancePids()
  const servers: ServerProcessMetric[] = []
  for (const row of running) {
    const m = await metricsForPid(row.pid)
    servers.push({
      serverId: row.serverId,
      pid: row.pid,
      cpuPercent: m.cpuPercent,
      memoryMb: m.memoryMb,
    })
  }

  return {
    timestamp: new Date().toISOString(),
    host: {
      cpuCores: os.cpus().length || 1,
      totalMemMb,
      freeMemMb,
      usedMemMb,
    },
    servers,
  }
}
